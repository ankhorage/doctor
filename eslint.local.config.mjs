import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@ankhorage/devtools/eslint';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default [
  ...createConfig({
    tsconfigRootDir,
    project: ['./tsconfig.eslint.json'],
    files: ['tests/**/*.ts', 'paradox.config.ts'],
  }),
  {
    name: 'doctor-existing-function-size-debt',
    files: [
      'src/analysis.ts',
      'src/cliLayoutAnalysis.ts',
      'src/manifestAnalysis.ts',
      'src/secretManifestAnalysis.ts',
      'tests/authReadinessAnalysis.test.ts',
      'tests/cli.test.ts',
      'tests/commands.test.ts',
      'tests/manifestAnalysis.test.ts',
      'tests/secretManifestAnalysis.test.ts',
      'tests/targetArchitecture.test.ts',
    ],
    rules: {
      'max-lines-per-function': 'off',
    },
  },
  {
    name: 'doctor-existing-complexity-debt',
    files: ['src/analysis.ts', 'src/authReadinessAnalysis.ts', 'src/secretManifestAnalysis.ts'],
    rules: {
      complexity: 'off',
    },
  },
  {
    name: 'doctor-existing-file-size-debt',
    files: [
      'src/analysis.ts',
      'src/cliLayoutAnalysis.ts',
      'src/manifestAnalysis.ts',
      'tests/commands.test.ts',
    ],
    rules: {
      'max-lines': 'off',
    },
  },
  {
    name: 'doctor-existing-object-injection-debt',
    files: [
      'src/analysis.ts',
      'src/authReadinessTargets.ts',
      'src/cliLayoutAnalysis.ts',
      'src/dependencyPolicyAnalysis.ts',
      'src/manifestAnalysis.ts',
      'tests/commands.test.ts',
      'tests/testSupport.ts',
    ],
    rules: {
      'security/detect-object-injection': 'off',
    },
  },
];
