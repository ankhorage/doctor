import type { AnkhCapabilityId, AnkhCommandDescriptor } from '@ankhorage/contracts/cli';

import type { DoctorAnalysisResult, DoctorPlannedChange, DoctorTargetMode } from './analysis.js';
import { analyzeDoctorTargetWithCliLayout } from './cliLayoutAnalysis.js';
import type { DoctorCommandContext, DoctorCommandRunResult } from './commandContext.js';
import {
  countErrorDiagnostics,
  countWarningDiagnostics,
  type DoctorDiagnostic,
} from './diagnostics.js';
import { DOCTOR_CAPABILITIES, DOCTOR_COMMAND_CATEGORY } from './packageMetadata.js';

type DoctorCommandName = 'fix' | 'package' | 'repo' | 'validate';

interface DoctorCommandRunRequest {
  readonly context: DoctorCommandContext;
  readonly inputPath?: string;
}

type DoctorCommandImplementation = (
  request: DoctorCommandRunRequest,
  services: DoctorCommandServices,
) => Promise<DoctorCommandRunResult>;

export interface DoctorCommandDefinition {
  readonly capability: AnkhCapabilityId;
  readonly mode: DoctorTargetMode;
  readonly path: readonly [DoctorCommandName];
  readonly standaloneName: DoctorCommandName;
  readonly summary: string;
  readonly run: DoctorCommandImplementation;
}

export interface DoctorCommandInvocation {
  readonly argv: readonly string[];
  readonly command: DoctorCommandDefinition;
  readonly context: DoctorCommandContext;
}

export interface DoctorCommandServices {
  readonly analyzeTarget: typeof analyzeDoctorTargetWithCliLayout;
}

export interface RunDoctorCommandOptions {
  readonly runCommandImpl?: RunDoctorCommandImpl;
  readonly services?: Partial<DoctorCommandServices>;
}

export type RunDoctorCommandImpl = (
  request: DoctorCommandInvocation,
  options?: RunDoctorCommandOptions,
) => Promise<DoctorCommandRunResult>;

const COMMAND_CAPABILITIES = {
  validate: DOCTOR_CAPABILITIES[0],
  fix: DOCTOR_CAPABILITIES[1],
  repo: DOCTOR_CAPABILITIES[2],
  package: DOCTOR_CAPABILITIES[3],
} as const satisfies Record<DoctorCommandName, AnkhCapabilityId>;

export const DOCTOR_COMMANDS = [
  {
    standaloneName: 'validate',
    path: ['validate'],
    capability: COMMAND_CAPABILITIES.validate,
    mode: 'validate',
    summary:
      'Validate a repo, package, or app-manifest JSON path with the applicable Doctor profile.',
    run: runValidateCommand,
  },
  {
    standaloneName: 'fix',
    path: ['fix'],
    capability: COMMAND_CAPABILITIES.fix,
    mode: 'fix',
    summary: 'Build a non-mutating fix plan for deterministic doctor policy violations.',
    run: runFixCommand,
  },
  {
    standaloneName: 'repo',
    path: ['repo'],
    capability: COMMAND_CAPABILITIES.repo,
    mode: 'repo',
    summary: 'Force repo-light diagnostics for a repo/workspace-root candidate path.',
    run: runRepoCommand,
  },
  {
    standaloneName: 'package',
    path: ['package'],
    capability: COMMAND_CAPABILITIES.package,
    mode: 'package',
    summary: 'Force package-light diagnostics for a directory containing package.json.',
    run: runPackageCommand,
  },
] as const satisfies readonly DoctorCommandDefinition[];

export async function runDoctorCommand(
  request: DoctorCommandInvocation,
  options: RunDoctorCommandOptions = {},
): Promise<DoctorCommandRunResult> {
  const services = createDoctorCommandServices(options.services);

  try {
    const parsedArgs = parseCommandArguments(request.command, request.argv);
    if (parsedArgs.kind === 'help') {
      request.context.writeStdout(renderCommandHelp(request.command));
      return { exitCode: 0 };
    }

    return await request.command.run(
      {
        context: request.context,
        inputPath: parsedArgs.inputPath,
      },
      services,
    );
  } catch (error) {
    request.context.writeStderr(renderCommandFailure(request.command.standaloneName, error));
    return { exitCode: 1 };
  }
}

export function createProviderCommandDescriptors(): readonly AnkhCommandDescriptor[] {
  return DOCTOR_COMMANDS.map((command) => ({
    capability: command.capability,
    path: command.path,
    summary: command.summary,
  }));
}

export function findDoctorCommandByStandaloneName(value: string): DoctorCommandDefinition | null {
  return DOCTOR_COMMANDS.find((command) => command.standaloneName === value) ?? null;
}

export function renderRootHelp(version: string): string {
  const commandLines = DOCTOR_COMMANDS.map(
    (command) => `  ${command.standaloneName.padEnd(8, ' ')} ${command.summary}`,
  ).join('\n');

  return [
    `@ankhorage/doctor v${version}`,
    '',
    'Usage:',
    '  ankhorage-doctor <command> [path]',
    `  ankh ${DOCTOR_COMMAND_CATEGORY} <command> [path]`,
    '',
    'Commands:',
    commandLines,
    '',
    'Path resolution:',
    '  Pass a repo/package directory or app-manifest JSON file, or omit [path] to inspect the current directory.',
    '',
  ].join('\n');
}

export function renderUnknownCommand(value: string): string {
  return [`Unknown doctor command: ${value}`, '', 'Run ankhorage-doctor --help', ''].join('\n');
}

function renderCommandHelp(command: DoctorCommandDefinition): string {
  return [
    command.summary,
    '',
    'Usage:',
    `  ankhorage-doctor ${command.standaloneName} [path]`,
    `  ankh ${DOCTOR_COMMAND_CATEGORY} ${command.path.join(' ')} [path]`,
    '',
    'Path resolution:',
    '  Pass a repo/package directory or app-manifest JSON file, or omit [path] to inspect the current directory.',
    '',
  ].join('\n');
}

function createDoctorCommandServices(
  overrides: Partial<DoctorCommandServices> = {},
): DoctorCommandServices {
  return {
    analyzeTarget: overrides.analyzeTarget ?? analyzeDoctorTargetWithCliLayout,
  };
}

function parseCommandArguments(
  command: DoctorCommandDefinition,
  argv: readonly string[],
): { readonly kind: 'help' } | { readonly kind: 'run'; readonly inputPath?: string } {
  const [firstArg] = argv;

  if (argv.length === 1 && firstArg !== undefined && isHelpToken(firstArg)) {
    return { kind: 'help' };
  }

  if (argv.length > 1) {
    throw new Error(`Doctor ${command.standaloneName} accepts at most one path argument.`);
  }

  return {
    kind: 'run',
    inputPath: firstArg,
  };
}

async function runValidateCommand(
  request: DoctorCommandRunRequest,
  services: DoctorCommandServices,
): Promise<DoctorCommandRunResult> {
  const result = await services.analyzeTarget({
    cwd: request.context.cwd,
    inputPath: request.inputPath,
    mode: 'validate',
  });

  request.context.writeStdout(renderAnalysisReport('validate', result));

  return {
    exitCode: countErrorDiagnostics(result.diagnostics) > 0 ? 1 : 0,
  };
}

async function runFixCommand(
  request: DoctorCommandRunRequest,
  services: DoctorCommandServices,
): Promise<DoctorCommandRunResult> {
  const result = await services.analyzeTarget({
    cwd: request.context.cwd,
    inputPath: request.inputPath,
    mode: 'fix',
  });

  request.context.writeStdout(renderAnalysisReport('fix', result));

  return {
    exitCode: countErrorDiagnostics(result.diagnostics) > 0 ? 1 : 0,
  };
}

async function runRepoCommand(
  request: DoctorCommandRunRequest,
  services: DoctorCommandServices,
): Promise<DoctorCommandRunResult> {
  const result = await services.analyzeTarget({
    cwd: request.context.cwd,
    inputPath: request.inputPath,
    mode: 'repo',
  });

  request.context.writeStdout(renderAnalysisReport('repo', result));

  return {
    exitCode: countErrorDiagnostics(result.diagnostics) > 0 ? 1 : 0,
  };
}

async function runPackageCommand(
  request: DoctorCommandRunRequest,
  services: DoctorCommandServices,
): Promise<DoctorCommandRunResult> {
  const result = await services.analyzeTarget({
    cwd: request.context.cwd,
    inputPath: request.inputPath,
    mode: 'package',
  });

  request.context.writeStdout(renderAnalysisReport('package', result));

  return {
    exitCode: countErrorDiagnostics(result.diagnostics) > 0 ? 1 : 0,
  };
}

function renderAnalysisReport(
  commandName: DoctorCommandName,
  result: DoctorAnalysisResult,
): string {
  const lines = [
    `doctor ${commandName}`,
    `target: ${result.targetPath}`,
    `profile: ${result.profile}`,
    `checks: ${result.appliedChecks.length > 0 ? result.appliedChecks.join(', ') : 'none'}`,
    `repoMarkers: ${result.repoMarkers.length > 0 ? result.repoMarkers.join(', ') : 'none'}`,
    '',
    'Diagnostics:',
  ];

  if (result.diagnostics.length === 0) {
    lines.push('  none');
  } else {
    for (const diagnostic of result.diagnostics) {
      lines.push(renderDiagnosticLine(diagnostic));
    }
  }

  if (commandName === 'fix') {
    lines.push('');
    lines.push('Planned changes:');

    if (result.plannedChanges.length === 0) {
      lines.push('  none');
    } else {
      for (const change of result.plannedChanges) {
        lines.push(renderPlannedChangeLine(change));
      }
    }
  }

  const errorCount = countErrorDiagnostics(result.diagnostics);
  const warningCount = countWarningDiagnostics(result.diagnostics);

  lines.push('');
  lines.push(`Summary: ${errorCount} error(s), ${warningCount} warning(s)`);
  lines.push('');

  return lines.join('\n');
}

function renderDiagnosticLine(diagnostic: DoctorDiagnostic): string {
  return `  - ${diagnostic.severity.toUpperCase()} ${diagnostic.ruleId} (${diagnostic.code}): ${diagnostic.message}`;
}

function renderPlannedChangeLine(change: DoctorPlannedChange): string {
  return `  - ${change.ruleId} [${change.kind}]: ${change.description}`;
}

function renderCommandFailure(commandName: DoctorCommandName, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return [`Failed to run doctor ${commandName}: ${message}`, ''].join('\n');
}

function isHelpToken(value: string): boolean {
  return value === '--help' || value === '-h' || value === 'help';
}
