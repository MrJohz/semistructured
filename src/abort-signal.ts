import * as assert from "node:assert";
import { IterableWeakSet } from "./weak-iterable-set.ts";

const DEV = globalThis.__DEV__ ?? true;

const GLOBAL_ROOTS = new Set<any>();

/** @internal */
export const SIGIL = Symbol("AbortSignalConstructorSigil");

export class AbortSignal extends EventTarget {
  #aborted = false;
  #reason: any = undefined;
  #dependent = false;
  #timingOut = false;
  #sources = new IterableWeakSet<AbortSignal>();
  #targets = new IterableWeakSet<AbortSignal>();

  #abortSteps = new Set<VoidFunction>();

  /** @internal */
  constructor(sigil: typeof SIGIL, triggerCb?: (trigger: (reason: any) => void) => void) {
    if (sigil !== SIGIL) throw new Error("AbortSignal is not constructable");
    super();

    triggerCb?.((reason) => this.#trigger(reason));
  }

  #trigger(reason?: any) {
    if (this.#aborted) return;
    this.#aborted = true;

    if (reason === undefined) reason = new DOMException("The operation was aborted.", "AbortError");
    this.#reason = reason;

    const toAbort: AbortSignal[] = [this];
    for (const other of this.#targets) {
      if (other.#aborted) continue;
      other.#aborted = true;
      other.#reason = reason;
      toAbort.push(other);
    }

    for (const signal of toAbort) {
      for (const callback of signal.#abortSteps) this.#callCallback(callback);
      signal.#abortSteps.clear();
      signal.dispatchEvent(new Event("abort"));
      signal.#updateGarbageCollectability();
    }
  }

  /**
   * The **`aborted`** read-only property returns a value that indicates whether the asynchronous operations the signal is communicating with are aborted (`true`) or not (`false`).
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/aborted)
   */
  get aborted(): boolean {
    return this.#aborted;
  }

  /**
   * The **`reason`** read-only property returns a JavaScript value that indicates the abort reason.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/reason)
   */
  get reason(): any {
    return this.#reason;
  }

  #currentAbortHandler: ((this: AbortSignal, ev: Event) => any) | null = null;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/abort_event) */
  get onabort() {
    return this.#currentAbortHandler;
  }
  set onabort(handler) {
    if (this.#currentAbortHandler !== null)
      this.removeEventListener("abort", this.#currentAbortHandler);
    if (handler !== null) this.addEventListener("abort", handler);
    this.#currentAbortHandler = handler;
  }

  /**
   * The **`throwIfAborted()`** method throws the signal's abort AbortSignal.reason if the signal has been aborted; otherwise it does nothing.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/throwIfAborted)
   */
  throwIfAborted(): void {
    if (this.#aborted) throw this.#reason;
  }

  #callCallback(callback: VoidFunction) {
    try {
      callback();
    } catch (err) {
      queueMicrotask(() => {
        throw err;
      });
    }
  }

  #collectable = true;
  #updateGarbageCollectability() {
    let collectable;
    if (!this.#aborted && this.#dependent && !this.#sources.empty && this.#abortSteps.size !== 0) {
      collectable = false;
    } else if (this.#timingOut && this.#abortSteps.size !== 0) {
      collectable = false;
    } else {
      collectable = true;
    }

    if (collectable === this.#collectable) return;

    this.#collectable = collectable;
    if (collectable) GLOBAL_ROOTS.delete(this);
    else GLOBAL_ROOTS.add(this);
  }

  addAbortCallback(callback: VoidFunction): Disposable {
    if (this.#aborted) {
      this.#callCallback(callback);
      return { [Symbol.dispose]: () => {} };
    }

    this.#abortSteps.add(callback);
    this.#updateGarbageCollectability();
    return { [Symbol.dispose]: AbortSignal.#makeDisposeCallback(this, callback) };
  }

  // EventTarget type overrides

  addEventListener<K extends keyof AbortSignalEventMap>(
    type: K,
    listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener, options);
  }
  removeEventListener<K extends keyof AbortSignalEventMap>(
    type: K,
    listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener, options);
  }

  static abort(reason?: any): AbortSignal {
    const signal = new AbortSignal(SIGIL);
    signal.#aborted = true;
    signal.#reason = reason === undefined ? new DOMException("Aborted", "AbortError") : reason;
    return signal;
  }

  static timeout(delay: number): AbortSignal {
    const signal = new AbortSignal(SIGIL);
    signal.#timingOut = true;
    const ref = new WeakRef(signal);
    setTimeout(AbortSignal.#makeTimeoutCallback(ref), delay);
    return signal;
  }

  static any(signals: AbortSignal[]): AbortSignal {
    const result = new AbortSignal(SIGIL);
    for (const signal of signals) {
      if (signal.#aborted) {
        result.#aborted = true;
        result.#reason = signal.#reason;
        return result;
      }
    }

    result.#dependent = true;
    for (const signal of signals) {
      if (!signal.#dependent) {
        result.#sources.add(signal);
        signal.#targets.add(result);
        signal.#updateGarbageCollectability();
      } else {
        for (const source of signal.#sources) {
          if (DEV) {
            assert.ok(!source.#aborted, "source must not be aborted");
            assert.ok(!source.#dependent, "source must not be dependent");
          }
          result.#sources.add(source);
          source.#targets.add(result);
          source.#updateGarbageCollectability();
        }
      }
    }
    result.#updateGarbageCollectability();
    return result;
  }

  static #makeDisposeCallback(signal: AbortSignal, callback: VoidFunction) {
    return () => {
      signal.#abortSteps.delete(callback);
      signal.#updateGarbageCollectability();
      signal = undefined as any;
    };
  }

  static #makeTimeoutCallback(ref: WeakRef<AbortSignal>) {
    return () => {
      const signal = ref.deref();
      if (!signal) return;
      signal.#timingOut = false;
      signal.#trigger(new DOMException("The operation timed out.", "TimeoutError"));
    };
  }
}
