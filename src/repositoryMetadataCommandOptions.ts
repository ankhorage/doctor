import type { DoctorRepositoryMetadataOptions } from './analysis.js';

/*** Derive managed applicability from GitHub Actions' repository identity, never package naming. */
export function createMetadataOptions(input: {
  readonly context: { readonly env: NodeJS.ProcessEnv };
  readonly enforceRepositoryMetadata: boolean;
}): DoctorRepositoryMetadataOptions {
  const { env } = input.context;
  const managed =
    env.GITHUB_ACTIONS === 'true' &&
    env.GITHUB_REPOSITORY_OWNER === 'ankhorage' &&
    env.GITHUB_REPOSITORY?.startsWith('ankhorage/') === true;

  return { enforce: input.enforceRepositoryMetadata, managed };
}
