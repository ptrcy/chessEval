/**
 * FEN Manipulation Utilities
 */

/**
 * Infers castling rights optimistically: if a king and rook are both on their
 * starting squares, the corresponding castling right is granted.
 * Overwrites whatever castling field is currently in the FEN.
 *
 * @param {string} fen
 * @returns {string}
 */
export function inferCastlingRights(fen) {
    if (!fen) return fen;
    const parts  = fen.split(' ');
    const ranks  = parts[0].split('/');
    const expand = (s) => s.replace(/\d/g, (d) => '1'.repeat(parseInt(d, 10)));
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
    parts[2] = castling || '-';
    return parts.join(' ');
}

/**
 * Rotates a FEN string 180 degrees.
 * This effectively flips the board:
 * - Rank 8 becomes Rank 1
 * - Rank 1 becomes Rank 8
 * - The pieces in each rank are reversed (a-h becomes h-a)
 * 
 * @param {string} fen - The FEN string to rotate
 * @returns {string} - The rotated FEN string
 */
export function rotateFen(fen) {
    if (!fen) return fen;
    
    const parts = fen.split(' ');
    const rows = parts[0].split('/');

    const reversedRows = rows.map(row => {
        // Expand numbers to 1s: "3p4" -> "111p1111"
        let expanded = row.replace(/\d/g, d => '1'.repeat(parseInt(d)));
        // Reverse the string
        let reversed = expanded.split('').reverse().join('');
        // Collapse 1s back to numbers: "111p1111" -> "3p4"
        return reversed.replace(/1+/g, m => m.length);
    }).reverse(); // Reverse the order of rows

    // Reconstruct FEN
    parts[0] = reversedRows.join('/');
    
    return parts.join(' ');
}
