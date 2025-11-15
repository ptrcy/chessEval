# ♔ Lichess Board Analyzer

A production-ready, interactive chess board analyzer powered by Stockfish WASM. This single-page web application mimics the Lichess board analyzer experience with real-time position evaluation, animated move suggestions, and a beautiful, responsive UI.

![Chess Board Analyzer](https://img.shields.io/badge/Chess-Analyzer-blue)
![Stockfish](https://img.shields.io/badge/Stockfish-17.1.0-green)
![Vite](https://img.shields.io/badge/Vite-5.0-purple)

## 🎯 Features

### Core Functionality
- **Interactive Chess Board**: Drag-and-drop pieces to make moves with full validation
- **FEN Position Loading**: Load any chess position via FEN string input
- **Real-time Engine Analysis**: Powered by Stockfish 17 running in a Web Worker
- **Evaluation Display**:
  - Visual evaluation bar (green for White advantage, red for Black)
  - Centipawn score display (e.g., +1.23, -2.00)
  - Mate detection (e.g., "M5" for mate in 5)
- **Top 3 Best Moves**: Shows the engine's top 3 recommended moves with their evaluations
- **Animated Move Arrows**: Sequential arrow animations showing the best moves on the board
- **Auto-analysis**: Automatically re-analyzes after each user move when analysis is active

### Technical Features
- **Non-blocking Analysis**: Stockfish runs in a Web Worker to keep UI responsive
- **Deep Analysis**: Configurable depth (default: 15) with MultiPV=3
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Touch-friendly**: Full touch support for mobile chess playing
- **Keyboard Accessible**: ARIA labels and focus management
- **Performance Optimized**: Vite-built bundle with code splitting

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Modern web browser with WebAssembly support (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd chessnpm
```

2. **Install dependencies**
```bash
npm install
```

3. **Development Mode**
```bash
npm run dev
```
This starts a local dev server at `http://localhost:5173`

4. **Production Build**
```bash
npm run build
```
This creates an optimized bundle in the `dist/` folder

5. **Preview Production Build**
```bash
npm run preview
```

### Running the Built Application

After building, simply open `dist/index.html` in your web browser or serve the `dist/` folder with any static file server:

```bash
# Using Python
python -m http.server --directory dist 8080

# Using Node.js http-server
npx http-server dist -p 8080
```

Then navigate to `http://localhost:8080`

## 📖 Usage Guide

### Loading a Position

1. **Default Position**: The app starts with the standard chess starting position
2. **Custom FEN**:
   - Paste a FEN string in the input box below the board
   - Click "Load Position" or press Enter
   - Invalid FEN strings will show an error message

Example FEN strings to try:
```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1  (Starting position)
r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3  (Italian Game)
8/8/8/8/8/2k5/2P5/2K5 w - - 0 1  (Endgame position)
```

### Analyzing Positions

1. **Start Analysis**: Click the "Start Analysis" button
   - The button turns red and changes to "Stop Analysis"
   - Stockfish begins analyzing at depth 15
   - Evaluation and top moves appear automatically

2. **Reading the Evaluation**:
   - **Positive scores** (e.g., +1.50): White is better by 1.5 pawns
   - **Negative scores** (e.g., -2.30): Black is better by 2.3 pawns
   - **Mate scores** (e.g., +M5): White can force mate in 5 moves
   - The eval bar visually represents the advantage

3. **Top 3 Moves**:
   - Shows the best moves in standard algebraic notation (SAN)
   - Each move displays its evaluation
   - Click any move to preview it temporarily on the board

4. **Move Arrows**:
   - Arrows appear sequentially on the board
   - Blue arrow: Best move
   - Green arrow: Second best move
   - Yellow arrow: Third best move
   - Arrows fade after 3 seconds

### Making Moves

1. **Drag and Drop**: Click and drag a piece to a legal square
2. **Auto-promotion**: Pawns automatically promote to Queen
3. **Move Validation**: Invalid moves are rejected and the board resets
4. **Auto-reanalysis**: If analysis is active, the new position is analyzed automatically

### Game States

- **Checkmate**: Shows winner and evaluation
- **Stalemate**: Displays draw message
- **Draw**: Detects and announces draw conditions

## 🛠️ Technology Stack

### Core Libraries
- **[Chessground](https://github.com/lichess-org/chessground)** v9.1.1: Lichess's official chess board UI
- **[Chess.js](https://github.com/jhlywa/chess.js)** v1.0.0-beta.8: Chess logic and move validation
- **[Stockfish](https://github.com/nmrugg/stockfish.js)** v17.1.0: UCI chess engine via CDN

### Build Tools
- **[Vite](https://vitejs.dev/)** v5.0: Lightning-fast build tool and dev server
- **Vanilla JavaScript**: ES6+ with modules (no framework overhead)

### Key Features
- **Web Workers**: Stockfish runs in a separate thread for non-blocking analysis
- **CSS Grid & Flexbox**: Modern, responsive layout
- **CSS Animations**: Smooth arrow transitions and UI feedback
- **CDN Integration**: Stockfish loaded from jsdelivr CDN for reliability

## 📁 Project Structure

```
chessnpm/
├── src/
│   ├── main.js              # Main application logic
│   ├── engine.js            # Stockfish engine wrapper
│   ├── stockfishWorker.js   # Web Worker for Stockfish
│   └── style.css            # Application styles
├── index.html               # HTML entry point
├── package.json             # Dependencies and scripts
├── vite.config.js           # Vite configuration
└── README.md                # This file
```

## ⚙️ Configuration

### Analysis Depth
To change the analysis depth, edit `src/main.js`:
```javascript
this.engine.analyze(fen, 15, (result) => { // Change 15 to desired depth
```

### MultiPV (Number of top moves)
To change the number of top moves, edit `src/engine.js`:
```javascript
this.sendCommand('setoption name MultiPV value 3'); // Change 3 to desired number
```

### Stockfish Version
To use a different Stockfish version, edit `src/stockfishWorker.js`:
```javascript
importScripts('https://cdn.jsdelivr.net/npm/stockfish@17.1.0/stockfish.js');
```

## 🎨 Customization

### Theme Colors
Edit CSS variables in `src/style.css`:
```css
:root {
    --primary-color: #3893e8;
    --success-color: #56b45d;
    --danger-color: #dc524a;
    --bg-color: #161512;
    --panel-bg: #262421;
    /* ... more colors ... */
}
```

### Board Style
Chessground supports multiple themes. Edit the board div class in `index.html`:
```html
<div id="chessboard" class="blue merida"></div>
<!-- Options: blue, brown, green, ic, purple, canvas -->
```

## 🔧 Troubleshooting

### Stockfish Not Loading
- **Error**: "Failed to initialize Stockfish"
- **Solution**: Ensure you have internet connection (Stockfish loads from CDN)
- **Alternative**: Download stockfish.js and update the importScripts path

### Invalid FEN Error
- **Error**: "Invalid FEN: ..."
- **Solution**: Verify your FEN string is correctly formatted with all 6 fields

### Board Not Rendering
- **Check**: Browser console for errors
- **Solution**: Ensure all npm packages installed: `npm install`

### Build Failures
- **Error**: Build fails during `npm run build`
- **Solution**: Clear node_modules and reinstall: `rm -rf node_modules && npm install`

## 🌐 Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+
- ❌ Internet Explorer (not supported)

**Requirements**: WebAssembly support, ES6 modules, Web Workers

## 📝 License

This project is provided as-is for educational and personal use.

### Third-party Licenses
- **Stockfish**: GNU GPL v3
- **Chessground**: GNU GPL v3
- **Chess.js**: BSD 2-Clause License

## 🙏 Acknowledgments

- [Lichess](https://lichess.org) for the amazing open-source Chessground library
- [Stockfish](https://stockfishchess.org/) team for the powerful chess engine
- [Jeff Hlywa](https://github.com/jhlywa) for chess.js

## 🚧 Future Enhancements

Potential features for future versions:
- [ ] Position history with undo/redo
- [ ] PGN import/export
- [ ] Opening book integration
- [ ] Cloud engine analysis
- [ ] Multiple board themes
- [ ] Analysis lines visualization
- [ ] Engine configuration UI
- [ ] Mobile app (PWA)

## 🐛 Bug Reports

Found a bug? Please check the console for errors and report issues with:
1. Browser version
2. Console error messages
3. Steps to reproduce
4. Expected vs actual behavior

---

**Happy Analyzing! ♟️**

Made with ❤️ using Vite, Stockfish, and Chessground
