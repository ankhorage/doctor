import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { findDoctorCommandByStandaloneName, runDoctorCommand } from '../src/commands.js';
import { createCapturedCommandContext, createDoctorFixture } from './testSupport.js';

test('doctor validate reports target and environment Auth readiness', async () => {
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
  expect(captured.stdout.value).toContain('Readiness:');
  expect(captured.stdout.value).toContain('web local google brokeredRedirect: ready');
  expect(captured.stdout.value).toContain('web preview google brokeredRedirect: ready');
  expect(captured.stdout.value).toContain('web production google brokeredRedirect: ready');
});

function createManifest() {
  return {
    deploy: { targets: { web: { enabled: true } } },
    infra: {
      secretStore: { provider: 'supabase-vault' },
      auth: {
        scope: 'global',
        provider: 'supabase',
        oauth: {
          enabled: true,
          callbackRoute: '/auth/callback',
          providers: [
            {
              id: 'google',
              enabled: true,
              credentialsRef: 'auth/oauth/google',
            },
          ],
        },
      },
    },
  };
}
