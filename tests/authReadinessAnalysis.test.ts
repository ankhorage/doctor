import type { AppDeployTargetId } from '@ankhorage/contracts/deploy';
import { APP_DEPLOY_ENVIRONMENT_IDS } from '@ankhorage/contracts/deploy';
import { describe, expect, test } from 'bun:test';

import { analyzeAuthReadiness } from '../src/authReadinessAnalysis.js';

const TARGET_COMBINATIONS: readonly (readonly AppDeployTargetId[])[] = [
  ['web'],
  ['android'],
  ['ios'],
  ['web', 'android'],
  ['web', 'ios'],
  ['android', 'ios'],
  ['web', 'android', 'ios'],
];

describe('Auth 4 target readiness', () => {
  test('reports every target across local, preview, and production as manifest-ready', () => {
    for (const targets of TARGET_COMBINATIONS) {
      const result = analyzeAuthReadiness(createManifest(targets));

      expect(result.diagnostics).toEqual([]);
      expect(result.readiness).toHaveLength(targets.length * APP_DEPLOY_ENVIRONMENT_IDS.length);
      expect(new Set(result.readiness.map((item) => item.environment))).toEqual(
        new Set(APP_DEPLOY_ENVIRONMENT_IDS),
      );
      expect(new Set(result.readiness.map((item) => item.target))).toEqual(new Set(targets));
      expect(result.readiness.every((item) => item.status === 'ready')).toBe(true);
      expect(result.readiness.every((item) => item.transport === 'brokeredRedirect')).toBe(true);
    }
  });

  test('does not create readiness for disabled targets', () => {
    const result = analyzeAuthReadiness(createManifest(['web']));

    expect(new Set(result.readiness.map((item) => item.target))).toEqual(new Set(['web']));
    expect(result.readiness).toHaveLength(3);
  });

  test('reports a missing native callback scheme for every environment', () => {
    const manifest = createManifest(['android']);
    delete manifest.deploy.targets.android.scheme;
    const result = analyzeAuthReadiness(manifest);

    expect(result.readiness).toHaveLength(3);
    expect(result.readiness.every((item) => item.status === 'missing')).toBe(true);
    expect(result.readiness.every((item) => item.message.includes('android deep-link scheme'))).toBe(
      true,
    );
    expect(result.diagnostics.map((item) => item.ruleId)).toContain(
      'manifest.auth.oauth.callback-target.configured',
    );
  });

  test('reports unsupported provider capabilities without inventing a fallback', () => {
    const result = analyzeAuthReadiness(createManifest(['web'], 'azure'));

    expect(result.readiness).toHaveLength(3);
    expect(result.readiness.every((item) => item.status === 'unsupported')).toBe(true);
    expect(result.diagnostics.map((item) => item.ruleId)).toContain(
      'manifest.auth.oauth.setup.supported',
    );
  });

  test('rejects a target model with no enabled application target', () => {
    const result = analyzeAuthReadiness(createManifest([]));

    expect(result.readiness).toEqual([]);
    expect(result.diagnostics.map((item) => item.ruleId)).toContain(
      'manifest.deploy.targets.enabled',
    );
  });

  test('keeps legacy targetless manifests Web-only with an actionable warning', () => {
    const manifest = createManifest(['web']);
    const { deploy: _deploy, ...legacyManifest } = manifest;
    const result = analyzeAuthReadiness(legacyManifest);

    expect(result.readiness).toHaveLength(3);
    expect(result.readiness.every((item) => item.target === 'web')).toBe(true);
    expect(result.readiness.every((item) => item.status === 'ready')).toBe(true);
    expect(
      result.diagnostics.some(
        (item) =>
          item.ruleId === 'manifest.deploy.targets.legacy-web' && item.severity === 'warning',
      ),
    ).toBe(true);
  });

  test('never echoes inline credential material into readiness output', () => {
    const rawValue = 'must-never-appear-in-doctor-output';
    const manifest = createManifest(['web', 'android', 'ios'], 'google', rawValue);

    expect(JSON.stringify(analyzeAuthReadiness(manifest))).not.toContain(rawValue);
  });
});

function createManifest(
  enabledTargets: readonly AppDeployTargetId[],
  providerId = 'google',
  inlineCredential?: string,
) {
  const enabled = new Set(enabledTargets);
  return {
    deploy: {
      targets: {
        web: { enabled: enabled.has('web') },
        android: {
          enabled: enabled.has('android'),
          package: 'com.ankh.demo',
          scheme: 'ankh-demo',
        },
        ios: {
          enabled: enabled.has('ios'),
          bundleIdentifier: 'com.ankh.demo',
          scheme: 'ankh-demo',
        },
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
          providers: [
            {
              id: providerId,
              enabled: true,
              credentialsRef: 'auth/oauth/google',
              ...(inlineCredential === undefined ? {} : { clientSecret: inlineCredential }),
            },
          ],
        },
      },
    },
  };
}
