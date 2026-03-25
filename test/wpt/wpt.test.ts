import { describe, test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { fileURLToPath } from "node:url";

// Import the ponyfill classes — these will be injected as globals for WPT tests.
import {
  AbortController as PonyfillAbortController,
  AbortSignal as PonyfillAbortSignal,
} from "../../src/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "fixtures");

// WPT test result status codes (from testharness.js)
const STATUS = {
  PASS: 0,
  FAIL: 1,
  TIMEOUT: 2,
  NOTRUN: 3,
  PRECONDITION_FAILED: 4,
} as const;

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

  describe(`WPT: ${relPath}`, () => {
    test("run", async () => {
      // Build a sandbox with all the globals the WPT harness and tests need.
      // Using vm.createContext gives us a fresh global for each test file,
      // preventing testharness.js state from leaking between files.
      const sandbox: Record<string, unknown> = {
        // --- Harness infrastructure ---
        // testharness.js is wrapped as `(function(global_scope) { ... })(self)`
        // and the ShellTestEnvironment needs these:
        console,
        setTimeout,
        clearTimeout,
        Promise,
        Error,
        TypeError,
        RangeError,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Symbol,
        Map,
        Set,
        WeakMap,
        WeakSet,
        RegExp,
        Date,
        JSON,
        Math,
        Proxy,
        Reflect,
        WeakRef,
        FinalizationRegistry,
        ArrayBuffer,
        SharedArrayBuffer,
        DataView,
        Int8Array,
        Uint8Array,
        Uint8ClampedArray,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
        BigInt64Array,
        BigUint64Array,
        BigInt,
        Intl,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
        structuredClone,
        queueMicrotask,
        AggregateError,
        // atob/btoa may be needed by some tests
        atob,
        btoa,
        // Node.js native web APIs needed by the abort tests
        Event,
        EventTarget,
        DOMException,

        // Ponyfill classes — injected after harness load (see below).
        // Start with natives so testharness.js can load without error.
        AbortController: globalThis.AbortController,
        AbortSignal: globalThis.AbortSignal,

        // --- WPT harness environment detection ---
        GLOBAL: {
          isWindow() {
            return false;
          },
          isShadowRealm() {
            return false;
          },
        },
      };

      // self must point to the sandbox itself (set after context creation)
      const context = vm.createContext(sandbox);
      // Now make `self` point to the context's global
      vm.runInContext("self = this;", context);

      // --- Load testharness.js ---
      // The harness internally creates an AbortController per Test (line ~2756).
      // We need it to use the native AbortController for its own plumbing, not
      // the ponyfill (which may be broken/incomplete). We inject the native
      // reference as a captured variable, then patch the harness source to use
      // it instead of the global `AbortController`.
      const harnessPath = path.join(FIXTURES_DIR, "resources", "testharness.js");
      const harnessSource = fs.readFileSync(harnessPath, "utf-8");

      // Save the native AbortController before the harness loads, then
      // replace the global with the ponyfill. The harness's internal usage
      // is patched to use the saved reference.
      sandbox._NativeAbortController = globalThis.AbortController;
      const patchedHarness = harnessSource.replace(
        'if (typeof AbortController === "function") {\n            this._abortController = new AbortController();',
        'if (typeof _NativeAbortController === "function") {\n            this._abortController = new _NativeAbortController();',
      );
      vm.runInContext(patchedHarness, context, { filename: harnessPath });

      // Now set the ponyfill as the global AbortController/AbortSignal.
      // Test code will see these instead of the natives.
      sandbox.AbortController = PonyfillAbortController;
      sandbox.AbortSignal = PonyfillAbortSignal;

      // --- Load META: script dependencies ---
      const testSource = fs.readFileSync(testFile, "utf-8");
      const meta = parseMeta(testSource);
      const testDir = path.dirname(testFile);

      for (const scriptPath of meta.scripts) {
        const resolved = path.resolve(testDir, scriptPath);
        const scriptSource = fs.readFileSync(resolved, "utf-8");
        vm.runInContext(scriptSource, context, { filename: resolved });
      }

      // --- Hook into testharness.js result callbacks ---
      const results: Array<{
        name: string;
        status: number;
        message: string | null;
      }> = [];

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `WPT test file timed out: ${relPath} (collected ${results.length} results so far)`,
            ),
          );
        }, 30_000);

        // Inject the callback-registration calls into the sandbox.
        // testharness.js exposes add_result_callback and add_completion_callback
        // as globals in the sandbox context.
        (sandbox as any)._wpt_on_result = (t: {
          name: string;
          status: number;
          message: string | null;
        }) => {
          results.push({ name: t.name, status: t.status, message: t.message });
        };

        (sandbox as any)._wpt_on_completion = () => {
          clearTimeout(timeout);
          resolve();
        };

        vm.runInContext(
          `
          add_result_callback(_wpt_on_result);
          add_completion_callback(_wpt_on_completion);
        `,
          context,
        );

        // --- Run the test file ---
        vm.runInContext(testSource, context, { filename: testFile });
      });

      // --- Report results ---
      const failures: string[] = [];
      for (const result of results) {
        if (result.status !== STATUS.PASS) {
          const statusName =
            Object.entries(STATUS).find(([, v]) => v === result.status)?.[0] ??
            `UNKNOWN(${result.status})`;
          failures.push(`[${statusName}] ${result.name}: ${result.message ?? "(no message)"}`);
        }
      }

      const passed = results.filter((r) => r.status === STATUS.PASS).length;
      const failed = results.length - passed;

      console.log(`  ${relPath}: ${passed} passed, ${failed} failed (${results.length} total)`);

      if (failures.length > 0) {
        const detail = failures.map((f) => `    ${f}`).join("\n");
        throw new Error(`${failures.length} WPT subtest(s) failed in ${relPath}:\n${detail}`);
      }
    });
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
