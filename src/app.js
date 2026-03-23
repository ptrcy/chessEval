/**
 * Mobile Chess App
 */

import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { StockfishEngine } from './engine.js';
import { rotateFen, inferCastlingRights } from './utils/fen.js';
import './app.css';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

class MobileChess {
    constructor() {
        this.chess = new Chess();
        this.board = null;
        this.engine = null;
        this.currentArrows = [];
        this.arrowAnimationTimeout = null;
        this.arrowAnimationGeneration = 0;

        this.moveHistory = [];
        this.currentMoveIndex = -1;

        this.settings = {
            removeBleeding: true
        };

        this.elements = {
            board:         document.getElementById('chessboard'),
            boardContainer:document.getElementById('boardContainer'),
            fenInput:      document.getElementById('fenInput'),
            undoBtn:       document.getElementById('undoBtn'),
            redoBtn:       document.getElementById('redoBtn'),
            flipBtn:       document.getElementById('flipBtn'),
            toggleTurnBtn: document.getElementById('toggleTurnBtn'),
            rotateFenBtn:  document.getElementById('rotateFenBtn'),
            cameraBtn:     document.getElementById('cameraBtn'),
            cameraInput:   document.getElementById('cameraInput'),
            statusMessage: document.getElementById('statusMessage'),
            evalDisplay:   document.getElementById('evalDisplay'),
            settingsBtn:   document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settingsModal'),
            closeSettingsBtn: document.getElementById('closeSettingsBtn'),
            removeBleedingToggle: document.getElementById('removeBleedingToggle'),
            promotionModal: document.getElementById('promotionModal'),
            promotionPieces: document.querySelectorAll('.promotion-piece')
        };

        this._pendingMove = null;
        this.init();
    }

    async init() {
        try {
            this.initSettings();
            this.initBoard();
            this.initPromotion();
            this.engine = new StockfishEngine({ multiPv: 3, threads: 2 });
            await this.engine.init();
            this.runAnalysis();
        } catch (error) {
            console.error('Mobile init error:', error);
            this.showStatus('Engine Error: Failed to initialize Stockfish. Analysis will be unavailable.', 'error', true);
        }
    }

    initPromotion() {
        this.elements.promotionPieces.forEach(btn => {
            btn.addEventListener('click', () => {
                const piece = btn.getAttribute('data-piece');
                if (this._pendingMove) {
                    this.completeMove(this._pendingMove.orig, this._pendingMove.dest, piece);
                }
                this.elements.promotionModal.classList.remove('active');
            });
        });

        // Cancel promotion on backdrop click — snap piece back
        this.elements.promotionModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.promotionModal) {
                this._pendingMove = null;
                this.elements.promotionModal.classList.remove('active');
                this.board.set({ fen: this.chess.fen() });
            }
        });
    }

    initSettings() {
        // Load settings from localStorage
        const saved = localStorage.getItem('chesseval_settings');
        if (saved) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Failed to parse settings:', e);
            }
        }

        // Set initial toggle state
        if (this.elements.removeBleedingToggle) {
            this.elements.removeBleedingToggle.checked = this.settings.removeBleeding;

            // Save setting when changed
            this.elements.removeBleedingToggle.addEventListener('change', () => {
                this.settings.removeBleeding = this.elements.removeBleedingToggle.checked;
                this.saveSettings();
            });
        }

        // Settings button
        this.elements.settingsBtn?.addEventListener('click', () => this.openSettings());
        this.elements.closeSettingsBtn?.addEventListener('click', () => this.closeSettings());

        // Close modal on backdrop click
        this.elements.settingsModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.closeSettings();
            }
        });
    }

    saveSettings() {
        localStorage.setItem('chesseval_settings', JSON.stringify(this.settings));
    }

    openSettings() {
        this.elements.settingsModal?.classList.add('active');
    }

    closeSettings() {
        this.elements.settingsModal?.classList.remove('active');
    }

    initBoard() {
        this.board = Chessground(this.elements.board, {
            fen: DEFAULT_FEN,
            movable: {
                free: false,
                color: 'both',
                dests: this.getMoveDests(),
                events: {
                    after: (orig, dest) => this.onMove(orig, dest)
                }
            },
            draggable: { enabled: true, showGhost: true },
            highlight: { lastMove: true, check: true }
        });

        this.updateTurnIndicator();
        this.updateButtons();
        this.updateEvalDisplay(null, '--');

        this.elements.undoBtn?.addEventListener('click', () => this.undo());
        this.elements.redoBtn?.addEventListener('click', () => this.redo());

        // Button 2: flip visual perspective
        this.elements.flipBtn?.addEventListener('click', () => this.flipBoard());

        // Button 1: toggle whose turn it is
        this.elements.toggleTurnBtn?.addEventListener('click', () => this.toggleTurn());

        // Button 3: rotate FEN 180° (fix wrong scan orientation)
        this.elements.rotateFenBtn?.addEventListener('click', () => this.rotateBoardLogic());

        this.elements.cameraBtn?.addEventListener('click', () => this.elements.cameraInput.click());
        this.elements.cameraInput?.addEventListener('change', (e) => this.handleImageUpload(e));

        this.elements.fenInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.loadPosition(this.elements.fenInput.value.trim());
        });

        window.addEventListener('resize', () => this.board?.redrawAll());
        setTimeout(() => this.board?.redrawAll(), 100);
    }

    // ── Move handling ──────────────────────────────────────────────────────

    onMove(orig, dest) {
        // Detect promotion
        const piece = this.chess.get(orig);
        const isPromotion = piece?.type === 'p' && 
            ((piece.color === 'w' && dest[1] === '8') || 
             (piece.color === 'b' && dest[1] === '1'));

        if (isPromotion) {
            this._pendingMove = { orig, dest };
            this.elements.promotionModal.classList.add('active');
            return;
        }

        this.completeMove(orig, dest);
    }

    completeMove(orig, dest, promotion = 'q') {
        try {
            const move = this.chess.move({ from: orig, to: dest, promotion });
            if (move) {
                if (this.currentMoveIndex < this.moveHistory.length - 1) {
                    this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex + 1);
                }
                this.moveHistory.push(move);
                this.currentMoveIndex++;
                this.updateBoardState();
            } else {
                // Illegal move, snap back
                this.board.set({ fen: this.chess.fen() });
            }
        } catch (e) {
            console.error('Move error:', e);
            this.board.set({ fen: this.chess.fen() });
        }
        this._pendingMove = null;
    }

    updateBoardState(orientation) {
        const isGameOver = this.chess.isGameOver();
        const config = {
            fen: this.chess.fen(),
            turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
            movable: { 
                color: 'both', 
                free: false,
                dests: isGameOver ? new Map() : this.getMoveDests(),
                events: {
                    after: (orig, dest) => this.onMove(orig, dest)
                }
            },
            lastMove: this.currentMoveIndex >= 0
                ? [this.moveHistory[this.currentMoveIndex].from,
                   this.moveHistory[this.currentMoveIndex].to]
                : undefined
        };
        if (orientation) config.orientation = orientation;
        
        this.board.set(config);
        
        // Ensure visual sync on mobile
        this.board.redrawAll();

        this.updateTurnIndicator();
        this.updateButtons();
        this.clearArrows();
        this.runAnalysis();
    }

    getMoveDests() {
        const dests = new Map();
        try {
            this.chess.moves({ verbose: true }).forEach(m => {
                if (!dests.has(m.from)) dests.set(m.from, []);
                dests.get(m.from).push(m.to);
            });
        } catch (e) {
            console.error('Error getting move dests:', e);
        }
        return dests;
    }

    // ── Turn indicator ─────────────────────────────────────────────────────

    updateTurnIndicator() {
        const isWhite = this.chess.turn() === 'w';
        const isGameOver = this.chess.isGameOver();

        // Board border colour
        this.elements.boardContainer.className =
            'board-container ' + (isWhite ? 'turn-white' : 'turn-black');

        // Toggle-turn button: set --turn-fill CSS variable and tooltip
        const btn = this.elements.toggleTurnBtn;
        if (btn) {
            // White piece: near-white fill; Black piece: near-black fill
            btn.style.setProperty('--turn-fill', isWhite ? '#f0f0f0' : '#1a1a1a');
            
            let title = isWhite ? 'White to move' : 'Black to move';
            if (isGameOver) title = 'Game over';
            
            btn.title = `${title} — tap to toggle`;
            btn.setAttribute('aria-label', title);
        }
    }

    // ── Button state ───────────────────────────────────────────────────────

    updateButtons() {
        if (this.elements.undoBtn) {
            this.elements.undoBtn.disabled = this.currentMoveIndex < 0;
        }
        if (this.elements.redoBtn) {
            this.elements.redoBtn.disabled =
                this.currentMoveIndex >= this.moveHistory.length - 1;
        }
    }

    // ── Eval display ───────────────────────────────────────────────────────

    updateEvalDisplay(result, labelOverride) {
        const el = this.elements.evalDisplay;
        if (!el) return;

        if (labelOverride) { el.textContent = labelOverride; return; }
        
        if (this.chess.isGameOver()) {
            if (this.chess.isCheckmate()) {
                el.textContent = this.chess.turn() === 'w' ? '0-1' : '1-0';
            } else {
                el.textContent = '½-½';
            }
            return;
        }

        if (!result) { el.textContent = '--'; return; }

        if (result.error) {
            el.textContent = 'Err';
            console.error('Analysis error:', result.error);
            return;
        }

        let text = '--';
        const isBlack = this.chess.turn() === 'b';
        if (typeof result.mate === 'number') {
            const m = isBlack ? -result.mate : result.mate;
            text = m > 0 ? `#${m}` : `#-${Math.abs(m)}`;
        } else if (typeof result.score === 'number') {
            const cp = (isBlack ? -result.score : result.score) / 100;
            text = `${cp > 0 ? '+' : ''}${cp.toFixed(2)}`;
        }
        el.textContent = text;
    }

    // ── Engine analysis ────────────────────────────────────────────────────

    runAnalysis() {
        if (!this.engine) return;
        if (this.chess.isGameOver()) {
            this.updateEvalDisplay();
            return;
        }

        this.engine.stop();
        this.updateEvalDisplay(null, '...');

        const analysisFen = this.chess.fen();
        this.engine.analyze(analysisFen, 15, (result) => {
            if (this.chess.fen() !== analysisFen) return;

            if (result.error) {
                this.updateEvalDisplay(result);
                this.showStatus(`Analysis failed: ${result.error}`, 'error');
                return;
            }

            this.updateEvalDisplay(result);
            if (result.moves?.length > 0) this.showMoveArrows(result.moves.slice(0, 3));
        });
    }

    // ── Arrows ─────────────────────────────────────────────────────────────

    showMoveArrows(moves) {
        this.clearArrows();
        const arrows = moves.map(({ move }, i) => ({
            orig:  move.substring(0, 2),
            dest:  move.substring(2, 4),
            brush: ['blue', 'green', 'yellow'][i] || 'blue'
        }));
        this.currentArrows = arrows;
        this.animateArrows(arrows);
    }

    animateArrows(arrows) {
        if (this.arrowAnimationTimeout) clearTimeout(this.arrowAnimationTimeout);
        const generation = ++this.arrowAnimationGeneration;
        let idx = 0;
        const visible = [];

        const next = () => {
            if (generation !== this.arrowAnimationGeneration) return;
            if (arrows.length === 0) return;
            if (idx < arrows.length) {
                visible.push(arrows[idx++]);
                this.board.setShapes(visible);
                this.arrowAnimationTimeout = setTimeout(next, 600);
            } else {
                this.arrowAnimationTimeout = setTimeout(() => {
                    if (generation !== this.arrowAnimationGeneration) return;
                    idx = 0; visible.length = 0;
                    this.board.setShapes([]);
                    next();
                }, 1200);
            }
        };
        next();
    }

    clearArrows() {
        if (this.arrowAnimationTimeout) clearTimeout(this.arrowAnimationTimeout);
        this.arrowAnimationGeneration++;
        this.board.setShapes([]);
        this.currentArrows = [];
    }

    // ── Navigation ─────────────────────────────────────────────────────────

    undo() {
        if (this.currentMoveIndex >= 0) {
            this.chess.undo();
            this.currentMoveIndex--;
            this.updateBoardState();
        }
    }

    redo() {
        if (this.currentMoveIndex < this.moveHistory.length - 1) {
            this.chess.move(this.moveHistory[this.currentMoveIndex + 1]);
            this.currentMoveIndex++;
            this.updateBoardState();
        }
    }

    // ── Board controls ─────────────────────────────────────────────────────

    /** Button 2: flip the visual perspective only (no FEN change) */
    flipBoard() {
        const cur = this.board.state.orientation;
        this.board.set({ orientation: cur === 'white' ? 'black' : 'white' });
    }

    /** Button 1: toggle the active turn in the FEN */
    toggleTurn() {
        const parts = this.chess.fen().split(' ');
        parts[1] = parts[1] === 'w' ? 'b' : 'w';
        this.loadPosition(parts.join(' '));
    }

    /** Button 3: rotate FEN 180° — corrects a wrong scan orientation */
    rotateBoardLogic() {
        this.loadPosition(inferCastlingRights(rotateFen(this.chess.fen())));
        this.closeSettings();
    }

    // ── Orientation detection ──────────────────────────────────────────────

    /**
     * Examines a raw FEN returned by the OCR API and rotates it 180° when the
     * board appears to have been photographed from black's side.
     *
     * Primary signal — king positions (reliable across all game phases):
     *   FEN rows are indexed 0 (rank 8) → 7 (rank 1).
     *   Normal:  white king (K) in rows 4-7,  black king (k) in rows 0-3.
     *   Flipped: white king (K) in rows 0-3,  black king (k) in rows 4-7.
     *   Each king's distance from the centre contributes to a flip score;
     *   a score > 1.5 triggers the rotation (tolerates centralised kings).
     *
     * Fallback — piece-distribution ratio (when neither king is found):
     *   If white pieces dominate the top half AND black pieces dominate the
     *   bottom half (both > 65 %), the board is likely flipped.
     */
    detectOrientation(fen) {
        const parts = fen.trim().split(/\s+/);
        const rows = parts[0].split('/');
        const whiteKingRow = rows.findIndex(r => r.includes('K'));
        const blackKingRow = rows.findIndex(r => r.includes('k'));

        let isFlipped = false;
        let bottomColor = 'white';

        if (whiteKingRow !== -1 || blackKingRow !== -1) {
            let score = 0;
            if (whiteKingRow !== -1) score += (3.5 - whiteKingRow); // positive if white king is in top half
            if (blackKingRow !== -1) score += (blackKingRow - 3.5); // positive if black king is in bottom half
            isFlipped = score > 1.5;
            console.log(`Orientation — king score: ${score.toFixed(2)} → ${isFlipped ? 'FLIPPED' : 'normal'}`);
        } else {
            const top    = rows.slice(0, 4).join('');
            const bottom = rows.slice(4).join('');
            const count  = (s, re) => (s.match(re) || []).length;
            const wTop = count(top,    /[A-Z]/g), bTop = count(top,    /[a-z]/g);
            const wBot = count(bottom, /[A-Z]/g), bBot = count(bottom, /[a-z]/g);
            isFlipped = (wTop / (wTop + bTop || 1)) > 0.65 &&
                        (bBot / (wBot + bBot || 1)) > 0.65;
            console.log(`Orientation — piece-distribution fallback → ${isFlipped ? 'FLIPPED' : 'normal'}`);
        }

        // If flipped, it means Black was at the bottom in the image.
        // We rotate the FEN to fix coordinates, then set turn to Black.
        if (isFlipped) {
            fen = rotateFen(fen);
            bottomColor = 'black';
        }

        // Set turn in FEN to match the bottom player
        const finalParts = fen.trim().split(/\s+/);
        finalParts[1] = bottomColor === 'white' ? 'w' : 'b';
        
        return { 
            fen: finalParts.join(' '), 
            bottomColor 
        };
    }

    // ── Position loading ───────────────────────────────────────────────────

    loadPosition(fen, orientation) {
        try {
            this.chess.load(fen);
            this.moveHistory = [];
            this.currentMoveIndex = -1;
            this.updateBoardState(orientation);
        } catch (e) {
            console.error('loadPosition error:', e);
            this.showStatus('Invalid FEN position', 'error');
        }
    }

    // ── Image scan ─────────────────────────────────────────────────────────

    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (this._processingImage) return;
        this._processingImage = true;

        try {
            this.showStatus(this.settings.removeBleeding ? 'Removing bleed-through…' : 'Processing image…', 'info', true);
            const resizedBlob = await this.resizeImage(file);
            const base64Data = await this.removeBleeding(resizedBlob, this.settings.removeBleeding);

            const sizeKB = ((base64Data.length - 22) * 3 / 4 / 1024).toFixed(1);
            this.showStatus(`Uploading (${sizeKB} KB)…`, 'info', true);

            const response = await fetch('/.netlify/functions/board-to-fen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Data })
            });

            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            if (!data.fen)  throw new Error('No FEN returned');

            const { fen: detectedFen, bottomColor } = this.detectOrientation(data.fen);
            const finalFen = inferCastlingRights(detectedFen);
            
            console.log('FEN from API:', data.fen);
            console.log('FEN after detection/inference:', finalFen);
            console.log('Detected bottom color:', bottomColor);
            
            this.loadPosition(finalFen, bottomColor);
            this.showStatus('Board detected — adjust turn / orientation if needed', 'success');

        } catch (error) {
            console.error('Image processing error:', error);
            const msg = error instanceof Error ? error.message : (error.type || String(error));
            this.showStatus(`Error: ${msg}`, 'error');
        } finally {
            this._processingImage = false;
            this.elements.cameraInput.value = '';
        }
    }

    resizeImage(file, maxSide = 520, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let { width, height } = img;
                    if (width > maxSide || height > maxSide) {
                        if (width >= height) {
                            height = Math.round(height * maxSide / width);
                            width  = maxSide;
                        } else {
                            width  = Math.round(width * maxSide / height);
                            height = maxSide;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width  = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    canvas.toBlob(blob => {
                        if (blob) resolve(blob);
                        else reject(new Error('Canvas toBlob failed'));
                    }, 'image/jpeg', quality);
                };
                img.onerror = () => reject(new Error('Failed to load image for resizing'));
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
        });
    }

    async removeBleeding(blob, enabled = true) {
        if (!enabled) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        const arrayBuffer = await blob.arrayBuffer();
        const res = await fetch('https://rmbleeding.vercel.app/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'image/jpeg' },
            body: arrayBuffer,
        });
        if (!res.ok) throw new Error(`rmbleeding API error: ${res.status}`);
        const data = await res.json();
        if (!data.image) throw new Error('No image in rmbleeding response');
        const mime = data.format === 'png' ? 'image/png' : 'image/jpeg';
        return `data:${mime};base64,${data.image}`;
    }

    // ── Status toast ───────────────────────────────────────────────────────

    showStatus(message, type, persist = false) {
        const el = this.elements.statusMessage;
        if (!el) return;
        el.textContent = message;
        el.className   = type || '';
        el.style.display = 'block';
        clearTimeout(this._statusTimer);
        if (!persist) {
            this._statusTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
        }
    }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new MobileChess());
} else {
    new MobileChess();
}
