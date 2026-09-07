import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  connectivity,
  exampleCircuit,
  emptyCircuit,
  pins,
  placementError,
  parseCircuit,
  HOLES,
  type Part,
} from '../lib/circuit.ts';
test('600 terminal holes, 240 rail holes; strips are separated by gap and column', () => {
  assert.equal(HOLES.length, 840);
  const n = connectivity(emptyCircuit());
  assert.equal(n.A1, n.E1);
  assert.equal(n.F1, n.J1);
  assert.notEqual(n.A1, n.F1);
  assert.notEqual(n.A1, n.A2);
  assert.notEqual(n.TP1, n.TP31);
  assert.notEqual(n.TP1, n.TN1);
  assert.notEqual(n.TP1, n.BP1);
  assert.equal(n.TP1, n.TP30);
});
test('continuous rails can be selected, and jumpers bridge split rails', () => {
  const c = emptyCircuit();
  c.splitRails = false;
  assert.equal(connectivity(c).TP1, connectivity(c).TP60);
  c.splitRails = true;
  c.wires.push({ id: 'x', from: 'TP30', to: 'TP31', color: '#ff0000' });
  assert.equal(connectivity(c).TP1, connectivity(c).TP60);
});
test('reference LED lights with power and remains off without power', () => {
  const c = exampleCircuit();
  assert.deepEqual(analyze(c, true).litLeds, ['led']);
  assert.deepEqual(analyze(c, false).litLeds, []);
  assert.equal(analyze(c, true).issues.length, 0);
});
test('open return, reversed polarity, omitted resistor and bypass resistor are diagnosed', () => {
  let c = exampleCircuit();
  c.wires.pop();
  assert.equal(analyze(c, true).litLeds.length, 0);
  assert.match(analyze(c, true).issues[0].message, /open circuit/);
  c = exampleCircuit();
  c.parts.find((p) => p.id === 'led')!.rotation = 180;
  c.parts.find((p) => p.id === 'led')!.col = 29;
  assert.match(analyze(c, true).issues[0].message, /reversed/);
  c = exampleCircuit();
  c.wires.push({ id: 'bypass', from: 'A24', to: 'A27', color: '#ff0000' });
  assert.match(analyze(c, true).issues[0].message, /series resistor/);
  assert.equal(analyze(c, true).litLeds.length, 0);
});
test('ground short disables LED preview', () => {
  const c = exampleCircuit();
  c.wires.push({ id: 'short', from: 'TP1', to: 'TN1', color: '#ff0000' });
  const r = analyze(c, true);
  assert.ok(r.short);
  assert.equal(r.powered, false);
  assert.equal(r.litLeds.length, 0);
});
test('button pairs always connect on each side, closes across gap only when pressed', () => {
  const c = exampleCircuit('button');
  const n = connectivity(c);
  assert.equal(n.E33, n.E35);
  assert.equal(n.F33, n.F35);
  assert.notEqual(n.E33, n.F33);
  assert.equal(analyze(c, true).powered, true);
  assert.equal(analyze(c, true).litLeds.length, 0);
  assert.deepEqual(analyze(c, true, ['btn']).litLeds, ['led']);
});
test('light sensor divider changes GPIO34 reading with light', () => {
  const c = exampleCircuit('ldr');
  const dark = analyze(c, true, [], false, 0),
    bright = analyze(c, true, [], false, 100);
  assert.equal(dark.powered, true);
  assert.equal(dark.issues.length, 0);
  assert.ok(dark.analog['34'] > 0);
  assert.ok(bright.analog['34'] > dark.analog['34']);
  assert.ok(bright.analog['34'] < 3.3);
  assert.equal(analyze(c, false).analog['34'], undefined);
});
test('active buzzer preset powers the buzzer without a wiring fault', () => {
  const c = exampleCircuit('buzzer');
  const powered = analyze(c, true);
  assert.deepEqual(
    c.parts.map((part) => part.type),
    ['esp32', 'buzzer'],
  );
  assert.deepEqual(powered.activeBuzzers, ['buzzer']);
  assert.deepEqual(powered.litLeds, []);
  assert.equal(powered.issues.length, 0);
  assert.equal(powered.short, false);
  assert.equal(powered.powered, true);
  assert.deepEqual(analyze(c, false).activeBuzzers, []);
});
test('GPIO23 HIGH can drive protected LED and LOW turns it off', () => {
  const c = exampleCircuit();
  c.wires[0].from = 'J18';
  const low = analyze(c, true, [], false);
  assert.equal(low.litLeds.length, 0);
  assert.match(low.issues[0]?.message || '', /same voltage/);
  assert.doesNotMatch(low.issues[0]?.message || '', /open circuit/);
  assert.deepEqual(analyze(c, true, [], true).litLeds, ['led']);
});
test('placement rejects occupied holes, off-board legs and a second ESP32', () => {
  const c = exampleCircuit();
  assert.match(
    placementError({ ...c.parts[1], col: 59 }, c.parts) || '',
    /legs/,
  );
  assert.match(
    placementError({ ...c.parts[1], id: 'copy' }, c.parts) || '',
    /occupies/,
  );
  assert.match(
    placementError({ ...c.parts[0], id: 'esp2', col: 35 }, c.parts) || '',
    /one ESP32/,
  );
  assert.equal(pins(c.parts[0]).length, 30);
  assert.equal(pins(c.parts[0])[0].hole, 'A4');
  assert.equal(pins(c.parts[0])[15].hole, 'I4');
});
test('rotation produces grid-snapped pin locations', () => {
  const p: Part = {
    id: 'r',
    type: 'resistor',
    row: 'A',
    col: 24,
    rotation: 90,
    value: 220,
  };
  assert.deepEqual(
    pins(p).map((p) => p.hole),
    ['A24', 'D24'],
  );
  p.rotation = 180;
  assert.deepEqual(
    pins(p).map((p) => p.hole),
    ['A24', 'A21'],
  );
});
test('component placement rejects physical body overlap while allowing clear spacing', () => {
  const esp: Part = {
    id: 'esp',
    type: 'esp32',
    row: 'A',
    col: 4,
    rotation: 0,
    value: 0,
  };
  const underBoard: Part = {
    id: 'under-board',
    type: 'led',
    row: 'D',
    col: 10,
    rotation: 0,
    value: 0,
  };
  const besideBoard: Part = { ...underBoard, row: 'D', col: 24 };
  assert.match(placementError(underBoard, [esp]) || '', /bodies overlap/);
  assert.equal(placementError(besideBoard, [esp]), null);
});
test('project import validates placements, values, colors and duplicate IDs', () => {
  assert.deepEqual(parseCircuit(exampleCircuit()), exampleCircuit());
  assert.throws(() =>
    parseCircuit({ parts: [], wires: [], splitRails: 'yes' }),
  );
  let c = exampleCircuit();
  c.wires[0].color = 'url(javascript:x)';
  assert.throws(() => parseCircuit(c));
  c = exampleCircuit();
  c.parts[1].value = -1;
  assert.throws(() => parseCircuit(c));
  c = exampleCircuit();
  c.parts[1].id = c.parts[0].id;
  assert.throws(() => parseCircuit(c));
  c = exampleCircuit();
  c.wires.push({ id: 'same-hole', from: 'A1', to: 'A1', color: '#e35a52' });
  assert.throws(() => parseCircuit(c), /two different holes/);
  c = exampleCircuit();
  c.wires.push({
    id: 'reverse',
    from: c.wires[0].to,
    to: c.wires[0].from,
    color: '#42536b',
  });
  assert.throws(() => parseCircuit(c), /Duplicate wire/);
});
