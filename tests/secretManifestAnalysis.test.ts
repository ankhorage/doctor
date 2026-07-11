import { describe, expect, test } from 'bun:test';

import { analyzeAppManifest } from '../src/manifestAnalysis.js';

describe('secret-store manifest diagnostics', () => {
  test('accepts canonical Supabase Vault OAuth references', () => {
    const diagnostics = analyzeAppManifest({
      settings: createSettings(),
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
    });

    expect(diagnostics).toEqual([]);
  });

  test('requires a secret store and credentialsRef for enabled OAuth providers', () => {
    const diagnostics = analyzeAppManifest({
      settings: createSettings(),
      infra: {
        auth: {
          scope: 'global',
          provider: 'supabase',
          oauth: {
            enabled: true,
            callbackRoute: '/auth/callback',
            providers: [{ id: 'google', enabled: true }],
          },
        },
      },
    });

    expect(diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
      'manifest.secret-store.provider.required',
    );
    expect(diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
      'manifest.auth.oauth.provider.credentials-ref.required',
    );
  });

  test('rejects inline secret values without echoing submitted content', () => {
    const diagnostics = analyzeAppManifest({
      settings: createSettings(),
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
                clientSecret: 'sentinel-secret-value',
              },
            ],
          },
        },
      },
    });

    expect(diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
      'manifest.auth.oauth.provider.inline-secret.disallowed',
    );
    expect(JSON.stringify(diagnostics)).not.toContain('sentinel-secret-value');
  });

  test('rejects duplicate providers, invalid callback routes, and non-canonical references', () => {
    const diagnostics = analyzeAppManifest({
      settings: createSettings(),
      infra: {
        secretStore: { provider: 'supabase-vault' },
        auth: {
          scope: 'global',
          provider: 'supabase',
          oauth: {
            enabled: true,
            callbackRoute: 'auth/callback',
            providers: [
              {
                id: 'google',
                enabled: true,
                credentialsRef: '/auth//oauth/google/',
              },
              {
                id: 'google',
                enabled: false,
                credentialsRef: 'auth/oauth/google-disabled',
              },
            ],
          },
        },
      },
    });

    const ruleIds = diagnostics.map((diagnostic) => diagnostic.ruleId);
    expect(ruleIds).toContain('manifest.auth.oauth.callback-route.valid');
    expect(ruleIds).toContain('manifest.auth.oauth.provider.duplicate');
    expect(ruleIds).toContain('manifest.auth.oauth.provider.credentials-ref.valid');
  });

  test('keeps applications without OAuth valid', () => {
    expect(
      analyzeAppManifest({
        settings: createSettings(),
        infra: {
          auth: {
            scope: 'global',
            provider: 'supabase',
          },
        },
      }),
    ).toEqual([]);
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
