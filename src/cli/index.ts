#!/usr/bin/env node
import { run } from "./run.js";

const color = !("NO_COLOR" in process.env) && ("FORCE_COLOR" in process.env || process.stdout.isTTY === true);

process.exitCode = run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  color,
});
