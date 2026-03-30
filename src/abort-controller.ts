import { AbortSignal, SIGIL, type RegisterSignalCallbacks } from "./abort-signal.ts";

export class AbortController {
  #callbacks = new Set<RegisterSignalCallbacks>();
  #signal = new AbortSignal(SIGIL, (cb) => {
    this.#callbacks.add(cb);
    return () => this.#callbacks.delete(cb);
  });

  get signal() {
    return this.#signal;
  }

  abort(reason?: any) {
    if (reason === undefined) reason = new DOMException("The operation was aborted.", "AbortError");

    const ev = new Event("abort");
    const dispatches = [];
    for (const cb of this.#callbacks) {
      dispatches.push(cb.dispatchEvent);
      cb.abort(reason);
    }

    for (const dispatch of dispatches) dispatch(ev);
  }
}
