import type { AnkhCommandHandler, AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

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
    handlers: DOCTOR_COMMANDS.map((command) => {
      const handler: AnkhCommandHandler = (request) =>
        runCommandImpl(
          {
            argv: request.argv,
            command,
            context: request.context,
          },
          {
            services: options.services,
          },
        );

      return {
        path: command.path,
        handler,
      };
    }),
  } satisfies AnkhRuntimeCommandProvider;
}

const provider = createDoctorRuntimeProvider();

export default provider;
