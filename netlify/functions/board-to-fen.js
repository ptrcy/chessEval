// netlify/functions/board-to-fen.js
// Thin proxy: receive image → call OCR API → return FEN.
// Orientation detection is handled on the client side.

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    if (!data.image) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) };
    }

    const base64Data = data.image.replace(/^data:image\/\w+;base64,/, '');
    const blob = new Blob([Buffer.from(base64Data, 'base64')], { type: 'image/png' });
    const form = new FormData();
    form.append('file', blob, 'board.png');

    const response = await fetch('https://helpman.komtera.lt/predict', {
      method: 'POST',
      body: form,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OCR API ${response.status}: ${response.statusText} – ${text}`);
    }

    const result = await response.json();
    let fen = result.results?.[0]?.fen ?? null;

    if (!fen) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Could not detect board' }) };
    }

    // Ensure FEN has all 6 fields (castling rights are inferred client-side
    // after orientation detection, so we leave them as '-' here).
    if (fen.split(' ').length < 6) fen += ' w - - 0 1';

    console.log('board-to-fen: returning FEN:', fen);
    return { statusCode: 200, body: JSON.stringify({ fen }) };

  } catch (error) {
    console.error('board-to-fen error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
