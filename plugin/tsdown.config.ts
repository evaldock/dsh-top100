import { defineConfig } from "tsdown";

const id = "@evaldock/dsh-top100-plugin";
const CLIENT_EXTERNALS = ["react", "react/jsx-runtime", "react-dom"];

export default defineConfig({
  entry: { client: "src/client/index.ts" },
  tsconfig: "tsconfig.client.json",
  outDir: "client",
  format: "cjs",
  platform: "browser",
  target: "es2022",
  dts: false,
  sourcemap: false,
  clean: true,
  external: [...CLIENT_EXTERNALS],
  noExternal: (source: string) => (CLIENT_EXTERNALS.includes(source) ? undefined : true),
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  outputOptions: {
    entryFileNames: "client.js",
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
    footer: "return module.exports; } });",
    intro: "var module = { exports: {} }; var exports = module.exports;",
  },
});
