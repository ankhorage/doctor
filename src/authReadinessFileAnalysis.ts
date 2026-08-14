import { promises as fs } from 'node:fs';

import {
  analyzeAuthReadiness,
  type DoctorAuthReadinessAnalysis,
} from './authReadinessAnalysis.js';

export async function analyzeAuthReadinessFile(
  filePath: string,
): Promise<DoctorAuthReadinessAnalysis> {
  try {
    const manifest = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
    return analyzeAuthReadiness(manifest, filePath);
  } catch {
    return { diagnostics: [], readiness: [] };
  }
}
