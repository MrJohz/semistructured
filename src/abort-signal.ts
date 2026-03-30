import { AbortController } from "./abort-controller.ts";

/** @internal */
export type RegisterSignal = (callbacks: RegisterSignalCallbacks) => () => void;
/** @internal */
export type RegisterSignalCallbacks = {
  abort: (reason: any) => void;
  dispatchEvent: (ev: Event) => boolean;
};

/** @internal */
export const SIGIL = Symbol("AbortSignalConstructorSigil");

export class AbortSignal extends EventTarget {
  #aborted = false;
  #reason: any = undefined;
  #addSignalCallbacks = {
    abort: (reason: any) => {
      this.#aborted = true;
      this.#reason = reason;
      this.#registerSignal = undefined;
      this.#removeSignal?.();
      this.#removeSignal = undefined;
    },
    dispatchEvent: (ev: Event) => {
      const dispatch = this.dispatchEvent(ev);
      if (!dispatch) return dispatch;
      return this.onabort?.(ev) ?? false;
    },
  };
  #registerSignal?: RegisterSignal;
  #removeSignal?: () => void;

  /** @internal */
  constructor(sigil: typeof SIGIL, registerSignal?: RegisterSignal) {
    if (sigil !== SIGIL) throw new Error("AbortSignal is not constructable");
    super();

    this.#registerSignal = registerSignal;
    this.#removeSignal = this.#registerSignal?.(this.#addSignalCallbacks);
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

  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/abort_event) */
  onabort: ((this: AbortSignal, ev: Event) => any) | null = null;

  /**
   * The **`throwIfAborted()`** method throws the signal's abort AbortSignal.reason if the signal has been aborted; otherwise it does nothing.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/throwIfAborted)
   */
  throwIfAborted(): void {
    if (this.#aborted) throw this.#reason;
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

  static abort(reason?: any) {
    const signal = new AbortSignal(SIGIL);
    signal.#aborted = true;
    signal.#reason = reason === undefined ? new DOMException("Aborted", "AbortError") : reason;
    return signal;
  }

  static timeout(delay: number) {
    const ctrl = new AbortController();
    setTimeout(() => {
      const reason = new DOMException("The operation timed out.", "TimeoutError");

      ctrl.abort(reason);
    }, delay);
    return ctrl.signal;
  }

  static any(signals: AbortSignal[]) {
    const upstream = [...signals];
    const signal = new AbortSignal(SIGIL, (cb) => {
      const registrations: (() => void)[] = [];
      for (const ups of upstream) {
        if (ups.#aborted) {
          cb.abort(ups.#reason);
          break;
        }

        const unregister = ups.#registerSignal?.(cb);
        if (unregister) registrations.push(unregister);
      }

      return () => {
        for (const r of registrations) r();
      };
    });
    return signal;
  }
}
