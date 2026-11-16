import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { DoctorRepositoryMetadataOptions } from './analysis.js';

/*** Derive managed applicability only when GitHub's checkout and Doctor's target share one canonical identity. */
export async function createMetadataOptionsAsync(input: {
  readonly context: { readonly cwd: string; readonly env: NodeJS.ProcessEnv };
  readonly enforceRepositoryMetadata: boolean;
  readonly inputPath?: string;
}): Promise<DoctorRepositoryMetadataOptions> {
  const { env } = input.context;
  const managedWorkflow =
    env.GITHUB_ACTIONS === 'true' &&
    env.GITHUB_REPOSITORY_OWNER === 'ankhorage' &&
    env.GITHUB_REPOSITORY?.startsWith('ankhorage/') === true;

  if (!managedWorkflow) {
    return { enforce: input.enforceRepositoryMetadata, managed: false };
  }

  const workspacePath = env.GITHUB_WORKSPACE;
  if (workspacePath === undefined || workspacePath.length === 0) {
    return createUnconfirmedApplicabilityOptions(input.enforceRepositoryMetadata);
  }

  try {
    const [workspaceIdentity, targetIdentity] = await Promise.all([
      fs.realpath(workspacePath),
      fs.realpath(path.resolve(input.context.cwd, input.inputPath ?? '.')),
    ]);
    return {
      enforce: input.enforceRepositoryMetadata,
      managed: workspaceIdentity === targetIdentity,
    };
  } catch {
    return createUnconfirmedApplicabilityOptions(input.enforceRepositoryMetadata);
  }
}

/*** Reject incomplete managed-workflow identity instead of applying managed policy to an arbitrary target. */
function createUnconfirmedApplicabilityOptions(enforce: boolean): DoctorRepositoryMetadataOptions {
  return {
    applicabilityDiagnostic:
      'Repository metadata applicability could not be confirmed because this managed GitHub Actions workflow has no resolvable GITHUB_WORKSPACE target identity.',
    enforce,
    managed: false,
  };
}
