import { defineConfig } from "vitest/config";

// Scope this package's `test` script to its own suite, so `turbo run test`
// (run per-package) does not pick up other packages via the root config.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
