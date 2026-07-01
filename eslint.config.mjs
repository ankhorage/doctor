import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@ankhorage/devtools/eslint';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default createConfig({
  tsconfigRootDir,
  project: ['./tsconfig.eslint.json'],
  files: ['src/**/*.ts', 'tests/**/*.ts', 'paradox.config.ts'],
});
