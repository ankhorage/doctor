import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  type Capability,
  isCapability,
  normalizeCapability,
} from '@ankhorage/contracts/capabilities';

import { capabilityCatalogAstAsync } from './capabilityCatalogAst.js';
import { capabilityCatalogExports } from './capabilityCatalogExports.js';

const CAPABILITIES_SOURCE_PATH = 'src/capabilities/index.ts';

type CatalogResolution =
  | { readonly capabilities: readonly Capability[]; readonly path: string; readonly reason: null }
  | { readonly capabilities: null; readonly path: string; readonly reason: string }
  | { readonly capabilities: null; readonly path: null; readonly reason: null };

/*** Read an opted-in package catalog without executing target package code. */
export async function readCapabilityCatalogAsync(
  packageRoot: string,
  packageExports: unknown,
): Promise<CatalogResolution> {
  const catalogPath = path.resolve(packageRoot, CAPABILITIES_SOURCE_PATH);
  if (!(await isFileAsync(catalogPath))) return { capabilities: null, path: null, reason: null };
  try {
    capabilityCatalogExports(packageRoot, packageExports, catalogPath);
    const values = await capabilityCatalogAstAsync(packageRoot, catalogPath, 'CAPABILITIES');
    if (!Array.isArray(values))
      throw new Error(`${CAPABILITIES_SOURCE_PATH} must export CAPABILITIES as an array.`);
    const capabilities = values.map((value, index) => {
      if (!isCapability(value))
        throw new Error(`CAPABILITIES[${index}] is not a valid Capability.`);
      return normalizeCapability(value);
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

/*** Check whether one candidate is a regular file. */
async function isFileAsync(candidate: string): Promise<boolean> {
  try {
    return (await fs.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

/*** Reject duplicate identifiers in one canonical catalog. */
function assertUniqueCapabilityIds(capabilities: readonly Capability[]): void {
  const ids = new Set<string>();
  for (const capability of capabilities) {
    if (ids.has(capability.id)) throw new Error(`Duplicate capability id "${capability.id}".`);
    ids.add(capability.id);
  }
}
