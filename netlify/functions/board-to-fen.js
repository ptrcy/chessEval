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

    // Ensure FEN has all 6 fields
    if (fen.split(' ').length < 6) fen += ' w - - 0 1';

    // --- Optimistic castling rights ---
    // Infer castling availability from king/rook starting squares.
    const fenParts = fen.split(' ');
    const ranks    = fenParts[0].split('/');
    const expand   = (s) => s.replace(/\d/g, (d) => '1'.repeat(parseInt(d, 10)));
    const r8 = expand(ranks[0]); // rank 8 (black back rank)
    const r1 = expand(ranks[7]); // rank 1 (white back rank)

    let castling = '';
    if (r1[4] === 'K') {
      if (r1[7] === 'R') castling += 'K';
      if (r1[0] === 'R') castling += 'Q';
    }
    if (r8[4] === 'k') {
      if (r8[7] === 'r') castling += 'k';
      if (r8[0] === 'r') castling += 'q';
    }
    fenParts[2] = castling || '-';
    fen = fenParts.join(' ');

    console.log('board-to-fen: returning FEN:', fen);
    return { statusCode: 200, body: JSON.stringify({ fen }) };

  } catch (error) {
    console.error('board-to-fen error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
