import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  format: ["esm"],
  unbundle: true,
  dts: true,
  minify: "dce-only",
  define: {
    "globalThis.__DEV__": "false",
  },
  outExtensions: () => ({
    js: ".js",
  }),
});
