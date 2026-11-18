import type { DoctorCommandDefinition } from './commands.js';

export interface DoctorCommandArguments {
  readonly enforceRepositoryMetadata: boolean;
  readonly inputPath?: string;
  readonly kind: 'run';
}

/*** Parse Doctor's single target path and explicit repository-metadata activation flag. */
export function parseDoctorCommandArguments(
  command: DoctorCommandDefinition,
  argv: readonly string[],
): { readonly kind: 'help' } | DoctorCommandArguments {
  const [firstArg] = argv;
  if (argv.length === 1 && firstArg !== undefined && isHelpToken(firstArg)) {
    return { kind: 'help' };
  }

  const enforceRepositoryMetadata = argv.includes('--enforce-repository-metadata');
  const pathArgs = argv.filter((argument) => argument !== '--enforce-repository-metadata');
  if (pathArgs.length > 1 || (enforceRepositoryMetadata && argv.length !== pathArgs.length + 1)) {
    throw new Error(`Doctor ${command.standaloneName} accepts at most one path argument.`);
  }

  return { enforceRepositoryMetadata, inputPath: pathArgs[0], kind: 'run' };
}

/*** Recognize shared standalone and provider command help spellings. */
function isHelpToken(value: string): boolean {
  return value === '--help' || value === '-h' || value === 'help';
}
