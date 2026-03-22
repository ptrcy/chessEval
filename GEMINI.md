# Chess Mobile - Board Analyzer

A mobile-optimized chess application that allows users to scan physical chess boards from photos and analyze the positions using Stockfish WASM.

## Project Overview

The project provides an interactive chess board that can be populated by uploading an image of a real-world chess board. It uses computer vision (via an external OCR API) to detect piece positions and then runs a local Stockfish engine to provide evaluations and move suggestions.

### Core Technologies
- **Frontend:** Vanilla JavaScript (ESM) with [Vite](https://vitejs.dev/) as the build tool.
- **Chess Logic:** [chess.js](https://github.com/jhlywa/chess.js) for move validation and FEN handling.
- **Chess Board:** [chessground](https://github.com/lichess-org/chessground) for the interactive UI.
- **Engine:** [Stockfish WASM](https://github.com/hi-ogawa/stockfish-wasm) running in a Web Worker.
- **Backend:** [Netlify Functions](https://www.netlify.com/products/functions/) used as a proxy for the OCR API.
- **Computer Vision:** Custom client-side image preprocessing (Gaussian blur, normalization) and an external OCR API (`https://helpman.komtera.lt/predict`) for piece detection.

### Architecture
- `src/app.js`: Main application controller, handles UI interactions, board state, and image processing.
- `src/engine.js`: Wrapper for the Stockfish Web Worker.
- `src/stockfishWorker.js`: Web Worker script that communicates with the Stockfish WASM binary.
- `src/utils/fen.js`: Utility functions for FEN manipulation (e.g., rotating the board 180°).
- `netlify/functions/board-to-fen.js`: Serverless function that proxies the image to the OCR API and handles optimistic castling rights inference.
- `public/stockfish/`: Contains the Stockfish WASM binary and its loader.

## Building and Running

### Development
To start the development server:
```bash
npm run dev
```

To run the project with Netlify Functions locally:
```bash
# Requires netlify-cli
netlify dev
```

### Production
To build the project for production:
```bash
npm run build
```
The output will be in the `dist/` directory.

### Testing
Currently, there is no automated test suite. Manual testing is performed via the browser.

## Development Conventions

- **Modular JS:** Use ES Modules for all source files.
- **Web Worker:** Keep heavy engine computations in `src/stockfishWorker.js` to avoid blocking the main UI thread.
- **Image Preprocessing:** When adding new image filters, implement them in `src/app.js` using HTML5 Canvas for performance.
- **Mobile First:** The UI is designed specifically for mobile viewports (`index.html` meta tags and `src/app.css`).
- **FEN Robustness:** Always ensure FEN strings include all 6 fields (pieces, turn, castling, en passant, half-move clock, full-move number) before loading into `chess.js`.

## Key Files
- `index.html`: Main entry point and mobile UI layout.
- `src/app.js`: Orchestrates the board, engine, and image scanning logic.
- `src/engine.js`: Manages the lifecycle of the Stockfish engine.
- `netlify.toml`: Configuration for Netlify deployment and functions.
- `vite.config.js`: Vite build configuration, including proxy settings for local development.
