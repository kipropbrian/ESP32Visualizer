import { HOLES, ROWS, pins, position, type Part } from './circuit';
export function anchorPinAt(part: Part, index: number, hole: string): Part {
  if (!HOLES.includes(hole)) throw new Error('Invalid target hole.');
  const target = position(hole),
    pin = pins(part)[index] ?? pins(part)[0];
  const x = part.col - 1 + target.x - pin.x,
    y = ROWS[part.row] + target.y - pin.y;
  const row = Object.keys(ROWS).find((r) => ROWS[r] === y);
  return { ...part, col: x + 1, row: row ?? 'invalid' };
}
export function nearestHole(x: number, y: number): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -0.5 || x > 59.5 || y < -4.5 || y > 15.5) return null;
  const row = Object.keys(ROWS).reduce((a, b) =>
    Math.abs(ROWS[a] - y) <= Math.abs(ROWS[b] - y) ? a : b,
  );
  return `${row}${Math.max(1, Math.min(60, Math.round(x) + 1))}`;
}
export function nudgeHole(hole: string, dx: number, dy: number): string | null {
  const p = position(hole),
    rows = Object.keys(ROWS),
    row = rows.findIndex((r) => ROWS[r] === p.y);
  const candidate = `${rows[row + dy]}${p.x + 1 + dx}`;
  return HOLES.includes(candidate) ? candidate : null;
}
