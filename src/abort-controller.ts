import * as assert from "assert";
import { AbortSignal, SIGIL } from "./abort-signal.ts";

const DEV = globalThis.__DEV__ ?? true;

export class AbortController {
  #trigger!: (reason: any) => void;
  #signal = new AbortSignal(SIGIL, (trigger) => (this.#trigger = trigger));

  constructor() {
    if (DEV) assert.ok(this.#trigger, "trigger must be set during `AbortSignal` constructor");
  }

  get signal() {
    return this.#signal;
  }

  abort(reason?: any) {
    this.#trigger(reason);
  }
}
