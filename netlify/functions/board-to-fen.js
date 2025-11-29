// netlify/functions/board-to-fen.js (or .mjs if your project uses ESM everywhere)

// ❗ Only external import you need:
import { rotateFen } from './fen-utils.js';

export const handler = async (event, context) => {
  console.log('Function board-to-fen invoked');
  console.log('Method:', event.httpMethod);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    console.log('Parsing body...');
    const data = JSON.parse(event.body);
    const imageBase64 = data.image;

    if (!imageBase64) {
      console.error('No image provided in body');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No image provided' }),
      };
    }

    console.log('Processing image data...');
    // Remove header if present (e.g., "data:image/png;base64,")
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // --- Pure JS / Node 18+: Blob + FormData (no polyfills, no form-data lib) ---
    const blob = new Blob([buffer], { type: 'image/png' });
    const form = new FormData();
    form.append('file', blob, 'board.png');
    // ---------------------------------------------------------------------------

    console.log('Sending request to OCR API...');
    const response = await fetch('https://helpman.komtera.lt/predict', {
      method: 'POST',
      body: form, // fetch will set the correct multipart/form-data headers
    });

    console.log('OCR API response status:', response.status);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `API responded with ${response.status}: ${response.statusText} – ${text}`,
      );
    }

    const result = await response.json();
    console.log('OCR API result:', JSON.stringify(result));

    // The API returns { results: [ { fen: "..." } ] }
    let fen =
      result.results && result.results[0] ? result.results[0].fen : null;

    if (!fen) {
      console.error('No FEN found in result');
      return {
        statusCode: 422,
        body: JSON.stringify({ error: 'Could not detect board' }),
      };
    }

    // Ensure FEN is complete (6 parts)
    if (fen.split(' ').length < 6) {
      fen += ' w - - 0 1';
    }

    // --- Heuristic Orientation Detection ---
    const rows = fen.split(' ')[0].split('/');
    const topHalf = rows.slice(0, 4).join('');
    const bottomHalf = rows.slice(4).join('');

    const countPieces = (str, color) => {
      const regex = color === 'w' ? /[A-Z]/g : /[a-z]/g;
      return (str.match(regex) || []).length;
    };

    const whiteTop = countPieces(topHalf, 'w');
    const blackTop = countPieces(topHalf, 'b');
    const whiteBottom = countPieces(bottomHalf, 'w');
    const blackBottom = countPieces(bottomHalf, 'b');

    let isFlipped = false;
    if (whiteTop > blackTop && blackBottom > whiteBottom) {
      isFlipped = true;
      console.log('Detected FLIPPED board orientation. Rotating...');
    } else {
      console.log('Detected NORMAL board orientation.');
    }

    if (isFlipped) {
      fen = rotateFen(fen);
    }

    // --- Optimistic Castling Rights ---
    const fenParts = fen.split(' ');
    const position = fenParts[0];
    const ranks = position.split('/');

    const rank8 = ranks[0]; // Black pieces
    const rank1 = ranks[7]; // White pieces

    const expandRank = (rankStr) =>
      rankStr.replace(/\d/g, (d) => '1'.repeat(parseInt(d, 10)));

    const r8 = expandRank(rank8);
    const r1 = expandRank(rank1);

    let castling = '';

    // White castling
    if (r1[4] === 'K') {
      if (r1[7] === 'R') castling += 'K'; // h1
      if (r1[0] === 'R') castling += 'Q'; // a1
    }

    // Black castling
    if (r8[4] === 'k') {
      if (r8[7] === 'r') castling += 'k'; // h8
      if (r8[0] === 'r') castling += 'q'; // a8
    }

    if (!castling) castling = '-';

    fenParts[2] = castling;
    fen = fenParts.join(' ');

    console.log('Success! Final FEN:', fen);
    return {
      statusCode: 200,
      body: JSON.stringify({ fen }),
    };
  } catch (error) {
    console.error('Error processing image:', error);
    console.error('Stack:', error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
    };
  }
};
