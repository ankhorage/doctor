import type { Capability } from '@ankhorage/contracts/capability';

export const CAPABILITIES = [
  {
    id: 'doctor.validate',
    owner: '@ankhorage/doctor',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
  },
  {
    id: 'doctor.fix',
    owner: '@ankhorage/doctor',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
  },
  {
    id: 'doctor.repo',
    owner: '@ankhorage/doctor',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
  },
  {
    id: 'doctor.package',
    owner: '@ankhorage/doctor',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
  },
] as const satisfies readonly Capability[];
