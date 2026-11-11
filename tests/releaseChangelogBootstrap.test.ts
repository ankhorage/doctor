import { rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/analysis.js';
import { createDoctorFixture } from './testSupport.js';

const packageName = '@ankhorage/scraper';

test.each(['patch', 'minor', 'major'])(
  'allows generated first changelog while a genuine %s Changeset is pending',
  async (level) => {
    await expectChangelogDiagnostic(
      false,
      `---\n'${packageName}': ${level}\n---\n\nRelease observations.\n`,
    );
  },
);

test.each([
  ['no Changeset', undefined],
  ['empty Changeset', '---\n---\n'],
  ['unrelated package', "---\n'@ankhorage/unrelated': patch\n---\n"],
  ['invalid release type', `---\n'${packageName}': invalid\n---\n`],
])('requires the changelog when there is %s', async (_label, contents) => {
  await expectChangelogDiagnostic(true, contents);
});

/*** Exercise the real Doctor policy with or without a first-release Changeset. */
async function expectChangelogDiagnostic(expected: boolean, releaseNote: string | undefined) {
  const fixture = await createDoctorFixture({
    packageJson: { name: packageName, version: '0.1.0', publishConfig: { access: 'public' } },
    withGitDir: true,
    withChangeset: true,
    withReadme: true,
    withLicense: true,
    extraFiles: releaseNote === undefined ? {} : { '.changeset/scraper.md': releaseNote },
  });
  try {
    const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
    expect(result.diagnostics.some((item) => item.ruleId === 'repo.changelog.required')).toBe(
      expected,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}
