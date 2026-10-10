import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface ResolvedContractsImport {
  readonly packageRoot: string;
  readonly path: string;
}

/*** Resolve a declared Contracts public export without executing package code. */
export async function resolveContractsCatalogImportAsync(
  packageRoot: string,
  fromPath: string,
  specifier: string,
): Promise<ResolvedContractsImport> {
  if (!isContractsPublicSubpath(specifier))
    throw new Error(
      'Capability catalogs may import only local metadata or Contracts public exports.',
    );
  if (!(await hasDeclaredContractsDependencyAsync(packageRoot)))
    throw new Error(
      'Capability catalogs may import Contracts metadata only from a declared dependency.',
    );
  const require = createRequire(pathToFileURL(fromPath));
  const targetPath = require.resolve(specifier);
  const contractsPackageRoot = await findInstalledContractsPackageRootAsync(targetPath);
  if (!isInsidePackage(contractsPackageRoot, targetPath))
    throw new Error(
      'Contracts public exports must resolve within the installed Contracts package.',
    );
  return { packageRoot: contractsPackageRoot, path: targetPath };
}

/*** Find the installed Contracts package that owns a resolved public export. */
async function findInstalledContractsPackageRootAsync(targetPath: string): Promise<string> {
  return findContractsPackageRootAsync(path.dirname(targetPath));
}

/*** Walk parent directories until the Contracts package manifest establishes the boundary. */
async function findContractsPackageRootAsync(candidate: string): Promise<string> {
  if (candidate === path.dirname(candidate))
    throw new Error('Unable to find the installed Contracts package for its public export.');
  try {
    const packageMetadata: unknown = JSON.parse(
      await fs.readFile(path.join(candidate, 'package.json'), 'utf8'),
    );
    if (isUnknownRecord(packageMetadata) && packageMetadata.name === '@ankhorage/contracts')
      return candidate;
  } catch {
    // Only an actual package root establishes the trusted external boundary.
  }
  return findContractsPackageRootAsync(path.dirname(candidate));
}

/*** Check whether a specifier names an explicitly exported Contracts subpath. */
function isContractsPublicSubpath(specifier: string): boolean {
  return /^@ankhorage\/contracts\/[^/]+$/.test(specifier);
}

/*** Check whether the inspected package declares its Contracts dependency. */
async function hasDeclaredContractsDependencyAsync(packageRoot: string): Promise<boolean> {
  try {
    const packageMetadata: unknown = JSON.parse(
      await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    );
    return hasContractsDependency(packageMetadata);
  } catch {
    return false;
  }
}

/*** Check standard runtime dependency declarations for Contracts. */
function hasContractsDependency(packageMetadata: unknown): boolean {
  if (!isUnknownRecord(packageMetadata)) return false;
  return [
    packageMetadata.dependencies,
    packageMetadata.optionalDependencies,
    packageMetadata.peerDependencies,
  ].some(
    (dependencies) =>
      isUnknownRecord(dependencies) && typeof dependencies['@ankhorage/contracts'] === 'string',
  );
}

/*** Check whether a resolved export remains within its installed package. */
function isInsidePackage(packageRoot: string, candidate: string): boolean {
  const relativePath = path.relative(packageRoot, candidate);
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '..';
}

/*** Narrow an unknown value to a record without accepting arrays. */
function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
