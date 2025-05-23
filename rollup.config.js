import typescript from "rollup-plugin-typescript2";

export default {
  input: "src/ch32webflash.ts",
  output: [
    {
      file: "dist/ch32webflash.umd.js",
      format: "umd",
      name: "ch32webflash", // global variable name
    },
    {
      file: "dist/ch32webflash.esm.js",
      format: "es",
    },
  ],
  plugins: [
    typescript({
      useTsconfigDeclarationDir: true,
      tsconfigOverride: {
        compilerOptions: {
          importHelpers: true,
        },
      },
    }),
  ],
};
