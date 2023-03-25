// rollup.config.js
import typescript from "rollup-plugin-typescript2";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/terrar.cjs.js",
        format: "cjs",
        exports: "named",
        sourcemap: true,
      },
      {
        file: "dist/terrar.esm.js",
        format: "es",
        exports: "named",
        sourcemap: true,
      },
      {
        file: "dist/terrar.umd.js",
        format: "umd",
        name: "terrar",
        exports: "named",
        sourcemap: true,
      },
    ],
    plugins: [json(), typescript(), nodeResolve(), commonjs()],
  },
];