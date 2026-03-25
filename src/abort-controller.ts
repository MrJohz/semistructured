import { AbortSignal } from "./abort-signal.ts";

export class AbortController extends globalThis.AbortController {
  #signal = new AbortSignal();

  get signal() {
    return this.#signal;
  }
}
