import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load .env into the test environment (e.g. MAINNET_RPC_URL for the fork tests).
config({ quiet: true });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
