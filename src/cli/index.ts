import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import {
  createProviderCommandDescriptors,
  DOCTOR_COMMANDS,
  type DoctorCommandServices,
  runDoctorCommand,
  type RunDoctorCommandImpl,
} from '../commands.js';
import {
  DOCTOR_CAPABILITIES,
  DOCTOR_COMMAND_CATEGORY,
  DOCTOR_PACKAGE_NAME,
  DOCTOR_PACKAGE_VERSION,
} from '../packageMetadata.js';

export interface CreateDoctorRuntimeProviderOptions {
  readonly runCommandImpl?: RunDoctorCommandImpl;
  readonly services?: Partial<DoctorCommandServices>;
}

export function createDoctorRuntimeProvider(
  options: CreateDoctorRuntimeProviderOptions = {},
): AnkhRuntimeCommandProvider {
  const runCommandImpl = options.runCommandImpl ?? runDoctorCommand;

  return {
    id: DOCTOR_PACKAGE_NAME,
    category: DOCTOR_COMMAND_CATEGORY,
    version: DOCTOR_PACKAGE_VERSION,
    capabilities: [...DOCTOR_CAPABILITIES],
    commands: createProviderCommandDescriptors(),
    handlers: DOCTOR_COMMANDS.map((command) => ({
      path: command.path,
      handler(request) {
        return runCommandImpl(
          {
            argv: request.argv,
            command,
            context: request.context,
          },
          {
            services: options.services,
          },
        );
      },
    })),
  } satisfies AnkhRuntimeCommandProvider;
}

const provider = createDoctorRuntimeProvider();

export default provider;
