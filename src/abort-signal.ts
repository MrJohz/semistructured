/** @internal */
export type State = { aborted: boolean; reason: any };

/** @internal */
type AddSignalCallback = (state: State, signal: AbortSignal) => void;

/** @internal */
export function createAbortSignal(addSignal: AddSignalCallback): {
  state: State;
  signal: AbortSignal;
} {
  const state = { aborted: false, reason: undefined as any };
  const signal = new AbortSignal(SIGIL, state, addSignal);
  return { state, signal };
}

/** @internal */
export const SIGIL = Symbol("AbortSignalConstructorSigil");

export class AbortSignal extends EventTarget {
  #state: State;
  #addSignal: AddSignalCallback;

  /** @internal */
  constructor(sigil: typeof SIGIL, state: State, addSignal: AddSignalCallback) {
    if (sigil !== SIGIL) throw new Error("AbortSignal is not constructable");
    super();

    this.#state = state;
    this.#addSignal = addSignal;
    this.#addSignal(this.#state, this);
  }
  /**
   * The **`aborted`** read-only property returns a value that indicates whether the asynchronous operations the signal is communicating with are aborted (`true`) or not (`false`).
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/aborted)
   */
  get aborted() {
    return this.#state.aborted;
  }

  /**
   * The **`reason`** read-only property returns a JavaScript value that indicates the abort reason.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/reason)
   */
  get reason() {
    return this.#state.reason;
  }

  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/abort_event) */
  onabort: ((this: AbortSignal, ev: Event) => any) | null = null;

  /**
   * The **`throwIfAborted()`** method throws the signal's abort AbortSignal.reason if the signal has been aborted; otherwise it does nothing.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/throwIfAborted)
   */
  throwIfAborted(): void {
    if (this.#state.aborted) {
      throw this.#state.reason;
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
    const signal = new AbortSignal(SIGIL, { aborted: false, reason: undefined }, () => {});
    signal.#state.aborted = true;
    signal.#state.reason =
      reason === undefined ? new DOMException("Aborted", "AbortError") : reason;
    return signal;
  }

  static timeout(delay: number) {
    const signals: [State, AbortSignal][] = [];
    const state: State = { aborted: false, reason: undefined };
    const signal = new AbortSignal(SIGIL, state, (state, signal) => signals.push([state, signal]));
    setTimeout(() => {
      const reason = new DOMException("The operation timed out.", "TimeoutError");
      state.aborted = true;
      state.reason = reason;

      for (const [state, signal] of signals) {
        state.aborted = true;
        state.reason = reason;
        signal.dispatchEvent(new Event("abort"));
      }
    }, delay);
    return signal;
  }

  static any(signals: AbortSignal[]) {
    const upstream = [...signals];
    const state: State = { aborted: false, reason: undefined };
    const signal = new AbortSignal(SIGIL, state, (state, sig) => {
      for (const upstreamSignal of upstream) {
        upstreamSignal.#addSignal(state, sig);
        if (!state.aborted && upstreamSignal.aborted) {
          state.aborted = true;
          state.reason = upstreamSignal.reason;
        }
      }
    });
    return signal;
  }
}
