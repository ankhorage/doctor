import { analyzeAuthProviderReadiness } from './authReadinessProvider.js';
import { resolveAuthReadinessTargets } from './authReadinessTargets.js';
import type { DoctorDiagnostic } from './diagnostics.js';
import type { DoctorReadiness } from './readiness.js';

export interface DoctorAuthReadinessAnalysis {
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly readiness: readonly DoctorReadiness[];
}

export function analyzeAuthReadiness(
  manifest: unknown,
  manifestPath = 'manifest.json',
): DoctorAuthReadinessAnalysis {
  if (!isRecord(manifest)) return emptyAnalysis();

  const infra = isRecord(manifest.infra) ? manifest.infra : null;
  const auth = infra !== null && isRecord(infra.auth) ? infra.auth : null;
  const oauth = auth !== null && isRecord(auth.oauth) ? auth.oauth : null;
  if (oauth?.enabled !== true || !Array.isArray(oauth.providers)) return emptyAnalysis();

  const targetResult = resolveAuthReadinessTargets(manifest.deploy, manifestPath);
  const diagnostics = [...targetResult.diagnostics];
  if (targetResult.targets === null) return { diagnostics, readiness: [] };

  const readiness: DoctorReadiness[] = [];
  for (const provider of oauth.providers) {
    if (!isRecord(provider) || provider.enabled === false) continue;
    const result = analyzeAuthProviderReadiness({
      authProvider: auth?.provider,
      callbackRoute: oauth.callbackRoute,
      enabledTargets: targetResult.enabledTargets,
      manifestPath,
      provider,
      targets: targetResult.targets,
    });
    diagnostics.push(...result.diagnostics);
    readiness.push(...result.readiness);
  }

  return { diagnostics, readiness };
}

function emptyAnalysis(): DoctorAuthReadinessAnalysis {
  return { diagnostics: [], readiness: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
