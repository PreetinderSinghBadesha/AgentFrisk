import { parseArgs } from "node:util";
import { ConfigError } from "../config.js";
import { colors } from "../report/colors.js";
import { formatJson, formatListJson } from "../report/json.js";
import { formatList } from "../report/list.js";
import { formatSarif } from "../report/sarif.js";
import { formatText } from "../report/text.js";
import { SEVERITY_RANK } from "../rules/index.js";
import { analyzeDir, scan, ScanError } from "../scan.js";
import type { Severity } from "../types.js";
import { VERSION } from "../version.js";

export interface Output {
  stdout(text: string): void;
  stderr(text: string): void;
  color: boolean;
}

const USAGE = `Usage: agentfrisk <command> [dir] [options]

Commands:
  scan [dir]    Find WebMCP tools and report dangerous ones
  list [dir]    List discovered WebMCP tools and their effects

Options:
  --json                 Print JSON
  --sarif                Print SARIF 2.1.0 for GitHub code scanning (scan only)
  --fail-on <severity>   Exit 1 on findings at or above: error | warning | info (default: error)
  --config <path>        Path to agentfrisk.config.json (default: <dir>/agentfrisk.config.json)
  -h, --help             Show this help
  -v, --version          Show the version
`;

class UsageError extends Error {}

function isSeverity(value: string): value is Severity {
  return value in SEVERITY_RANK;
}

export function run(argv: string[], output: Output): number {
  try {
    return execute(argv, output);
  } catch (error) {
    if (error instanceof UsageError) {
      output.stderr(`agentfrisk: ${error.message}\n\n${USAGE}`);
      return 2;
    }
    if (error instanceof ScanError || error instanceof ConfigError) {
      output.stderr(`agentfrisk: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

function execute(argv: string[], output: Output): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: "boolean" },
        sarif: { type: "boolean" },
        "fail-on": { type: "string" },
        config: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    output.stdout(USAGE);
    return 0;
  }
  if (values.version) {
    output.stdout(`${VERSION}\n`);
    return 0;
  }
  const [command, dir = ".", ...extra] = positionals;
  if (!command) throw new UsageError("missing command");
  if (command !== "scan" && command !== "list") throw new UsageError(`unknown command "${command}"`);
  if (extra.length > 0) throw new UsageError(`unexpected arguments: ${extra.join(" ")}`);
  if (values.json && values.sarif) throw new UsageError("--json and --sarif cannot be combined");
  const failOn = values["fail-on"] ?? "error";
  if (!isSeverity(failOn)) throw new UsageError(`--fail-on must be error, warning, or info (got "${failOn}")`);
  const c = colors(output.color);

  if (command === "list") {
    if (values.sarif) throw new UsageError("--sarif is only available for scan");
    const { tools } = analyzeDir(dir, { configPath: values.config });
    output.stdout(values.json ? formatListJson(tools) : formatList(tools, c));
    return 0;
  }

  const result = scan(dir, { configPath: values.config });
  output.stdout(values.sarif ? formatSarif(result) : values.json ? formatJson(result) : formatText(result, c));
  const threshold = SEVERITY_RANK[failOn];
  return result.findings.some((f) => SEVERITY_RANK[f.severity] >= threshold) ? 1 : 0;
}
