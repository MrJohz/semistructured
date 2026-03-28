/** @internal */
export type AbortSignalCallbacks = {
  onDispatch: (callback: (reason: any) => void) => void;
};

/** @internal */
export const SIGIL = Symbol("AbortSignalConstructorSigil");

export class AbortSignal extends EventTarget {
  #callbacks: AbortSignalCallbacks;
  #aborted: boolean = false;
  #reason: any = undefined;

  /** @internal */
  constructor(sigil: typeof SIGIL, callbacks: AbortSignalCallbacks) {
    if (sigil !== SIGIL) throw new Error("AbortSignal is not constructable");
    super();

    this.#callbacks = callbacks;
    this.#callbacks.onDispatch((reason) => {
      if (this.#aborted) return;
      this.#aborted = true;
      this.#reason = reason;

      const event = new Event("abort", {
        bubbles: false,
        cancelable: false,
        composed: false,
      });

      // TODO: which order should these go in?
      this.dispatchEvent(event);
      this.onabort?.(event);
    });
  }
  /**
   * The **`aborted`** read-only property returns a value that indicates whether the asynchronous operations the signal is communicating with are aborted (`true`) or not (`false`).
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/aborted)
   */
  get aborted() {
    return this.#aborted;
  }

  /**
   * The **`reason`** read-only property returns a JavaScript value that indicates the abort reason.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/reason)
   */
  get reason() {
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
    if (this.#aborted) {
      throw this.#reason;
    }
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
    const signal = new AbortSignal(SIGIL, { onDispatch: () => {} });
    signal.#aborted = true;
    signal.#reason = reason === undefined ? new DOMException("Aborted", "AbortError") : reason;
    return signal;
  }

  static timeout(delay: number) {
    const signal = new AbortSignal(SIGIL, { onDispatch: () => {} });
    setTimeout(() => {
      signal.#aborted = true;
      signal.#reason = new DOMException("The operation timed out.", "TimeoutError");
      const event = new Event("abort", {
        bubbles: false,
        cancelable: false,
        composed: false,
      });
      signal.dispatchEvent(event);
      signal.onabort?.(event);
    }, delay);
    return signal;
  }

  static any(signals: AbortSignal[]) {
    const signal = new AbortSignal(SIGIL, { onDispatch: () => {} });
    for (const inputSignal of signals) {
      if (inputSignal.aborted) {
        signal.#aborted = true;
        signal.#reason = inputSignal.reason;
        break;
      }
      inputSignal.addEventListener("abort", () => {
        if (signal.#aborted) return;
        signal.#aborted = true;
        signal.#reason = inputSignal.reason;

        const event = new Event("abort", {
          bubbles: false,
          cancelable: false,
          composed: false,
        });
        signal.dispatchEvent(event);
        signal.onabort?.(event);
      });
    }
    return signal;
  }
}
