import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { DoctorCommandContext } from '../src/commandContext.js';

export interface CapturedCommandContext {
  readonly context: DoctorCommandContext;
  readonly stderr: { value: string };
  readonly stdout: { value: string };
}

export interface DoctorFixtureOptions {
  readonly packageJson?: Record<string, unknown> | 'invalid-json' | null;
  readonly withBunLock?: boolean;
  readonly withChangelog?: boolean;
  readonly withChangeset?: boolean;
  readonly withGitDir?: boolean;
  readonly withLicense?: boolean;
  readonly withReadme?: boolean;
  readonly withWorkflows?: boolean;
}

export function createCapturedCommandContext(
  cwd: string,
  version = '0.1.0',
): CapturedCommandContext {
  const stdout = { value: '' };
  const stderr = { value: '' };

  return {
    stdout,
    stderr,
    context: {
      cwd,
      env: process.env,
      version,
      writeStdout(text: string) {
        stdout.value += text;
      },
      writeStderr(text: string) {
        stderr.value += text;
      },
    },
  };
}

export async function createDoctorFixture(options: DoctorFixtureOptions = {}): Promise<string> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ankhorage-doctor-'));

  if (options.withGitDir) {
    await fs.mkdir(path.join(rootPath, '.git'), { recursive: true });
  }

  if (options.withWorkflows) {
    await fs.mkdir(path.join(rootPath, '.github', 'workflows'), {
      recursive: true,
    });
    await fs.writeFile(path.join(rootPath, '.github', 'workflows', 'ci.yml'), 'name: CI\n', 'utf8');
  }

  if (options.withChangeset) {
    await fs.mkdir(path.join(rootPath, '.changeset'), { recursive: true });
  }

  if (options.withBunLock) {
    await fs.writeFile(path.join(rootPath, 'bun.lock'), '', 'utf8');
  }

  if (options.withReadme) {
    await fs.writeFile(path.join(rootPath, 'README.md'), '# Test\n', 'utf8');
  }

  if (options.withChangelog) {
    await fs.writeFile(path.join(rootPath, 'CHANGELOG.md'), '# Changelog\n', 'utf8');
  }

  if (options.withLicense) {
    await fs.writeFile(path.join(rootPath, 'LICENSE'), 'MIT\n', 'utf8');
  }

  if (options.packageJson === 'invalid-json') {
    await fs.writeFile(path.join(rootPath, 'package.json'), '{invalid', 'utf8');
  } else if (options.packageJson !== null && options.packageJson !== undefined) {
    await fs.writeFile(
      path.join(rootPath, 'package.json'),
      `${JSON.stringify(options.packageJson, null, 2)}\n`,
      'utf8',
    );
  }

  return rootPath;
}

export async function createStandaloneFile(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  const absolutePath = path.join(rootPath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, 'fixture\n', 'utf8');
  return absolutePath;
}

export async function snapshotDirectory(rootPath: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  await walkDirectory(rootPath, rootPath, snapshot);
  return snapshot;
}

async function walkDirectory(
  rootPath: string,
  currentPath: string,
  snapshot: Record<string, string>,
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, absolutePath);

    if (entry.isDirectory()) {
      await walkDirectory(rootPath, absolutePath, snapshot);
      continue;
    }

    snapshot[relativePath] = await fs.readFile(absolutePath, 'utf8');
  }
}
