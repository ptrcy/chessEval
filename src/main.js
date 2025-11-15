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

        // DOM elements
        this.elements = {
            board: document.getElementById('chessboard'),
            fenInput: document.getElementById('fenInput'),
            loadFenBtn: document.getElementById('loadFenBtn'),
            fenError: document.getElementById('fenError'),
            toggleAnalysisBtn: document.getElementById('toggleAnalysisBtn'),
            analysisLabel: document.getElementById('analysisLabel'),
            evalScore: document.getElementById('evalScore'),
            evalBar: document.getElementById('evalBar'),
            evalDepth: document.getElementById('evalDepth'),
            topMovesList: document.getElementById('topMovesList'),
            statusMessage: document.getElementById('statusMessage')
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

            // Initialize Stockfish engine
            this.showStatus('Initializing Stockfish engine...', 'info');
            this.engine = new StockfishEngine();
            await this.engine.init();
            this.showStatus('Engine ready!', 'success');
            setTimeout(() => this.clearStatus(), 2000);

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
        this.elements.loadFenBtn.addEventListener('click', () => {
            const fen = this.elements.fenInput.value.trim();
            if (fen) {
                this.loadPosition(fen);
            }
        });

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
    }

    /**
     * Load a position from FEN
     */
    loadPosition(fen) {
        try {
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

            // Clear previous analysis
            this.clearArrows();
            this.clearTopMoves();

            // Re-analyze if active
            if (this.isAnalysisActive) {
                this.runAnalysis();
            }

        } catch (error) {
            this.showError('Invalid FEN: ' + error.message);
        }
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
        }
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
            if (currentIndex < arrows.length) {
                visibleArrows.push(arrows[currentIndex]);
                this.board.setShapes(visibleArrows);
                currentIndex++;

                this.arrowAnimationTimeout = setTimeout(showNextArrow, 600);
            } else {
                // Keep arrows visible for 3 seconds, then clear
                this.arrowAnimationTimeout = setTimeout(() => {
                    if (this.isAnalysisActive && !this.chess.isGameOver()) {
                        this.board.setShapes([]);
                        this.currentArrows = [];
                    }
                }, 3000);
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
