export type Kind = 'esp32' | 'led' | 'resistor' | 'button' | 'ldr' | 'buzzer';
export type Part = {
  id: string;
  type: Kind;
  footprint?: 'same-side';
  col: number;
  row: string;
  rotation: number;
  value: number;
};
export type Wire = { id: string; from: string; to: string; color: string };
export type Circuit = {
  parts: Part[];
  wires: Wire[];
  splitRails: boolean;
  profile?: 'hardware';
};
export const ROWS: Record<string, number> = {
  TP: -4,
  TN: -3,
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 7,
  G: 8,
  H: 9,
  I: 10,
  J: 11,
  BP: 14,
  BN: 15,
};
export const HOLES = Object.keys(ROWS).flatMap((row) =>
  Array.from({ length: 60 }, (_, i) => `${row}${i + 1}`),
);
export const HOLE_SET = new Set(HOLES);
export const TOP_PINS = [
  'VIN',
  'GND',
  '13',
  '12',
  '14',
  '27',
  '26',
  '25',
  '33',
  '32',
  '35',
  '34',
  'VN',
  'VP',
  'EN',
];
export const BOTTOM_PINS = [
  '3V3',
  'GND',
  '15',
  '2',
  '4',
  '16',
  '17',
  '5',
  '18',
  '19',
  '21',
  '3',
  '1',
  '22',
  '23',
];
export function position(hole: string) {
  const m = /^([A-Z]+)(\d+)$/.exec(hole);
  return m ? { x: Number(m[2]) - 1, y: ROWS[m[1]] } : { x: NaN, y: NaN };
}
export function holeAt(x: number, y: number) {
  const row = Object.keys(ROWS).find((r) => ROWS[r] === Math.round(y));
  const col = Math.round(x) + 1;
  return row && col > 0 && col <= 60 ? `${row}${col}` : '';
}
export function transformed(p: Part, x: number, y: number) {
  const a = (p.rotation * Math.PI) / 180;
  return {
    x: p.col - 1 + Math.round(x * Math.cos(a) - y * Math.sin(a)),
    y: ROWS[p.row] + Math.round(x * Math.sin(a) + y * Math.cos(a)),
  };
}
export function pins(p: Part) {
  const specs: [string, number, number][] =
    p.type === 'esp32'
      ? [
          ...TOP_PINS.map((v, i) => [v, i, 0] as [string, number, number]),
          ...BOTTOM_PINS.map((v, i) => [v, i, 10] as [string, number, number]),
        ]
      : p.type === 'button'
        ? p.footprint === 'same-side'
          ? ([
              ['1', 0, 0],
              ['2', 0, 2],
              ['3', 2, 0],
              ['4', 2, 2],
            ] as [string, number, number][])
          : [
              ['1', 0, 0],
              ['2', 2, 0],
              ['3', 0, 3],
              ['4', 2, 3],
            ]
        : [
            [
              p.type === 'led' ? 'A (+)' : p.type === 'buzzer' ? '+' : '1',
              0,
              0,
            ],
            [
              p.type === 'led' ? 'K (−)' : p.type === 'buzzer' ? '−' : '2',
              p.type === 'resistor' ? 3 : 2,
              0,
            ],
          ];
  return specs.map(([label, x, y], i) => {
    const pt = transformed(p, x, y);
    return { id: `${p.id}:${i}`, label, hole: holeAt(pt.x, pt.y), ...pt };
  });
}
export function placementError(p: Part, others: Part[]) {
  const pts = pins(p);
  if (pts.some((pt) => !pt.hole))
    return 'All legs must land in breadboard holes. Try moving or rotating the part.';
  if (
    p.type === 'esp32' &&
    others.some((o) => o.type === 'esp32' && o.id !== p.id)
  )
    return 'This workbench supports one ESP32 at a time.';
  const occupied = new Set(
    others
      .filter((o) => o.id !== p.id)
      .flatMap((o) => pins(o).map((pt) => pt.hole)),
  );
  if (pts.some((pt) => occupied.has(pt.hole)))
    return 'A component leg already occupies that hole. Pick a neighboring hole in the same strip.';
  const body = footprintBounds(p);
  if (
    body &&
    others.some((other) => {
      if (other.id === p.id) return false;
      const otherBody = footprintBounds(other);
      return !!otherBody && boxesOverlap(body, otherBody);
    })
  )
    return 'Component bodies overlap. Leave a clear space between parts so they can sit on the breadboard.';
  return null;
}
type Bounds = { left: number; right: number; top: number; bottom: number };
function footprintBounds(p: Part): Bounds | null {
  const shape =
    p.type === 'esp32'
      ? { left: -0.6, right: 14.6, top: -0.4, bottom: 10.4 }
      : p.type === 'led'
        ? { left: 0.2, right: 1.8, top: -2.5, bottom: -0.45 }
        : p.type === 'resistor'
          ? { left: 0.6, right: 2.4, top: -0.55, bottom: 0.55 }
          : p.type === 'button'
            ? {
                left: -0.35,
                right: 2.35,
                top: 0.15,
                bottom: p.footprint === 'same-side' ? 1.9 : 2.85,
              }
            : p.type === 'ldr'
              ? { left: 0.1, right: 1.9, top: -2.2, bottom: -0.35 }
              : { left: -0.15, right: 2.15, top: -2.5, bottom: -0.1 };
  const angle = (p.rotation * Math.PI) / 180;
  const points = [
    [shape.left, shape.top],
    [shape.right, shape.top],
    [shape.left, shape.bottom],
    [shape.right, shape.bottom],
  ].map(([x, y]) => ({
    x: p.col - 1 + x * Math.cos(angle) - y * Math.sin(angle),
    y: ROWS[p.row] + x * Math.sin(angle) + y * Math.cos(angle),
  }));
  if (
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    return null;
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}
function boxesOverlap(a: Bounds, b: Bounds) {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}
class Nets {
  parent: Record<string, string> = Object.fromEntries(HOLES.map((h) => [h, h]));
  find(a: string): string {
    if (!this.parent[a]) return a;
    return this.parent[a] === a
      ? a
      : (this.parent[a] = this.find(this.parent[a]));
  }
  join(a: string, b: string) {
    if (HOLE_SET.has(a) && HOLE_SET.has(b))
      this.parent[this.find(a)] = this.find(b);
  }
}
export function connectivity(c: Circuit, pressed: string[] = []) {
  const n = new Nets();
  for (let col = 1; col <= 60; col++) {
    for (const row of ['B', 'C', 'D', 'E']) n.join(`A${col}`, `${row}${col}`);
    for (const row of ['G', 'H', 'I', 'J']) n.join(`F${col}`, `${row}${col}`);
  }
  for (const rail of ['TP', 'TN', 'BP', 'BN'])
    for (let col = 2; col <= 60; col++)
      if (!c.splitRails || col !== 31)
        n.join(`${rail}${col - 1}`, `${rail}${col}`);
  c.wires.forEach((w) => n.join(w.from, w.to));
  c.parts
    .filter((p) => p.type === 'button')
    .forEach((p) => {
      const t = pins(p);
      n.join(t[0].hole, t[1].hole);
      n.join(t[2].hole, t[3].hole);
      if (pressed.includes(p.id)) n.join(t[0].hole, t[2].hole);
    });
  return Object.fromEntries(HOLES.map((h) => [h, n.find(h)]));
}
export function connectedHoles(c: Circuit, h: string, pressed: string[] = []) {
  const net = connectivity(c, pressed);
  return HOLES.filter((x) => net[x] === net[h]);
}
export function analyze(
  c: Circuit,
  powered: boolean,
  pressed: string[] = [],
  gpioHigh = false,
  light = 50,
) {
  const net = connectivity(c, pressed),
    issues: { severity: 'error' | 'warning' | 'info'; message: string }[] = [],
    litLeds: string[] = [],
    activeBuzzers: string[] = [];
  const esp = c.parts.find((p) => p.type === 'esp32'),
    ep = esp ? pins(esp) : [];
  const highs = ep
    .filter(
      (p) =>
        p.label === '3V3' ||
        (gpioHigh &&
          (c.profile === 'hardware'
            ? ['19', '2'].includes(p.label)
            : p.label === '23')),
    )
    .map((p) => net[p.hole]);
  const grounds = ep
    .filter(
      (p) =>
        p.label === 'GND' ||
        (!gpioHigh &&
          (c.profile === 'hardware'
            ? ['19', '2'].includes(p.label)
            : p.label === '23')),
    )
    .map((p) => net[p.hole]);
  const graph: Record<string, { to: string; r: number }[]> = {};
  for (const p of c.parts.filter(
    (p) => p.type === 'resistor' || p.type === 'ldr',
  )) {
    const t = pins(p),
      a = net[t[0].hole],
      b = net[t[1].hole],
      r = p.type === 'ldr' ? 500 + (100 - light) * 495 : p.value;
    (graph[a] ??= []).push({ to: b, r });
    (graph[b] ??= []).push({ to: a, r });
  }
  function resistance(start: string, targets: string[]): number {
    if (targets.includes(start)) return 0;
    const dist: Record<string, number> = { [start]: 0 },
      queue = new Set([start]);
    while (queue.size) {
      const a = [...queue].reduce((x, y) => (dist[x] < dist[y] ? x : y));
      queue.delete(a);
      if (targets.includes(a)) return dist[a];
      for (const e of graph[a] || [])
        if (dist[a] + e.r < (dist[e.to] ?? Infinity)) {
          dist[e.to] = dist[a] + e.r;
          queue.add(e.to);
        }
    }
    return Infinity;
  }
  const short =
    powered && !!esp && highs.some((h) => resistance(h, grounds) < 100);
  if (short)
    issues.push({
      severity: 'error',
      message:
        'Short circuit: a supply or HIGH output reaches ground with too little resistance. Power is paused; remove the connection.',
    });
  for (const p of c.parts.filter(
    (p) => p.type === 'led' || p.type === 'buzzer',
  )) {
    const t = pins(p),
      a = net[t[0].hole],
      k = net[t[1].hole];
    const aHigh = resistance(a, highs),
      aGround = resistance(a, grounds),
      kHigh = resistance(k, highs),
      kGround = resistance(k, grounds),
      forward = aHigh + kGround,
      reverse = kHigh + aGround,
      bothAtKnownPotentials =
        (Number.isFinite(aHigh) || Number.isFinite(aGround)) &&
        (Number.isFinite(kHigh) || Number.isFinite(kGround));
    if (a === k)
      issues.push({
        severity: 'warning',
        message: `${p.type === 'led' ? 'LED' : 'Buzzer'} legs share one electrical strip. Move one leg to another numbered strip.`,
      });
    else if (Number.isFinite(forward)) {
      if (p.type === 'led' && forward < 100)
        issues.push({
          severity: 'error',
          message:
            'LED needs a series resistor (try 220 Ω or 330 Ω). A direct wire bypassing it also removes protection.',
        });
      else if (powered && !short) {
        if (p.type === 'led' && forward <= 10000) litLeds.push(p.id);
        else if (p.type === 'buzzer' && forward < 100) activeBuzzers.push(p.id);
      }
    } else if (Number.isFinite(reverse))
      issues.push({
        severity: 'warning',
        message: `${p.type === 'led' ? 'LED' : 'Buzzer'} polarity is reversed. Connect + toward 3V3 and − toward GND.`,
      });
    else if (bothAtKnownPotentials)
      issues.push({
        severity: 'info',
        message: `${p.type === 'led' ? 'LED' : 'Buzzer'} is connected but both legs are at the same voltage, so it stays off.`,
      });
    else
      issues.push({
        severity: 'info',
        message: `${p.type === 'led' ? 'LED' : 'Buzzer'} has an open circuit. Trace both legs back to power and ground.`,
      });
  }
  const analog: Record<string, number> = {};
  for (const p of ep.filter((p) =>
    ['32', '33', '34', '35', 'VP', 'VN'].includes(p.label),
  )) {
    const rp = resistance(net[p.hole], highs),
      rg = resistance(net[p.hole], grounds);
    if (
      powered &&
      !short &&
      Number.isFinite(rp) &&
      Number.isFinite(rg) &&
      rp + rg > 0
    )
      analog[p.label] = (3.3 * rg) / (rp + rg);
  }
  return {
    net,
    buttonLow:
      c.profile === 'hardware' &&
      ep.some(
        (p) =>
          p.label === '23' &&
          ep.some((g) => g.label === 'GND' && net[g.hole] === net[p.hole]),
      ),
    issues,
    litLeds,
    activeBuzzers,
    analog,
    short,
    powered: powered && !!esp && !short,
  };
}
export function emptyCircuit(): Circuit {
  return { parts: [], wires: [], splitRails: true };
}
export function exampleCircuit(
  kind: 'led' | 'button' | 'ldr' | 'buzzer' = 'led',
): Circuit {
  const parts: Part[] = [
    { id: 'esp', type: 'esp32', row: 'A', col: 4, rotation: 0, value: 0 },
  ];
  const wires: Wire[] = [];
  const w = (from: string, to: string, color = '#e35a52') =>
    wires.push({ id: `w${wires.length}`, from, to, color });
  w('J4', 'TP4');
  w('J5', 'TN5', '#42536b');
  if (kind === 'ldr') {
    parts.push(
      { id: 'ldr', type: 'ldr', row: 'C', col: 24, rotation: 0, value: 10000 },
      {
        id: 'res',
        type: 'resistor',
        row: 'D',
        col: 26,
        rotation: 0,
        value: 10000,
      },
    );
    w('TP24', 'A24');
    w('B29', 'TN29', '#42536b');
    w('B26', 'A15', '#7657d6');
  } else if (kind === 'buzzer') {
    parts.push({
      id: 'buzzer',
      type: 'buzzer',
      row: 'C',
      col: 27,
      rotation: 0,
      value: 0,
    });
    w('TP27', 'A27');
    w('B29', 'TN29', '#42536b');
  } else {
    parts.push(
      {
        id: 'res',
        type: 'resistor',
        row: 'C',
        col: 24,
        rotation: 0,
        value: 220,
      },
      { id: 'led', type: 'led', row: 'D', col: 27, rotation: 0, value: 0 },
    );
    w('TP24', 'A24');
    if (kind === 'button') {
      parts.push({
        id: 'btn',
        type: 'button',
        row: 'E',
        col: 33,
        rotation: 0,
        value: 0,
      });
      w('B29', 'D33', '#42536b');
      w('J33', 'TN33', '#42536b');
      w('TN29', 'TN33', '#42536b');
    } else w('B29', 'TN29', '#42536b');
  }
  return { parts, wires, splitRails: true };
}
export function parseCircuit(raw: unknown): Circuit {
  if (!raw || typeof raw !== 'object') throw Error('Invalid project file.');
  const c = raw as Circuit;
  if (
    !Array.isArray(c.parts) ||
    !Array.isArray(c.wires) ||
    c.parts.length > 100 ||
    c.wires.length > 300 ||
    (c.profile !== undefined && c.profile !== 'hardware') ||
    typeof c.splitRails !== 'boolean'
  )
    throw Error('Project data is invalid or too large.');
  const ids = new Set<string>();
  for (const p of c.parts) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      ids.has(p.id) ||
      !['esp32', 'led', 'resistor', 'button', 'ldr', 'buzzer'].includes(
        p.type,
      ) ||
      (p.footprint !== undefined &&
        (p.type !== 'button' || p.footprint !== 'same-side')) ||
      !Number.isInteger(p.col) ||
      !Object.hasOwn(ROWS, p.row) ||
      ![0, 90, 180, 270].includes(p.rotation) ||
      !Number.isFinite(p.value) ||
      p.value < 0 ||
      p.value > 1e7 ||
      (p.type === 'resistor' && p.value < 1)
    )
      throw Error('Invalid component.');
    ids.add(p.id);
    if (
      placementError(
        p,
        c.parts.filter((q) => q !== p),
      )
    )
      throw Error('Invalid component placement.');
  }
  const wirePairs = new Set<string>();
  for (const w of c.wires) {
    if (
      !w ||
      typeof w.id !== 'string' ||
      ids.has(w.id) ||
      !HOLE_SET.has(w.from) ||
      !HOLE_SET.has(w.to) ||
      !/^#[0-9a-fA-F]{6}$/.test(w.color)
    )
      throw Error('Invalid wire.');
    if (w.from === w.to) throw Error('A wire needs two different holes.');
    const pair = [w.from, w.to].sort().join('|');
    if (wirePairs.has(pair)) throw Error('Duplicate wire.');
    wirePairs.add(pair);
    ids.add(w.id);
  }
  return c;
}

export function hardwareCircuit(): Circuit {
  return {
    profile: 'hardware',
    splitRails: true,
    parts: [
      { id: 'esp', type: 'esp32', row: 'A', col: 4, rotation: 0, value: 0 },
      { id: 'led', type: 'led', row: 'C', col: 27, rotation: 0, value: 0 },
      {
        id: 'res',
        type: 'resistor',
        row: 'D',
        col: 29,
        rotation: 0,
        value: 220,
      },
      {
        id: 'btn',
        type: 'button',
        row: 'A',
        col: 40,
        rotation: 0,
        value: 0,
        footprint: 'same-side',
      },
    ],
    wires: [
      { id: 'gpio19-led', from: 'J13', to: 'A27', color: '#e35a52' },
      { id: 'led-return', from: 'A32', to: 'TN32', color: '#42536b' },
      { id: 'ground-rail', from: 'J5', to: 'TN5', color: '#42536b' },
      { id: 'rail-bridge', from: 'TN30', to: 'TN31', color: '#42536b' },
      { id: 'button-gnd', from: 'B40', to: 'TN40', color: '#42536b' },
      { id: 'button-input', from: 'B42', to: 'J18', color: '#21a685' },
    ],
  };
}
