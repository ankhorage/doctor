import packageJson from '../package.json';

export interface DoctorCommandContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly version: string;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export interface DoctorCommandRunResult {
  readonly exitCode: number;
}

export function createDefaultCommandContext(): DoctorCommandContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    version: packageJson.version,
    writeStdout(text: string) {
      process.stdout.write(text);
    },
    writeStderr(text: string) {
      process.stderr.write(text);
    },
  };
}
