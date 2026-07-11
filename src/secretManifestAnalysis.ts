import {
  findForbiddenInlineSecretFields,
  normalizeSecretRef,
  SECRET_STORE_PROVIDERS,
} from '@ankhorage/contracts/secrets';

import type { DoctorDiagnostic, DoctorRuleId } from './diagnostics.js';

const PROFILE = 'app-manifest' as const;

export function analyzeSecretStoreManifest(
  infra: Record<string, unknown>,
  manifestPath: string,
): DoctorDiagnostic[] {
  const diagnostics: DoctorDiagnostic[] = [];
  const secretStoreProvider = validateSecretStore(infra.secretStore, manifestPath, diagnostics);

  if (!isRecord(infra.auth)) return diagnostics;
  const oauth = infra.auth.oauth;
  if (oauth === undefined) return diagnostics;

  if (!isRecord(oauth)) {
    diagnostics.push(
      diagnostic(
        'field-invalid',
        'manifest.infra.auth.oauth must be a JSON object when present.',
        manifestPath,
        'manifest.auth.oauth.valid-shape',
      ),
    );
    return diagnostics;
  }

  if (typeof oauth.enabled !== 'boolean') {
    diagnostics.push(
      diagnostic(
        oauth.enabled === undefined ? 'field-missing' : 'field-invalid',
        'manifest.infra.auth.oauth.enabled must be a boolean.',
        manifestPath,
        'manifest.auth.oauth.valid-shape',
      ),
    );
  }

  if (
    typeof oauth.callbackRoute !== 'string' ||
    oauth.callbackRoute.trim().length === 0 ||
    !oauth.callbackRoute.trim().startsWith('/')
  ) {
    diagnostics.push(
      diagnostic(
        oauth.callbackRoute === undefined ? 'field-missing' : 'field-invalid',
        'manifest.infra.auth.oauth.callbackRoute must be a non-empty absolute route.',
        manifestPath,
        'manifest.auth.oauth.callback-route.valid',
      ),
    );
  }

  if (!Array.isArray(oauth.providers)) {
    diagnostics.push(
      diagnostic(
        oauth.providers === undefined ? 'field-missing' : 'field-invalid',
        'manifest.infra.auth.oauth.providers must be an array.',
        manifestPath,
        'manifest.auth.oauth.providers.valid',
      ),
    );
    return diagnostics;
  }

  const enabledProviders = oauth.providers.filter(
    (provider) => isRecord(provider) && provider.enabled !== false,
  );

  if (oauth.enabled === true && enabledProviders.length === 0) {
    diagnostics.push(
      diagnostic(
        'field-invalid',
        'OAuth is enabled, but no OAuth providers are enabled.',
        manifestPath,
        'manifest.auth.oauth.providers.valid',
      ),
    );
  }

  if (enabledProviders.length > 0 && secretStoreProvider === null) {
    diagnostics.push(
      diagnostic(
        'field-missing',
        'Enabled OAuth providers require manifest.infra.secretStore.provider.',
        manifestPath,
        'manifest.secret-store.provider.required',
      ),
    );
  }

  const seenProviderIds = new Set<string>();

  for (const [index, provider] of oauth.providers.entries()) {
    if (!isRecord(provider)) {
      diagnostics.push(
        diagnostic(
          'field-invalid',
          `manifest.infra.auth.oauth.providers[${index}] must be a JSON object.`,
          manifestPath,
          'manifest.auth.oauth.providers.valid',
        ),
      );
      continue;
    }

    const providerId = typeof provider.id === 'string' ? provider.id.trim() : '';
    if (providerId.length === 0) {
      diagnostics.push(
        diagnostic(
          provider.id === undefined ? 'field-missing' : 'field-invalid',
          `manifest.infra.auth.oauth.providers[${index}].id must be a non-empty string.`,
          manifestPath,
          'manifest.auth.oauth.providers.valid',
        ),
      );
    } else if (seenProviderIds.has(providerId)) {
      diagnostics.push(
        diagnostic(
          'field-invalid',
          `OAuth provider id "${providerId}" is configured more than once.`,
          manifestPath,
          'manifest.auth.oauth.provider.duplicate',
        ),
      );
    } else {
      seenProviderIds.add(providerId);
    }

    for (const field of findForbiddenInlineSecretFields(provider)) {
      diagnostics.push(
        diagnostic(
          'field-invalid',
          `Inline OAuth field "${field}" is forbidden. Store the value in the configured secret store and reference it with credentialsRef.`,
          manifestPath,
          'manifest.auth.oauth.provider.inline-secret.disallowed',
        ),
      );
    }

    if (provider.enabled === false) continue;

    if (typeof provider.credentialsRef !== 'string') {
      diagnostics.push(
        diagnostic(
          provider.credentialsRef === undefined ? 'field-missing' : 'field-invalid',
          `Enabled OAuth provider "${providerId || index}" requires a credentialsRef.`,
          manifestPath,
          'manifest.auth.oauth.provider.credentials-ref.required',
        ),
      );
      continue;
    }

    const refResult = normalizeSecretRef(provider.credentialsRef);
    if (!refResult.ok || refResult.data !== provider.credentialsRef) {
      diagnostics.push(
        diagnostic(
          'field-invalid',
          `OAuth provider "${providerId || index}" credentialsRef must be a canonical logical secret reference.`,
          manifestPath,
          'manifest.auth.oauth.provider.credentials-ref.valid',
        ),
      );
    }
  }

  return diagnostics;
}

function validateSecretStore(
  value: unknown,
  manifestPath: string,
  diagnostics: DoctorDiagnostic[],
): string | null {
  if (value === undefined) return null;

  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'field-invalid',
        'manifest.infra.secretStore must be a JSON object when present.',
        manifestPath,
        'manifest.secret-store.valid-shape',
      ),
    );
    return null;
  }

  if (typeof value.provider !== 'string' || value.provider.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        value.provider === undefined ? 'field-missing' : 'field-invalid',
        'manifest.infra.secretStore.provider must be a non-empty string.',
        manifestPath,
        'manifest.secret-store.provider.required',
      ),
    );
    return null;
  }

  const provider = value.provider.trim();
  if (!(SECRET_STORE_PROVIDERS as readonly string[]).includes(provider)) {
    diagnostics.push(
      diagnostic(
        'field-invalid',
        `Unsupported secret-store provider "${provider}". Current providers: ${SECRET_STORE_PROVIDERS.join(', ')}.`,
        manifestPath,
        'manifest.secret-store.provider.valid',
      ),
    );
  }

  return provider;
}

function diagnostic(
  code: DoctorDiagnostic['code'],
  message: string,
  path: string,
  ruleId: DoctorRuleId,
): DoctorDiagnostic {
  return {
    code,
    message,
    path,
    profile: PROFILE,
    ruleId,
    severity: 'error',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
