import test, { describe } from "node:test";
import { AbortSignal } from "./abort-signal.ts";
import { AbortController } from "./abort-controller.ts";
import * as assert from "node:assert";

describe("AbortSignal", () => {
  test("is not constructable", () => {
    // @ts-expect-error
    assert.throws(() => new AbortSignal());
  });

  describe("any", () => {
    test("aborts if any input signal is already aborted", () => {
      const reason = new Error("aborted");
      const ctrl = new AbortController();
      const signal = AbortSignal.any([AbortSignal.abort(reason), ctrl.signal]);

      assert.ok(signal.aborted);
      assert.strictEqual(signal.reason, reason);
    });

    test("aborts if any input signal aborts", () => {
      const reason = new Error("aborted");
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      const signal = AbortSignal.any([controller1.signal, controller2.signal]);

      controller1.abort(reason);

      assert.ok(signal.aborted);
      assert.ok(controller1.signal.aborted);
      assert.ok(!controller2.signal.aborted);
      assert.strictEqual(signal.reason, reason);
      assert.strictEqual(controller1.signal.reason, reason);
      assert.strictEqual(controller2.signal.reason, undefined);
    });

    test("works with signals returned by AbortSignal.timeout()", async () => {
      const controller = new AbortController();
      const timeoutSignal = AbortSignal.timeout(5);

      const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal]);

      const deferred = Promise.withResolvers<void>();
      combinedSignal.onabort = () => {
        assert.ok(combinedSignal.aborted);
        assert.ok(combinedSignal.reason instanceof DOMException);
        assert.strictEqual(combinedSignal.reason.name, "TimeoutError");
        deferred.resolve();
      };
      await deferred.promise;
    });
  });

  describe("garbage collection", () => {
    test("A timeout with no listeners can be dropped", async () => {
      let signal: AbortSignal | undefined = AbortSignal.timeout(100);
      const ref = new WeakRef(signal);

      signal = undefined;

      assert.ok(await waitForDeref(ref));
    });

    test("A dependent signal with no listeners can be dropped", async () => {
      const controller = new AbortController();

      let signal: AbortSignal | undefined = AbortSignal.any([controller.signal]);
      const ref = new WeakRef(signal);

      signal = undefined;

      assert.ok(await waitForDeref(ref));
    });

    test("A signal can be dropped if its parent controller is dropped", async () => {
      let controller: AbortController | undefined = new AbortController();
      const ref = new WeakRef(controller.signal);

      controller = undefined;

      assert.ok(await waitForDeref(ref));
    });

    test("Signals with handlers can be dropped", async () => {
      let controller: AbortController | undefined = new AbortController();
      const ref = new WeakRef(controller.signal);
      controller.signal.addEventListener("abort", noop);

      controller = undefined;

      assert.ok(await waitForDeref(ref));
    });

    test("A timeout with a listener is not dropped until the timeout is completed", async () => {
      const start = performance.now();
      let signal: AbortSignal | undefined = AbortSignal.timeout(150);
      signal.addAbortCallback(noop);
      const ref = new WeakRef(signal);

      signal = undefined;

      await waitForDeref(ref);
      assert.ok(performance.now() - start < 125, "timeout should not have fired yet");
      assert.ok(ref.deref());

      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.ok(await waitForDeref(ref));
    });

    test("A timeout can be dropped after its listener is removed", async () => {
      let signal: AbortSignal | undefined = AbortSignal.timeout(100);
      const { [Symbol.dispose]: dispose } = signal.addAbortCallback(noop);
      const ref = new WeakRef(signal);

      await waitForDeref(ref);

      dispose();
      signal = undefined;

      assert.ok(await waitForDeref(ref));
    });

    test("A dependent signal with listeners and non-empty sources is not dropped until the source is aborted", async () => {
      const controller = new AbortController();

      let signal: AbortSignal | undefined = AbortSignal.any([controller.signal]);
      signal.addAbortCallback(noop);
      const ref = new WeakRef(signal);

      signal = undefined;

      await waitForDeref(ref);
      assert.ok(ref.deref());

      controller.abort();
      assert.ok(await waitForDeref(ref));
    });

    test("A dependent signal can be dropped after its listener is removed", async () => {
      const controller = new AbortController();

      let signal: AbortSignal | undefined = AbortSignal.any([controller.signal]);
      const { [Symbol.dispose]: dispose } = signal.addAbortCallback(noop);
      const ref = new WeakRef(signal);

      await waitForDeref(ref);

      dispose();
      signal = undefined;

      assert.ok(await waitForDeref(ref));
    });
  });
});

function noop() {}

function runGarbageCollection() {
  assert.ok(globalThis.gc, "run tests with --expose-gc");
  globalThis.gc!();
}

async function waitForDeref<T extends WeakKey>(ref: WeakRef<T>): Promise<boolean> {
  // limit the number of attemtpts to 10
  // just in case something goes wrong
  for (let _ = 0; _ < 10; _++) {
    await new Promise((resolve) => setImmediate(resolve));
    runGarbageCollection();
    if (ref.deref() === undefined) return true;
  }

  return false;
}
