#!/usr/bin/env node

import("../dist/cli.js").catch((error) => {
  console.error("SoleilCode başlatılamadı:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
