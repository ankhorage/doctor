import type { AnkhCommandCategory, AnkhPackageMetadata } from '@ankhorage/contracts/cli';

import packageJson from '../package.json';
import { CAPABILITIES } from './capabilities/index.js';

export const DOCTOR_PACKAGE_NAME = packageJson.name;
export const DOCTOR_PACKAGE_VERSION = packageJson.version;
export const DOCTOR_COMMAND_CATEGORY = 'doctor' as const satisfies AnkhCommandCategory;

export const DOCTOR_PACKAGE_METADATA = {
  category: DOCTOR_COMMAND_CATEGORY,
  provider: './dist/cli/index.js',
  capabilities: CAPABILITIES,
} as const satisfies AnkhPackageMetadata;
