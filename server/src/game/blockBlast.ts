export const BOARD_SIZE = 8;

export type Cell = number;
export type Board = Cell[][];

export interface Piece {
  id: string;
  color: number;
  shape: number[][];
}

export interface BlastState {
  board: Board;
  pieces: Array<Piece | null>;
  score: number;
  combo: number;
  gameOver: boolean;
}

const SHAPES: number[][][] = [
  [[1]],
  [[1, 1]],
  [[1], [1]],
  [[1, 1, 1]],
  [[1], [1], [1]],
  [[1, 1, 1, 1]],
  [[1], [1], [1], [1]],
  [[1, 1, 1, 1, 1]],
  [[1], [1], [1], [1], [1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],
  [
    [1, 1],
    [1, 0],
  ],
  [
    [1, 1],
    [0, 1],
  ],
  [
    [1, 0],
    [1, 1],
  ],
  [
    [0, 1],
    [1, 1],
  ],
  [
    [1, 1, 1],
    [1, 0, 0],
  ],
  [
    [1, 1, 1],
    [0, 0, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [1, 1, 1],
    [0, 1, 0],
  ],
  [
    [0, 1],
    [1, 1],
    [0, 1],
  ],
  [
    [1, 0],
    [1, 1],
    [1, 0],
  ],
  [
    [1, 1, 1],
    [1, 0, 1],
  ],
];

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => 0));
}

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function createPiece(): Piece {
  const shape = SHAPES[randomInt(SHAPES.length)] ?? [[1]];
  return {
    id: `${Date.now()}-${randomInt(1_000_000)}`,
    color: randomInt(7) + 1,
    shape: shape.map((row) => [...row]),
  };
}

export function createHand(): Array<Piece | null> {
  return [createPiece(), createPiece(), createPiece()];
}

export function createInitialState(): BlastState {
  return {
    board: emptyBoard(),
    pieces: createHand(),
    score: 0,
    combo: 0,
    gameOver: false,
  };
}

export function canPlace(board: Board, piece: Piece, row: number, col: number): boolean {
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

export function hasAnyMove(board: Board, pieces: Array<Piece | null>): boolean {
  const remaining = pieces.filter((piece): piece is Piece => Boolean(piece));
  if (remaining.length === 0) return true;

  return remaining.some((piece) => {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (canPlace(board, piece, row, col)) return true;
      }
    }
    return false;
  });
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const next = cloneBoard(board);
  const fullRows: number[] = [];
  const fullCols: number[] = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    if (next[row].every((cell) => cell > 0)) fullRows.push(row);
  }
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    if (next.every((row) => row[col] > 0)) fullCols.push(col);
  }

  for (const row of fullRows) {
    next[row] = Array.from({ length: BOARD_SIZE }, () => 0);
  }
  for (const col of fullCols) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      next[row][col] = 0;
    }
  }

  return { board: next, cleared: fullRows.length + fullCols.length };
}

function cellCount(piece: Piece): number {
  return piece.shape.flat().filter(Boolean).length;
}

export function placePiece(
  state: BlastState,
  pieceIndex: number,
  row: number,
  col: number
): BlastState | null {
  if (state.gameOver) return null;
  const piece = state.pieces[pieceIndex];
  if (!piece) return null;
  if (!canPlace(state.board, piece, row, col)) return null;

  const board = cloneBoard(state.board);
  for (let r = 0; r < piece.shape.length; r += 1) {
    for (let c = 0; c < piece.shape[r].length; c += 1) {
      if (!piece.shape[r][c]) continue;
      board[row + r][col + c] = piece.color;
    }
  }

  const cleared = clearLines(board);
  const combo = cleared.cleared > 0 ? state.combo + 1 : 0;
  const placeScore = cellCount(piece);
  const clearScore = cleared.cleared > 0 ? cleared.cleared * 10 * Math.max(1, combo) : 0;

  const pieces = state.pieces.map((item, index) => (index === pieceIndex ? null : item));
  const nextPieces = pieces.every((item) => item === null) ? createHand() : pieces;
  const gameOver = !hasAnyMove(cleared.board, nextPieces);

  return {
    board: cleared.board,
    pieces: nextPieces,
    score: state.score + placeScore + clearScore,
    combo,
    gameOver,
  };
}

export function parseBlastState(value: unknown): BlastState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as BlastState;
  if (!Array.isArray(candidate.board) || candidate.board.length !== BOARD_SIZE) return null;
  if (!candidate.board.every((row) => Array.isArray(row) && row.length === BOARD_SIZE)) return null;
  if (!Array.isArray(candidate.pieces) || candidate.pieces.length !== 3) return null;
  return {
    board: candidate.board.map((row) => row.map((cell) => Number(cell) || 0)),
    pieces: candidate.pieces.map((piece) => {
      if (!piece) return null;
      return {
        id: String(piece.id),
        color: Number(piece.color) || 1,
        shape: Array.isArray(piece.shape) ? piece.shape : [[1]],
      };
    }),
    score: Number(candidate.score) || 0,
    combo: Number(candidate.combo) || 0,
    gameOver: candidate.gameOver === true,
  };
}
