import test, { describe } from "node:test";
import { AbortSignal } from "./abort-signal.ts";
import * as assert from "node:assert";

describe("AbortSignal", () => {
  test("AbortSignal is not null", () => {
    assert.ok(AbortSignal.abort() !== null, "AbortSignal exists");
  });
});
