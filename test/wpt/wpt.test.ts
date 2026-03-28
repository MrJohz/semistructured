import { describe, test as nodeTest } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { fileURLToPath } from "node:url";

const IGNORED_SUITES = new Set<string>([]);
const IGNORED_TESTS = new Set<string>([]);

// Import the ponyfill classes — these will be injected as globals for WPT tests.
import {
  AbortController as PonyfillAbortController,
  AbortSignal as PonyfillAbortSignal,
} from "../../src/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * Parse `// META:` directives from a WPT test file.
 * We care about `// META: script=<path>` for loading dependent scripts.
 */
function parseMeta(source: string): { scripts: string[] } {
  const scripts: string[] = [];
  for (const line of source.split("\n")) {
    const match = line.match(/^\/\/\s*META:\s*script=(.+)$/);
    if (match) {
      scripts.push(match[1].trim());
    }
  }
  return { scripts };
}

/**
 * Run a single WPT .any.js test file, bridging its results into node:test.
 *
 * Each test file runs in its own vm context so that testharness.js state
 * doesn't leak between files. We populate the sandbox with everything the
 * WPT harness and test code needs.
 */
function runWptTestFile(testFile: string): void {
  const relPath = path.relative(FIXTURES_DIR, testFile);

  const suiteFn = IGNORED_SUITES.has(relPath) ? describe.skip : describe;

  suiteFn(`WPT: ${relPath}`, async () => {
    const CONTEXT = vm.createContext({
      DOMException: globalThis.DOMException,
      AbortController: PonyfillAbortController,
      AbortSignal: PonyfillAbortSignal,
      assert_true: (value: any, message?: string) => assert.ok(value, message),
      assert_false: (value: any, message?: string) => assert.ok(!value, message),
      assert_equals: (actual: any, expected: any, message?: string) =>
        assert.strictEqual(actual, expected, message),
      assert_not_equals: (actual: any, expected: any, message?: string) =>
        assert.notStrictEqual(actual, expected, message),
      assert_throws_exactly: (expected: any, func: () => void, message?: string) => {
        let threw = false;
        try {
          func();
        } catch (err) {
          threw = true;
          assert.strictEqual(err, expected, message);
        }
        assert.ok(threw, message || "Expected function to throw");
      },
      done: function done() {},
      test: function test(func: (test: TestCtx) => void, name: string) {
        if (IGNORED_TESTS.has(name)) return nodeTest.skip(name, () => {});

        nodeTest(name, () => {
          func(new TestCtx());
        });
      },
      async_test: function async_test(func: (test: TestCtx) => void, name: string) {
        if (IGNORED_TESTS.has(name)) return nodeTest.skip(name, () => {});

        nodeTest(name, async () => {
          await new Promise<void>((resolve) => {
            func(new TestCtx(resolve));
          });
        });
      },
    });

    const testSource = fs.readFileSync(testFile, "utf-8");
    const meta = parseMeta(testSource);
    const testDir = path.dirname(testFile);

    for (const scriptPath of meta.scripts) {
      const resolved = path.resolve(testDir, scriptPath);
      const scriptSource = fs.readFileSync(resolved, "utf-8");
      vm.runInContext(scriptSource, CONTEXT, { filename: resolved });
    }

    vm.runInContext(testSource, CONTEXT, { filename: testFile });
  });
}

// --- Discover and run all .any.js test files ---
const testDir = path.join(FIXTURES_DIR, "dom", "abort");
const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith(".any.js"))
  .sort()
  .map((f) => path.join(testDir, f));

for (const testFile of testFiles) {
  runWptTestFile(testFile);
}

class TestCtx {
  #resolver: (() => void) | undefined;
  constructor(resolver?: () => void) {
    this.#resolver = resolver;
  }

  done() {
    this.#resolver?.();
  }

  step_func(func: () => void) {
    return func;
  }
  step_func_done(func: () => void) {
    return () => {
      func();
      this.done();
    };
  }
  step_timeout(func: () => void, timeout: number) {
    setTimeout(func, timeout);
  }
  unreached_func(message?: string) {
    return () => {
      throw new Error(message ?? "This code should not be reached");
    };
  }
}
