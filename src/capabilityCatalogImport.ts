import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveContractsCatalogImportAsync } from './capabilityCatalogContractsImport.js';

export interface ResolvedStaticImport {
  readonly packageRoot: string;
  readonly path: string;
}

/*** Resolve an allowed static import without executing its target package. */
export async function resolveImportPathAsync(
  packageRoot: string,
  fromPath: string,
  specifier: string,
): Promise<ResolvedStaticImport> {
  if (specifier.startsWith('.'))
    return resolveLocalImportPathAsync(packageRoot, fromPath, specifier);
  return resolveContractsCatalogImportAsync(packageRoot, fromPath, specifier);
}

/*** Resolve a relative static import that remains within its owning package. */
export async function resolveLocalImportPathAsync(
  packageRoot: string,
  fromPath: string,
  specifier: string,
): Promise<ResolvedStaticImport> {
  const candidate = path.resolve(path.dirname(fromPath), specifier);
  if (!isInsidePackage(packageRoot, candidate) && candidate !== packageRoot)
    throw new Error('Capability catalogs may not import outside their package.');
  for (const sourcePath of localSourceCandidates(candidate))
    if (await isFileAsync(sourcePath)) return { packageRoot, path: sourcePath };
  throw new Error(`Unable to resolve static capability import ${specifier}.`);
}

/*** Enumerate source files represented by one package-local ESM import specifier. */
function localSourceCandidates(candidate: string): readonly string[] {
  const extension = path.extname(candidate);
  if (extension === '.js')
    return [candidate.replace(/\.js$/u, '.ts'), candidate.replace(/\.js$/u, '.tsx'), candidate];
  if (extension === '.mjs') return [candidate.replace(/\.mjs$/u, '.mts'), candidate];
  if (extension === '.cjs') return [candidate.replace(/\.cjs$/u, '.cts'), candidate];
  return [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.js`,
    `${candidate}.mjs`,
    `${candidate}.cjs`,
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
    `${candidate}/index.js`,
  ];
}

/*** Check whether a resolved path remains within the inspected package root. */
function isInsidePackage(packageRoot: string, candidate: string): boolean {
  const relativePath = path.relative(packageRoot, candidate);
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '..';
}

/*** Check whether one candidate is a regular file. */
async function isFileAsync(candidate: string): Promise<boolean> {
  try {
    return (await fs.stat(candidate)).isFile();
  } catch {
    return false;
  }
}
