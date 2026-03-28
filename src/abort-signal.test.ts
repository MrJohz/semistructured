import test, { describe } from "node:test";
import { AbortSignal } from "./abort-signal.ts";
import * as assert from "node:assert";

describe("AbortSignal", () => {
  test("is not constructable", () => {
    // @ts-expect-error
    assert.throws(() => new AbortSignal());
  });
});
