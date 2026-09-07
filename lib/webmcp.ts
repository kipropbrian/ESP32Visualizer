import { parseCircuit, type Circuit } from './circuit.ts';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
};
export type ModelContext = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerWorkbench(
  context: ModelContext | undefined,
  read: () => unknown,
  replace: (c: Circuit) => void,
) {
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: 'inspect_breadboard',
      description:
        'Read the current ESP32 breadboard project and its circuit feedback.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => read(),
    },
    {
      name: 'replace_breadboard_circuit',
      description:
        'Replace the visible breadboard with a validated circuit. Adds an undo step and disconnects virtual power. Coordinates use A1–J60 and TP/TN/BP/BN rails.',
      inputSchema: {
        type: 'object',
        properties: {
          circuit: {
            type: 'object',
            properties: {
              parts: { type: 'array' },
              wires: { type: 'array' },
              splitRails: { type: 'boolean' },
            },
            required: ['parts', 'wires', 'splitRails'],
          },
        },
        required: ['circuit'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        if (!input || typeof input !== 'object' || !('circuit' in input))
          throw Error('A circuit is required.');
        const c = parseCircuit(input.circuit);
        replace(c);
        return { parts: c.parts.length, wires: c.wires.length, powered: false };
      },
    },
  ];
  for (const tool of tools)
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  return () => lifecycle.abort();
}
