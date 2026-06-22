import { defineConfig } from "tsup";

export default defineConfig({
  dts: true,
  entry: ["src/bin.ts"],
  format: ["esm"],
  platform: "node"
});
