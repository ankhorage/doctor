import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
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
