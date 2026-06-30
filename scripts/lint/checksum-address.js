import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress } from "viem";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const lint = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules" || name === "lib") continue;

    const path = join(dir, name);
    if (lstatSync(path).isDirectory()) {
      lint(path);
    } else if (path.endsWith(".ts") || path.endsWith(".js")) {
      const content = readFileSync(path, "utf8");
      const checksummed = content.replaceAll(/0x[0-9a-f]{40}(?![0-9a-f])/gi, (address) =>
        getAddress(address),
      );
      if (checksummed !== content) writeFileSync(path, checksummed);
    }
  }
};

lint(root);
