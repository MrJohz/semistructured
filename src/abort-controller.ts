import { AbortSignal, SIGIL, type State } from "./abort-signal.ts";

export class AbortController {
  #downstream: [State, AbortSignal][] = [];
  #state: State = { aborted: false, reason: undefined };
  #signal = new AbortSignal(SIGIL, this.#state, (state, signal) => {
    this.#downstream.push([state, signal]);
  });

  get signal() {
    return this.#signal;
  }

  abort(reason?: any) {
    if (this.#state.aborted) return;
    this.#state.aborted = true;
    this.#state.reason = reason === undefined ? new DOMException("Aborted", "AbortError") : reason;
    for (const [state, signal] of this.#downstream) {
      state.aborted = true;
      state.reason = this.#state.reason;
      signal.dispatchEvent(new Event("abort"));
    }
  }
}
