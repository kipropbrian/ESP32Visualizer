import { HOLE_SET, ROWS, position, type Wire } from './circuit';
import { nearestHole } from './placement';

export type WireDragEnd = 'from' | 'to' | 'both';

type GridDelta = { dx: number; dy: number };

function roundedDelta(dx: number, dy: number): GridDelta | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const rounded = { dx: Math.round(dx), dy: Math.round(dy) };
  return Number.isFinite(rounded.dx) && Number.isFinite(rounded.dy)
    ? rounded
    : null;
}

/**
 * Translate one endpoint by a rounded grid delta and require the translated
 * coordinate to be an actual named row. nearestHole supplies the canonical
 * row/column address, while the equality check rejects center/rail gaps that
 * nearestHole would otherwise resolve to the closest row.
 */
function translatedEndpoint(
  hole: string,
  { dx, dy }: GridDelta,
): string | null {
  if (!HOLE_SET.has(hole)) return null;
  const origin = position(hole);
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;

  const x = origin.x + dx;
  const y = origin.y + dy;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Object.values(ROWS).some((rowY) => rowY === y)
  )
    return null;

  const translated = nearestHole(x, y);
  if (!translated || !HOLE_SET.has(translated)) return null;
  const snapped = position(translated);
  return snapped.x === x && snapped.y === y ? translated : null;
}

/**
 * Produce a wire candidate for a rounded grid movement without mutating the
 * input wire. A one-end drag moves only the selected endpoint. A both-end
 * drag applies the exact same grid offset to both endpoints.
 */
export function wireDragCandidate(
  wire: Wire,
  end: WireDragEnd,
  dx: number,
  dy: number,
): Wire | null {
  if (!wire || (end !== 'from' && end !== 'to' && end !== 'both')) return null;
  const delta = roundedDelta(dx, dy);
  if (!delta) return null;

  if (end === 'both') {
    const from = translatedEndpoint(wire.from, delta);
    const to = translatedEndpoint(wire.to, delta);
    return from && to ? { ...wire, from, to } : null;
  }

  if (!HOLE_SET.has(wire[end])) return null;
  const origin = position(wire[end]);
  const target = nearestHole(origin.x + delta.dx, origin.y + delta.dy);
  return target ? { ...wire, [end]: target } : null;
}

/** Validate a wire candidate against endpoint and duplicate-wire constraints. */
export function wirePlacementError(
  candidate: Wire | null,
  others: Wire[],
): string | null {
  if (!candidate)
    return 'Invalid drop: both wire ends must land in breadboard holes.';
  if (!HOLE_SET.has(candidate.from) || !HOLE_SET.has(candidate.to))
    return 'Wire endpoints must be valid breadboard holes.';
  if (candidate.from === candidate.to)
    return 'A wire needs two different holes.';
  if (
    !Array.isArray(others) ||
    others.some(
      (wire) =>
        wire &&
        wire.id !== candidate.id &&
        ((wire.from === candidate.from && wire.to === candidate.to) ||
          (wire.from === candidate.to && wire.to === candidate.from)),
    )
  )
    return 'Those holes already have a jumper wire.';
  return null;
}
