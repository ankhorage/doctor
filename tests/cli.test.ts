import type { AnkhDiscoveredPackage, AnkhLoadedProvider } from '@ankhorage/ankh';
import {
  createPackageRegistry,
  createProviderRegistry,
  runCli as runAnkhCli,
} from '@ankhorage/ankh';
import { describe, expect, test } from 'bun:test';

import { runCli } from '../src/cli.js';
import { createDoctorRuntimeProvider } from '../src/cli/index.js';
import { createCapturedCommandContext } from './testSupport.js';

describe('standalone cli and provider-backed dispatch', () => {
  test('prints help and version for the standalone CLI', async () => {
    const help = createCapturedCommandContext('/workspace', '9.9.9');
    const version = createCapturedCommandContext('/workspace', '9.9.9');

    expect((await runCli([], { context: help.context })).exitCode).toBe(0);
    expect(help.stdout.value).toContain('ankhorage-doctor <command> [path]');

    expect((await runCli(['--version'], { context: version.context })).exitCode).toBe(0);
    expect(version.stdout.value).toBe('9.9.9\n');
  });

  test('uses the shared command runner for standalone CLI dispatch', async () => {
    const captured = createCapturedCommandContext('/workspace');
    const calls: string[] = [];

    const result = await runCli(['validate', 'fixtures'], {
      context: captured.context,
      runCommandImpl(request) {
        calls.push(request.command.standaloneName);
        request.context.writeStdout(
          `ran:${request.command.standaloneName}:${request.argv.join(',')}\n`,
        );
        return Promise.resolve({ exitCode: 0 });
      },
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(['validate']);
    expect(captured.stdout.value).toContain('ran:validate:fixtures');
  });

  test('routes provider-backed dispatch through @ankhorage/ankh', async () => {
    const captured = createCapturedCommandContext('/workspace');
    const calls: string[] = [];
    const provider = createDoctorRuntimeProvider({
      runCommandImpl(request) {
        calls.push(request.command.standaloneName);
        request.context.writeStdout(`provider:${request.command.standaloneName}\n`);
        return Promise.resolve({ exitCode: 0 });
      },
    });

    const packageRegistry = createPackageRegistry([createDiscoveredPackage()]);
    const providerRegistry = createProviderRegistry([createLoadedProvider(provider)]);

    const result = await runAnkhCli(['doctor', 'repo', 'fixtures'], {
      context: captured.context,
      registry: packageRegistry,
      providerRegistry,
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(['repo']);
    expect(captured.stdout.value).toContain('provider:repo');
  });

  test('uses the same injected shared runner from both surfaces', async () => {
    const standalone = createCapturedCommandContext('/workspace');
    const providerContext = createCapturedCommandContext('/workspace');
    const calls: string[] = [];

    const runCommandImpl = (request: {
      readonly argv: readonly string[];
      readonly command: { readonly standaloneName: string };
      readonly context: { writeStdout(text: string): void };
    }) => {
      calls.push(request.command.standaloneName);
      request.context.writeStdout(`shared:${request.command.standaloneName}\n`);
      return Promise.resolve({ exitCode: 0 });
    };

    await runCli(['package', 'fixtures'], {
      context: standalone.context,
      runCommandImpl,
    });

    const provider = createDoctorRuntimeProvider({ runCommandImpl });
    const packageRegistry = createPackageRegistry([createDiscoveredPackage()]);
    const providerRegistry = createProviderRegistry([createLoadedProvider(provider)]);

    await runAnkhCli(['doctor', 'package', 'fixtures'], {
      context: providerContext.context,
      registry: packageRegistry,
      providerRegistry,
    });

    expect(calls).toEqual(['package', 'package']);
    expect(standalone.stdout.value).toContain('shared:package');
    expect(providerContext.stdout.value).toContain('shared:package');
  });
});

function createDiscoveredPackage(): AnkhDiscoveredPackage {
  return {
    metadata: {
      category: 'doctor',
      provider: './dist/cli/index.js',
      capabilities: ['doctor.validate', 'doctor.fix', 'doctor.repo', 'doctor.package'],
    },
    packageJsonPath: '/workspace/package.json',
    packageName: '@ankhorage/doctor',
    packageRoot: '/workspace',
    source: 'workspace',
  };
}

function createLoadedProvider(
  provider: ReturnType<typeof createDoctorRuntimeProvider>,
): AnkhLoadedProvider {
  return {
    discoveredPackage: createDiscoveredPackage(),
    manifest: {
      id: provider.id,
      category: provider.category,
      version: provider.version,
      capabilities: provider.capabilities,
      commands: provider.commands,
    },
    providerModuleDefaultExport: provider,
    providerModulePath: '/workspace/dist/cli/index.js',
    providerModuleUrl: 'file:///workspace/dist/cli/index.js',
  };
}
