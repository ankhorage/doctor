import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTargetWithCliLayout } from '../src/cliLayoutAnalysis.js';
import { analyzeAppManifest } from '../src/manifestAnalysis.js';
import { createDoctorFixture } from './testSupport.js';

describe('app manifest authentication diagnostics', () => {
  test('accepts contract defaults and authentication without authorization', () => {
    const diagnostics = analyzeAppManifest({
      settings: createSettings(),
      infra: {
        auth: {
          scope: 'global',
          provider: 'supabase',
        },
      },
    });

    expect(diagnostics).toEqual([]);
  });

  test('accepts the canonical flow including the sign-in unauthorized alias', () => {
    const diagnostics = analyzeAppManifest({
      settings: createSettings(),
      infra: {
        auth: {
          scope: 'global',
          provider: 'supabase',
          flow: createCanonicalFlow(),
        },
      },
    });

    expect(diagnostics).toEqual([]);
  });

  test('rejects settings.authFlow with a direct manual migration message', () => {
    const diagnostics = analyzeAppManifest({
      settings: {
        ...createSettings(),
        authFlow: createCanonicalFlow(),
      },
      infra: {
        auth: {
          scope: 'global',
          provider: 'supabase',
          flow: createCanonicalFlow(),
        },
      },
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        ruleId: 'manifest.settings.auth-flow.removed',
        severity: 'error',
      }),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
      'Move this configuration manually to infra.auth.flow',
    );
    expect(diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
      'will not migrate it automatically',
    );
  });

  test('validates auth action route uniqueness and post-sign-in relationships', () => {
    const diagnostics = analyzeAppManifest({
      settings: createSettings(),
      infra: {
        auth: {
          scope: 'global',
          provider: 'supabase',
          flow: {
            ...createCanonicalFlow(),
            signUpRoute: '/sign-in/',
            signOutRoute: '/',
          },
        },
      },
    });
    const ruleIds = diagnostics.map((diagnostic) => diagnostic.ruleId);

    expect(ruleIds).toContain('manifest.auth.flow.route.unique');
    expect(ruleIds).toContain('manifest.auth.flow.post-sign-in.distinct');
  });

  test('validates authorization only when it is explicitly configured', () => {
    const withoutAuthorization = analyzeAppManifest({
      settings: createSettings(),
      infra: {
        auth: {
          scope: 'global',
          provider: 'supabase',
          flow: createCanonicalFlow(),
        },
      },
    });
    const withValidAuthorization = analyzeAppManifest({
      settings: createSettings(),
      infra: {
        auth: {
          scope: 'global',
          provider: 'supabase',
          flow: createCanonicalFlow(),
          authorization: {
            kind: 'ABAC',
            engine: 'cerbos',
          },
        },
      },
    });
    const withInvalidAuthorization = analyzeAppManifest({
      settings: createSettings(),
      infra: {
        auth: {
          scope: 'global',
          provider: 'supabase',
          flow: createCanonicalFlow(),
          authorization: {
            kind: 'ACL',
            engine: 'implicit',
          },
        },
      },
    });

    expect(withoutAuthorization).toEqual([]);
    expect(withValidAuthorization).toEqual([]);
    expect(withInvalidAuthorization.map((diagnostic) => diagnostic.ruleId)).toEqual([
      'manifest.auth.authorization.kind.valid',
      'manifest.auth.authorization.engine.valid',
    ]);
  });

  test('validates JSON manifest files as a first-class target', async () => {
    const fixture = await createDoctorFixture();
    const manifestPath = path.join(fixture, 'app.manifest.json');
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          settings: createSettings(),
          infra: {
            auth: {
              scope: 'global',
              provider: 'supabase',
              flow: createCanonicalFlow(),
            },
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const result = await analyzeDoctorTargetWithCliLayout({
      cwd: fixture,
      inputPath: 'app.manifest.json',
      mode: 'validate',
    });

    expect(result.profile).toBe('app-manifest');
    expect(result.appliedChecks).toEqual(['manifest']);
    expect(result.diagnostics).toEqual([]);
  });

  test('reports invalid JSON and never plans an automatic legacy migration', async () => {
    const fixture = await createDoctorFixture();
    await fs.writeFile(path.join(fixture, 'invalid.json'), '{invalid', 'utf8');
    await fs.writeFile(
      path.join(fixture, 'legacy.json'),
      JSON.stringify({
        settings: {
          ...createSettings(),
          authFlow: createCanonicalFlow(),
        },
        infra: {
          auth: {
            scope: 'global',
            provider: 'supabase',
          },
        },
      }),
      'utf8',
    );

    const invalidResult = await analyzeDoctorTargetWithCliLayout({
      cwd: fixture,
      inputPath: 'invalid.json',
      mode: 'validate',
    });
    const legacyFixResult = await analyzeDoctorTargetWithCliLayout({
      cwd: fixture,
      inputPath: 'legacy.json',
      mode: 'fix',
    });

    expect(invalidResult.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'invalid-app-manifest-json',
        ruleId: 'manifest.json.valid',
      }),
    );
    expect(legacyFixResult.diagnostics).toContainEqual(
      expect.objectContaining({ ruleId: 'manifest.settings.auth-flow.removed' }),
    );
    expect(legacyFixResult.plannedChanges).toEqual([]);
    expect(legacyFixResult.fixPlan?.changes).toEqual([]);
  });
});

function createSettings() {
  return {
    localization: {
      defaultLocale: 'en',
      locales: ['en'],
    },
  };
}

function createCanonicalFlow() {
  return {
    signInRoute: 'sign-in',
    signUpRoute: 'sign-up',
    signOutRoute: 'sign-out',
    forgotPasswordRoute: 'forgot-password',
    postSignInRoute: '/',
    unauthorizedRoute: 'sign-in',
  };
}
