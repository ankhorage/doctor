import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { analyzeAuthReadiness } from '../src/authReadinessAnalysis.js';
import { findDoctorCommandByStandaloneName, runDoctorCommand } from '../src/commands.js';
import { createCapturedCommandContext, createDoctorFixture } from './testSupport.js';

test('Auth 5 readiness surfaces exact native schemes and app-build requirements', () => {
  const result = analyzeAuthReadiness(createManifest());
  const android = result.readiness.filter((item) => item.target === 'android');
  const ios = result.readiness.filter((item) => item.target === 'ios');
  const web = result.readiness.filter((item) => item.target === 'web');

  expect(android).toHaveLength(3);
  expect(android.every((item) => item.callbackScheme === 'ankh-android')).toBe(true);
  expect(ios.every((item) => item.callbackScheme === 'ankh-ios')).toBe(true);
  expect(
    [...android, ...ios].every(
      (item) => item.hostRequirement === 'development-or-standalone-build',
    ),
  ).toBe(true);
  expect(web.every((item) => item.callbackScheme === undefined)).toBe(true);
  expect(web.every((item) => item.hostRequirement === undefined)).toBe(true);
  expect(android.every((item) => item.message.includes('Callback scheme: ankh-android.'))).toBe(
    true,
  );
  expect(ios.every((item) => item.message.includes('Callback scheme: ankh-ios.'))).toBe(true);
  expect(
    [...android, ...ios].every((item) =>
      item.message.includes('requires a development or standalone app build'),
    ),
  ).toBe(true);
});

test('Auth 5 readiness never derives a native callback scheme from app identity', () => {
  const manifest = createManifest();
  const result = analyzeAuthReadiness({
    ...manifest,
    deploy: {
      targets: {
        ...manifest.deploy.targets,
        android: { enabled: true, package: 'com.ankh.android' },
      },
    },
  });
  const android = result.readiness.filter((item) => item.target === 'android');

  expect(android.every((item) => item.status === 'missing')).toBe(true);
  expect(android.every((item) => item.callbackScheme === undefined)).toBe(true);
  expect(android.every((item) => item.hostRequirement === 'development-or-standalone-build')).toBe(
    true,
  );
  expect(JSON.stringify(android)).not.toContain('com.ankh.android://');
});

test('doctor validate prints the exact native scheme and build requirement', async () => {
  const fixture = await createDoctorFixture();
  const manifestPath = path.join(fixture, 'ankh.config.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(createManifest(), null, 2)}\n`, 'utf8');
  const captured = createCapturedCommandContext(fixture);
  const command = findDoctorCommandByStandaloneName('validate');
  if (!command) throw new Error('Doctor validate command is unavailable.');

  const result = await runDoctorCommand({
    argv: [manifestPath],
    command,
    context: captured.context,
  });

  expect(result.exitCode).toBe(0);
  expect(captured.stdout.value).toContain('android local google brokeredRedirect: ready');
  expect(captured.stdout.value).toContain('Callback scheme: ankh-android.');
  expect(captured.stdout.value).toContain('Callback scheme: ankh-ios.');
  expect(captured.stdout.value).toContain('requires a development or standalone app build');
});

function createManifest() {
  return {
    deploy: {
      targets: {
        web: { enabled: true },
        android: { enabled: true, package: 'com.ankh.android', scheme: 'ankh-android' },
        ios: { enabled: true, bundleIdentifier: 'com.ankh.ios', scheme: 'ankh-ios' },
      },
    },
    infra: {
      secretStore: { provider: 'supabase-vault' },
      auth: {
        scope: 'global',
        provider: 'supabase',
        oauth: {
          enabled: true,
          callbackRoute: '/auth/callback',
          providers: [{ id: 'google', enabled: true, credentialsRef: 'auth/oauth/google' }],
        },
      },
    },
  };
}
