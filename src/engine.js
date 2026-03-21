/**
 * Stockfish Engine Wrapper
 * Manages communication with Stockfish Web Worker and parses analysis results
 */

export class StockfishEngine {
    constructor(options = {}) {
        this.worker = null;
        this.isAnalyzing = false;
        this.analysisCallback = null;
        this.options = {
            multiPv: options.multiPv || 3,
            threads: options.threads || 2,
            ...options
        };
        this.currentAnalysis = {
            score: null,
            mate: null,
            depth: 0,
            moves: []
        };
    }

    /**
     * Initialize the Stockfish worker
     */
    async init() {
        return new Promise((resolve, reject) => {
            try {
                this.worker = new Worker(
                    new URL('./stockfishWorker.js', import.meta.url),
                    { type: 'module' }
                );

                this.worker.onmessage = (e) => this.handleMessage(e);
                this.worker.onerror = (error) => {
                    console.error('Worker error:', error);
                    reject(error);
                };

                // Initialize the worker
                this.worker.postMessage({ type: 'init' });

                // UCI flow: uci -> uciok -> [options] -> isready -> readyok
                const onMessage = (e) => {
                    const { type, data } = e.data;

                    if (type === 'error') {
                        this.worker.removeEventListener('message', onMessage);
                        reject(new Error(data));
                        return;
                    }

                    if (type === 'output') {
                        if (data === 'uciok') {
                            this.sendCommand(`setoption name MultiPV value ${this.options.multiPv}`);
                            this.sendCommand(`setoption name Threads value ${this.options.threads}`);
                            this.sendCommand('isready');
                        } else if (data === 'readyok') {
                            this.worker.removeEventListener('message', onMessage);
                            resolve();
                        }
                    }
                };

                this.worker.addEventListener('message', onMessage);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Handle messages from worker
     */
    handleMessage(e) {
        const { type, data } = e.data;

        if (type === 'output') {
            this.parseEngineOutput(data);
        } else if (type === 'error') {
            console.error('Engine error:', data);
            if (this.analysisCallback) {
                this.analysisCallback({ error: data });
            }
        }
    }

    /**
     * Parse Stockfish output and extract analysis data
     */
    parseEngineOutput(line) {
        // Parse info lines with score and moves
        if (line.startsWith('info') && line.includes('depth')) {
            const depthMatch = line.match(/depth (\d+)/);
            const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
            const pvMatch = line.match(/pv (.+)/);
            const multiPvMatch = line.match(/multipv (\d+)/);

            if (depthMatch) {
                const depth = parseInt(depthMatch[1]);
                const multiPv = multiPvMatch ? parseInt(multiPvMatch[1]) : 1;

                if (pvMatch) {
                    // Split PV into tokens and extract UCI moves (e2e4, e7e8q, etc.)
                    const tokens = pvMatch[1].trim().split(/\s+/);
                    const uciTokens = tokens.filter(t =>
                        /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t)
                    );

                    if (uciTokens.length === 0) {
                        return;
                    }

                    const primaryMove = uciTokens[0];

                    // Parse score
                    let score = null;
                    let mate = null;

                    if (scoreMatch) {
                        if (scoreMatch[1] === 'cp') {
                            score = parseInt(scoreMatch[2]);
                        } else if (scoreMatch[1] === 'mate') {
                            mate = parseInt(scoreMatch[2]);
                        }
                    }

                    // Update analysis data
                    if (multiPv === 1) {
                        this.currentAnalysis.depth = depth;
                        this.currentAnalysis.score = score;
                        this.currentAnalysis.mate = mate;
                    }

                    // Store move with its evaluation
                    const moveIndex = multiPv - 1;
                    this.currentAnalysis.moves[moveIndex] = {
                        move: primaryMove,
                        score: score,
                        mate: mate,
                        line: uciTokens
                    };
                }
            }
        }

        // When analysis completes at target depth, send callback
        if (line.startsWith('bestmove')) {
            if (this.analysisCallback && this.currentAnalysis.moves.length > 0) {
                this.analysisCallback({
                    ...this.currentAnalysis,
                    moves: this.currentAnalysis.moves.filter(m => m !== undefined)
                });
            }
        }
    }

    /**
     * Send command to Stockfish
     */
    sendCommand(command) {
        if (this.worker) {
            this.worker.postMessage({ type: 'command', command });
        }
    }

    /**
     * Start analyzing a position
     * @param {string} fen - FEN string of position
     * @param {number} depth - Analysis depth (default 15)
     * @param {function} callback - Callback for analysis results
     */
    analyze(fen, depth = 15, callback) {
        this.isAnalyzing = true;
        this.analysisCallback = callback;
        this.currentAnalysis = {
            score: null,
            mate: null,
            depth: 0,
            moves: []
        };

        this.sendCommand(`position fen ${fen}`);
        this.sendCommand(`go depth ${depth}`);
    }

    /**
     * Stop current analysis
     */
    stop() {
        this.isAnalyzing = false;
        this.analysisCallback = null;
        if (this.worker) {
            this.worker.postMessage({ type: 'stop' });
        }
    }

    /**
     * Terminate the worker
     */
    destroy() {
        this.stop();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
