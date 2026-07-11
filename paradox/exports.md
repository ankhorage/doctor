# Public API

## analyzeAppManifest

Kind: `function`
Module: `src/manifestAnalysis.ts`
Source: `src/manifestAnalysis.ts:112:1`

### Signatures

- `(manifest: unknown, manifestPath?: string) => DoctorDiagnostic[]`
  - manifest: `unknown`
  - manifestPath: `string` (optional)
  - returns: `DoctorDiagnostic[]`

## analyzeAppManifestFile

Kind: `function`
Module: `src/manifestAnalysis.ts`
Source: `src/manifestAnalysis.ts:78:1`

### Signatures

- `(filePath: string) => Promise<DoctorDiagnostic[]>`
  - filePath: `string`
  - returns: `Promise<DoctorDiagnostic[]>`

## analyzeAppManifestTarget

Kind: `function`
Module: `src/manifestAnalysis.ts`
Source: `src/manifestAnalysis.ts:39:1`

### Signatures

- `(request: DoctorAnalysisRequest) => Promise<DoctorAnalysisResult | null>`
  - request: `DoctorAnalysisRequest`
  - returns: `Promise<DoctorAnalysisResult | null>`

## analyzeDoctorTarget

Kind: `function`
Module: `src/analysis.ts`
Source: `src/analysis.ts:86:1`

### Signatures

- `(request: DoctorAnalysisRequest) => Promise<DoctorAnalysisResult>`
  - request: `DoctorAnalysisRequest`
  - returns: `Promise<DoctorAnalysisResult>`

## analyzeDoctorTargetWithCliLayout

Kind: `function`
Module: `src/cliLayoutAnalysis.ts`
Source: `src/cliLayoutAnalysis.ts:63:1`

### Signatures

- `(request: DoctorAnalysisRequest) => Promise<DoctorAnalysisResult>`
  - request: `DoctorAnalysisRequest`
  - returns: `Promise<DoctorAnalysisResult>`

## createDefaultCommandContext

Kind: `function`
Module: `src/commandContext.ts`
Source: `src/commandContext.ts:15:1`

### Signatures

- `() => DoctorCommandContext`
  - returns: `DoctorCommandContext`

## createDoctorRuntimeProvider

Kind: `function`
Module: `src/cli/index.ts`
Source: `src/cli/index.ts:23:1`

### Signatures

- `(options?: CreateDoctorRuntimeProviderOptions) => AnkhRuntimeCommandProvider`
  - options: `CreateDoctorRuntimeProviderOptions` (optional)
  - returns: `AnkhRuntimeCommandProvider`

## CreateDoctorRuntimeProviderOptions

Kind: `type`
Module: `src/cli/index.ts`
Source: `src/cli/index.ts:18:1`

### Members

| Name           | Kind     | Type                                          | Required | Description |
| -------------- | -------- | --------------------------------------------- | -------- | ----------- |
| runCommandImpl | property | `RunDoctorCommandImpl \| undefined`           | no       |             |
| services       | property | `Partial<DoctorCommandServices> \| undefined` | no       |             |

## DOCTOR_CAPABILITIES

Kind: `value`
Module: `src/packageMetadata.ts`
Source: `src/packageMetadata.ts:12:14`

## DOCTOR_COMMAND_CATEGORY

Kind: `value`
Module: `src/packageMetadata.ts`
Source: `src/packageMetadata.ts:11:14`

## DOCTOR_PACKAGE_METADATA

Kind: `value`
Module: `src/packageMetadata.ts`
Source: `src/packageMetadata.ts:19:14`

## DOCTOR_PACKAGE_NAME

Kind: `value`
Module: `src/packageMetadata.ts`
Source: `src/packageMetadata.ts:9:14`

## DOCTOR_PACKAGE_VERSION

Kind: `value`
Module: `src/packageMetadata.ts`
Source: `src/packageMetadata.ts:10:14`

## DoctorAnalysisRequest

Kind: `type`
Module: `src/analysis.ts`
Source: `src/analysis.ts:12:1`

### Members

| Name      | Kind     | Type                  | Required | Description |
| --------- | -------- | --------------------- | -------- | ----------- |
| cwd       | property | `string`              | yes      |             |
| inputPath | property | `string \| undefined` | no       |             |
| mode      | property | `DoctorTargetMode`    | yes      |             |

## DoctorAnalysisResult

Kind: `type`
Module: `src/analysis.ts`
Source: `src/analysis.ts:33:1`

### Members

| Name           | Kind     | Type                             | Required | Description |
| -------------- | -------- | -------------------------------- | -------- | ----------- |
| appliedChecks  | property | `readonly DoctorTargetCheck[]`   | yes      |             |
| diagnostics    | property | `readonly DoctorDiagnostic[]`    | yes      |             |
| fixPlan        | property | `DoctorFixPlan \| null`          | yes      |             |
| hasPackageJson | property | `boolean`                        | yes      |             |
| plannedChanges | property | `readonly DoctorPlannedChange[]` | yes      |             |
| profile        | property | `DoctorPolicyProfile`            | yes      |             |
| repoMarkers    | property | `readonly string[]`              | yes      |             |
| targetPath     | property | `string`                         | yes      |             |

## DoctorCommandContext

Kind: `type`
Module: `src/commandContext.ts`
Source: `src/commandContext.ts:3:1`

### Members

| Name        | Kind     | Type                     | Required | Description |
| ----------- | -------- | ------------------------ | -------- | ----------- |
| cwd         | property | `string`                 | yes      |             |
| env         | property | `NodeJS.ProcessEnv`      | yes      |             |
| version     | property | `string`                 | yes      |             |
| writeStderr | method   | `(text: string) => void` | yes      |             |
| writeStdout | method   | `(text: string) => void` | yes      |             |

## DoctorCommandRunResult

Kind: `type`
Module: `src/commandContext.ts`
Source: `src/commandContext.ts:11:1`

### Members

| Name     | Kind     | Type     | Required | Description |
| -------- | -------- | -------- | -------- | ----------- |
| exitCode | property | `number` | yes      |             |

## DoctorDiagnostic

Kind: `type`
Module: `src/diagnostics.ts`
Source: `src/diagnostics.ts:103:1`

### Members

| Name     | Kind     | Type                       | Required | Description |
| -------- | -------- | -------------------------- | -------- | ----------- |
| code     | property | `DoctorDiagnosticCode`     | yes      |             |
| message  | property | `string`                   | yes      |             |
| path     | property | `string`                   | yes      |             |
| profile  | property | `DoctorPolicyProfile`      | yes      |             |
| ruleId   | property | `DoctorRuleId`             | yes      |             |
| severity | property | `DoctorDiagnosticSeverity` | yes      |             |

## DoctorDiagnosticCode

Kind: `unknown`
Module: `src/diagnostics.ts`
Source: `src/diagnostics.ts:1:1`

## DoctorDiagnosticSeverity

Kind: `unknown`
Module: `src/diagnostics.ts`
Source: `src/diagnostics.ts:16:1`

## DoctorFixPlan

Kind: `type`
Module: `src/analysis.ts`
Source: `src/analysis.ts:26:1`

### Members

| Name        | Kind     | Type                             | Required | Description |
| ----------- | -------- | -------------------------------- | -------- | ----------- |
| changes     | property | `readonly DoctorPlannedChange[]` | yes      |             |
| diagnostics | property | `readonly DoctorDiagnostic[]`    | yes      |             |
| profile     | property | `DoctorPolicyProfile`            | yes      |             |
| targetPath  | property | `string`                         | yes      |             |

## DoctorPlannedChange

Kind: `type`
Module: `src/analysis.ts`
Source: `src/analysis.ts:18:1`

### Members

| Name        | Kind     | Type                      | Required | Description |
| ----------- | -------- | ------------------------- | -------- | ----------- |
| description | property | `string`                  | yes      |             |
| filePath    | property | `string`                  | yes      |             |
| kind        | property | `DoctorPlannedChangeKind` | yes      |             |
| ruleId      | property | `DoctorRuleId`            | yes      |             |
| safe        | property | `boolean`                 | yes      |             |

## DoctorPlannedChangeKind

Kind: `unknown`
Module: `src/analysis.ts`
Source: `src/analysis.ts:9:1`

## DoctorPolicyProfile

Kind: `unknown`
Module: `src/diagnostics.ts`
Source: `src/diagnostics.ts:17:1`

## DoctorRuleId

Kind: `unknown`
Module: `src/diagnostics.ts`
Source: `src/diagnostics.ts:19:1`

## DoctorTargetCheck

Kind: `unknown`
Module: `src/analysis.ts`
Source: `src/analysis.ts:7:1`

## DoctorTargetMode

Kind: `unknown`
Module: `src/analysis.ts`
Source: `src/analysis.ts:8:1`

## runCli

Kind: `function`
Module: `src/cli/standalone.ts`
Source: `src/cli/standalone.ts:21:1`

### Signatures

- `(argv: readonly string[], options?: DoctorCliOptions) => Promise<DoctorCommandRunResult>`
  - argv: `readonly string[]`
  - options: `DoctorCliOptions` (optional)
  - returns: `Promise<DoctorCommandRunResult>`
