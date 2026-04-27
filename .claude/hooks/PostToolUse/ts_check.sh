#!/usr/bin/env bash
set -e

# Read JSON input from Claude Code
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only run for .ts/.tsx files
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.tsx ]]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Lint the changed file
pnpm exec oxlint "$FILE_PATH"

# Format the changed file
pnpm exec oxfmt "$FILE_PATH"

# Type-check the package containing the changed file
PKG_DIR=$(echo "$FILE_PATH" | sed -n 's|\(packages/[^/]*\)/.*|\1|p')
if [[ -n "$PKG_DIR" && -f "$PKG_DIR/tsconfig.json" ]]; then
  pnpm exec tsgo --noEmit -p "$PKG_DIR/tsconfig.json"
else
  pnpm exec tsgo --build
fi
