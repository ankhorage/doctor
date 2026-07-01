import { describe, expect, test } from 'bun:test';

import { findDoctorCommandByStandaloneName, runDoctorCommand } from '../src/commands.js';
import {
  createCapturedCommandContext,
  createDoctorFixture,
  createStandaloneFile,
  snapshotDirectory,
} from './testSupport.js';

describe('doctor command runner', () => {
  test('validate auto-detects repo-only targets without reporting package.json missing', async () => {
    const fixture = await createDoctorFixture({
      withGitDir: true,
      withChangeset: true,
      withWorkflows: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).toContain('checks: repo');
    expect(captured.stdout.value).not.toContain('package-json-missing');
  });

  test('validate reports malformed package.json', async () => {
    const fixture = await createDoctorFixture({
      packageJson: 'invalid-json',
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('invalid-package-json');
  });

  test('validate reports missing paths', async () => {
    const fixture = await createDoctorFixture();
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: ['missing-path'],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('target-not-found');
  });

  test('validate rejects file paths', async () => {
    const fixture = await createDoctorFixture({
      withGitDir: true,
    });
    const filePath = await createStandaloneFile(fixture, 'notes.txt');
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [filePath],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('target-not-directory');
  });

  test('repo mode rejects non-repo candidates', async () => {
    const fixture = await createDoctorFixture();
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('repo'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('repo-markers-missing');
  });

  test('package mode rejects non-package candidates', async () => {
    const fixture = await createDoctorFixture({
      withGitDir: true,
      withChangeset: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('package'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package-json-missing');
  });

  test('fix is non-mutating in #1', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        name: '@ankhorage/example',
        version: '1.0.0',
        type: 'module',
      },
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const before = await snapshotDirectory(fixture);
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('fix'),
      context: captured.context,
    });

    const after = await snapshotDirectory(fixture);

    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).toContain('No automatic fixes available.');
    expect(after).toEqual(before);
  });
});

function getCommand(name: 'fix' | 'package' | 'repo' | 'validate') {
  const command = findDoctorCommandByStandaloneName(name);
  if (command === null) {
    throw new Error(`Missing command definition for ${name}`);
  }

  return command;
}
