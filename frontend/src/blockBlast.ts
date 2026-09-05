export const BOARD_SIZE = 8;

export interface Piece {
  id: string;
  color: number;
  shape: number[][];
}

export interface BlastState {
  board: number[][];
  pieces: Array<Piece | null>;
  score: number;
  combo: number;
  gameOver: boolean;
}

export function canPlace(board: number[][], piece: Piece, row: number, col: number): boolean {
  for (let r = 0; r < piece.shape.length; r += 1) {
    for (let c = 0; c < piece.shape[r].length; c += 1) {
      if (!piece.shape[r][c]) continue;
      const nr = row + r;
      const nc = col + c;
      if (nr < 0 || nc < 0 || nr >= BOARD_SIZE || nc >= BOARD_SIZE) return false;
      if (board[nr][nc] !== 0) return false;
    }
  }
  return true;
}

export function pieceCells(piece: Piece): Array<{ r: number; c: number }> {
  const cells: Array<{ r: number; c: number }> = [];
  piece.shape.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value) cells.push({ r, c });
    });
  });
  return cells;
}
