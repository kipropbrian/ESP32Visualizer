import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
for (const key of [
  'FormData',
  'window',
  'document',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'SVGElement',
  'SVGSVGElement',
  'MutationObserver',
  'getComputedStyle',
  'localStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
    writable: true,
  });
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  writable: true,
});
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(dom.window.SVGSVGElement.prototype as any).getScreenCTM = () => null;
(dom.window.SVGSVGElement.prototype as any).setPointerCapture = () => {};
const React = await import('react');
const { render, fireEvent, cleanup, screen, waitFor } =
  await import('@testing-library/react');
afterEach(() => cleanup());
const { default: App } = await import('../app/page');
const { exampleCircuit } = await import('../lib/circuit.ts');
test('learner can inspect a strip, load an LED circuit, and switch power on', () => {
  localStorage.clear();
  render(<App />);
  fireEvent.click(screen.getByText('Precise placement & keyboard controls'));
  fireEvent.change(screen.getByLabelText('Hole address'), {
    target: { value: 'A24' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Inspect hole' }));
  assert.ok(screen.getByText('Connection made. Nice work!'));
  fireEvent.click(screen.getByRole('button', { name: 'Next challenge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
  fireEvent.pointerDown(
    document.querySelector('[data-part="led"]')!.parentElement!,
  );
  assert.ok(screen.getByRole('heading', { name: 'LED' }));
  fireEvent.click(screen.getByRole('button', { name: 'USB power' }));
  assert.ok(screen.getByText('1 LED lit · complete circuit'));
  assert.ok(screen.getByText('Connection made. Nice work!'));
  cleanup();
});
test('free build supports keyboard placement, undo, and persisted circuit', () => {
  localStorage.clear();
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: 'Free build' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear board' }));
  fireEvent.click(screen.getByRole('button', { name: 'Place Resistor' }));
  fireEvent.click(screen.getByText('Precise placement & keyboard controls'));
  fireEvent.change(screen.getByLabelText('Hole address'), {
    target: { value: 'C40' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Place part' }));
  assert.equal(
    JSON.parse(localStorage.getItem('pinlab-project-v1')!).parts[0].col,
    40,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Undo$/ }));
  assert.equal(
    JSON.parse(localStorage.getItem('pinlab-project-v1')!).parts.length,
    0,
  );
  cleanup();
});
test('button circuit responds to momentary press and release', () => {
  localStorage.setItem(
    'pinlab-project-v1',
    JSON.stringify(exampleCircuit('button')),
  );
  render(<App />);
  fireEvent.pointerDown(
    document.querySelector('[data-part="btn"]')!.parentElement!,
  );
  fireEvent.click(screen.getByRole('button', { name: 'USB power' }));
  const hold = screen.getByRole('button', { name: 'Hold to press' });
  fireEvent.keyDown(hold, { key: ' ' });
  assert.ok(screen.getByText('1 LED lit · complete circuit'));
  fireEvent.keyUp(hold, { key: ' ' });
  assert.equal(screen.queryByText('1 LED lit · complete circuit'), null);
  cleanup();
});
test('working presets load powered circuits and expose their controls', () => {
  localStorage.clear();
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Load LED preset' }));
  assert.equal(
    document.querySelector('[data-part="led"]')?.getAttribute('data-led-state'),
    'on',
  );
  assert.ok(screen.getByText('1 LED lit · complete circuit'));

  fireEvent.click(
    screen.getByRole('button', { name: 'Load push button preset' }),
  );
  const hold = screen.getByRole('button', { name: 'Hold to press' });
  fireEvent.keyDown(hold, { key: ' ' });
  assert.ok(screen.getByText('1 LED lit · complete circuit'));
  fireEvent.keyUp(hold, { key: ' ' });

  fireEvent.click(
    screen.getByRole('button', { name: 'Load light sensor preset' }),
  );
  assert.ok(screen.getByLabelText('Light level'));
  assert.ok(screen.getAllByText(/GPIO34/).length >= 1);

  fireEvent.click(
    screen.getByRole('button', { name: 'Load active buzzer preset' }),
  );
  assert.ok(screen.getByText('Buzzer active (visual preview)'));
  assert.equal(
    document.querySelector('.lesson-panel')?.firstElementChild?.className,
    'preset-panel',
  );
});
test('each lesson hint opens, closes, and follows the selected lesson', () => {
  localStorage.clear();
  render(<App />);

  const lessonNames = [
    'Meet your breadboard',
    'Your first light',
    'Push to light',
    'Sense the light',
  ];
  const hintText = [
    'Try A24, then F24. Each group has five connected holes.',
    'With the starter placement: wire J4 → A24, B29 → J5. Resistor C24–C27; LED D27–D29.',
    'The two legs on each side are always joined. Pressing joins the two sides. Use E33 and F33 as the switched pair.',
    'Example: LDR C24–C26, resistor D26–D29. Wire J4 → A24, B29 → J5, B26 → A15 (GPIO34).',
  ];

  for (let i = 0; i < lessonNames.length; i++) {
    if (i > 0)
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(lessonNames[i]) }),
      );

    const hintButton = screen.getByRole('button', { name: 'Hint' });
    assert.equal(hintButton.getAttribute('aria-expanded'), 'false');
    fireEvent.click(hintButton);
    assert.equal(hintButton.getAttribute('aria-expanded'), 'true');
    assert.ok(screen.getByText(hintText[i]));

    fireEvent.click(hintButton);
    assert.equal(hintButton.getAttribute('aria-expanded'), 'false');
    assert.equal(screen.queryByText(hintText[i]), null);
  }
});
test('switching between Learn and Free build closes an open lesson hint', () => {
  localStorage.clear();
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
  assert.ok(
    screen.getByText('Try A24, then F24. Each group has five connected holes.'),
  );

  fireEvent.click(screen.getByRole('tab', { name: 'Free build' }));
  assert.equal(
    screen.queryByText(
      'Try A24, then F24. Each group has five connected holes.',
    ),
    null,
  );

  fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
  const hintButton = screen.getByRole('button', { name: 'Hint' });
  assert.equal(hintButton.getAttribute('aria-expanded'), 'false');
  assert.equal(
    screen.queryByText(
      'Try A24, then F24. Each group has five connected holes.',
    ),
    null,
  );
});
test('global interaction listeners stay constant across repeated renders and clean up', () => {
  localStorage.clear();
  const tracked = new Set(['blur', 'keydown', 'pointerup', 'pointercancel']);
  const active = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);
  window.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (tracked.has(type)) {
      const listeners = active.get(type) ?? new Set();
      listeners.add(listener);
      active.set(type, listeners);
    }
    originalAdd(type, listener, options);
  }) as typeof window.addEventListener;
  window.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    active.get(type)?.delete(listener);
    originalRemove(type, listener, options);
  }) as typeof window.removeEventListener;
  try {
    render(<App />);
    for (let i = 0; i < 12; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Wire (W)' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select (V)' }));
    }
    for (const type of tracked) assert.equal(active.get(type)?.size, 1);
    cleanup();
    for (const type of tracked) assert.equal(active.get(type)?.size ?? 0, 0);
  } finally {
    window.addEventListener = originalAdd;
    window.removeEventListener = originalRemove;
  }
});
test('copy circuit writes validated project JSON to the clipboard', async () => {
  localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
  let copied = '';
  const originalClipboard = navigator.clipboard;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => void (copied = text) },
  });
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy circuit' }));
    await waitFor(() => assert.ok(copied.length > 0));
    assert.deepEqual(JSON.parse(copied), exampleCircuit());
    assert.ok(screen.getByText('Circuit JSON copied to the clipboard.'));
  } finally {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  }
});
test('import loads a validated circuit through the file control', async () => {
  localStorage.clear();
  render(<App />);
  const file = {
    size: 1024,
    text: async () => JSON.stringify(exampleCircuit('ldr')),
  } as File;
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [file] },
  });
  await waitFor(() =>
    assert.equal(
      JSON.parse(localStorage.getItem('pinlab-project-v1')!).parts.some(
        (part: any) => part.type === 'ldr',
      ),
      true,
    ),
  );
  assert.ok(screen.getByText('Circuit imported.'));
});
test('click-to-place moves the selected leg and a no-op preserves a steady powered LED', () => {
  localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
  render(<App />);
  const led = document.querySelector('[data-part="led"]')!;
  fireEvent.pointerDown(led.parentElement!);
  fireEvent.pointerUp(document.querySelector('.breadboard')!);
  fireEvent.click(screen.getByRole('button', { name: 'USB power' }));
  assert.equal(
    document.querySelector('[data-part="led"]')?.getAttribute('data-led-state'),
    'on',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Move A (+) to a hole' }));
  fireEvent.click(
    [...document.querySelectorAll('.hole')].find(
      (h) => h.querySelector('title')?.textContent === 'D27',
    )!,
  );
  const field = screen.getByLabelText('Move selected part to hole');
  // Use the actual saved anchor so this is always a no-op.
  const current = JSON.parse(
    localStorage.getItem('pinlab-project-v1')!,
  ).parts.find((p: any) => p.id === 'led');
  fireEvent.change(field, {
    target: { value: `${current.row}${current.col}` },
  });
  assert.ok(screen.getByRole('button', { name: 'Power off' }));
  fireEvent.click(screen.getByRole('button', { name: /^Move$/ }));
  assert.ok(screen.getByRole('button', { name: 'Power off' }));
});
test('wire endpoints can be relocated by choosing an exact hole', () => {
  localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
  render(<App />);
  fireEvent.click(document.querySelector('.wire')!);
  fireEvent.click(screen.getByRole('button', { name: 'Move to: TP4' }));
  fireEvent.change(screen.getByLabelText('Hole address'), {
    target: { value: 'TP8' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Move to hole' }));
  assert.equal(
    JSON.parse(localStorage.getItem('pinlab-project-v1')!).wires[0].to,
    'TP8',
  );
});

test('drag keeps a single lit LED and drops the grabbed cathode at the release coordinate', () => {
  const oldPoint = globalThis.DOMPoint;
  class Point {
    constructor(
      public x: number,
      public y: number,
    ) {}
    matrixTransform() {
      return this;
    }
  }
  Object.defineProperty(globalThis, 'DOMPoint', {
    value: Point,
    configurable: true,
  });
  (dom.window as any).PointerEvent = dom.window.MouseEvent;
  (dom.window.SVGSVGElement.prototype as any).getScreenCTM = () => ({
    inverse: () => ({}),
  });
  try {
    localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'USB power' }));
    const original = document.querySelector('[data-part="led"]')!;
    const cathode = original.querySelector('[data-pin-index="1"] circle')!;
    const board = document.querySelector('.breadboard')!;
    fireEvent.pointerDown(cathode, { clientX: 610, clientY: 210 });
    fireEvent.pointerMove(board, { clientX: 618, clientY: 210 });
    assert.equal(document.querySelectorAll('[data-part="led"]').length, 1);
    assert.equal(document.querySelector('[data-part="led"]'), original);
    assert.equal(original.getAttribute('data-led-state'), 'on');
    fireEvent.pointerUp(board, { clientX: 618, clientY: 210 });
    assert.ok(screen.getByRole('button', { name: 'Power off' }));
    fireEvent.pointerDown(cathode, { clientX: 610, clientY: 210 });
    fireEvent.pointerMove(board, { clientX: 690, clientY: 290 });
    // Pointer-up can advance beyond the last render; it is the authoritative drop.
    fireEvent.pointerUp(board, { clientX: 730, clientY: 290 });
    const led = JSON.parse(
      localStorage.getItem('pinlab-project-v1')!,
    ).parts.find((p: any) => p.id === 'led');
    assert.equal(led.row, 'F');
    assert.equal(led.col, 33);
  } finally {
    (dom.window.SVGSVGElement.prototype as any).getScreenCTM = () => null;
    Object.defineProperty(globalThis, 'DOMPoint', {
      value: oldPoint,
      configurable: true,
    });
  }
});
test('choosing a new component cancels an unfinished move', () => {
  localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
  render(<App />);
  fireEvent.pointerDown(
    document.querySelector('[data-part="led"]')!.parentElement!,
  );
  fireEvent.pointerUp(document.querySelector('.breadboard')!);
  fireEvent.click(screen.getByRole('button', { name: 'Move A (+) to a hole' }));
  fireEvent.click(screen.getByRole('button', { name: 'Place Resistor' }));
  fireEvent.change(screen.getByLabelText('Hole address'), {
    target: { value: 'C40' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Place part' }));
  const project = JSON.parse(localStorage.getItem('pinlab-project-v1')!);
  assert.equal(project.parts.length, 4);
  assert.equal(project.parts.find((p: any) => p.id === 'led').col, 27);
});
function withWirePointerEnvironment(scale: number, run: () => void) {
  const oldPoint = globalThis.DOMPoint,
    oldPointer = (dom.window as any).PointerEvent;
  class Point {
    constructor(
      public x: number,
      public y: number,
    ) {}
    matrixTransform() {
      return { x: this.x / scale, y: this.y / scale };
    }
  }
  Object.defineProperty(globalThis, 'DOMPoint', {
    value: Point,
    configurable: true,
  });
  (dom.window as any).PointerEvent = dom.window.MouseEvent;
  (dom.window.SVGSVGElement.prototype as any).getScreenCTM = () => ({
    inverse: () => ({}),
  });
  try {
    run();
  } finally {
    (dom.window.SVGSVGElement.prototype as any).getScreenCTM = () => null;
    (dom.window as any).PointerEvent = oldPointer;
    Object.defineProperty(globalThis, 'DOMPoint', {
      value: oldPoint,
      configurable: true,
    });
  }
}
function savedWires() {
  return JSON.parse(localStorage.getItem('pinlab-project-v1')!).wires;
}
test('wire endpoint dragging follows final release at 200 percent zoom and preserves the other end', () =>
  withWirePointerEnvironment(2, () => {
    localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
    render(<App />);
    const board = document.querySelector('.breadboard')!,
      wire = document.querySelector('[data-wire-id="w0"]')!;
    fireEvent.pointerDown(wire.querySelector('[data-wire-end="to"] circle')!, {
      clientX: 220,
      clientY: 140,
    });
    fireEvent.pointerMove(board, { clientX: 380, clientY: 140 });
    assert.ok(screen.getByText(/Drag wire: J4 → TP8/));
    assert.equal(savedWires()[0].to, 'TP4'); // preview is not an edit
    fireEvent.pointerUp(board, { clientX: 460, clientY: 180 });
    assert.equal(savedWires()[0].from, 'J4');
    assert.equal(savedWires()[0].to, 'TN10');
    fireEvent.click(screen.getByRole('button', { name: /^Undo$/ }));
    assert.equal(savedWires()[0].to, 'TP4');
  }));
test('dragging the wire middle moves both endpoints together', () =>
  withWirePointerEnvironment(1, () => {
    localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
    render(<App />);
    const board = document.querySelector('.breadboard')!,
      body = document.querySelector('[data-wire-id="w0"] [data-wire-body]')!;
    fireEvent.pointerDown(body, { clientX: 110, clientY: 200 });
    fireEvent.pointerMove(board, { clientX: 150, clientY: 200 });
    fireEvent.pointerUp(board, { clientX: 170, clientY: 200 });
    assert.equal(savedWires()[0].from, 'J7');
    assert.equal(savedWires()[0].to, 'TP7');
  }));
test('palette pointer drag places a component at the snapped drop hole', () =>
  withWirePointerEnvironment(1, () => {
    localStorage.clear();
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Free build' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear board' }));
    const board = document.querySelector('.breadboard')!;
    const card = screen.getByRole('button', { name: 'Place LED' });
    fireEvent.pointerDown(card, { clientX: 180, clientY: 200, button: 0 });
    fireEvent.pointerMove(board, { clientX: 150, clientY: 150 });
    assert.ok(screen.getByText(/Drag LED to A6/));
    fireEvent.pointerUp(board, { clientX: 150, clientY: 150 });
    const project = JSON.parse(localStorage.getItem('pinlab-project-v1')!);
    assert.equal(project.parts.length, 1);
    assert.deepEqual(project.parts[0], {
      id: project.parts[0].id,
      type: 'led',
      row: 'A',
      col: 6,
      rotation: 0,
      value: 0,
    });
  }));
test('a real pointer click on a kit card leaves the part ready for precise placement', () => {
  localStorage.clear();
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: 'Free build' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear board' }));
  const card = screen.getByRole('button', { name: 'Place LED' });
  fireEvent.pointerDown(card, { clientX: 180, clientY: 200, button: 0 });
  fireEvent.pointerUp(card, { clientX: 180, clientY: 200, button: 0 });
  fireEvent.click(card);
  fireEvent.click(screen.getByText('Precise placement & keyboard controls'));
  assert.ok(screen.getByRole('button', { name: 'Place part' }));
});
test('invalid wire drops, same-hole drops, and cancellation preserve circuit and power', () =>
  withWirePointerEnvironment(1, () => {
    localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'USB power' }));
    const board = document.querySelector('.breadboard')!,
      end = () =>
        document.querySelector(
          '[data-wire-id="w0"] [data-wire-end="to"] circle',
        )!;
    const initial = localStorage.getItem('pinlab-project-v1');
    for (const [x, y] of [
      [110, 70],
      [-80, 70],
      [110, 370],
    ]) {
      fireEvent.pointerDown(end(), { clientX: 110, clientY: 70 });
      fireEvent.pointerMove(board, { clientX: x, clientY: y });
      fireEvent.pointerUp(board, { clientX: x, clientY: y });
      assert.equal(localStorage.getItem('pinlab-project-v1'), initial);
      assert.ok(screen.getByRole('button', { name: 'Power off' }));
    }
    fireEvent.pointerDown(end(), { clientX: 110, clientY: 70 });
    fireEvent.pointerMove(board, { clientX: 190, clientY: 70 });
    fireEvent.pointerCancel(board);
    fireEvent.pointerUp(board, { clientX: 190, clientY: 70 });
    assert.equal(localStorage.getItem('pinlab-project-v1'), initial);
    fireEvent.pointerDown(end(), { clientX: 110, clientY: 70 });
    fireEvent.pointerMove(board, { clientX: 190, clientY: 70 });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.pointerUp(board, { clientX: 190, clientY: 70 });
    assert.equal(localStorage.getItem('pinlab-project-v1'), initial);
  }));

test('reloading the active button preset resets its momentary runtime state', () => {
  localStorage.clear();
  render(<App />);
  const preset = screen.getByRole('button', {
    name: 'Load push button preset',
  });
  fireEvent.click(preset);
  const hold = screen.getByRole('button', { name: 'Hold to press' });
  fireEvent.keyDown(hold, { key: ' ' });
  assert.ok(screen.getByText('1 LED lit · complete circuit'));

  fireEvent.click(preset);
  assert.ok(screen.getByRole('button', { name: 'Hold to press' }));
  assert.equal(screen.queryByText('1 LED lit · complete circuit'), null);
  assert.ok(screen.getByRole('button', { name: 'Power off' }));
});

test('uppercase Cmd/Ctrl+Shift+Z redoes the latest circuit edit', () => {
  localStorage.clear();
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: 'Free build' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear board' }));
  fireEvent.click(screen.getByRole('button', { name: 'Place Resistor' }));
  fireEvent.click(screen.getByText('Precise placement & keyboard controls'));
  fireEvent.change(screen.getByLabelText('Hole address'), {
    target: { value: 'C40' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Place part' }));
  fireEvent.click(screen.getByRole('button', { name: /^Undo$/ }));
  assert.equal(
    JSON.parse(localStorage.getItem('pinlab-project-v1')!).parts.length,
    0,
  );

  fireEvent.keyDown(document.body, {
    key: 'Z',
    ctrlKey: true,
    shiftKey: true,
  });
  assert.equal(
    JSON.parse(localStorage.getItem('pinlab-project-v1')!).parts.length,
    1,
  );
});

test('selecting a wire clears a previously inspected net highlight', () => {
  localStorage.setItem('pinlab-project-v1', JSON.stringify(exampleCircuit()));
  render(<App />);
  fireEvent.click(document.querySelector('[data-hole="A24"]')!);
  assert.equal(
    document.querySelector('[data-hole="A24"]')?.getAttribute('fill'),
    '#43c9a04d',
  );
  fireEvent.click(document.querySelector('[data-wire-id="w0"]')!);
  assert.equal(
    document.querySelector('[data-hole="A24"]')?.getAttribute('fill'),
    'transparent',
  );
});
