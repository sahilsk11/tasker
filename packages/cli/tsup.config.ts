import { defineConfig } from "tsup";

export default defineConfig({
  dts: true,
  entry: ["src/bin.ts"],
  external: ["better-sqlite3"],
  format: ["esm"],
  noExternal: ["@tasker/api", "@tasker/core"],
  platform: "node"
});
