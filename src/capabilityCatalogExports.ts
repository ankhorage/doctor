import path from 'node:path';

/*** Resolve and validate the public export for an authored capability catalog. */
export function capabilityCatalogExports(
  packageRoot: string,
  packageExports: unknown,
  catalogPath: string,
): void {
  const target = readCapabilityExportTarget(
    isRecord(packageExports) ? packageExports['./capabilities'] : undefined,
  );
  if (target === null)
    throw new Error('Package exports must define "./capabilities" for its canonical catalog.');
  if (!target.startsWith('./') || !isInsidePackage(packageRoot, path.resolve(packageRoot, target)))
    throw new Error('The public "./capabilities" export must resolve within its package.');
  if (
    !capabilitySourceCandidatesForExport(target).some(
      (candidate) => path.resolve(packageRoot, candidate) === catalogPath,
    )
  )
    throw new Error(
      'The public "./capabilities" export must resolve to src/capabilities/index.ts.',
    );
}

/*** Select one concrete target from a Node package export condition object. */
function readCapabilityExportTarget(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return null;
  for (const candidate of [value.import, value.default, value.types]) {
    const target = readCapabilityExportTarget(candidate);
    if (target !== null) return target;
  }
  return null;
}

/*** Map a conventional dist export to authored source candidates. */
function capabilitySourceCandidatesForExport(target: string): readonly string[] {
  if (!target.startsWith('./dist/') || !target.endsWith('.js')) return [target];
  const stem = target.slice('./dist/'.length, -'.js'.length);
  return [`./src/${stem}.ts`, `./src/${stem}.tsx`, `./src/${stem}.js`, `./src/${stem}.mjs`];
}

/*** Check whether a resolved target remains inside the inspected package. */
function isInsidePackage(packageRoot: string, candidate: string): boolean {
  const relativePath = path.relative(packageRoot, candidate);
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '..';
}

/*** Narrow an unknown value to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
