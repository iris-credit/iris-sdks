import { defineConfig } from "vitest/config";

// Fork projects get extra time for Anvil startup and remote RPC reads.
const forkTestConfig = {
  testTimeout: 120_000,
} as const;

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
          include: ["packages/iris-ts/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "core-sdk",
          include: ["packages/core-sdk/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "core-sdk-fork",
          include: ["packages/core-sdk/test/**/*.integration.test.ts"],
          ...forkTestConfig,
        },
      },
      {
        extends: true,
        test: {
          name: "iris-sdk",
          include: ["packages/iris-sdk/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "iris-sdk-fork",
          include: ["packages/iris-sdk/test/**/*.integration.test.ts"],
          ...forkTestConfig,
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
          name: "evm-simulation-fork",
          include: ["packages/evm-simulation/test/**/*.integration.test.ts"],
          ...forkTestConfig,
        },
      },
      {
        extends: true,
        test: {
          name: "test",
          include: ["packages/test/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "test-fork",
          include: ["packages/test/test/**/*.integration.test.ts"],
          ...forkTestConfig,
        },
      },
    ],
  },
});
