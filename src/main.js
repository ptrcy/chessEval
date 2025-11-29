/**
 * Lichess Board Analyzer - Main Application
 * Interactive chess analysis with Stockfish WASM
 */

import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { StockfishEngine } from './engine.js';
import './style.css';

// Default starting position
const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

class BoardAnalyzer {
    constructor() {
        this.chess = new Chess();
        this.board = null;
        this.engine = null;
        this.isAnalysisActive = false;
        this.currentArrows = [];
        this.arrowAnimationTimeout = null;
        this.fenList = [];
        this.currentFenIndex = -1;
        this.moveHistory = [];
        this.currentMoveIndex = -1;

        // DOM elements
        this.elements = {
            board: document.getElementById('chessboard'),
            fenInput: document.getElementById('fenInput'),
            fenError: document.getElementById('fenError'),
            toggleAnalysisBtn: document.getElementById('toggleAnalysisBtn'),
            analysisLabel: document.getElementById('analysisLabel'),
            evalScore: document.getElementById('evalScore'),
            evalBar: document.getElementById('evalBar'),
            evalDepth: document.getElementById('evalDepth'),
            topMovesList: document.getElementById('topMovesList'),
            statusMessage: document.getElementById('statusMessage'),
            fenFileInput: document.getElementById('fenFileInput'),
            prevFenBtn: document.getElementById('prevFenBtn'),
            nextFenBtn: document.getElementById('nextFenBtn'),
            prevMoveBtn: document.getElementById('prevMoveBtn'),
            nextMoveBtn: document.getElementById('nextMoveBtn'),
            firstMoveBtn: document.getElementById('firstMoveBtn'),
            lastMoveBtn: document.getElementById('lastMoveBtn'),
            turnIndicator: document.getElementById('turnIndicator'),
            positionCounter: document.getElementById('positionCounter'),
            positionProgressBar: document.getElementById('positionProgressBar'),
            fileDropZone: document.getElementById('fileDropZone'),
            fileInfo: document.getElementById('fileInfo'),
            fileName: document.getElementById('fileName'),
            removeFileBtn: document.getElementById('removeFileBtn')
        };

        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Initialize Chessground board
            this.initBoard();

            // Initialize Stockfish engine in the background
            this.elements.toggleAnalysisBtn.disabled = true;
            this.showStatus('Initializing Stockfish engine...', 'info');
            this.engine = new StockfishEngine();
            this.engine.init().then(() => {
                this.elements.toggleAnalysisBtn.disabled = false;
                this.showStatus('Engine ready!', 'success');
                setTimeout(() => this.clearStatus(), 2000);
            }).catch(error => {
                console.error('Engine initialization error:', error);
                this.showStatus(`Failed to load engine: ${error.message}`, 'error');
            });

            // Set up event listeners
            this.setupEventListeners();

            // Load default position
            this.loadPosition(DEFAULT_FEN);

        } catch (error) {
            console.error('Initialization error:', error);
            this.showStatus(`Failed to initialize: ${error.message}`, 'error');
        }
    }

    /**
     * Initialize Chessground board
     */
    initBoard() {
        this.board = Chessground(this.elements.board, {
            fen: DEFAULT_FEN,
            movable: {
                free: false,
                color: 'both',
                events: {
                    after: (orig, dest) => this.onMove(orig, dest)
                }
            },
            draggable: {
                enabled: true,
                showGhost: true
            },
            highlight: {
                lastMove: true,
                check: true
            },
            animation: {
                enabled: true,
                duration: 200
            }
        });
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        this.elements.fenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const fen = this.elements.fenInput.value.trim();
                if (fen) {
                    this.loadPosition(fen);
                }
            }
        });

        this.elements.toggleAnalysisBtn.addEventListener('click', () => {
            this.toggleAnalysis();
        });

        this.elements.fenFileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e);
        });

        this.elements.prevFenBtn.addEventListener('click', () => {
            this.loadPrevFen();
        });

        this.elements.nextFenBtn.addEventListener('click', () => {
            this.loadNextFen();
        });

        this.elements.prevMoveBtn.addEventListener('click', () => {
            this.goToPrevMove();
        });

        this.elements.nextMoveBtn.addEventListener('click', () => {
            this.goToNextMove();
        });

        this.elements.firstMoveBtn.addEventListener('click', () => {
            this.goToFirstMove();
        });

        this.elements.lastMoveBtn.addEventListener('click', () => {
            this.goToLastMove();
        });

        // File Drop Zone
        const dropZone = this.elements.fileDropZone;

        dropZone.addEventListener('click', (e) => {
            if (e.target !== this.elements.fenFileInput) {
                this.elements.fenFileInput.click();
            }
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');

            if (e.dataTransfer.files.length > 0) {
                this.elements.fenFileInput.files = e.dataTransfer.files;
                // Trigger change event manually
                const event = new Event('change');
                this.elements.fenFileInput.dispatchEvent(event);
            }
        });

        this.elements.removeFileBtn.addEventListener('click', () => {
            this.clearFile();
        });

        // Global shortcuts
        document.addEventListener('keydown', (e) => {
            // Toggle analysis with 'e'
            if (e.key === 'e' && document.activeElement !== this.elements.fenInput) {
                this.toggleAnalysis();
            }
        });

        document.addEventListener('paste', (e) => {
            console.log('Paste event fired');
            // Only handle paste if not in a text input field
            const target = document.activeElement;
            const isTextInput = target.tagName === 'TEXTAREA' ||
                (target.tagName === 'INPUT' && (target.type === 'text' || target.type === 'search' || target.type === 'password'));

            if (isTextInput) {
                console.log('Paste ignored: inside text input');
                return;
            }

            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            console.log('Paste content:', text);

            if (!text) {
                this.showStatus('Clipboard empty or no text found', 'error');
                return;
            }

            this.showStatus(`Paste detected: ${text.substring(0, 20)}...`, 'info');
            this.loadFenList(text);
        });
    }

    /**
     * Load a position from FEN
     */
    loadPosition(fen) {
        try {
            // Check if FEN is incomplete (missing active color etc.)
            // Standard FEN has 6 fields. If less, append default suffix.
            if (fen.split(' ').length < 6) {
                fen += ' w - - 0 1';
            }

            // Validate FEN
            const testChess = new Chess(fen);

            // If valid, update the board
            this.chess.load(fen);
            this.board.set({
                fen: fen,
                turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
                movable: {
                    color: 'both',
                    dests: this.getMoveDests()
                }
            });

            // Update FEN input
            this.elements.fenInput.value = fen;
            this.clearError();

            // Update list selection (internal state only)
            this.currentFenIndex = this.fenList.indexOf(fen);
            this.updateNavButtons();
            this.updatePositionCounter();
            this.updateTurnIndicator();

            // Clear previous analysis
            this.clearArrows();
            this.clearTopMoves();

            // Reset move history
            this.moveHistory = [];
            this.currentMoveIndex = -1;
            this.updateMoveButtons();

            // Always stop analysis when loading new position
            if (this.isAnalysisActive) {
                this.toggleAnalysis();
            }

        } catch (error) {
            this.showError('Invalid FEN: ' + error.message);
        }
    }

    /**
     * Handle file upload
     */
    /**
     * Handle file upload
     */
    handleFileUpload(event) {
        console.log('File upload triggered');
        const file = event.target.files[0];
        if (!file) return;

        // Check if it's an image
        if (file.type.startsWith('image/')) {
            this.handleImageUpload(file);
            return;
        }

        this.showStatus('Reading file...', 'info');

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('File read successfully');
            const content = e.target.result;
            this.showStatus(`File read: ${content.substring(0, 20)}...`, 'success');
            this.loadFenList(content);

            // Update file info UI
            this.elements.fileDropZone.style.display = 'none';
            this.elements.fileInfo.style.display = 'flex';
            this.elements.fileName.textContent = file.name;
        };
        reader.readAsText(file);
    }

    /**
     * Handle image upload for OCR
     */
    handleImageUpload(file) {
        console.log('handleImageUpload called with file:', file.name, file.type);
        this.showStatus('Processing image...', 'info');

        const reader = new FileReader();
        reader.onload = async (e) => {
            console.log('Image read as base64');
            const base64Data = e.target.result;

            try {
                console.log('Sending request to /.netlify/functions/board-to-fen');
                const response = await fetch('/.netlify/functions/board-to-fen', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ image: base64Data })
                });

                if (!response.ok) {
                    throw new Error(`Server error: ${response.statusText}`);
                }

                const data = await response.json();

                if (data.error) {
                    throw new Error(data.error);
                }

                if (data.fen) {
                    this.showStatus('Board detected!', 'success');
                    this.loadPosition(data.fen);

                    // Update file info UI
                    this.elements.fileDropZone.style.display = 'none';
                    this.elements.fileInfo.style.display = 'flex';
                    this.elements.fileName.textContent = file.name;
                } else {
                    throw new Error('No FEN returned');
                }

            } catch (error) {
                console.error('Image processing error:', error);
                this.showStatus(`Image processing failed: ${error.message}`, 'error');
                this.clearFile(); // Reset file input
            }
        };
        reader.readAsDataURL(file);
    }

    /**
     * Clear loaded file
     */
    clearFile() {
        this.fenList = [];
        this.currentFenIndex = -1;
        this.elements.fenFileInput.value = '';
        this.elements.fileDropZone.style.display = 'block';
        this.elements.fileInfo.style.display = 'none';
        this.loadPosition(DEFAULT_FEN);
        this.updateNavButtons();
        this.updatePositionCounter();
    }

    /**
     * Load a list of FENs
     */
    loadFenList(fensString) {
        console.log('Loading FEN list, length:', fensString?.length);
        if (!fensString) return;

        const lines = fensString.split(/\r?\n/); // Handle both \n and \r\n
        this.fenList = [];

        lines.forEach(line => {
            const fen = line.trim();
            if (fen) {
                this.fenList.push(fen);
            }
        });

        console.log('Parsed FENs:', this.fenList.length);

        // Load the first one if available
        if (this.fenList.length > 0) {
            this.currentFenIndex = 0;
            this.loadPosition(this.fenList[0]);
        } else {
            this.showError('No valid FENs found in input');
        }
        this.updatePositionCounter();
    }

    /**
     * Render the FEN list (internal method, kept for compatibility if needed, but UI removed)
     * Actually, the previous code had this call but I don't see the method definition in the file I read in Step 208!
     * Wait, Step 208 file content:
     * Line 233: this.renderFenList();
     * But where is renderFenList defined?
     * It is NOT defined in the file content I read in Step 208.
     * This is a CRITICAL finding. If renderFenList is called but not defined, it will throw an error and stop execution!
     */

    // I need to remove the call to renderFenList() since I removed the UI for it.

    /**
     * Update navigation buttons state
     */
    updateNavButtons() {
        if (this.fenList.length === 0) {
            this.elements.prevFenBtn.disabled = true;
            this.elements.nextFenBtn.disabled = true;
            return;
        }

        this.elements.prevFenBtn.disabled = this.currentFenIndex <= 0;
        this.elements.nextFenBtn.disabled = this.currentFenIndex >= this.fenList.length - 1 || this.currentFenIndex === -1;
    }

    /**
     * Update position counter and progress bar
     */
    updatePositionCounter() {
        const total = this.fenList.length;
        const current = this.currentFenIndex + 1;

        if (total === 0) {
            this.elements.positionCounter.textContent = '1 / 1';
            this.elements.positionProgressBar.style.width = '100%';
        } else {
            this.elements.positionCounter.textContent = `${current} / ${total}`;
            const percentage = (current / total) * 100;
            this.elements.positionProgressBar.style.width = `${percentage}%`;
        }
    }

    /**
     * Load previous FEN
     */
    loadPrevFen() {
        if (this.currentFenIndex > 0) {
            this.loadPosition(this.fenList[this.currentFenIndex - 1]);
        }
    }

    /**
     * Load next FEN
     */
    loadNextFen() {
        if (this.currentFenIndex < this.fenList.length - 1) {
            this.loadPosition(this.fenList[this.currentFenIndex + 1]);
        }
    }

    /**
     * Go to previous move
     */
    goToPrevMove() {
        if (this.currentMoveIndex >= 0) {
            this.chess.undo();
            this.currentMoveIndex--;
            this.updateBoardAfterNav();
        }
    }

    /**
     * Go to next move
     */
    goToNextMove() {
        if (this.currentMoveIndex < this.moveHistory.length - 1) {
            const move = this.moveHistory[this.currentMoveIndex + 1];
            this.chess.move(move);
            this.currentMoveIndex++;
            this.updateBoardAfterNav();
        }
    }

    /**
     * Go to first move
     */
    goToFirstMove() {
        if (this.currentMoveIndex >= 0) {
            this.chess.reset();
            // We need to reload the initial FEN if it wasn't the standard start position
            // But for now, let's just undo all moves
            // Actually, chess.js reset() goes to standard start. 
            // Better to undo until index is -1
            while (this.currentMoveIndex >= 0) {
                this.chess.undo();
                this.currentMoveIndex--;
            }
            // If we loaded a FEN, we need to make sure we are back at that FEN
            // The undo logic above works if we started from a FEN and made moves.
            // But if we loaded a FEN, chess.js history starts empty.
            // So undoing brings us back to the loaded FEN.

            this.updateBoardAfterNav();
        }
    }

    /**
     * Go to last move
     */
    goToLastMove() {
        if (this.currentMoveIndex < this.moveHistory.length - 1) {
            while (this.currentMoveIndex < this.moveHistory.length - 1) {
                const move = this.moveHistory[this.currentMoveIndex + 1];
                this.chess.move(move);
                this.currentMoveIndex++;
            }
            this.updateBoardAfterNav();
        }
    }

    /**
     * Update board after navigation
     */
    updateBoardAfterNav() {
        this.board.set({
            fen: this.chess.fen(),
            turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
            movable: {
                color: 'both',
                dests: this.getMoveDests()
            },
            lastMove: this.currentMoveIndex >= 0 ?
                [this.moveHistory[this.currentMoveIndex].from, this.moveHistory[this.currentMoveIndex].to] : undefined
        });

        this.elements.fenInput.value = this.chess.fen();
        this.clearArrows();
        this.updateMoveButtons();
        this.updateTurnIndicator();

        if (this.isAnalysisActive) {
            this.runAnalysis();
        }
    }

    /**
     * Update move navigation buttons
     */
    updateMoveButtons() {
        this.elements.prevMoveBtn.disabled = this.currentMoveIndex < 0;
        this.elements.firstMoveBtn.disabled = this.currentMoveIndex < 0;
        this.elements.nextMoveBtn.disabled = this.currentMoveIndex >= this.moveHistory.length - 1;
        this.elements.lastMoveBtn.disabled = this.currentMoveIndex >= this.moveHistory.length - 1;
    }

    /**
     * Get legal move destinations for Chessground
     */
    getMoveDests() {
        const dests = new Map();
        const moves = this.chess.moves({ verbose: true });

        moves.forEach(move => {
            if (!dests.has(move.from)) {
                dests.set(move.from, []);
            }
            dests.get(move.from).push(move.to);
        });

        return dests;
    }

    /**
     * Handle move on the board
     */
    onMove(orig, dest) {
        // Try to make the move
        const move = this.chess.move({
            from: orig,
            to: dest,
            promotion: 'q' // Always promote to queen for simplicity
        });

        if (move) {
            // Update board state
            this.board.set({
                fen: this.chess.fen(),
                turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
                movable: {
                    color: 'both',
                    dests: this.getMoveDests()
                }
            });

            // Update FEN input
            this.elements.fenInput.value = this.chess.fen();

            // Clear arrows
            this.clearArrows();

            // Check for game over
            if (this.chess.isGameOver()) {
                this.handleGameOver();
            } else if (this.isAnalysisActive) {
                // Re-analyze new position
                this.runAnalysis();
            }

            // Update move history
            // If we are not at the end of history, truncate it
            if (this.currentMoveIndex < this.moveHistory.length - 1) {
                this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex + 1);
            }
            this.moveHistory.push(move);
            this.currentMoveIndex++;
            this.updateMoveButtons();
            this.updateTurnIndicator();
        } else {
            // Invalid move - reset board
            this.board.set({
                fen: this.chess.fen()
            });
        }
    }

    /**
     * Handle game over states
     */
    handleGameOver() {
        if (this.chess.isCheckmate()) {
            const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
            this.showStatus(`Checkmate! ${winner} wins.`, 'success');
            this.updateEvalDisplay({ mate: 0 });
        } else if (this.chess.isDraw()) {
            this.showStatus('Draw!', 'info');
            this.updateEvalDisplay({ score: 0 });
        } else if (this.chess.isStalemate()) {
            this.showStatus('Stalemate!', 'info');
            this.updateEvalDisplay({ score: 0 });
        }

        this.clearTopMoves();
    }

    /**
     * Toggle analysis on/off
     */
    toggleAnalysis() {
        this.isAnalysisActive = !this.isAnalysisActive;

        if (this.isAnalysisActive) {
            this.elements.analysisLabel.textContent = 'Stop Analysis';
            this.elements.toggleAnalysisBtn.classList.add('active');
            this.runAnalysis();
        } else {
            this.elements.analysisLabel.textContent = 'Start Analysis';
            this.elements.toggleAnalysisBtn.classList.remove('active');
            this.engine.stop();
            this.clearArrows();
            this.clearEvalDisplay();
        }
    }

    /**
     * Update turn indicator
     */
    updateTurnIndicator() {
        const turn = this.chess.turn(); // 'w' or 'b'
        this.elements.turnIndicator.className = 'turn-indicator-dot';
        this.elements.turnIndicator.classList.add(turn === 'w' ? 'turn-white' : 'turn-black');
        this.elements.turnIndicator.title = turn === 'w' ? 'White to move' : 'Black to move';
    }

    /**
     * Clear evaluation display
     */
    clearEvalDisplay() {
        this.elements.evalScore.textContent = '+0.00';
        this.elements.evalScore.style.color = 'var(--text-color)';
        this.elements.evalBar.style.width = '50%';
        this.elements.evalBar.style.backgroundColor = 'var(--success-color)';
        this.elements.evalDepth.textContent = 'Depth: -';
        this.clearTopMoves();
    }

    /**
     * Run Stockfish analysis on current position
     */
    runAnalysis() {
        if (!this.engine || this.chess.isGameOver()) {
            return;
        }

        const fen = this.chess.fen();

        this.engine.analyze(fen, 15, (result) => {
            if (result.error) {
                this.showStatus('Analysis error: ' + result.error, 'error');
                return;
            }

            // Update evaluation display
            this.updateEvalDisplay(result);

            // Update top moves list
            this.updateTopMoves(result.moves);

            // Show arrows for top moves
            if (result.moves.length > 0) {
                this.showMoveArrows(result.moves.slice(0, 3));
            }
        });
    }

    /**
     * Update evaluation display
     */
    updateEvalDisplay(result) {
        const { score, mate, depth } = result;

        // Update depth
        if (depth !== undefined) {
            this.elements.evalDepth.textContent = `Depth: ${depth}`;
        }

        // Calculate evaluation
        let evalText = '+0.00';
        let evalPercent = 50;
        let color = 'var(--success-color)';

        if (mate !== null && mate !== undefined) {
            evalText = mate > 0 ? `+M${mate}` : `M${Math.abs(mate)}`;
            evalPercent = mate > 0 ? 100 : 0;
            color = mate > 0 ? 'var(--success-color)' : 'var(--danger-color)';
        } else if (score !== null && score !== undefined) {
            const cpScore = score / 100;
            evalText = (cpScore >= 0 ? '+' : '') + cpScore.toFixed(2);

            // Calculate percentage for eval bar (sigmoid-like function)
            // Clamp between -10 and +10 for display
            const clampedScore = Math.max(-1000, Math.min(1000, score));
            evalPercent = 50 + (clampedScore / 1000) * 50;
            color = score > 0 ? 'var(--success-color)' : 'var(--danger-color)';
        }

        // Update UI
        this.elements.evalScore.textContent = evalText;
        this.elements.evalScore.style.color = color;
        this.elements.evalBar.style.width = evalPercent + '%';
        this.elements.evalBar.style.backgroundColor = color;
    }

    /**
     * Update top moves list
     */
    updateTopMoves(moves) {
        if (!moves || moves.length === 0) {
            this.clearTopMoves();
            return;
        }

        const html = moves.slice(0, 3).map((moveData, index) => {
            const { move, score, mate } = moveData;

            // Convert UCI to SAN
            let san = move;
            try {
                const tempChess = new Chess(this.chess.fen());
                const from = move.substring(0, 2);
                const to = move.substring(2, 4);
                const promotion = move.length > 4 ? move.substring(4) : undefined;

                const moveObj = tempChess.move({ from, to, promotion });
                if (moveObj) {
                    san = moveObj.san;
                }
            } catch (e) {
                // Keep UCI notation if conversion fails
            }

            // Format evaluation
            let evalText = '';
            if (mate !== null && mate !== undefined) {
                evalText = mate > 0 ? `+M${mate}` : `M${Math.abs(mate)}`;
            } else if (score !== null && score !== undefined) {
                const cpScore = score / 100;
                evalText = (cpScore >= 0 ? '+' : '') + cpScore.toFixed(2);
            }

            return `
                <div class="move-item" data-move="${move}" data-index="${index}">
                    <span class="move-san">${index + 1}. ${san}</span>
                    <span class="move-eval">${evalText}</span>
                </div>
            `;
        }).join('');

        this.elements.topMovesList.innerHTML = html;

        // Add click handlers for move preview
        this.elements.topMovesList.querySelectorAll('.move-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const move = e.currentTarget.dataset.move;
                this.previewMove(move);
            });
        });
    }

    /**
     * Preview a move temporarily
     */
    previewMove(uciMove) {
        const from = uciMove.substring(0, 2);
        const to = uciMove.substring(2, 4);

        // Highlight the move
        this.board.setShapes([
            { orig: from, dest: to, brush: 'paleBlue' }
        ]);

        // Clear after 2 seconds
        setTimeout(() => {
            if (this.currentArrows.length === 0) {
                this.board.setShapes([]);
            }
        }, 2000);
    }

    /**
     * Show animated arrows for top moves
     */
    showMoveArrows(moves) {
        this.clearArrows();

        const arrows = moves.map((moveData, index) => {
            const { move } = moveData;
            const from = move.substring(0, 2);
            const to = move.substring(2, 4);

            // Different colors for top 3 moves
            const brushes = ['paleBlue', 'paleGreen', 'yellow'];
            const brush = brushes[index] || 'paleBlue';

            return { orig: from, dest: to, brush };
        });

        this.currentArrows = arrows;

        // Animate arrows sequentially
        this.animateArrows(arrows);
    }

    /**
     * Animate arrows appearing one by one
     */
    animateArrows(arrows) {
        if (this.arrowAnimationTimeout) {
            clearTimeout(this.arrowAnimationTimeout);
        }

        let currentIndex = 0;
        const visibleArrows = [];

        const showNextArrow = () => {
            // Stop animation if analysis is no longer running or game ended
            if (!this.isAnalysisActive || this.chess.isGameOver()) {
                this.board.setShapes([]);
                this.currentArrows = [];
                this.arrowAnimationTimeout = null;
                return;
            }

            if (currentIndex < arrows.length) {
                visibleArrows.push(arrows[currentIndex]);
                this.board.setShapes(visibleArrows);
                currentIndex++;

                this.arrowAnimationTimeout = setTimeout(showNextArrow, 600);
            } else {
                // All arrows shown: pause briefly, then restart the cycle
                this.arrowAnimationTimeout = setTimeout(() => {
                    if (!this.isAnalysisActive || this.chess.isGameOver()) {
                        this.board.setShapes([]);
                        this.currentArrows = [];
                        this.arrowAnimationTimeout = null;
                        return;
                    }

                    // Reset and start the animation loop again
                    currentIndex = 0;
                    visibleArrows.length = 0;
                    this.board.setShapes([]);
                    showNextArrow();
                }, 1200);
            }
        };

        showNextArrow();
    }

    /**
     * Clear arrows from board
     */
    clearArrows() {
        if (this.arrowAnimationTimeout) {
            clearTimeout(this.arrowAnimationTimeout);
            this.arrowAnimationTimeout = null;
        }
        this.board.setShapes([]);
        this.currentArrows = [];
    }

    /**
     * Clear top moves list
     */
    clearTopMoves() {
        this.elements.topMovesList.innerHTML = '<div class="move-placeholder">Start analysis to see moves...</div>';
    }

    /**
     * Show status message
     */
    showStatus(message, type = 'info') {
        this.elements.statusMessage.textContent = message;
        this.elements.statusMessage.className = `status-message ${type}`;
    }

    /**
     * Clear status message
     */
    clearStatus() {
        this.elements.statusMessage.textContent = '';
        this.elements.statusMessage.className = 'status-message';
    }

    /**
     * Show error in FEN input
     */
    showError(message) {
        this.elements.fenError.textContent = message;
    }

    /**
     * Clear FEN error
     */
    clearError() {
        this.elements.fenError.textContent = '';
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BoardAnalyzer();
});
