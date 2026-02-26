/**
 * Mobile Chess App
 */

import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { StockfishEngine } from './engine.js';
import { rotateFen } from './utils/fen.js';
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
            evalDisplay:   document.getElementById('evalDisplay')
        };

        this.init();
    }

    async init() {
        try {
            this.initBoard();
            this.engine = new StockfishEngine({ multiPv: 3, threads: 2 });
            await this.engine.init();
            this.runAnalysis();
        } catch (error) {
            console.error('Mobile init error:', error);
        }
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

        window.addEventListener('resize', () => this.board?.redrawAll());
        setTimeout(() => this.board?.redrawAll(), 100);
    }

    // ── Move handling ──────────────────────────────────────────────────────

    onMove(orig, dest) {
        const move = this.chess.move({ from: orig, to: dest, promotion: 'q' });
        if (move) {
            if (this.currentMoveIndex < this.moveHistory.length - 1) {
                this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex + 1);
            }
            this.moveHistory.push(move);
            this.currentMoveIndex++;
            this.updateBoardState();
        } else {
            this.board.set({ fen: this.chess.fen() });
        }
    }

    updateBoardState(orientation) {
        const config = {
            fen: this.chess.fen(),
            turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
            movable: { color: 'both', dests: this.getMoveDests() },
            lastMove: this.currentMoveIndex >= 0
                ? [this.moveHistory[this.currentMoveIndex].from,
                   this.moveHistory[this.currentMoveIndex].to]
                : undefined
        };
        if (orientation) config.orientation = orientation;
        this.board.set(config);

        this.updateTurnIndicator();
        this.updateButtons();
        this.clearArrows();
        this.runAnalysis();
    }

    getMoveDests() {
        const dests = new Map();
        this.chess.moves({ verbose: true }).forEach(m => {
            if (!dests.has(m.from)) dests.set(m.from, []);
            dests.get(m.from).push(m.to);
        });
        return dests;
    }

    // ── Turn indicator ─────────────────────────────────────────────────────

    updateTurnIndicator() {
        const isWhite = this.chess.turn() === 'w';

        // Board border colour
        this.elements.boardContainer.className =
            'board-container ' + (isWhite ? 'turn-white' : 'turn-black');

        // Toggle-turn button: set --turn-fill CSS variable and tooltip
        const btn = this.elements.toggleTurnBtn;
        if (btn) {
            // White piece: near-white fill; Black piece: near-black fill
            btn.style.setProperty('--turn-fill', isWhite ? '#f0f0f0' : '#1a1a1a');
            btn.title      = isWhite ? 'White to move — tap to toggle' : 'Black to move — tap to toggle';
            btn.setAttribute('aria-label', isWhite ? 'White to move' : 'Black to move');
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
        if (!result)       { el.textContent = '--'; return; }

        let text = '--';
        if (typeof result.mate === 'number') {
            text = result.mate > 0 ? `#${result.mate}` : `#-${Math.abs(result.mate)}`;
        } else if (typeof result.score === 'number') {
            const cp = result.score / 100;
            text = `${cp > 0 ? '+' : ''}${cp.toFixed(2)}`;
        }
        el.textContent = text;
    }

    // ── Engine analysis ────────────────────────────────────────────────────

    runAnalysis() {
        if (!this.engine) return;
        if (this.chess.isGameOver()) { this.updateEvalDisplay(null, 'Game over'); return; }

        this.engine.stop();
        this.updateEvalDisplay(null, '...');

        const analysisFen = this.chess.fen();
        this.engine.analyze(analysisFen, 15, (result) => {
            if (this.chess.fen() !== analysisFen) return;
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
        this.loadPosition(rotateFen(this.chess.fen()));
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
        const rows = fen.split(' ')[0].split('/');
        const whiteKingRow = rows.findIndex(r => r.includes('K'));
        const blackKingRow = rows.findIndex(r => r.includes('k'));

        let isFlipped = false;

        if (whiteKingRow !== -1 || blackKingRow !== -1) {
            let score = 0;
            if (whiteKingRow !== -1) score += (3.5 - whiteKingRow); // positive if king is in top half
            if (blackKingRow !== -1) score += (blackKingRow - 3.5); // positive if king is in bottom half
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

        return isFlipped ? rotateFen(fen) : fen;
    }

    // ── Position loading ───────────────────────────────────────────────────

    loadPosition(fen, orientation) {
        try {
            if (fen.split(' ').length < 6) fen += ' w - - 0 1';
            this.chess.load(fen);
            this.moveHistory = [];
            this.currentMoveIndex = -1;
            this.updateBoardState(orientation);
        } catch (e) {
            console.error('loadPosition error:', e);
            this.showStatus('Invalid FEN', 'error');
        }
    }

    // ── Image scan ─────────────────────────────────────────────────────────

    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showStatus('Processing image…', 'info');

        try {
            const base64Data  = await this.compressImage(file);
            this.showStatus('Cleaning image…', 'info');
            const cleanedData = await this.applyRemoveBleeding(base64Data);

            const sizeKB = ((cleanedData.length - 22) * 3 / 4 / 1024).toFixed(1);
            this.showStatus(`Uploading (${sizeKB} KB)…`, 'info');

            const response = await fetch('/.netlify/functions/board-to-fen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: cleanedData })
            });

            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            if (!data.fen)  throw new Error('No FEN returned');

            const fen = this.detectOrientation(data.fen);
            console.log('FEN from API:', data.fen);
            console.log('FEN after orientation check:', fen);
            this.loadPosition(fen, 'white');
            this.showStatus('Board detected — adjust turn / orientation if needed', 'success');

        } catch (error) {
            console.error('Image processing error:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.elements.cameraInput.value = '';
        }
    }

    compressImage(file, maxWidth = 1024, quality = 0.7) {
        return new Promise((resolve, reject) => {
            if (file.size < 300000) {
                const reader = new FileReader();
                reader.onload  = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(e);
                reader.readAsDataURL(file);
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let { width, height } = img;
                    if (width > maxWidth) {
                        height = Math.round(height * maxWidth / width);
                        width  = maxWidth;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width  = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    applyRemoveBleeding(base64Data) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64Data;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width  = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                ctx.putImageData(removeBleeding(ctx.getImageData(0, 0, canvas.width, canvas.height)), 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = (err) => reject(err);
        });
    }

    // ── Status toast ───────────────────────────────────────────────────────

    showStatus(message, type) {
        const el = this.elements.statusMessage;
        if (!el) return;
        el.textContent = message;
        el.className   = type;
        el.style.display = 'block';
        clearTimeout(this._statusTimer);
        this._statusTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
    }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new MobileChess());
} else {
    new MobileChess();
}

// ─────────────────────────────────────────────────────────────────────────────
// Image pre-processing: remove bleed-through / uneven illumination
// ─────────────────────────────────────────────────────────────────────────────

function _gaussianBlur(src, width, height, sigma) {
    const radius = Math.ceil(3 * sigma);
    const size   = 2 * radius + 1;
    const kernel = new Float32Array(size);
    let ksum = 0;
    for (let i = 0; i < size; i++) {
        const x = i - radius;
        kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
        ksum += kernel[i];
    }
    for (let i = 0; i < size; i++) kernel[i] /= ksum;

    const tmp = new Float32Array(width * height);
    const dst = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            let acc = 0;
            for (let k = -radius; k <= radius; k++) {
                acc += src[row + Math.min(Math.max(x + k, 0), width - 1)] * kernel[k + radius];
            }
            tmp[row + x] = acc;
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let acc = 0;
            for (let k = -radius; k <= radius; k++) {
                acc += tmp[Math.min(Math.max(y + k, 0), height - 1) * width + x] * kernel[k + radius];
            }
            dst[y * width + x] = acc;
        }
    }
    return dst;
}

function removeBleeding(imageData) {
    const { data, width, height } = imageData;
    const n = width * height;

    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    const bg      = _gaussianBlur(gray, width, height, 25);
    const norm    = new Float32Array(n);
    const blendFactor = 0.5; // Controls how much we rely on the background subtraction
    
    for (let i = 0; i < n; i++) {
        // Less aggressive normalization: mix the original grayscale with the normalized version
        // so dark pieces don't get completely washed out into white context.
        const normalizedValue = ((gray[i] + 1) / (bg[i] + 1)) * 255;
        norm[i] = Math.min(255, Math.max(0, (normalizedValue * blendFactor) + (gray[i] * (1 - blendFactor))));
    }

    const denoised = _gaussianBlur(norm, width, height, 2);
    const out      = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
        const v = Math.round(denoised[i]);
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
        out[i * 4 + 3] = 255;
    }
    return new ImageData(out, width, height);
}
