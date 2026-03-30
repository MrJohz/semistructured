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
});
