import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  type Capability,
  isCapability,
  normalizeCapability,
} from '@ankhorage/contracts/capabilities';

type CatalogResolution =
  | { readonly capabilities: readonly Capability[]; readonly path: string; readonly reason: null }
  | { readonly capabilities: null; readonly path: string | null; readonly reason: string };

/*** Read the statically authored public capability catalog without evaluating target package code. */
export async function readCapabilityCatalogAsync(
  packageRoot: string,
  packageExports: unknown,
): Promise<CatalogResolution> {
  const exportTarget = readCapabilitiesExportTarget(packageExports);
  if (exportTarget === null) {
    return {
      capabilities: null,
      path: null,
      reason: 'Package exports must define "./capabilities".',
    };
  }

  const catalogPath = await resolveCatalogPathAsync(packageRoot, exportTarget);
  if (catalogPath === null) {
    return {
      capabilities: null,
      path: path.resolve(packageRoot, exportTarget),
      reason: 'The public "./capabilities" export must resolve to a local catalog module.',
    };
  }

  try {
    const source = await fs.readFile(catalogPath, 'utf8');
    const catalog = parseStaticCapabilities(source);
    const capabilities = catalog.map((capability, index) => {
      if (!isCapability(capability)) {
        throw new Error(`CAPABILITIES[${index}] is not a valid Capability.`);
      }
      return normalizeCapability(capability);
    });
    assertUniqueCapabilityIds(capabilities);
    return { capabilities, path: catalogPath, reason: null };
  } catch (error) {
    return {
      capabilities: null,
      path: catalogPath,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/*** Read the first import/default/types target from a package capabilities subpath export. */
function readCapabilitiesExportTarget(packageExports: unknown): string | null {
  if (!isRecord(packageExports)) return null;
  return readExportTarget(packageExports['./capabilities']);
}

/*** Select one concrete target from a Node package export condition object. */
function readExportTarget(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return null;

  for (const candidate of [value.import, value.default, value.types]) {
    const target = readExportTarget(candidate);
    if (target !== null) return target;
  }

  return null;
}

/*** Resolve a package export to its authored source counterpart or published module. */
async function resolveCatalogPathAsync(
  packageRoot: string,
  exportTarget: string,
): Promise<string | null> {
  if (!exportTarget.startsWith('./')) return null;
  const publishedPath = path.resolve(packageRoot, exportTarget);
  if (!isInsidePackage(packageRoot, publishedPath)) return null;

  const sourceCandidates = sourceCandidatesForExport(exportTarget).map((candidate) =>
    path.resolve(packageRoot, candidate),
  );
  for (const candidate of [...sourceCandidates, publishedPath]) {
    if (isInsidePackage(packageRoot, candidate) && (await isFileAsync(candidate))) return candidate;
  }

  return null;
}

/*** Map a conventional dist capability export to its source module candidates. */
function sourceCandidatesForExport(exportTarget: string): readonly string[] {
  if (!exportTarget.startsWith('./dist/') || !exportTarget.endsWith('.js')) return [exportTarget];
  const stem = exportTarget.slice('./dist/'.length, -'.js'.length);
  return [`./src/${stem}.ts`, `./src/${stem}.tsx`, `./src/${stem}.js`, `./src/${stem}.mjs`];
}

/*** Check whether a resolved path remains within the inspected package root. */
function isInsidePackage(packageRoot: string, candidate: string): boolean {
  const relativePath = path.relative(packageRoot, candidate);
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '..';
}

/*** Check whether one catalog candidate is a regular file. */
async function isFileAsync(candidate: string): Promise<boolean> {
  try {
    return (await fs.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

/*** Parse the literal array assigned to the canonical CAPABILITIES export. */
function parseStaticCapabilities(source: string): readonly unknown[] {
  const declaration = /export\s+const\s+CAPABILITIES\s*=\s*/u.exec(source);
  if (declaration?.index === undefined) {
    throw new Error('The public catalog must export a literal CAPABILITIES array.');
  }

  const start = declaration.index + declaration[0].length;
  if (source.at(start) !== '[') {
    throw new Error('CAPABILITIES must be assigned a literal array.');
  }

  const literal = source.slice(start, findArrayEnd(source, start) + 1);
  return parseJsonLikeLiteral(literal) as readonly unknown[];
}

/*** Find the closing bracket of a JavaScript array without evaluating its contents. */
function findArrayEnd(source: string, start: number): number {
  let depth = 0;
  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source.at(index);
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
    } else if (character === '[') {
      depth += 1;
    } else if (character === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error('CAPABILITIES contains an unterminated array literal.');
}

/*** Convert a JSON-compatible TypeScript object literal into JSON without executing expressions. */
function parseJsonLikeLiteral(literal: string): unknown {
  const withQuotedKeys = literal.replace(/([,{]\s*)([A-Za-z_$][\w$]*)\s*:/gu, '$1"$2":');
  const normalizedStrings = normalizeSingleQuotedStrings(withQuotedKeys);
  const withoutTrailingCommas = normalizedStrings.replace(/,\s*([}\]])/gu, '$1');
  return JSON.parse(withoutTrailingCommas) as unknown;
}

/*** Convert JavaScript single-quoted strings to JSON strings while preserving their values. */
function normalizeSingleQuotedStrings(source: string): string {
  let output = '';
  let index = 0;

  while (index < source.length) {
    if (source.at(index) !== "'") {
      output += source.at(index);
      index += 1;
      continue;
    }

    const { end, value } = readSingleQuotedString(source, index);
    output += JSON.stringify(value);
    index = end + 1;
  }

  return output;
}

/*** Read one single-quoted JavaScript string without allowing executable interpolation. */
function readSingleQuotedString(
  source: string,
  start: number,
): { readonly end: number; readonly value: string } {
  let value = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source.at(index);
    if (character === "'") return { end: index, value };
    if (character !== '\\') {
      value += character;
      continue;
    }

    const escaped = source.at(index + 1);
    if (escaped === undefined) break;
    value += escaped === 'n' ? '\n' : escaped === 'r' ? '\r' : escaped === 't' ? '\t' : escaped;
    index += 1;
  }

  throw new Error('CAPABILITIES contains an unterminated string literal.');
}

/*** Reject duplicate capability identifiers in one canonical public catalog. */
function assertUniqueCapabilityIds(capabilities: readonly Capability[]): void {
  const ids = new Set<string>();
  for (const capability of capabilities) {
    if (ids.has(capability.id)) throw new Error(`Duplicate capability id "${capability.id}".`);
    ids.add(capability.id);
  }
}

/*** Narrow an unknown value to a JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
