'use client';
import {
  Fragment,
  useState,
  useMemo,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { wireDragCandidate, wirePlacementError } from '@/lib/wire-placement';
import { anchorPinAt, nearestHole, nudgeHole } from '@/lib/placement';
import { flushSync } from 'react-dom';
import { registerWorkbench, type ModelContext } from '@/lib/webmcp';
import {
  Cpu,
  Cable,
  MousePointer2,
  ScanLine,
  RotateCw,
  Trash2,
  Undo2,
  Redo2,
  Play,
  Square,
  Plus,
  Minus,
  Maximize,
  ChevronRight,
  Check,
  Lightbulb,
  CircleHelp,
  Copy,
  Upload,
  ArrowLeft,
  Volume2,
  Sun,
  CircleDot,
  BookOpen,
  X,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  type Circuit,
  type Wire,
  type Part,
  type Kind,
  ROWS,
  HOLES,
  position,
  pins,
  placementError,
  connectedHoles,
  analyze,
  emptyCircuit,
  exampleCircuit,
  parseCircuit,
} from '@/lib/circuit';
const PALETTE = [
  { type: 'esp32', name: 'ESP32 DevKit', desc: '30 pins · 3.3 V', icon: Cpu },
  { type: 'led', name: 'LED', desc: 'Red · polarized', icon: Lightbulb },
  { type: 'resistor', name: 'Resistor', desc: '220 Ω · adjustable', icon: Zap },
  {
    type: 'button',
    name: 'Push button',
    desc: 'Momentary · 4 legs',
    icon: CircleDot,
  },
  {
    type: 'ldr',
    name: 'Light sensor',
    desc: 'Photoresistor · 2 legs',
    icon: Sun,
  },
  {
    type: 'buzzer',
    name: 'Active buzzer',
    desc: '3.3 V · polarized',
    icon: Volume2,
  },
] as const;
const COLORS = [
  '#e35a52',
  '#42536b',
  '#21a685',
  '#e6ad32',
  '#528be0',
  '#9471d8',
];
const LESSONS = [
  {
    name: 'Meet your breadboard',
    detail: 'See the hidden connections',
    steps: [
      'Choose the Inspect tool.',
      'Click any hole from A to J. The highlighted holes are electrically connected.',
      'Notice that A–E and F–J do not connect across the center gap.',
    ],
    hint: 'Try A24, then F24. Each group has five connected holes.',
  },
  {
    name: 'Your first light',
    detail: 'Build a complete LED circuit',
    steps: [
      'Connect ESP32 3V3 to one end of a 220 Ω resistor.',
      'Connect the other resistor end to the LED anode (+).',
      'Connect the LED cathode (−) to ESP32 GND, then turn on USB power.',
    ],
    hint: 'With the starter placement: wire J4 → A24, B29 → J5. Resistor C24–C27; LED D27–D29.',
  },
  {
    name: 'Push to light',
    detail: 'Give your circuit a switch',
    steps: [
      'Add a button across the center gap (anchor E33).',
      'Put the button in the LED’s return path to GND.',
      'Turn on power. Hold the button in its inspector; the LED should light only while pressed.',
    ],
    hint: 'The two legs on each side are always joined. Pressing joins the two sides. Use E33 and F33 as the switched pair.',
  },
  {
    name: 'Sense the light',
    detail: 'Make a voltage divider',
    steps: [
      'Connect 3V3 → light sensor → a shared strip.',
      'Connect that strip → 10 kΩ resistor → GND.',
      'Connect the shared strip to GPIO34, power on, then change the light level.',
    ],
    hint: 'Example: LDR C24–C26, resistor D26–D29. Wire J4 → A24, B29 → J5, B26 → A15 (GPIO34).',
  },
];
const uid = () => crypto.randomUUID();
function formAddress(form: HTMLFormElement, name: string) {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.toUpperCase() : '';
}
const point = (h: string) => {
  const p = position(h);
  return { x: 50 + p.x * 20, y: 150 + p.y * 20 };
};
const partPoint = (p: Part) => ({
  x: 50 + (p.col - 1) * 20,
  y: 150 + ROWS[p.row] * 20,
});
const starter = () => {
  const c = exampleCircuit();
  c.wires = [];
  return c;
};
function PartDrawing({
  part,
  selected,
  lit,
  pressed,
  power,
  transparent = false,
  onboard = false,
}: {
  part: Part;
  selected: boolean;
  lit: boolean;
  pressed: boolean;
  power: boolean;
  transparent?: boolean;
  onboard?: boolean;
}) {
  const p = partPoint(part),
    t = pins(part);
  return (
    <g
      data-led-state={part.type === 'led' ? (lit ? 'on' : 'off') : undefined}
      className={`component ${selected ? 'selected' : ''}`}
      data-part={part.id}
    >
      <title>
        {part.type === 'esp32'
          ? 'ESP32 DevKit'
          : part.type === 'led'
            ? 'Red LED'
            : part.type === 'resistor'
              ? `${part.value} ohm resistor`
              : part.type === 'button'
                ? 'Momentary push button'
                : part.type === 'ldr'
                  ? 'Photoresistor'
                  : 'Active buzzer'}
      </title>
      <g transform={`translate(${p.x} ${p.y}) rotate(${part.rotation})`}>
        {part.type !== 'esp32' && (
          <rect
            x={-10}
            y={part.type === 'button' ? -8 : -49}
            width={part.type === 'resistor' ? 80 : 60}
            height={part.type === 'button' ? 78 : 75}
            rx={5}
            fill="transparent"
            stroke={selected ? '#148667' : 'none'}
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
        )}

        {part.type === 'esp32' ? (
          <>
            <rect
              x={-11}
              y={-8}
              width={302}
              height={216}
              rx={8}
              fill={transparent ? '#204a4260' : '#20463e'}
              stroke={selected ? '#2bd6ad' : '#12372e'}
              strokeWidth={selected ? 3 : 2}
            />
            <rect
              x={37}
              y={35}
              width={165}
              height={130}
              rx={5}
              fill={transparent ? '#bfd0ce70' : '#c6d0cf'}
              stroke="#8faaa4"
            />
            <path
              d="M219 42h51v14h-38v15h38v14h-38v15h38v14h-51"
              fill="none"
              stroke="#d6be70"
              strokeWidth={4}
            />
            <rect
              x={-19}
              y={75}
              width={38}
              height={50}
              rx={3}
              fill="#c2cad0"
              stroke="#65717b"
            />
            <rect x={-20} y={86} width={15} height={28} rx={2} fill="#35434b" />
            <text x={119} y={85} textAnchor="middle" className="chip-label">
              ESP32
            </text>
            <text x={119} y={110} textAnchor="middle" className="chip-detail">
              WROOM-32
            </text>
            <text x={119} y={145} textAnchor="middle" className="chip-detail">
              DEVKIT V1 · 30 PIN
            </text>
            <circle
              cx={27}
              cy={173}
              r={4}
              fill={power ? '#59ff98' : '#457268'}
            />
            <circle
              cx={27}
              cy={154}
              r={4}
              fill={onboard ? '#529aff' : '#2b4c6a'}
            >
              <title>GPIO2 onboard blue LED</title>
            </circle>
            <text x={44} y={178} className="pcb-text">
              USB POWER
            </text>
          </>
        ) : part.type === 'resistor' ? (
          <>
            <path d="M0 0h60" stroke="#9aabb4" strokeWidth={4} />
            <rect
              x={13}
              y={-9}
              width={34}
              height={18}
              rx={5}
              fill="#e2c28e"
              stroke="#b99764"
            />
            <path d="M21-9v18M28-9v18" stroke="#934936" strokeWidth={4} />
            <path
              d="M35-9v18"
              stroke={part.value === 10000 ? '#e59c2b' : '#654b37'}
              strokeWidth={4}
            />
            <path d="M42-8v16" stroke="#c29938" strokeWidth={2} />
            <g className="component-tag" transform="translate(30 -22)">
              <rect
                x={-23}
                y={-8}
                width={46}
                height={15}
                rx={4}
                fill="#fffaf0"
                stroke="#d8c39a"
                strokeWidth={1}
              />
              <text x={0} y={2} textAnchor="middle" className="part-label">
                {part.value >= 1000 ? `${part.value / 1000}k` : part.value} Ω
              </text>
            </g>
          </>
        ) : part.type === 'led' ? (
          <>
            <path d="M0 0v-19h12" stroke="#aeb9bd" strokeWidth={3.5} />
            <path d="M40 0v-15H28" stroke="#89979d" strokeWidth={3.5} />
            {lit && (
              <>
                <circle
                  cx={20}
                  cy={-29}
                  r={31}
                  fill="#ff302f35"
                  className="led-glow led-glow-outer"
                  pointerEvents="none"
                />
                <circle
                  cx={20}
                  cy={-29}
                  r={21}
                  fill="#ff211be0"
                  className="led-glow"
                  pointerEvents="none"
                />
              </>
            )}
            <path
              d="M6-16v-15a14 14 0 0 1 28 0v15z"
              fill={lit ? '#ff2822' : '#a93f3d'}
              stroke={lit ? '#d61111' : '#6f302f'}
              strokeWidth={2}
            />
            <ellipse
              cx={16}
              cy={-33}
              rx={5}
              ry={8}
              fill="#ffd5ce"
              opacity={lit ? 0.88 : 0.48}
            />
            <path
              d="M7-18h26"
              stroke="#ff8b82"
              strokeWidth={1.5}
              opacity={0.55}
            />
            <rect
              x={3}
              y={-18}
              width={34}
              height={6}
              rx={2.5}
              fill={lit ? '#f52c27' : '#893938'}
              stroke="#702c2c"
              strokeWidth={1.5}
            />
            <g className="component-polarity">
              <text x={-6} y={-4} className="part-label">
                +
              </text>
              <text x={35} y={-4} className="part-label">
                −
              </text>
            </g>
          </>
        ) : part.type === 'button' ? (
          <g>
            <path
              d={
                part.footprint === 'same-side'
                  ? 'M0 0v40m40-40v40'
                  : 'M0 0v60m40-60v60'
              }
              stroke="#98a6ac"
              strokeWidth={5}
            />
            <path
              d="M-7 13h8M39 13h8M-7 47h8M39 47h8"
              stroke="#c7d0d4"
              strokeWidth={6}
              strokeLinecap="round"
            />
            <rect
              x={-3}
              y={9}
              width={46}
              height={42}
              rx={6}
              fill="#263940"
              stroke="#101f25"
              strokeWidth={2.5}
            />
            <rect
              x={2}
              y={14}
              width={36}
              height={32}
              rx={4}
              fill="#3d5057"
              stroke="#657980"
              strokeWidth={1.5}
            />
            <path
              d="M5 17h30"
              stroke="#91a0a5"
              strokeWidth={2}
              opacity={0.65}
            />
            <circle
              cx={20}
              cy={30}
              r={13}
              fill={pressed ? '#199979' : '#151f23'}
              stroke="#87979d"
              strokeWidth={3}
            />
            <circle
              cx={20}
              cy={30}
              r={8}
              fill={pressed ? '#6ed9bd' : '#2d3b40'}
            />
            <ellipse
              cx={17}
              cy={27}
              rx={3}
              ry={2}
              fill="#c5d0d3"
              opacity={pressed ? 0.35 : 0.55}
            />
          </g>
        ) : part.type === 'ldr' ? (
          <>
            <path d="M0 0l8-22m32 22L32-22" stroke="#93a1a8" strokeWidth={3} />
            <circle
              cx={20}
              cy={-25}
              r={18}
              fill="#e8b271"
              stroke="#a77443"
              strokeWidth={2}
            />
            <path
              d="M9-36h17v6H13v6h14v6H13"
              fill="none"
              stroke="#9b472e"
              strokeWidth={3}
            />
          </>
        ) : (
          <>
            <path d="M0 0v-20m40 20v-20" stroke="#93a1a8" strokeWidth={3} />
            <circle
              cx={20}
              cy={-25}
              r={23}
              fill="#263841"
              stroke={lit ? '#25c8a0' : '#132c37'}
              strokeWidth={3}
            />
            <circle cx={20} cy={-25} r={5} fill="#0f202a" />
            <text x={5} y={-32} fill="#e8edef" fontSize={12}>
              +
            </text>
            {lit && (
              <path
                d="M48-42q15 18 0 35M55-47q20 24 0 45"
                fill="none"
                stroke="#21a685"
                strokeWidth={2}
              />
            )}
          </>
        )}
      </g>
      {t.map((pin, i) => (
        <g key={i} data-pin-index={i}>
          <circle
            cx={50 + pin.x * 20}
            cy={150 + pin.y * 20}
            r={9}
            fill="transparent"
          />
          <circle
            cx={50 + pin.x * 20}
            cy={150 + pin.y * 20}
            r={4}
            fill="#d3b868"
            stroke="#685c39"
          />
          <title>
            {pin.label} → {pin.hole}
          </title>
          {part.type === 'esp32' && (
            <text
              x={50 + pin.x * 20}
              y={150 + pin.y * 20 + (i < 15 ? 17 : -10)}
              textAnchor="middle"
              fill="#d6ede1"
              fontSize={9}
              fontFamily="monospace"
            >
              {pin.label}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}
export default function App() {
  const [circuit, setCircuit] = useState<Circuit>(starter),
    [past, setPast] = useState<Circuit[]>([]),
    [future, setFuture] = useState<Circuit[]>([]),
    [mode, setMode] = useState('learn'),
    [lesson, setLesson] = useState(0),
    [completed, setCompleted] = useState<number[]>([]),
    [tool, setTool] = useState('select'),
    [placing, setPlacing] = useState<Kind | null>(null),
    [rotation, setRotation] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [moving, setMoving] = useState<
      | { type: 'part'; id: string; pin: number }
      | { type: 'wire'; id: string; end: 'from' | 'to' }
      | null
    >(null),
    [activePin, setActivePin] = useState(0),
    [wireStart, setWireStart] = useState<string | null>(null),
    [wireColor, setWireColor] = useState(COLORS[0]),
    [hover, setHover] = useState<string | null>(null),
    [probe, setProbe] = useState<string | null>(null),
    [powered, setPowered] = useState(false),
    [pressed, setPressed] = useState<string[]>([]),
    [gpioHigh, setGpioHigh] = useState(false),
    [light, setLight] = useState(50),
    [zoom, setZoom] = useState(1),
    [showNets, setShowNets] = useState(true),
    [transparent, setTransparent] = useState(false),
    [help, setHelp] = useState(false),
    [hint, setHint] = useState(false),
    [message, setMessage] = useState(
      'Choose Inspect, then click a hole to see what connects.',
    ),
    [ready, setReady] = useState(false),
    [drag, setDrag] = useState<Part | null>(null);
  const svgRef = useRef<SVGSVGElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    dragRef = useRef<{
      p: Part;
      x: number;
      y: number;
      moved: boolean;
      pin: number;
    } | null>(null);
  const wireDragRef = useRef<{
    wire: Wire;
    end: 'from' | 'to' | 'both';
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const paletteDragRef = useRef<{
    type: Kind;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [wirePreview, setWirePreview] = useState<{
    id: string;
    wire: Wire | null;
    error: string | null;
  } | null>(null);
  const [palettePreview, setPalettePreview] = useState<{
    type: Kind;
    hole: string;
  } | null>(null);
  const suppressClick = useRef(false);
  const result = useMemo(
    () => analyze(circuit, powered, pressed, gpioHigh, light),
    [circuit, powered, pressed, gpioHigh, light],
  );
  const chosen = circuit.parts.find((p) => p.id === selected),
    chosenWire = circuit.wires.find((w) => w.id === selected);
  const highlights = useMemo(() => {
    const target = probe || hover;
    if (!target || !showNets) return new Set<string>();
    const root = result.net[target];
    return new Set(HOLES.filter((hole) => result.net[hole] === root));
  }, [probe, hover, showNets, result.net]);
  const success =
    lesson === 0
      ? !!probe && /^[A-J]\d+$/.test(probe)
      : lesson === 1
        ? result.litLeds.length > 0
        : lesson === 2
          ? powered &&
            circuit.parts.some((p) => p.type === 'button') &&
            analyze(
              circuit,
              true,
              circuit.parts.filter((p) => p.type === 'button').map((p) => p.id),
              gpioHigh,
            ).litLeds.length > 0 &&
            analyze(circuit, true, [], gpioHigh).litLeds.length === 0
          : result.analog['34'] !== undefined;
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pinlab-project-v1');
      if (raw) setCircuit(parseCircuit(JSON.parse(raw)));
      const progress = JSON.parse(
        localStorage.getItem('pinlab-progress-v1') || '[]',
      );
      if (Array.isArray(progress))
        setCompleted(
          progress.filter((n) => Number.isInteger(n) && n >= 0 && n < 4),
        );
    } catch {
      setMessage(
        'The saved project could not be read. A fresh workbench is ready.',
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem('pinlab-project-v1', JSON.stringify(circuit));
      } catch {
        setMessage(
          'Browser storage is unavailable. Copy your circuit to keep it.',
        );
      }
  }, [circuit, ready]);
  useEffect(() => {
    if (success && mode === 'learn' && !completed.includes(lesson)) {
      const next = [...completed, lesson];
      setCompleted(next);
      try {
        localStorage.setItem('pinlab-progress-v1', JSON.stringify(next));
      } catch {}
    }
  }, [success, mode, lesson, completed]);
  useEffect(() => {
    const release = () => {
      setPressed([]);
      cancelInteraction();
    };
    window.addEventListener('blur', release);
    return () => window.removeEventListener('blur', release);
  }, []);
  useEffect(() => {
    const releasePointer = () => {
      if (paletteDragRef.current || wireDragRef.current || dragRef.current)
        cancelInteraction();
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    return () => {
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
    };
  }, []);
  function cancelInteraction() {
    wireDragRef.current = null;
    paletteDragRef.current = null;
    setWirePreview(null);
    setPalettePreview(null);
    setMoving(null);
    setPlacing(null);
    setWireStart(null);
    setDrag(null);
    dragRef.current = null;
  }
  function commit(next: Circuit) {
    cancelInteraction();
    if (JSON.stringify(next) === JSON.stringify(circuit)) return;
    setPast((p) => [...p.slice(-49), circuit]);
    setFuture([]);
    setCircuit(next);
    setPowered(false);
    setPressed([]);
    setProbe(null);
  }
  const workbenchRef = useRef({
    read: () => ({ circuit, result }),
    replace: (c: Circuit) => commit(c),
  });
  workbenchRef.current = {
    read: () => ({ circuit, result }),
    replace: (c: Circuit) => commit(c),
  };
  useEffect(
    () =>
      registerWorkbench(
        (document as Document & { modelContext?: ModelContext }).modelContext,
        () => workbenchRef.current.read(),
        (c) => flushSync(() => workbenchRef.current.replace(c)),
      ),
    [],
  );
  function undo() {
    cancelInteraction();
    if (!past.length) return;
    setFuture((f) => [circuit, ...f]);
    setCircuit(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setPowered(false);
    setPressed([]);
    setProbe(null);
    setSelected(null);
  }
  function redo() {
    cancelInteraction();
    if (!future.length) return;
    setPast((p) => [...p, circuit]);
    setCircuit(future[0]);
    setFuture((f) => f.slice(1));
    setPowered(false);
    setPressed([]);
    setProbe(null);
    setSelected(null);
  }
  function remove() {
    if (!selected) return;
    commit({
      ...circuit,
      parts: circuit.parts.filter((p) => p.id !== selected),
      wires: circuit.wires.filter((w) => w.id !== selected),
    });
    setSelected(null);
    setMessage('Removed. Use Undo to bring it back.');
  }
  function rotate() {
    if (chosen) {
      const next = { ...chosen, rotation: (chosen.rotation + 90) % 360 };
      const error = placementError(next, circuit.parts);
      if (error) setMessage(error);
      else
        commit({
          ...circuit,
          parts: circuit.parts.map((p) => (p.id === next.id ? next : p)),
        });
    } else {
      setRotation((r) => (r + 90) % 360);
    }
  }
  function movePart(p: Part) {
    const error = placementError(p, circuit.parts);
    if (error) {
      setMessage(error);
      return false;
    }
    commit({
      ...circuit,
      parts: circuit.parts.map((x) => (x.id === p.id ? p : x)),
    });
    setMessage(
      `Placed at ${p.row}${p.col}. Wires stay in their holes. Circuit edits disconnect USB power.`,
    );
    return true;
  }
  function chooseTool(next: string) {
    cancelInteraction();
    setTool(next);
    setPlacing(null);
    setWireStart(null);
    setProbe(null);
  }
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e) => {
    if (
      (e.target as HTMLElement).closest(
        'input,textarea,[role="slider"],[role="combobox"],[role="listbox"],[role="dialog"]',
      )
    )
      return;
    if (e.key === 'Escape') {
      cancelInteraction();
      setPlacing(null);
      setMoving(null);
      setWireStart(null);
      setSelected(null);
      setDrag(null);
      dragRef.current = null;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
      chosen
    ) {
      e.preventDefault();
      const hole = nudgeHole(
        pins(chosen)[activePin]?.hole || pins(chosen)[0].hole,
        e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0,
        e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0,
      );
      if (hole) movePart(anchorPinAt(chosen, activePin, hole));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove();
    } else if (e.key.toLowerCase() === 'r') rotate();
    else if (e.key.toLowerCase() === 'w') chooseTool('wire');
    else if (e.key.toLowerCase() === 'v') chooseTool('select');
    else if (e.key.toLowerCase() === 'i') chooseTool('inspect');
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  function svgPoint(clientX: number, clientY: number) {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  }
  function nearest(clientX: number, clientY: number) {
    const p = svgPoint(clientX, clientY),
      x = Math.round((p.x - 50) / 20),
      y = (p.y - 150) / 20;
    return nearestHole(x, y);
  }
  function addPart(type: Kind, hole: string) {
    const pos = position(hole),
      row = /^[A-Z]+/.exec(hole)![0],
      p: Part = {
        id: uid(),
        type,
        col: pos.x + 1,
        row,
        rotation,
        value: type === 'resistor' ? 220 : 0,
      };
    const error = placementError(p, circuit.parts);
    if (error) {
      setMessage(error);
      return;
    }
    commit({ ...circuit, parts: [...circuit.parts, p] });
    setSelected(p.id);
    setActivePin(0);
    setPlacing(null);
    setTool('select');
    setMessage(
      `${PALETTE.find((x) => x.type === type)?.name} placed at ${hole}. Drag to move; R to rotate.`,
    );
  }
  function beginWireDrag(
    e: ReactPointerEvent<SVGGElement>,
    wire: Wire,
    end: 'from' | 'to' | 'both',
  ) {
    if (tool !== 'select' || placing || moving || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    cancelInteraction();
    const p = svgPoint(e.clientX, e.clientY);
    setSelected(wire.id);
    setProbe(null);
    wireDragRef.current = { wire, end, x: p.x, y: p.y, moved: false };
    setWirePreview({ id: wire.id, wire, error: null });
    svgRef.current?.setPointerCapture(e.pointerId);
  }
  function commitWire(next: Wire | null) {
    const error = wirePlacementError(next, circuit.wires);
    if (error) {
      setMessage(error);
      return false;
    }
    if (!next) return false;
    commit({
      ...circuit,
      wires: circuit.wires.map((w) => (w.id === next.id ? next : w)),
    });
    setMessage(`Wire placed: ${next.from} → ${next.to}.`);
    return true;
  }
  function clickHole(hole: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (moving) {
      if (moving.type === 'part') {
        const p = circuit.parts.find((p) => p.id === moving.id);
        if (p && movePart(anchorPinAt(p, moving.pin, hole))) setMoving(null);
      } else {
        const wire = circuit.wires.find((w) => w.id === moving.id);
        if (wire) {
          const next = { ...wire, [moving.end]: hole };
          if (commitWire(next)) setMoving(null);
        }
      }
      return;
    }

    if (placing) {
      addPart(placing, hole);
      return;
    }
    if (tool === 'wire') {
      if (!wireStart) {
        setWireStart(hole);
        setMessage(`Wire starts at ${hole}. Choose its other end.`);
      } else if (hole !== wireStart) {
        if (
          circuit.wires.some(
            (w) =>
              (w.from === wireStart && w.to === hole) ||
              (w.to === wireStart && w.from === hole),
          )
        ) {
          setMessage('Those holes already have a jumper wire.');
          return;
        }
        commit({
          ...circuit,
          wires: [
            ...circuit.wires,
            { id: uid(), from: wireStart, to: hole, color: wireColor },
          ],
        });
        setWireStart(null);
        setMessage(
          'Wire connected. Choose another starting hole, or press V to select.',
        );
      }
      return;
    }
    setProbe(hole);
    setSelected(null);
    setMessage(
      `${hole}: ${connectedHoles(circuit, hole, pressed).length} holes share this connection. Components such as resistors separate electrical nets.`,
    );
  }
  function handleHoleClick(e: ReactMouseEvent<SVGCircleElement>) {
    const hole = e.currentTarget.dataset.hole;
    if (hole) clickHole(hole);
  }
  function loadExample() {
    const next = exampleCircuit(
      mode === 'sandbox'
        ? 'led'
        : lesson === 2
          ? 'button'
          : lesson === 3
            ? 'ldr'
            : 'led',
    );
    commit(next);
    setPowered(false);
    setPressed([]);
    setGpioHigh(false);
    setTool('select');
    setSelected(null);
    setWireStart(null);
    setProbe(null);
    setMessage(
      'Example loaded. Turn on USB power and explore the connections.',
    );
  }
  function loadPreset(kind: 'led' | 'button' | 'ldr' | 'buzzer') {
    const next = exampleCircuit(kind);
    commit(next);
    // Presets are reproducible runtime starting points even when the circuit
    // itself is already loaded and commit() correctly treats it as a no-op.
    setPressed([]);
    setGpioHigh(false);
    setLight(50);
    setTool('select');
    setSelected(
      kind === 'button'
        ? 'btn'
        : kind === 'ldr'
          ? 'ldr'
          : kind === 'buzzer'
            ? 'buzzer'
            : 'led',
    );
    setActivePin(0);
    setWireStart(null);
    setProbe(null);
    setPowered(true);
    setMessage(
      kind === 'button'
        ? 'Push-button preset powered. Hold the button control to light the LED.'
        : kind === 'ldr'
          ? 'Light-sensor preset powered. Move the light slider to change GPIO34.'
          : kind === 'buzzer'
            ? 'Active-buzzer preset powered. The buzzer is active.'
            : 'LED preset powered. The red LED is glowing through a 220 Ω resistor.',
    );
  }
  function changeLesson(n: number) {
    cancelInteraction();
    setLesson(n);
    setHint(false);
    setProbe(null);
    setPowered(false);
    setPressed([]);
    chooseTool(n === 0 ? 'inspect' : 'select');
    setMessage(
      'Your circuit stays on the workbench. Use Load example if you want a reference.',
    );
  }
  async function copyProject() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(circuit, null, 2));
      setMessage('Circuit JSON copied to the clipboard.');
    } catch {
      setMessage(
        'Clipboard access was blocked. Allow clipboard access and try again.',
      );
    }
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 200000) throw Error('Project file is too large.');
      commit(parseCircuit(JSON.parse(await file.text())));
      setPowered(false);
      setPressed([]);
      setGpioHigh(false);
      setSelected(null);
      setWireStart(null);
      setMessage('Circuit imported.');
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Could not import this project.',
      );
    }
    if (fileRef.current) fileRef.current.value = '';
  }
  const movingPart =
    moving?.type === 'part'
      ? circuit.parts.find((p) => p.id === moving.id)
      : undefined;
  const hoverPart =
    hover && movingPart && moving?.type === 'part'
      ? anchorPinAt(movingPart, moving.pin, hover)
      : null;
  const preview = drag || hoverPart;
  const previewError = preview ? placementError(preview, circuit.parts) : null;
  const activeLabel = wirePreview
    ? wirePreview.error ||
      `Drag wire: ${wirePreview.wire?.from} → ${wirePreview.wire?.to} · release to place`
    : preview
      ? `${pins(preview)
          .map((p) => p.hole || 'outside board')
          .join(
            ' · ',
          )}${previewError ? ' · cannot place' : ' · release/click to place'}`
      : palettePreview
        ? `Drag ${PALETTE.find((p) => p.type === palettePreview.type)?.name} to ${palettePreview.hole} · release to place`
        : moving
          ? `Choose a hole for ${moving.type === 'wire' ? moving.end + ' wire end' : movingPart ? pins(movingPart)[moving.pin]?.label : 'part'}`
          : placing
            ? `Place ${PALETTE.find((p) => p.type === placing)?.name} · ${rotation}°`
            : wireStart
              ? `Connect ${wireStart} to…`
              : tool === 'wire'
                ? 'Choose two holes to connect'
                : tool === 'inspect'
                  ? 'Click a hole to trace its connections'
                  : 'Drag components to move them';
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" title="Experiments homepage">
          <span className="brand-icon">
            <Cpu size={23} />
          </span>
          <span>
            pin<span className="brand-light">lab</span>
            <small>ESP32 PLAYGROUND</small>
          </span>
        </a>
        <Tabs
          value={mode}
          onValueChange={(v) => {
            cancelInteraction();
            setMode(String(v));
            setHint(false);
          }}
        >
          <TabsList>
            <TabsTrigger value="learn">
              <BookOpen size={16} />
              Learn
            </TabsTrigger>
            <TabsTrigger value="sandbox">
              <Cable size={16} />
              Free build
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="header-actions">
          <span className="saved">
            <span />
            Saved on this device
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHelp(true)}
            aria-label="Help and pin reference"
          >
            <CircleHelp />
          </Button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">YOUR ELECTRONICS WORKBENCH</div>
          <h1>
            {mode === 'learn'
              ? 'Small connections. Big discoveries.'
              : 'Make room for your next idea.'}
          </h1>
        </div>
        <div className="project-actions">
          <Button variant="outline" onClick={copyProject}>
            <Copy />
            Copy circuit
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => void importProject(e.target.files?.[0])}
          />
        </div>
      </div>
      <main className="workbench-layout">
        <aside className="kit-panel">
          <div className="panel-title">
            <h2>Starter kit</h2>
            <span>6 parts</span>
          </div>
          <p className="panel-caption">
            Pick a part, then click a hole.
            <br />
            Or drag it onto the board.
          </p>
          <div className="parts-list">
            {PALETTE.map(({ type, name, desc, icon: Icon }) => (
              <button
                key={type}
                aria-label={`Place ${name}`}
                className={`part-card ${placing === type ? 'active' : ''}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  cancelInteraction();
                  setSelected(null);
                  setProbe(null);
                  paletteDragRef.current = {
                    type,
                    x: e.clientX,
                    y: e.clientY,
                    moved: false,
                  };
                  setTool('select');
                }}
                onPointerUp={() => {
                  if (paletteDragRef.current?.type === type) {
                    paletteDragRef.current = null;
                    setPalettePreview(null);
                  }
                }}
                onPointerCancel={() => {
                  if (paletteDragRef.current?.type === type) {
                    paletteDragRef.current = null;
                    setPalettePreview(null);
                  }
                }}
                onClick={() => {
                  cancelInteraction();
                  setPlacing(placing === type ? null : type);
                  setTool('select');
                  setWireStart(null);
                  setSelected(null);
                  setMessage(
                    type === 'esp32'
                      ? 'Wide DevKit: try anchor A4 or B4. Rotate 180° to face the other way.'
                      : type === 'button'
                        ? 'Place its first leg at E33 to span the center gap.'
                        : 'Choose an empty hole for the first leg. R rotates before placement.',
                  );
                }}
              >
                <span className={`part-icon icon-${type}`}>
                  <Icon size={23} />
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>{desc}</small>
                </span>
                <Plus size={15} className="add-part" />
              </button>
            ))}
          </div>
          <div className="kit-note">
            <Lightbulb size={18} />
            <p>
              Start with the parts in your kit. There’s no soldering here, and
              Undo is always nearby.
            </p>
          </div>
          <button className="text-link" onClick={() => setHelp(true)}>
            Breadboard & pin reference <ChevronRight size={14} />
          </button>
        </aside>
        <section
          className="board-panel"
          aria-label="Interactive breadboard workbench"
        >
          <div className="board-toolbar">
            <div className="tool-group">
              {[
                { id: 'select', icon: MousePointer2, label: 'Select (V)' },
                { id: 'wire', icon: Cable, label: 'Wire (W)' },
                {
                  id: 'inspect',
                  icon: ScanLine,
                  label: 'Inspect connections (I)',
                },
              ].map(({ id, icon: Icon, label }) => (
                <Button
                  key={id}
                  variant={tool === id && !placing ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => chooseTool(id)}
                  aria-label={label}
                  title={label}
                >
                  <Icon />
                </Button>
              ))}
              <span className="toolbar-divider" />
              <Button
                variant="ghost"
                size="icon"
                disabled={!past.length}
                onClick={undo}
                aria-label="Undo"
                title="Undo"
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!future.length}
                onClick={redo}
                aria-label="Redo"
                title="Redo"
              >
                <Redo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!chosen && !placing}
                onClick={rotate}
                aria-label="Rotate part"
                title="Rotate (R)"
              >
                <RotateCw />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!selected}
                onClick={remove}
                aria-label="Delete selected"
                title="Delete"
              >
                <Trash2 />
              </Button>
            </div>
            <Button
              disabled={!circuit.parts.some((p) => p.type === 'esp32')}
              className={`power-button ${powered ? 'on' : ''}`}
              onClick={() => {
                setPowered(!powered);
                setPressed([]);
                setMessage(
                  powered
                    ? 'USB power disconnected.'
                    : 'USB power connected. Check the circuit feedback below.',
                );
              }}
            >
              {powered ? <Square size={14} /> : <Play size={14} />}
              <span>{powered ? 'Power off' : 'USB power'}</span>
            </Button>
          </div>
          <div className="board-meta">
            <span>
              <span className="live-dot" />
              60-column breadboard <span className="muted-meta">/ A–J</span>
            </span>
            <div className="quick-placement">
              {chosen && (
                <Button
                  variant="outline"
                  onClick={() => {
                    cancelInteraction();
                    setTool('select');
                    setMoving({ type: 'part', id: chosen.id, pin: activePin });
                    setProbe(null);
                  }}
                >
                  <MousePointer2 />
                  Move {pins(chosen)[activePin]?.label || 'part'} to a hole
                </Button>
              )}
              <span className="mode-pill">
                {powered ? 'POWERED · 3.3 V' : 'POWER OFF'}
              </span>
            </div>
          </div>
          <div
            className={`stage ${wirePreview ? 'dragging-wire' : ''} ${tool === 'wire' ? 'wiring' : ''} ${placing || moving ? 'placing' : ''}`}
          >
            <div className="stage-instruction">
              <span>{activeLabel}</span>
              {(placing || wireStart || moving) && (
                <button
                  onClick={() => {
                    setPlacing(null);
                    setMoving(null);
                    setWireStart(null);
                  }}
                >
                  Cancel <X size={13} />
                </button>
              )}
            </div>
            <div className="board-scroll">
              {/* Coordinate-based SVG has equivalent keyboard controls in Precise placement below. */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/prefer-tag-over-role */}
              <svg
                ref={svgRef}
                className="breadboard"
                width={1280 * zoom}
                viewBox="0 0 1280 510"
                aria-label="Breadboard, 60 numbered columns and rows A through J. Use the precise hole controls below as a keyboard alternative."
                onPointerMove={(e) => {
                  const h = nearest(e.clientX, e.clientY);
                  setHover((current) => (current === h ? current : h));
                  if (paletteDragRef.current) {
                    const d = paletteDragRef.current;
                    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5)
                      d.moved = true;
                    if (d.moved && h)
                      setPalettePreview((current) =>
                        current?.type === d.type && current.hole === h
                          ? current
                          : { type: d.type, hole: h },
                      );
                    return;
                  }
                  if (wireDragRef.current) {
                    const d = wireDragRef.current,
                      p = svgPoint(e.clientX, e.clientY);
                    if (Math.hypot(p.x - d.x, p.y - d.y) > 5) d.moved = true;
                    if (d.moved) {
                      const next = wireDragCandidate(
                        d.wire,
                        d.end,
                        (p.x - d.x) / 20,
                        (p.y - d.y) / 20,
                      );
                      const error = wirePlacementError(next, circuit.wires);
                      setWirePreview((current) =>
                        current?.id === d.wire.id &&
                        current.wire?.from === next?.from &&
                        current.wire?.to === next?.to &&
                        current.error === error
                          ? current
                          : { id: d.wire.id, wire: next, error },
                      );
                    }
                    return;
                  }
                  if (dragRef.current) {
                    const pt = svgPoint(e.clientX, e.clientY),
                      d = dragRef.current;
                    // Keep the grabbed pin beneath the pointer at every zoom level.
                    if (Math.hypot(pt.x - d.x, pt.y - d.y) > 5) d.moved = true;
                    if (d.moved) {
                      const pin = pins(d.p)[d.pin];
                      const h = nearestHole(
                        pin.x + (pt.x - d.x) / 20,
                        pin.y + (pt.y - d.y) / 20,
                      );
                      const next = h ? anchorPinAt(d.p, d.pin, h) : null;
                      setDrag((current) =>
                        current !== null &&
                        next !== null &&
                        current.id === next.id &&
                        current.row === next?.row &&
                        current.col === next?.col &&
                        current.rotation === next?.rotation
                          ? current
                          : next,
                      );
                    }
                  }
                }}
                onPointerLeave={() => setHover(null)}
                onPointerCancel={cancelInteraction}
                onLostPointerCapture={() => {
                  wireDragRef.current = null;
                  setWirePreview(null);
                  dragRef.current = null;
                  setDrag(null);
                }}
                onPointerUp={(e) => {
                  if (paletteDragRef.current) {
                    const d = paletteDragRef.current,
                      h = nearest(e.clientX, e.clientY);
                    if (
                      d.moved ||
                      Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5
                    ) {
                      suppressClick.current = true;
                      if (h) addPart(d.type, h);
                      else
                        setMessage(
                          'Drop the component on a breadboard hole. The kit item stayed in place.',
                        );
                      setTimeout(() => {
                        suppressClick.current = false;
                      }, 0);
                    }
                    paletteDragRef.current = null;
                    setPalettePreview(null);
                    return;
                  }
                  if (wireDragRef.current) {
                    const d = wireDragRef.current,
                      p = svgPoint(e.clientX, e.clientY);
                    if (d.moved || Math.hypot(p.x - d.x, p.y - d.y) > 5) {
                      suppressClick.current = true;
                      commitWire(
                        wireDragCandidate(
                          d.wire,
                          d.end,
                          (p.x - d.x) / 20,
                          (p.y - d.y) / 20,
                        ),
                      );
                      setTimeout(() => {
                        suppressClick.current = false;
                      }, 0);
                    }
                    wireDragRef.current = null;
                    setWirePreview(null);
                    return;
                  }
                  const d = dragRef.current;
                  if (d?.moved) {
                    suppressClick.current = true;
                    const pt = svgPoint(e.clientX, e.clientY),
                      pin = pins(d.p)[d.pin];
                    const h = nearestHole(
                      pin.x + (pt.x - d.x) / 20,
                      pin.y + (pt.y - d.y) / 20,
                    );
                    if (h) movePart(anchorPinAt(d.p, d.pin, h));
                    else
                      setMessage(
                        'Drop inside the breadboard. The part stayed in its original holes.',
                      );
                    // A synthesized click immediately follows pointerup; later clicks remain usable.
                    setTimeout(() => {
                      suppressClick.current = false;
                    }, 0);
                  }
                  dragRef.current = null;
                  setDrag(null);
                }}
              >
                <defs>
                  <filter
                    id="board-shadow"
                    x="-10%"
                    y="-10%"
                    width="120%"
                    height="130%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="8"
                      stdDeviation="6"
                      floodColor="#05131c"
                      floodOpacity=".28"
                    />
                  </filter>
                  <pattern
                    id="board-texture"
                    width="5"
                    height="5"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="1" cy="1" r=".35" fill="#c5cdd0" />
                  </pattern>
                </defs>
                <rect
                  x={21}
                  y={24}
                  width={1238}
                  height={464}
                  rx={12}
                  fill="#e7ebed"
                  filter="url(#board-shadow)"
                />
                <rect
                  x={24}
                  y={24}
                  width={1232}
                  height={455}
                  rx={10}
                  fill="#f2f4f3"
                />
                <rect
                  x={24}
                  y={24}
                  width={1232}
                  height={455}
                  rx={10}
                  fill="url(#board-texture)"
                />
                <rect
                  x={28}
                  y={249}
                  width={1224}
                  height={22}
                  rx={4}
                  fill="#d2dadd"
                />
                <path d="M28 250h1224" stroke="#bcc8ce" strokeWidth={2} />
                <text
                  x={640}
                  y={264}
                  textAnchor="middle"
                  fill="#778d97"
                  fontSize={10}
                  letterSpacing={3}
                >
                  CENTER GAP · NO CONNECTION ACROSS
                </text>
                {[
                  { y: 53, color: '#d77472' },
                  { y: 107, color: '#76a3c6' },
                  { y: 413, color: '#d77472' },
                  { y: 467, color: '#76a3c6' },
                ].map(({ y, color }) => (
                  <g key={y}>
                    <path
                      d={
                        circuit.splitRails
                          ? `M43 ${y}h589 m24 0h589`
                          : `M43 ${y}h1202`
                      }
                      stroke={color}
                      strokeWidth={2}
                    />
                    <text x={32} y={y + 4} fill={color} fontSize={13}>
                      {color === '#d77472' ? '+' : '−'}
                    </text>
                  </g>
                ))}
                {Array.from({ length: 60 }, (_, i) => (
                  <g key={i}>
                    <text
                      x={50 + i * 20}
                      y={133}
                      textAnchor="middle"
                      className="board-number"
                    >
                      {i + 1}
                    </text>
                    <text
                      x={50 + i * 20}
                      y={395}
                      textAnchor="middle"
                      className="board-number"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
                {Object.entries(ROWS)
                  .filter(([r]) => r.length === 1)
                  .map(([r, y]) => (
                    <g key={r}>
                      <text x={33} y={154 + y * 20} className="board-number">
                        {r}
                      </text>
                      <text x={1238} y={154 + y * 20} className="board-number">
                        {r}
                      </text>
                    </g>
                  ))}
                {HOLES.map((h) => {
                  const p = point(h);
                  return (
                    <Fragment key={h}>
                      <circle
                        className="hole"
                        data-hole={h}
                        aria-hidden="true"
                        onClick={handleHoleClick}
                        cx={p.x}
                        cy={p.y}
                        r={8}
                        fill={highlights.has(h) ? '#43c9a04d' : 'transparent'}
                      >
                        <title>{h}</title>
                      </circle>
                      <rect
                        x={p.x - 2.5}
                        y={p.y - 2.5}
                        width={5}
                        height={5}
                        rx={1.1}
                        fill={
                          wireStart === h
                            ? '#e35a52'
                            : highlights.has(h)
                              ? '#0b9b7b'
                              : '#8998a0'
                        }
                        stroke={highlights.has(h) ? '#009b76' : '#d5dfe2'}
                        strokeWidth={1}
                        pointerEvents="none"
                      />
                    </Fragment>
                  );
                })}
                {circuit.parts.map((p) => (
                  <g
                    key={p.id}
                    onPointerDown={(e) => {
                      if (
                        e.button !== 0 ||
                        tool !== 'select' ||
                        placing ||
                        moving
                      )
                        return;
                      e.preventDefault();
                      e.stopPropagation();
                      const pt = svgPoint(e.clientX, e.clientY);
                      const index = Number(
                        (e.target as Element)
                          .closest('[data-pin-index]')
                          ?.getAttribute('data-pin-index') || 0,
                      );
                      setSelected(p.id);
                      setActivePin(index);
                      setProbe(null);
                      dragRef.current = {
                        p,
                        x: pt.x,
                        y: pt.y,
                        moved: false,
                        pin: index,
                      };
                      svgRef.current?.setPointerCapture(e.pointerId);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        tool === 'wire' ||
                        tool === 'inspect' ||
                        placing ||
                        moving
                      ) {
                        const h = nearest(e.clientX, e.clientY);
                        if (h) clickHole(h);
                      }
                    }}
                  >
                    <PartDrawing
                      part={
                        preview?.id === p.id && Object.hasOwn(ROWS, preview.row)
                          ? preview
                          : p
                      }
                      selected={selected === p.id}
                      lit={
                        result.litLeds.includes(p.id) ||
                        result.activeBuzzers.includes(p.id)
                      }
                      pressed={pressed.includes(p.id)}
                      power={result.powered}
                      onboard={
                        circuit.profile === 'hardware' &&
                        gpioHigh &&
                        result.powered
                      }
                      transparent={transparent}
                    />
                  </g>
                ))}
                {palettePreview && (
                  <g pointerEvents="none" opacity={0.55}>
                    <PartDrawing
                      part={{
                        id: 'palette-preview',
                        type: palettePreview.type,
                        row: /^[A-Z]+/.exec(palettePreview.hole)![0],
                        col: position(palettePreview.hole).x + 1,
                        rotation,
                        value: palettePreview.type === 'resistor' ? 220 : 0,
                        ...(palettePreview.type === 'button'
                          ? { footprint: 'same-side' as const }
                          : {}),
                      }}
                      selected={false}
                      lit={false}
                      pressed={false}
                      power={false}
                      transparent={false}
                    />
                  </g>
                )}
                {circuit.wires
                  .slice()
                  .sort(
                    (a, b) =>
                      Number(a.id === selected) - Number(b.id === selected),
                  )
                  .map((w) => {
                    const displayed =
                      wirePreview?.id === w.id && wirePreview.wire
                        ? wirePreview.wire
                        : w;
                    const a = point(displayed.from),
                      b = point(displayed.to),
                      lift = Math.min(85, 22 + Math.abs(b.x - a.x) * 0.08),
                      d = `M${a.x} ${a.y} C${a.x} ${a.y - lift},${b.x} ${b.y - lift},${b.x} ${b.y}`;
                    return (
                      <g
                        key={w.id}
                        className="wire"
                        data-wire-id={w.id}
                        onPointerDown={(e) => beginWireDrag(e, w, 'both')}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (suppressClick.current) return;
                          if (
                            tool === 'wire' ||
                            tool === 'inspect' ||
                            moving ||
                            placing
                          ) {
                            const h = nearest(e.clientX, e.clientY);
                            if (h) clickHole(h);
                          } else {
                            setSelected(w.id);
                            setPlacing(null);
                            setProbe(null);
                          }
                        }}
                      >
                        <path
                          d={d}
                          data-wire-body="true"
                          stroke="transparent"
                          strokeWidth={18}
                          fill="none"
                        />
                        <path
                          d={d}
                          stroke={selected === w.id ? '#fff' : '#00000025'}
                          strokeWidth={selected === w.id ? 7 : 5}
                          fill="none"
                        />
                        <path
                          d={d}
                          stroke={w.color}
                          strokeWidth={3.5}
                          fill="none"
                        />
                        {(['from', 'to'] as const).map((end) => {
                          const p = end === 'from' ? a : b;
                          return (
                            <g
                              key={end}
                              data-wire-end={end}
                              className="wire-end"
                              onPointerDown={(e) => beginWireDrag(e, w, end)}
                            >
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={12}
                                fill="transparent"
                              />
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={selected === w.id ? 7 : 4}
                                fill={w.color}
                                stroke={selected === w.id ? 'white' : w.color}
                                strokeWidth={2}
                              />
                              <title>
                                Drag {end} end: {displayed[end]}
                              </title>
                            </g>
                          );
                        })}
                        <title>
                          {w.from} → {w.to}
                        </title>
                      </g>
                    );
                  })}
                {wirePreview?.wire && (
                  <g pointerEvents="none" aria-hidden="true">
                    {[wirePreview.wire.from, wirePreview.wire.to].map(
                      (h, i) => {
                        const p = point(h);
                        return (
                          <g key={i}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={10}
                              fill="none"
                              stroke={wirePreview.error ? '#c2473e' : '#13896b'}
                              strokeWidth={2}
                            />
                            <rect
                              x={p.x - 21}
                              y={p.y + 13}
                              width={42}
                              height={18}
                              rx={4}
                              fill={wirePreview.error ? '#a83630' : '#116d57'}
                            />
                            <text
                              x={p.x}
                              y={p.y + 26}
                              fill="white"
                              textAnchor="middle"
                              fontSize={12}
                            >
                              {h}
                            </text>
                          </g>
                        );
                      },
                    )}
                  </g>
                )}
                {wireStart && hover && (
                  <path
                    d={`M${point(wireStart).x} ${point(wireStart).y}L${point(hover).x} ${point(hover).y}`}
                    stroke={wireColor}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    pointerEvents="none"
                  />
                )}
                {((hover && (moving || placing || tool === 'wire')) ||
                  preview) && (
                  <g pointerEvents="none" aria-hidden="true">
                    {(preview
                      ? pins(preview)
                          .filter((p) => p.hole)
                          .map((p) => p.hole)
                      : hover
                        ? [hover]
                        : []
                    ).map((h) => {
                      const pt = point(h);
                      return (
                        <g key={h}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={9}
                            fill="none"
                            stroke={previewError ? '#d14e48' : '#0f9873'}
                            strokeWidth={2.5}
                          />
                          <rect
                            x={pt.x - 20}
                            y={pt.y + 11}
                            width={40}
                            height={18}
                            rx={4}
                            fill={previewError ? '#a83b37' : '#116d57'}
                          />
                          <text
                            x={pt.x}
                            y={pt.y + 24}
                            fill="white"
                            textAnchor="middle"
                            fontSize={12}
                          >
                            {h}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}
              </svg>
            </div>
            <div className="stage-footer">
              <span>
                <MousePointer2 size={13} />
                {hover || probe || 'Hover a hole to see its address'}
              </span>
              <div>
                <button
                  aria-label="Zoom out"
                  disabled={zoom <= 0.5}
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                >
                  <Minus size={15} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  aria-label="Zoom in"
                  disabled={zoom >= 3}
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                >
                  <Plus size={15} />
                </button>
                <button
                  aria-label="Fit board"
                  onClick={() =>
                    setZoom(
                      Math.max(
                        0.25,
                        ((svgRef.current?.parentElement?.clientWidth || 1280) -
                          28) /
                          1280,
                      ),
                    )
                  }
                >
                  <Maximize size={14} />
                </button>
              </div>
            </div>
          </div>
          <div className="board-options">
            <label htmlFor="show-connections">
              <Switch
                id="show-connections"
                checked={showNets}
                onCheckedChange={setShowNets}
              />
              Show connections
            </label>
            <label htmlFor="split-rails">
              <Switch
                id="split-rails"
                checked={circuit.splitRails}
                onCheckedChange={(v) => commit({ ...circuit, splitRails: v })}
              />
              Split power rails
            </label>
            <label htmlFor="see-through">
              <Switch
                id="see-through"
                checked={transparent}
                onCheckedChange={setTransparent}
              />
              See through ESP32
            </label>
          </div>
          <output className="status-line">
            <span className={result.short ? 'status-error' : 'status-icon'}>
              {result.short ? <Zap size={17} /> : <CircleDot size={17} />}
            </span>
            <span>{message}</span>
          </output>
          <details
            className="precise-controls"
            open={moving ? true : undefined}
          >
            <summary>Precise placement & keyboard controls</summary>
            <div className="precise-fields">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const h = formAddress(e.currentTarget, 'hole');
                  if (HOLES.includes(h)) clickHole(h);
                  else
                    setMessage(
                      'Enter A1–J60 or a rail address such as TP4 / TN4 / BP4 / BN4.',
                    );
                }}
              >
                <label>
                  Hole address
                  <input
                    name="hole"
                    placeholder="A24"
                    required
                    aria-label="Hole address"
                  />
                </label>
                <Button type="submit" variant="outline">
                  {moving
                    ? 'Move to hole'
                    : placing
                      ? 'Place part'
                      : tool === 'wire'
                        ? 'Wire endpoint'
                        : 'Inspect hole'}
                </Button>
              </form>
              <span>
                V select · W wire · I inspect · R rotate · Delete remove ·
                ⌘/Ctrl Z undo. TP/TN = top +/−; BP/BN = bottom +/−.
              </span>
            </div>
          </details>
        </section>
        <aside className="lesson-panel">
          <section className="preset-panel" aria-labelledby="preset-heading">
            <div className="eyebrow">WORKING PRESETS</div>
            <h2 id="preset-heading">Start with a correct circuit</h2>
            <p>
              Each preset loads safely and turns USB power on so you can test it
              immediately.
            </p>
            <div className="preset-grid">
              <button
                aria-label="Load LED preset"
                onClick={() => loadPreset('led')}
              >
                <Lightbulb />
                <span>
                  <strong>LED</strong>
                  <small>Steady red glow</small>
                </span>
              </button>
              <button
                aria-label="Load push button preset"
                onClick={() => loadPreset('button')}
              >
                <CircleDot />
                <span>
                  <strong>Push button</strong>
                  <small>Hold to light LED</small>
                </span>
              </button>
              <button
                aria-label="Load light sensor preset"
                onClick={() => loadPreset('ldr')}
              >
                <Sun />
                <span>
                  <strong>Light sensor</strong>
                  <small>Read GPIO34</small>
                </span>
              </button>
              <button
                aria-label="Load active buzzer preset"
                onClick={() => loadPreset('buzzer')}
              >
                <Volume2 />
                <span>
                  <strong>Active buzzer</strong>
                  <small>Powered tone</small>
                </span>
              </button>
            </div>
          </section>
          {mode === 'learn' ? (
            <>
              <div className="lesson-heading">
                <span className="eyebrow">LEARNING PATH</span>
                <span>{completed.length} / 4</span>
              </div>
              <h2>Learn by connecting</h2>
              <div className="lesson-progress">
                <span style={{ width: `${completed.length * 25}%` }} />
              </div>
              <div className="lesson-list">
                {LESSONS.map((l, i) => (
                  <button
                    key={l.name}
                    className={`lesson-item ${lesson === i ? 'active' : ''}`}
                    onClick={() => changeLesson(i)}
                  >
                    <span
                      className={`step-number ${completed.includes(i) ? 'complete' : ''}`}
                    >
                      {completed.includes(i) ? (
                        <Check size={14} />
                      ) : (
                        String(i + 1).padStart(2, '0')
                      )}
                    </span>
                    <span>
                      <strong>{l.name}</strong>
                      <small>{l.detail}</small>
                    </span>
                    {lesson === i && <ChevronRight size={14} />}
                  </button>
                ))}
              </div>
              <div className="mission">
                <span className="eyebrow">CHALLENGE {lesson + 1}</span>
                <h3>{LESSONS[lesson].name}</h3>
                <ol>
                  {LESSONS[lesson].steps.map((step, i) => (
                    <li key={step}>
                      <span>{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                {success && (
                  <div className="success">
                    <CheckCircle2 size={18} />
                    <span>Connection made. Nice work!</span>
                  </div>
                )}
                <div className="mission-actions">
                  <Button
                    variant="outline"
                    aria-expanded={hint}
                    aria-controls="lesson-hint"
                    onClick={() => setHint((open) => !open)}
                  >
                    <Lightbulb />
                    Hint
                  </Button>
                  {lesson > 0 && (
                    <Button variant="ghost" onClick={loadExample}>
                      Load example
                    </Button>
                  )}
                </div>
                {hint && (
                  <p className="hint" id="lesson-hint">
                    {LESSONS[lesson].hint}
                  </p>
                )}
                {success && lesson < 3 && (
                  <Button
                    className="next-lesson"
                    onClick={() => changeLesson(lesson + 1)}
                  >
                    Next challenge
                    <ChevronRight />
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow">FREE BUILD</div>
              <h2>Your board. Your rules.</h2>
              <p className="panel-caption">
                Try a connection, trace it, and see what changes. Your circuit
                saves in this browser.
              </p>
              <Button variant="outline" onClick={loadExample}>
                Load LED example
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  commit(emptyCircuit());
                  setTool('select');
                  setSelected(null);
                  setProbe(null);
                  setWireStart(null);
                  setMessage(
                    'Empty workbench. Add an ESP32 from the starter kit. Undo restores your circuit.',
                  );
                }}
              >
                Clear board
              </Button>
            </>
          )}
          <section className="inspector">
            <div className="eyebrow">
              {chosen || chosenWire ? 'SELECTED' : 'CIRCUIT FEEDBACK'}
            </div>
            {chosen ? (
              <>
                <h3>{PALETTE.find((p) => p.type === chosen.type)?.name}</h3>
                <div className="selection-location">
                  {chosen.row}
                  {chosen.col} · {chosen.rotation}°
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Rotate selected part"
                    onClick={rotate}
                  >
                    <RotateCw />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete selected part"
                    onClick={remove}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <form
                  className="move-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const h = formAddress(e.currentTarget, 'anchor');
                    if (!HOLES.includes(h)) {
                      setMessage('Use a valid hole address.');
                      return;
                    }
                    movePart(anchorPinAt(chosen, activePin, h));
                  }}
                >
                  <input
                    name="anchor"
                    aria-label="Move selected part to hole"
                    placeholder={pins(chosen)[activePin]?.hole}
                    key={`${chosen.id}:${activePin}`}
                  />
                  <Button type="submit" variant="outline">
                    Move
                  </Button>
                </form>
                <p className="inspector-note">
                  Moving pin: {pins(chosen)[activePin]?.label}. Arrow keys move
                  one hole. Click a pin below to choose which leg to place.
                </p>
                {chosen.type === 'resistor' && (
                  <Select
                    value={String(chosen.value)}
                    onValueChange={(v) =>
                      commit({
                        ...circuit,
                        parts: circuit.parts.map((p) =>
                          p.id === chosen.id ? { ...p, value: Number(v) } : p,
                        ),
                      })
                    }
                  >
                    <SelectTrigger aria-label="Resistance">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[100, 220, 330, 1000, 4700, 10000].map((v) => (
                        <SelectItem key={v} value={String(v)}>
                          {v >= 1000 ? `${v / 1000} kΩ` : `${v} Ω`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {chosen.type === 'button' && (
                  <Button
                    className="hold-button"
                    disabled={!powered}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setPressed([chosen.id]);
                    }}
                    onPointerUp={() => setPressed([])}
                    onPointerCancel={() => setPressed([])}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setPressed([chosen.id]);
                      }
                    }}
                    onKeyUp={() => setPressed([])}
                    onBlur={() => setPressed([])}
                  >
                    {pressed.includes(chosen.id) ? 'Pressed' : 'Hold to press'}
                  </Button>
                )}
                {chosen.type === 'ldr' && (
                  <div className="light-control">
                    <label>
                      Light level <span>{light}%</span>
                    </label>
                    <Slider
                      aria-label="Light level"
                      value={[light]}
                      onValueChange={(v) =>
                        setLight(Array.isArray(v) ? v[0] : v)
                      }
                      min={0}
                      max={100}
                    />
                    <p>Bright → lower resistance</p>
                  </div>
                )}
                {chosen.type === 'esp32' && (
                  <>
                    <label className="gpio-control" htmlFor="gpio23-output">
                      <Switch
                        id="gpio23-output"
                        checked={gpioHigh}
                        onCheckedChange={setGpioHigh}
                      />
                      {circuit.profile === 'hardware'
                        ? 'GPIO19 + GPIO2'
                        : 'GPIO23'}{' '}
                      {gpioHigh ? 'HIGH' : 'LOW'}
                    </label>
                    <p className="inspector-note">
                      {circuit.profile === 'hardware'
                        ? 'GPIO23 is an active-low input with an internal pull-up. This wiring preview controls GPIO19 and the mirrored GPIO2 manually, with steady LEDs.'
                        : 'USB supplies 3V3. GPIO23 is the manual output. Other GPIOs are inputs; VIN is not a supply here.'}
                    </p>
                  </>
                )}
                <div className="pin-list">
                  {pins(chosen).map((p) => (
                    <button
                      key={p.id}
                      aria-pressed={pins(chosen)[activePin]?.id === p.id}
                      onClick={() => {
                        setActivePin(
                          pins(chosen).findIndex((pin) => pin.id === p.id),
                        );
                        setProbe(p.hole);
                        setMessage(`${p.label} is at ${p.hole}.`);
                      }}
                    >
                      <span>
                        {chosen.type === 'esp32' && /^\d+$/.test(p.label)
                          ? `GPIO${p.label}`
                          : p.label}
                      </span>
                      <code>{p.hole}</code>
                    </button>
                  ))}
                </div>
              </>
            ) : chosenWire ? (
              <>
                <h3>Jumper wire</h3>
                <p className="inspector-note">
                  Drag the middle to move the whole wire. Drag either round end
                  to reconnect it.
                </p>
                <p>
                  {chosenWire.from} → {chosenWire.to}
                </p>
                <div className="wire-end-actions">
                  {(['from', 'to'] as const).map((end) => (
                    <Button
                      key={end}
                      variant="outline"
                      onClick={() => {
                        cancelInteraction();
                        setTool('select');
                        setMoving({ type: 'wire', id: chosenWire.id, end });
                        setProbe(null);
                        setMessage(
                          `Click the new hole for ${chosenWire[end]}.`,
                        );
                      }}
                    >
                      Move {end}: {chosenWire[end]}
                    </Button>
                  ))}
                </div>
                <Button variant="outline" onClick={remove}>
                  <Trash2 />
                  Remove wire
                </Button>
              </>
            ) : (
              <p className="inspector-note">
                Select a part to inspect its pins, change resistance, or press a
                button.
              </p>
            )}
            {Object.entries(result.analog).map(([pin, v]) => (
              <div className="analog-read" key={pin}>
                <span>GPIO{pin}</span>
                <strong>{v.toFixed(2)} V</strong>
                <small>Simple divider estimate</small>
              </div>
            ))}
            {result.litLeds.length > 0 && (
              <div className="feedback good">
                <Lightbulb size={16} />
                <span>{result.litLeds.length} LED lit · complete circuit</span>
              </div>
            )}
            {result.activeBuzzers.length > 0 && (
              <div className="feedback good">
                <Volume2 size={16} />
                <span>Buzzer active (visual preview)</span>
              </div>
            )}
            {result.issues.map((issue, i) => (
              <div key={i} className={`feedback ${issue.severity}`}>
                <CircleDot size={15} />
                <span>{issue.message}</span>
              </div>
            ))}
          </section>
        </aside>
      </main>
      <div className="wire-palette">
        <Cable size={17} />
        <span>Jumper color</span>
        {COLORS.map((color) => (
          <button
            key={color}
            aria-label={`Use ${color} wire`}
            aria-pressed={wireColor === color}
            className={wireColor === color ? 'active' : ''}
            style={{ background: color }}
            onClick={() => {
              setWireColor(color);
              if (chosenWire)
                commit({
                  ...circuit,
                  wires: circuit.wires.map((w) =>
                    w.id === chosenWire.id ? { ...w, color } : w,
                  ),
                });
              else chooseTool('wire');
            }}
          >
            {wireColor === color && <Check size={13} />}
          </button>
        ))}
        <span className="palette-tip">
          Color is a label, not an electrical connection.
        </span>
      </div>
      <footer className="app-footer">
        <a href="/">
          <ArrowLeft size={13} /> Experiments
        </a>
        <span>
          A wiring playground, not a firmware or precision circuit simulator.
        </span>
        <button onClick={() => setHelp(true)}>
          About this board <ChevronRight size={13} />
        </button>
      </footer>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="help-dialog">
          <DialogHeader>
            <DialogTitle>Your first connections</DialogTitle>
            <DialogDescription>
              Learn the circuit here, then check the labels on your physical
              kit.
            </DialogDescription>
          </DialogHeader>
          <div className="help-content">
            <h3>Under the breadboard</h3>
            <p>
              At each number, A–E share one metal strip and F–J share another.
              The center gap separates them. Power rails run along the edges;
              with split rails enabled, columns 1–30 and 31–60 are separate. Red
              and blue markings do not supply power by themselves.
            </p>
            <h3>Which ESP32?</h3>
            <p>
              This is the common 30-pin ESP32 DevKit V1 layout, shown sideways
              with USB at the left and a wide, 10-hole header spacing. Real
              clone dimensions vary. A wide board can cover almost every
              breadboard hole: use an adapter or connect it beside the
              breadboard with jumper leads. Virtual wires can attach directly to
              its labeled pins. Nearby holes under the drawn body are visible in
              “See through ESP32”; check physical clearance on your kit.
            </p>
            <p>
              3V3 is 3.3 V; GND is ground. VP is GPIO36 and VN is GPIO39.
              GPIO34–39 are input-only. GPIO numbers are not physical header
              positions. Pins 0, 2, 5, 12 and 15 affect startup on the classic
              ESP32. Avoid connecting 5 V to GPIO pins.
            </p>
            <h3>Your firmware reference</h3>
            <p>
              Your esp32_device firmware uses GPIO23 INPUT_PULLUP with a 40 ms
              debounce. GPIO19 drives the external red LED and GPIO2 mirrors it
              on the onboard blue LED. Each press cycles OFF → Solid ON → Strobe
              → Heartbeat → OFF. Strobe toggles every 80 ms; heartbeat is on at
              0–100 ms and 200–300 ms of each second. The wiring preset keeps
              outputs steady under manual control; these animations are
              described here rather than executed.
            </p>
            <p>
              The preset follows the documented B40 ground / B42 GPIO23 button
              contacts and puts 220 Ω in the LED return to ground. Other
              component positions are illustrative because the hardware guide
              does not specify their holes.
            </p>
            <h3>What the preview checks</h3>
            <p>
              USB powers the ESP32’s 3V3 pin. The default profile controls
              GPIO23 manually; the hardware preset uses GPIO23 as an input and
              controls GPIO19/GPIO2 together. The preview traces wires,
              breadboard strips, buttons, and resistor paths. It checks direct
              shorts, reversed LEDs, and a missing or bypassed resistor; it
              lights an LED only with a series resistance of 100 Ω–10 kΩ.
            </p>
            <p>
              Use simple circuits with one supply and series branches. Parallel
              resistor networks, current sharing, multiple LEDs in series, real
              LED brightness, firmware, timing, and module sensors are not
              simulated. The light sensor is a bare two-leg photoresistor; its
              divider voltage is an estimate. The active buzzer is visual only.
            </p>
            <h3>Using the workbench</h3>
            <p>
              Click a part, then a hole, or drag a kit card with a mouse or
              finger; the ghost snaps to the nearest hole. Drag a placed part to
              move it. Grab a particular leg, or select a pin and use “Move to a
              hole” above the board. Arrow keys move by one hole; drag a wire’s
              middle to move both ends, or drag a round endpoint to reconnect
              it. Exact-address controls remain in the wire inspector. A drop
              into the same holes leaves power unchanged. W draws wires between
              two holes; I traces connections; R rotates; Delete removes; ⌘/Ctrl
              Z undoes. Wires stay in the holes when parts move. Turn power on
              again after editing. For keyboard placement, choose a part and use
              “Precise placement”.
            </p>
            <p>
              Your project and challenge progress save on this device. Copy
              circuit puts the project JSON on your clipboard.
            </p>
            <div className="reference-links">
              <a
                href="https://learn.sparkfun.com/tutorials/how-to-use-a-breadboard/all"
                target="_blank"
                rel="noreferrer"
              >
                SparkFun: breadboard connections ↗
              </a>
              <a
                href="https://documentation.espressif.com/esp32_datasheet_en.html"
                target="_blank"
                rel="noreferrer"
              >
                Espressif: ESP32 electrical reference ↗
              </a>
              <a
                href="https://github.com/playelek/pinout-doit-32devkitv1"
                target="_blank"
                rel="noreferrer"
              >
                30-pin DevKit V1 layout reference ↗
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
