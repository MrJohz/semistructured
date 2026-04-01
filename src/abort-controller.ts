import { AbortSignal, SIGIL } from "./abort-signal.ts";

export class AbortController {
  #trigger!: (reason: any) => void;
  #signal = new AbortSignal(SIGIL, (trigger) => (this.#trigger = trigger));

  get signal() {
    return this.#signal;
  }

  abort(reason?: any) {
    this.#trigger(reason);
  }
}
