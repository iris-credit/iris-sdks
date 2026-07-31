import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    retry: process.env.CI ? 2 : 0,
    // Fork tests provision an Anvil fork per test against a live archive RPC; under
    // parallel load fork setup + RPC latency push tests past the 5s default and flake.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: "iris-ts",
          include: ["packages/iris-ts/test/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "core-sdk",
          include: ["packages/core-sdk/src/**/*.test.ts", "packages/core-sdk/test/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "iris-sdk",
          include: ["packages/iris-sdk/src/**/*.test.ts", "packages/iris-sdk/test/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "evm-simulation",
          include: ["packages/evm-simulation/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "test",
          include: ["packages/test/test/**/*.test.ts"],
        },
      },
    ],
  },
});
