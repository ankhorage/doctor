import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { runCli } from '../src/cli/standalone.js';
import { createCapturedCommandContext, createDoctorFixture } from './testSupport.js';

test('leaves an unrelated checkout exempt when an Ankhorage workflow validates it', async () => {
  const workspace = await createFixture();
  const externalTarget = await createFixture();
  const captured = createManagedCommandContext(workspace);

  expect(
    (
      await runCli(['validate', '--enforce-repository-metadata', externalTarget], {
        context: captured.context,
      })
    ).exitCode,
  ).toBe(0);
  expect(captured.stdout.value).not.toContain('repository.metadata.document.required');
});

test('recognizes a managed workspace through a symlinked target path', async () => {
  const workspace = await createFixture();
  const symlinkPath = path.join(path.dirname(workspace), `${path.basename(workspace)}-symlink`);
  await fs.symlink(workspace, symlinkPath);
  const captured = createManagedCommandContext(workspace);

  expect(
    (
      await runCli(['validate', '--enforce-repository-metadata', symlinkPath], {
        context: captured.context,
      })
    ).exitCode,
  ).toBe(1);
  expect(captured.stdout.value).toContain('ERROR repository.metadata.document.required');
});

test('reports unconfirmed GitHub workspace identity instead of guessing applicability', async () => {
  const fixture = await createFixture();
  const captured = createManagedCommandContext(fixture, '/missing-managed-workspace');

  expect(
    (await runCli(['validate', '--enforce-repository-metadata'], { context: captured.context }))
      .exitCode,
  ).toBe(1);
  expect(captured.stdout.value).toContain('ERROR repository.metadata.eligibility.confirmed');
});

async function createFixture(): Promise<string> {
  return createDoctorFixture({
    packageJson: { name: 'unscoped-fixture', private: true },
    extraFiles: { 'src/index.ts': 'export const fixture = true;\n' },
  });
}

function createManagedCommandContext(cwd: string, workspace = cwd) {
  const captured = createCapturedCommandContext(cwd);
  return {
    ...captured,
    context: {
      ...captured.context,
      env: {
        ...captured.context.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'ankhorage/unscoped-fixture',
        GITHUB_REPOSITORY_OWNER: 'ankhorage',
        GITHUB_WORKSPACE: workspace,
      },
    },
  };
}
