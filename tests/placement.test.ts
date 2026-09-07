import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorPinAt, nearestHole, nudgeHole } from '../lib/placement.ts';
import {
  analyze,
  hardwareCircuit,
  parseCircuit,
  pins,
  placementError,
  type Part,
} from '../lib/circuit.ts';
const led: Part = {
  id: 'led',
  type: 'led',
  row: 'D',
  col: 27,
  rotation: 0,
  value: 0,
};
test('a selected LED leg lands exactly on the requested hole', () => {
  const moved = anchorPinAt(led, 1, 'F35');
  assert.deepEqual(
    pins(moved).map((p) => p.hole),
    ['F33', 'F35'],
  );
  assert.equal(placementError(moved, []), null);
});
test('rotated parts preserve their pin offsets and reject impossible center-gap placements', () => {
  const rotated = { ...led, rotation: 90 };
  assert.equal(pins(anchorPinAt(rotated, 1, 'D40'))[1].hole, 'D40');
  assert.ok(placementError(anchorPinAt(rotated, 1, 'F40'), []));
});
test('same-side button footprints keep all four legs on valid rows when rotated', () => {
  const button: Part = {
    id: 'button',
    type: 'button',
    row: 'C',
    col: 20,
    rotation: 0,
    value: 0,
    footprint: 'same-side',
  };
  const expected = [
    ['C20', 'E20', 'C22', 'E22'],
    ['C20', 'C18', 'E20', 'E18'],
    ['C20', 'A20', 'C18', 'A18'],
    ['C20', 'C22', 'A20', 'A22'],
  ];
  for (const [rotation, holes] of expected.entries()) {
    const rotated = { ...button, rotation: rotation * 90 };
    assert.deepEqual(
      pins(rotated).map((pin) => pin.hole),
      holes,
    );
    assert.equal(placementError(rotated, []), null);
  }
});
test('snapping has no dead zone inside the center gap and rejects outside drops', () => {
  assert.equal(nearestHole(23.2, 5.4), 'E24');
  assert.equal(nearestHole(23.2, 5.6), 'F24');
  assert.equal(nearestHole(-1, 0), null);
  assert.equal(nudgeHole('E24', 0, 1), 'F24');
  assert.equal(nudgeHole('F24', 0, -1), 'E24');
  assert.equal(nudgeHole('A60', 1, 0), null);
});
test('hardware reference preserves GPIO23 pull-up input and GPIO19 LED return resistor', () => {
  const c = hardwareCircuit();
  assert.deepEqual(parseCircuit(c), c);
  const off = analyze(c, true, [], false),
    on = analyze(c, true, [], true),
    pressed = analyze(c, true, ['btn'], true);
  assert.equal(off.litLeds.length, 0);
  assert.deepEqual(on.litLeds, ['led']);
  assert.equal(on.buttonLow, false);
  assert.equal(pressed.buttonLow, true);
  assert.equal(pressed.short, false);
  assert.deepEqual(pressed.litLeds, ['led']);
  assert.equal(off.net.B40, off.net.J5);
  assert.equal(off.net.B42, off.net.J18);
  assert.notEqual(off.net.B40, off.net.B42);
});

test('non-finite pointer coordinates never produce invalid hole strings', () => {
  assert.equal(nearestHole(NaN, NaN), null);
  assert.equal(nearestHole(Infinity, 0), null);
  assert.throws(() => anchorPinAt(led, 0, 'BNNaN'));
});
