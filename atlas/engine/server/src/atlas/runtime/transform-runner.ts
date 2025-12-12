import crypto from 'crypto';
import vm from 'vm';
import { getJsonPath } from './json-path.js';

export interface TransformResult {
  output: unknown;
  logs: string[];
}

export class TransformRunner {
  constructor(private readonly timeoutMs = 200) {}

  async run(source: string, payload: unknown): Promise<TransformResult> {
    const logs: string[] = [];
    const sandbox = {
      payload: structuredClone(payload),
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      },
      sha256: (value: string) => crypto.createHash('sha256').update(value).digest('hex'),
      uuid: () => crypto.randomUUID(),
      date: () => new Date().toISOString(),
      jsonPath: (obj: unknown, path: string) => getJsonPath(obj, path),
      Buffer: undefined,
      process: undefined,
      setTimeout,
      clearTimeout,
      setInterval: undefined,
      clearInterval: undefined,
    };

    const script = new vm.Script(`
        "use strict";
        ${source}
        if (typeof transform !== 'function') {
          throw new Error('Transform must export a function named "transform"');
        }
        const result = transform(payload);
      `);

    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    try {
      script.runInContext(context, { timeout: this.timeoutMs });
    } catch (err) {
      logs.push(`transform_error: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const raw =
      typeof context.result !== 'undefined'
        ? // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          context.result
        : // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          context.transform?.(payload);
    const output = raw && typeof raw.then === 'function' ? await raw : raw;
    return { output, logs };
  }
}
