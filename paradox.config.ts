import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
    title: 'DOCTOR',
    description:
      'Executable doctor provider and standalone CLI for lightweight Ankhorage repo and package compliance diagnostics.',
    usage: {
      entrypoints: ['src/readme-usage.ts'],
    },
  },
  package: {
    root: '.',
    entrypoints: ['src/index.ts'],
  },
  output: {
    dir: './paradox',
  },
});
