import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLE_SET, position, type Wire } from '../lib/circuit.ts';
import {
  wireDragCandidate,
  wirePlacementError,
} from '../lib/wire-placement.ts';

const wire = (from: string, to: string, id = 'w0'): Wire => ({
  id,
  from,
  to,
  color: '#e35a52',
});

test('one-end drag rounds grid delta and preserves the other endpoint', () => {
  const original = wire('E24', 'E30');
  const moved = wireDragCandidate(original, 'from', 1.6, 0.4);

  assert.deepEqual(moved, wire('E26', 'E30'));
  assert.deepEqual(original, wire('E24', 'E30'));
});

test('one-end drag supports rail rows, snaps across gaps, and rejects outside drops', () => {
  assert.deepEqual(
    wireDragCandidate(wire('TP30', 'TP40'), 'from', 1, 0),
    wire('TP31', 'TP40'),
  );
  assert.deepEqual(
    wireDragCandidate(wire('E24', 'E30'), 'from', 0, 1),
    wire('E24', 'E30'),
  );
  assert.deepEqual(
    wireDragCandidate(wire('E24', 'E30'), 'from', 0, 2),
    wire('F24', 'E30'),
  );
  assert.equal(wireDragCandidate(wire('TP60', 'TP40'), 'from', 1, 0), null);
  assert.equal(wireDragCandidate(wire('A1', 'A3'), 'from', -1, 0), null);
});

test('both-end drag applies one exact offset and preserves relative geometry', () => {
  const original = wire('E24', 'J30');
  const moved = wireDragCandidate(original, 'both', 1.6, 3.4);

  assert.deepEqual(moved, wire('F26', 'BP32'));
  assert.ok(moved);
  assert.equal(
    position(moved.from).x - position(moved.to).x,
    position(original.from).x - position(original.to).x,
  );
  assert.equal(
    position(moved.from).y - position(moved.to).y,
    position(original.from).y - position(original.to).y,
  );
});

test('both-end drag rejects a candidate when either endpoint enters a row gap', () => {
  assert.equal(wireDragCandidate(wire('E24', 'F30'), 'both', 0, 1), null);
  assert.equal(wireDragCandidate(wire('A59', 'A60'), 'both', 2, 0), null);
});

test('wire drag rejects non-finite deltas and malformed source endpoints', () => {
  const original = wire('A24', 'A30');
  assert.equal(wireDragCandidate(original, 'from', Number.NaN, 0), null);
  assert.equal(
    wireDragCandidate(original, 'to', 0, Number.POSITIVE_INFINITY),
    null,
  );
  assert.equal(wireDragCandidate(wire('bad', 'A30'), 'both', 1, 0), null);
  assert.equal(HOLE_SET.has('A24'), true);
});

test('wire placement errors cover null, missing, same, and duplicate endpoints', () => {
  assert.match(wirePlacementError(null, []) ?? '', /invalid/i);
  assert.match(
    wirePlacementError(wire('', 'A2'), []) ?? '',
    /valid breadboard holes/i,
  );
  assert.match(
    wirePlacementError(wire('A2', 'A2'), []) ?? '',
    /different holes/i,
  );
  assert.match(
    wirePlacementError(wire('A2', 'A3', 'w1'), [wire('A3', 'A2', 'w2')]) ?? '',
    /already have/i,
  );
  assert.equal(
    wirePlacementError(wire('A2', 'A3', 'w1'), [wire('A3', 'A2', 'w1')]),
    null,
  );
  assert.equal(wirePlacementError(wire('A2', 'A3'), []), null);
});
