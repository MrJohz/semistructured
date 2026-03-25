import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { hello } from "./index.ts";

describe("hello", () => {
  test("returns a greeting", () => {
    assert.equal(hello("world"), "Hello, world!");
  });
});
