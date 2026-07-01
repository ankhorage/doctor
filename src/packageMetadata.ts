import type {
  AnkhCapabilityId,
  AnkhCommandCategory,
  AnkhPackageMetadata,
} from '@ankhorage/contracts/cli';

import packageJson from '../package.json';

export const DOCTOR_PACKAGE_NAME = packageJson.name;
export const DOCTOR_PACKAGE_VERSION = packageJson.version;
export const DOCTOR_COMMAND_CATEGORY = 'doctor' as const satisfies AnkhCommandCategory;
export const DOCTOR_CAPABILITIES = [
  'doctor.validate',
  'doctor.fix',
  'doctor.repo',
  'doctor.package',
] as const satisfies readonly AnkhCapabilityId[];

export const DOCTOR_PACKAGE_METADATA = {
  category: DOCTOR_COMMAND_CATEGORY,
  provider: './dist/ankh.provider.js',
  capabilities: DOCTOR_CAPABILITIES,
} as const satisfies AnkhPackageMetadata;
