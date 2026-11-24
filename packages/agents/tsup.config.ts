import { defineConfig } from "tsup";

export default defineConfig({
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  removeNodeProtocol: false
});
