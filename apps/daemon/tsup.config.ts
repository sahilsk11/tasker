import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/port-proxy.ts"],
  format: ["esm"],
  noExternal: ["@tasker/api", "@tasker/core"],
  platform: "node"
});
