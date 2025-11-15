/**
 * Stockfish Web Worker
 * Handles Stockfish engine communication in a separate thread
 */

let stockfish = null;
let messageQueue = [];
let isReady = false;

// Initialize Stockfish using direct import
function initStockfish() {
    try {
        // Load Stockfish from CDN using importScripts (for Web Worker)
        importScripts('https://cdn.jsdelivr.net/npm/stockfish@17.1.0/stockfish.js');

        // Create Stockfish instance (stockfish.js provides a global Stockfish function)
        stockfish = self.Stockfish();

        stockfish.onmessage = function(line) {
            // Send all Stockfish output back to main thread
            self.postMessage({ type: 'output', data: line });

            // Check if engine is ready
            if (line === 'uciok') {
                isReady = true;
                // Process any queued commands
                while (messageQueue.length > 0) {
                    const cmd = messageQueue.shift();
                    stockfish.postMessage(cmd);
                }
            }
        };

        // Initialize UCI
        stockfish.postMessage('uci');

    } catch (error) {
        self.postMessage({
            type: 'error',
            data: `Failed to initialize Stockfish: ${error.message}`
        });
    }
}

// Handle messages from main thread
self.onmessage = function(e) {
    const { type, command } = e.data;

    if (type === 'init') {
        initStockfish();
        return;
    }

    if (type === 'command') {
        if (isReady && stockfish) {
            stockfish.postMessage(command);
        } else {
            // Queue commands until engine is ready
            messageQueue.push(command);
        }
    }

    if (type === 'stop') {
        if (stockfish) {
            stockfish.postMessage('stop');
        }
    }
};
