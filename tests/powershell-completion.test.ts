import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const completionPath = path.resolve("completions/soleil.ps1");

test("PowerShell completion covers documented commands and options", async () => {
  const script = await readFile(completionPath, "utf8");

  for (const command of ["doctor", "setup", "language", "run", "bench"]) {
    assert.match(script, new RegExp(`'${command}'`));
  }

  for (const option of ["--cwd", "--mode", "--language", "--yes", "--json", "--suite", "--runs"]) {
    assert.match(script, new RegExp(`'${option}'`));
  }

  for (const value of ["auto", "free", "local", "private", "smoke", "core"]) {
    assert.match(script, new RegExp(`'${value}'`));
  }

  assert.match(script, /Register-ArgumentCompleter -Native -CommandName soleil/);
});

test("PowerShell completion candidate lists are deterministic and unique", async () => {
  const script = await readFile(completionPath, "utf8");
  const listMatches = script.matchAll(/\$script:Soleil(?:Commands|Options|Modes|Languages|Suites) = @\((?<body>[\s\S]*?)\)/g);

  for (const match of listMatches) {
    const body = match.groups?.body ?? "";
    const values = [...body.matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
    assert.deepEqual(values, [...new Set(values)], `duplicate completion values in ${match[0].split(" = ")[0]}`);
    assert.ok(values.length > 0);
  }
});
