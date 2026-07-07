import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';
import { describe, expect, test } from 'bun:test';

import provider, { createDoctorRuntimeProvider } from '../src/cli/index.js';
import { createProviderCommandDescriptors, DOCTOR_COMMANDS } from '../src/commands.js';

describe('doctor package provider', () => {
  test('publishes the expected runtime provider shape', () => {
    const expectedProvider = createDoctorRuntimeProvider() satisfies AnkhRuntimeCommandProvider;

    expect(expectedProvider.id).toBe('@ankhorage/doctor');
    expect(expectedProvider.category).toBe('doctor');
    expect(expectedProvider.capabilities).toEqual([
      'doctor.validate',
      'doctor.fix',
      'doctor.repo',
      'doctor.package',
    ]);
    expect(expectedProvider.commands).toEqual(createProviderCommandDescriptors());
    expect(expectedProvider.handlers?.map((handler) => handler.path.join(' '))).toEqual(
      DOCTOR_COMMANDS.map((command) => command.path.join(' ')),
    );
    expect(JSON.stringify(expectedProvider)).not.toContain('doctor.github.validate');
    expect(JSON.stringify(expectedProvider)).not.toContain('doctor.ci.validate');
  });

  test('default export is the runtime provider', () => {
    expect(provider.category).toBe('doctor');
    expect(provider.commands).toHaveLength(4);
    expect(provider.handlers).toHaveLength(4);
  });

  test('keeps provider descriptors aligned with the shared command table', () => {
    expect(createProviderCommandDescriptors()).toEqual(
      DOCTOR_COMMANDS.map((command) => ({
        capability: command.capability,
        path: command.path,
        summary: command.summary,
      })),
    );
  });
});
