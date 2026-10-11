import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { toPosix } from "./files.js";

export interface Project {
  program: ts.Program;
  checker: ts.TypeChecker;
  scripts: ts.SourceFile[];
  display(sourceFile: ts.SourceFile): string;
  isProjectFile(sourceFile: ts.SourceFile): boolean;
}

const BASE_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
};

const FORCED_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  checkJs: false,
  noEmit: true,
  noLib: true,
  types: [],
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  allowArbitraryExtensions: true,
};

function compilerOptions(configDir: string | undefined): ts.CompilerOptions {
  const configPath = configDir && join(configDir, "tsconfig.json");
  if (!configPath || !existsSync(configPath)) return { ...BASE_OPTIONS, ...FORCED_OPTIONS };
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, dirname(configPath));
  const options = { ...BASE_OPTIONS, ...parsed.options, ...FORCED_OPTIONS };
  if (options.moduleResolution === ts.ModuleResolutionKind.Classic) {
    options.moduleResolution = ts.ModuleResolutionKind.Bundler;
  }
  return options;
}

export function normalizePath(path: string): string {
  return toPosix(resolve(path));
}

export function createProject(
  sources: Map<string, string>,
  displayFiles: Map<string, string>,
  root: string,
  configDir?: string,
): Project {
  const options = compilerOptions(configDir);
  const host = ts.createCompilerHost(options, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (f) => sources.get(normalizePath(f)) ?? readFile(f);
  host.fileExists = (f) => sources.has(normalizePath(f)) || fileExists(f);
  const directories = new Set([...sources.keys()].flatMap(ancestors));
  const directoryExists = host.directoryExists?.bind(host);
  host.directoryExists = (d) => directories.has(normalizePath(d)) || (directoryExists?.(d) ?? false);
  host.getSourceFile = (f, languageVersion, onError, shouldCreate) => {
    const text = sources.get(normalizePath(f));
    if (text === undefined) return getSourceFile(f, languageVersion, onError, shouldCreate);
    return ts.createSourceFile(f, text, languageVersion, true, scriptKind(f));
  };
  const rootNames = [...sources.keys()];
  const program = ts.createProgram({ rootNames, options, host });
  const checker = program.getTypeChecker();
  const scanned = new Set(rootNames);
  const scripts = program
    .getSourceFiles()
    .filter((sf) => scanned.has(normalizePath(sf.fileName)));
  return {
    program,
    checker,
    scripts,
    display: (sf) => {
      const file = displayFiles.get(normalizePath(sf.fileName)) ?? sf.fileName;
      return toPosix(relative(root, file));
    },
    isProjectFile: (sf) =>
      !sf.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sf) &&
      !normalizePath(sf.fileName).includes("/node_modules/"),
  };
}

function ancestors(path: string): string[] {
  const result: string[] = [];
  let current = dirname(path);
  while (!result.includes(current)) {
    result.push(current);
    current = dirname(current);
  }
  return result;
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (/\.(tsx)$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.(ts|mts|cts)$/i.test(fileName)) return ts.ScriptKind.TS;
  if (/\.(jsx)$/i.test(fileName)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}
