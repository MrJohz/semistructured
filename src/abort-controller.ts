import { AbortSignal, SIGIL } from "./abort-signal.ts";

export class AbortController {
  #onDispatch!: (reason: any) => void;
  #signal = new AbortSignal(SIGIL, {
    onDispatch: (callback) => {
      this.#onDispatch = callback;
    },
  });

  get signal() {
    return this.#signal;
  }

  abort(reason?: any) {
    this.#onDispatch(reason === undefined ? new DOMException("Aborted", "AbortError") : reason);
  }
}
