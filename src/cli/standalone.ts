#!/usr/bin/env bun

import type { DoctorCommandContext, DoctorCommandRunResult } from '../commandContext.js';
import { createDefaultCommandContext } from '../commandContext.js';
import {
  type DoctorCommandServices,
  findDoctorCommandByStandaloneName,
  renderRootHelp,
  renderUnknownCommand,
  runDoctorCommand,
  type RunDoctorCommandImpl,
} from '../commands.js';
import { analyzeDoctorTargetWithCliLayout } from '../cliLayoutAnalysis.js';

export interface DoctorCliOptions {
  readonly context?: DoctorCommandContext;
  readonly runCommandImpl?: RunDoctorCommandImpl;
  readonly services?: Partial<DoctorCommandServices>;
}

export async function runCli(
  argv: readonly string[],
  options: DoctorCliOptions = {},
): Promise<DoctorCommandRunResult> {
  const context = options.context ?? createDefaultCommandContext();
  const runCommand = options.runCommandImpl ?? runDoctorCommand;
  const [firstToken, ...restTokens] = argv;

  if (firstToken === undefined || isHelpToken(firstToken)) {
    context.writeStdout(renderRootHelp(context.version));
    return { exitCode: 0 };
  }

  if (isVersionToken(firstToken)) {
    context.writeStdout(`${context.version}\n`);
    return { exitCode: 0 };
  }

  const command = findDoctorCommandByStandaloneName(firstToken);
  if (command === null) {
    context.writeStderr(renderUnknownCommand(firstToken));
    return { exitCode: 1 };
  }

  return runCommand(
    {
      argv: restTokens,
      command,
      context,
    },
    {
      services: {
        analyzeTarget: analyzeDoctorTargetWithCliLayout,
        ...options.services,
      },
    },
  );
}

function isHelpToken(value: string): boolean {
  return value === '--help' || value === '-h' || value === 'help';
}

function isVersionToken(value: string): boolean {
  return value === '--version' || value === '-v' || value === 'version';
}

if (import.meta.main) {
  const result = await runCli(process.argv.slice(2));
  process.exit(result.exitCode);
}
