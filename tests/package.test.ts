import type { AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { describe, expect, test } from 'bun:test';

import packageJson from '../package.json';

describe('package metadata', () => {
  test('publishes the expected Ankh metadata and bin entry', () => {
    const expectedAnkhMetadata = {
      category: 'doctor',
      provider: './dist/cli/index.js',
      capabilities: ['doctor.validate', 'doctor.fix', 'doctor.repo', 'doctor.package'],
    } as const satisfies AnkhPackageMetadata;

    expect(packageJson.name).toBe('@ankhorage/doctor');
    expect(packageJson.type).toBe('module');
    expect(packageJson.bin).toEqual({
      'ankhorage-doctor': './dist/cli/standalone.js',
    });
    expect(JSON.stringify(packageJson.ankh)).toBe(JSON.stringify(expectedAnkhMetadata));
    expect(JSON.parse(JSON.stringify(expectedAnkhMetadata))).toEqual(expectedAnkhMetadata);

    const capabilityText = JSON.stringify(packageJson.ankh.capabilities);
    expect(capabilityText).not.toContain('doctor.github.validate');
    expect(capabilityText).not.toContain('doctor.ci.validate');
  });
});
