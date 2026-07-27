#!/usr/bin/env node

import("../dist/cli.js").catch((error) => {
  console.error("SoleilCode could not start:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
