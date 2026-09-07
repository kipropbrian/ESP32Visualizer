import test from 'node:test';
import assert from 'node:assert/strict';
import { registerWorkbench, type ModelContext } from '../lib/webmcp.ts';
import { exampleCircuit, emptyCircuit } from '../lib/circuit.ts';
test('WebMCP exposes the same project state and validates before replacement', () => {
  let state = emptyCircuit();
  const registered: any[] = [];
  let signal: AbortSignal | undefined;
  const context: ModelContext = {
    registerTool: (tool, opts) => {
      registered.push(tool);
      signal = opts.signal;
    },
  };
  const stop = registerWorkbench(
    context,
    () => state,
    (c) => {
      state = c;
    },
  );
  assert.deepEqual(
    registered.map((t) => t.name),
    ['inspect_breadboard', 'replace_breadboard_circuit'],
  );
  assert.equal(registered[0].annotations.readOnlyHint, true);
  const c = exampleCircuit();
  assert.deepEqual(registered[1].execute({ circuit: c }), {
    parts: 3,
    wires: 4,
    powered: false,
  });
  assert.deepEqual(registered[0].execute({}), c);
  assert.throws(() => registered[1].execute({ circuit: { parts: [] } }));
  assert.deepEqual(state, c);
  stop();
  assert.equal(signal?.aborted, true);
});
