import { defineConfig } from "vitest/config";

// Fork projects get extra time for Anvil startup and remote RPC reads, and
// bound their RPC demand in CI while leaving local concurrency unrestricted.
const forkTestConfig = {
  ...(process.env.CI
    ? {
        maxConcurrency: 1,
        maxWorkers: 2,
        sequence: { concurrent: false, groupOrder: 1 },
      }
    : {}),
  testTimeout: 120_000,
} as const;

export default defineConfig({
  test: {
    // A timed-out test has already spent its full budget; retrying it duplicates
    // fork RPC work without changing the outcome.
    retry: process.env.CI
      ? {
          count: 2,
          condition: /^(?!(?:Test|Hook) timed out in \d+ms\.)/,
        }
      : 0,
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
