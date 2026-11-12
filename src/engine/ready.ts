/** Posted by the worker once it can receive calls. Comlink ignores messages without an id. */
export const ENGINE_READY = { type: 'pdf-engine-ready' } as const;

export function isReadyMessage(data: unknown): boolean {
  return (data as { type?: unknown } | null)?.type === ENGINE_READY.type;
}
