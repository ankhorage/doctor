import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function abs(relativePath) {
  return path.join(root, relativePath);
}

async function read(relativePath) {
  return fs.readFile(abs(relativePath), 'utf8');
}

async function write(relativePath, content) {
  const target = abs(relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function replaceOnce(source, search, replacement, filePath) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`${filePath}: expected exactly one ${JSON.stringify(search)}, found ${count}`);
  }
  return source.replace(search, replacement);
}

const oldCliPath = 'src/cli.ts';
const standaloneCliPath = 'src/cli/standalone.ts';
const oldCli = await read(oldCliPath);
const standaloneCli = oldCli
  .replaceAll("from './commandContext.js'", "from '../commandContext.js'")
  .replaceAll("from './commands.js'", "from '../commands.js'");
await write(standaloneCliPath, standaloneCli);
await fs.rm(abs(oldCliPath));

const packageJsonPath = 'package.json';
const packageJson = JSON.parse(await read(packageJsonPath));
packageJson.bin['ankhorage-doctor'] = './dist/cli/standalone.js';
await write(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

for (const filePath of ['src/index.ts', 'src/readme-usage.ts', 'README.md']) {
  const source = await read(filePath);
  const next = source.replaceAll("'./cli.js'", "'./cli/standalone.js'");
  if (next === source) {
    throw new Error(`${filePath}: standalone CLI import was not updated`);
  }
  await write(filePath, next);
}

{
  const filePath = 'tests/cli.test.ts';
  const source = await read(filePath);
  const next = replaceOnce(
    source,
    "import { runCli } from '../src/cli.js';",
    "import { runCli } from '../src/cli/standalone.js';",
    filePath,
  );
  await write(filePath, next);
}

{
  const filePath = 'src/diagnostics.ts';
  const source = await read(filePath);
  const next = replaceOnce(
    source,
    "  | 'package.ankh.required-for-provider'\n",
    "  | 'package.ankh.required-for-provider'\n  | 'package.cli.index.required'\n  | 'package.cli.root-file.disallowed'\n",
    filePath,
  );
  await write(filePath, next);
}

{
  const filePath = 'src/analysis.ts';
  let source = await read(filePath);
  source = replaceOnce(
    source,
    "] as const;\n\nexport async function analyzeDoctorTarget",
    "] as const;\nconst LEGACY_ROOT_CLI_SOURCE = path.join('src', 'cli.ts');\nconst CANONICAL_CLI_INDEX_SOURCE = path.join('src', 'cli', 'index.ts');\n\nexport async function analyzeDoctorTarget",
    filePath,
  );
  source = replaceOnce(
    source,
    "  const diagnostics: DoctorDiagnostic[] = [];\n  const { packageJson } = request;\n\n  if (request.profile === 'public-package') {",
    "  const diagnostics: DoctorDiagnostic[] = [];\n  const { packageJson } = request;\n\n  diagnostics.push(\n    ...(await validateCliLayout({\n      packageJson,\n      profile: request.profile,\n      targetPath: request.targetPath,\n    })),\n  );\n\n  if (request.profile === 'public-package') {",
    filePath,
  );
  source = replaceOnce(
    source,
    "async function validateAnkhMetadataAndProvider(request: {",
    `async function validateCliLayout(request: {\n  readonly packageJson: Record<string, unknown>;\n  readonly profile: DoctorPolicyProfile;\n  readonly targetPath: string;\n}): Promise<DoctorDiagnostic[]> {\n  const diagnostics: DoctorDiagnostic[] = [];\n  const legacyRootCliPath = path.join(request.targetPath, LEGACY_ROOT_CLI_SOURCE);\n  const canonicalCliIndexPath = path.join(request.targetPath, CANONICAL_CLI_INDEX_SOURCE);\n\n  if (await pathExists(legacyRootCliPath)) {\n    diagnostics.push(\n      createDiagnostic({\n        code: 'field-invalid',\n        message: 'Package CLI code must live under src/cli/; root src/cli.ts is not allowed.',\n        path: legacyRootCliPath,\n        profile: request.profile,\n        ruleId: 'package.cli.root-file.disallowed',\n        severity: 'error',\n      }),\n    );\n  }\n\n  const metadata = isRecord(request.packageJson.ankh) ? request.packageJson.ankh : null;\n  const exportsField = isRecord(request.packageJson.exports) ? request.packageJson.exports : null;\n  const exposesCliProvider =\n    (metadata !== null && isNonEmptyString(metadata.provider)) ||\n    (exportsField !== null && exportsField['./cli'] !== undefined);\n\n  if (exposesCliProvider && !(await pathExists(canonicalCliIndexPath))) {\n    diagnostics.push(\n      createDiagnostic({\n        code: 'missing-path',\n        message: 'CLI-capable packages must expose their provider from src/cli/index.ts.',\n        path: canonicalCliIndexPath,\n        profile: request.profile,\n        ruleId: 'package.cli.index.required',\n        severity: 'error',\n      }),\n    );\n  }\n\n  return diagnostics;\n}\n\nasync function validateAnkhMetadataAndProvider(request: {`,
    filePath,
  );
  await write(filePath, source);
}

{
  const filePath = 'tests/commands.test.ts';
  let source = await read(filePath);
  const insertionPoint = "  test('provider package without package.json.ankh fails', async () => {";
  const tests = `  test('rejects root src/cli.ts files', async () => {\n    const fixture = await createDoctorFixture({\n      packageJson: createValidPublicPackageJson({\n        docsScript: 'echo docs',\n      }),\n      withGitDir: true,\n      withWorkflows: true,\n      withChangeset: true,\n      withReadme: true,\n      withChangelog: true,\n      withLicense: true,\n      extraFiles: {\n        'src/cli.ts': 'export {};\\n',\n      },\n    });\n    const captured = createCapturedCommandContext(fixture);\n\n    const result = await runDoctorCommand({\n      argv: [],\n      command: getCommand('validate'),\n      context: captured.context,\n    });\n\n    expect(result.exitCode).toBe(1);\n    expect(captured.stdout.value).toContain('package.cli.root-file.disallowed');\n  });\n\n  test('requires src/cli/index.ts for CLI-capable packages', async () => {\n    const fixture = await createDoctorFixture({\n      packageJson: {\n        ...createValidPublicPackageJson({\n          docsScript: 'echo docs',\n        }),\n        ankh: {\n          category: 'example',\n          provider: './dist/cli/index.js',\n          capabilities: [],\n        },\n      },\n      withGitDir: true,\n      withWorkflows: true,\n      withChangeset: true,\n      withReadme: true,\n      withChangelog: true,\n      withLicense: true,\n    });\n    const captured = createCapturedCommandContext(fixture);\n\n    const result = await runDoctorCommand({\n      argv: [],\n      command: getCommand('validate'),\n      context: captured.context,\n    });\n\n    expect(result.exitCode).toBe(1);\n    expect(captured.stdout.value).toContain('package.cli.index.required');\n  });\n\n  test('accepts the canonical src/cli/index.ts provider layout', async () => {\n    const fixture = await createDoctorFixture({\n      packageJson: {\n        ...createValidPublicPackageJson({\n          docsScript: 'echo docs',\n        }),\n        ankh: {\n          category: 'example',\n          provider: './dist/cli/index.js',\n          capabilities: [],\n        },\n      },\n      withGitDir: true,\n      withWorkflows: true,\n      withChangeset: true,\n      withReadme: true,\n      withChangelog: true,\n      withLicense: true,\n      extraFiles: {\n        'src/cli/index.ts': 'export default {};\\n',\n      },\n    });\n    const captured = createCapturedCommandContext(fixture);\n\n    const result = await runDoctorCommand({\n      argv: [],\n      command: getCommand('validate'),\n      context: captured.context,\n    });\n\n    expect(result.exitCode).toBe(0);\n    expect(captured.stdout.value).not.toContain('package.cli.index.required');\n    expect(captured.stdout.value).not.toContain('package.cli.root-file.disallowed');\n  });\n\n`;
  source = replaceOnce(source, insertionPoint, `${tests}${insertionPoint}`, filePath);
  source = replaceOnce(
    source,
    "        'src/ankh.provider.ts': createProviderSource({\n          capabilities: ['doctor.validate'],\n          commandCapabilities: ['doctor.validate'],\n        }),\n      },\n    });\n    const captured = createCapturedCommandContext(fixture);\n\n    const result = await runDoctorCommand({\n      argv: [],\n      command: getCommand('validate'),\n      context: captured.context,\n    });\n\n    expect(result.exitCode).toBe(1);\n    expect(captured.stdout.value).toContain('package.ankh.capabilities.match-provider');",
    "        'src/ankh.provider.ts': createProviderSource({\n          capabilities: ['doctor.validate'],\n          commandCapabilities: ['doctor.validate'],\n        }),\n        'src/cli/index.ts': 'export {};\\n',\n      },\n    });\n    const captured = createCapturedCommandContext(fixture);\n\n    const result = await runDoctorCommand({\n      argv: [],\n      command: getCommand('validate'),\n      context: captured.context,\n    });\n\n    expect(result.exitCode).toBe(1);\n    expect(captured.stdout.value).toContain('package.ankh.capabilities.match-provider');",
    filePath,
  );
  source = replaceOnce(
    source,
    "        'src/ankh.provider.ts': createProviderSource({\n          capabilities: ['doctor.validate'],\n          commandCapabilities: ['doctor.validate'],\n          handlerPaths: [],\n        }),\n      },",
    "        'src/ankh.provider.ts': createProviderSource({\n          capabilities: ['doctor.validate'],\n          commandCapabilities: ['doctor.validate'],\n          handlerPaths: [],\n        }),\n        'src/cli/index.ts': 'export {};\\n',\n      },",
    filePath,
  );
  await write(filePath, source);
}

await write(
  '.changeset/calm-cli-folders.md',
  `---\n'@ankhorage/doctor': minor\n---\n\nEnforce the canonical \`src/cli/index.ts\` provider layout, reject root \`src/cli.ts\` files, and move the Doctor standalone CLI under \`src/cli/\`.\n`,
);
