---
"@iris-credit/test": minor
---

`spawnAnvil` now awaits process cleanup and reports failures as typed errors. It returns a `stopAndWait()` that resolves once the process closes, accepts `signal`/`startupTimeoutMs`/`forceKillAfterMs` options, escalates `SIGINT` to `SIGKILL`, and surfaces `AnvilStartupError`, `AnvilProcessError`, and `AnvilCleanupError`. A new `redactForkUrl` option (default on in CI) strips `forkUrl` and `forkHeader` values from Anvil diagnostics. The Vitest `client` fixture awaits teardown so a retry cannot overlap an abandoned Anvil.
