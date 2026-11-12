/// <reference lib="webworker" />
/**
 * Worker entry point. The MuPDF WASM module is loaded here, off the UI thread,
 * so rendering a heavy page can never freeze the app (docs/ARCHITECTURE.md §5).
 */
import * as Comlink from 'comlink';
import { EngineError, type Command, type DocumentId, type EngineApi, type SaveOptions } from './api.ts';
import { MupdfEngine } from './mupdf/engine.ts';
import { ENGINE_READY } from './ready.ts';

const engine = new MupdfEngine();

/** Errors lose their class when they cross the worker boundary; keep the code in the message. */
function wrap<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (err) {
    if (err instanceof EngineError) return Promise.reject(new Error(`${err.code}: ${err.message}`));
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

const api: EngineApi = {
  open: (bytes: Uint8Array, name: string) => wrap(() => engine.open(bytes, name)),
  authenticate: (id: DocumentId, password: string) => wrap(() => engine.authenticate(id, password)),
  close: (id: DocumentId) => wrap(() => engine.close(id)),
  getInfo: (id: DocumentId) => wrap(() => engine.getInfo(id)),
  run: (id: DocumentId, command: Command) => wrap(() => engine.run(id, command)),
  undo: (id: DocumentId) => wrap(() => engine.undo(id)),
  redo: (id: DocumentId) => wrap(() => engine.redo(id)),

  // Large results are transferred (moved), not copied, back to the UI thread.
  render: (id: DocumentId, pageIndex: number, scale: number) =>
    wrap(() => {
      const result = engine.render(id, pageIndex, scale);
      return Comlink.transfer(result, [result.pixels.buffer]);
    }),
  save: (id: DocumentId, options?: SaveOptions) =>
    wrap(() => {
      const bytes = engine.save(id, options);
      return Comlink.transfer(bytes, [bytes.buffer]);
    }),
};

Comlink.expose(api);

// The MuPDF import above uses top-level await to load its WASM, and messages that
// reach a worker before a listener exists are dropped. So the client waits for
// this signal before sending anything (see client.ts).
self.postMessage(ENGINE_READY);
