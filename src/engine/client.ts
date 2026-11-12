import * as Comlink from 'comlink';
import { EngineError, type EngineApi, type EngineErrorCode } from './api.ts';

/**
 * The UI's handle to the engine worker. One worker for the whole app; it owns
 * every open document. Errors are turned back into EngineError with their code.
 */

let instance: EngineApi | null = null;

export function getEngine(): EngineApi {
  if (instance) return instance;
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'pdf-engine' });
  const remote = Comlink.wrap<EngineApi>(worker);

  instance = new Proxy({} as EngineApi, {
    get(_target, prop: keyof EngineApi) {
      return async (...args: unknown[]) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await (remote[prop] as any)(...args);
        } catch (err) {
          throw toEngineError(err);
        }
      };
    },
  });
  return instance;
}

const CODES: readonly EngineErrorCode[] = [
  'not-a-pdf',
  'unknown-document',
  'wrong-password',
  'invalid-command',
  'nothing-to-undo',
  'nothing-to-redo',
  'internal',
];

export function toEngineError(err: unknown): EngineError {
  if (err instanceof EngineError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const match = /^([a-z-]+): ([\s\S]*)$/.exec(message);
  if (match && CODES.includes(match[1] as EngineErrorCode)) {
    return new EngineError(match[1] as EngineErrorCode, match[2]!);
  }
  return new EngineError('internal', message);
}
