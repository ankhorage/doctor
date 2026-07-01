# Public API

## analyzeDoctorTarget

Kind: `function`
Module: `src/analysis.ts`
Source: `src/analysis.ts:35:1`

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
Module: `src/ankh.provider.ts`
Source: `src/ankh.provider.ts:22:1`

### Signatures

- `(options?: CreateDoctorRuntimeProviderOptions) => AnkhRuntimeCommandProvider`
  - options: `CreateDoctorRuntimeProviderOptions` (optional)
  - returns: `AnkhRuntimeCommandProvider`

## CreateDoctorRuntimeProviderOptions

Kind: `type`
Module: `src/ankh.provider.ts`
Source: `src/ankh.provider.ts:17:1`

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
Source: `src/analysis.ts:9:1`

### Members

| Name      | Kind     | Type                  | Required | Description |
| --------- | -------- | --------------------- | -------- | ----------- |
| cwd       | property | `string`              | yes      |             |
| inputPath | property | `string \| undefined` | no       |             |
| mode      | property | `DoctorTargetMode`    | yes      |             |

## DoctorAnalysisResult

Kind: `type`
Module: `src/analysis.ts`
Source: `src/analysis.ts:15:1`

### Members

| Name           | Kind     | Type                           | Required | Description |
| -------------- | -------- | ------------------------------ | -------- | ----------- |
| appliedChecks  | property | `readonly DoctorTargetCheck[]` | yes      |             |
| diagnostics    | property | `readonly DoctorDiagnostic[]`  | yes      |             |
| hasPackageJson | property | `boolean`                      | yes      |             |
| repoMarkers    | property | `readonly string[]`            | yes      |             |
| targetPath     | property | `string`                       | yes      |             |

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
Source: `src/diagnostics.ts:20:1`

### Members

| Name     | Kind     | Type                       | Required | Description |
| -------- | -------- | -------------------------- | -------- | ----------- |
| code     | property | `DoctorDiagnosticCode`     | yes      |             |
| message  | property | `string`                   | yes      |             |
| path     | property | `string`                   | yes      |             |
| severity | property | `DoctorDiagnosticSeverity` | yes      |             |

## DoctorDiagnosticCode

Kind: `unknown`
Module: `src/diagnostics.ts`
Source: `src/diagnostics.ts:1:1`

## DoctorDiagnosticSeverity

Kind: `unknown`
Module: `src/diagnostics.ts`
Source: `src/diagnostics.ts:18:1`

## DoctorTargetCheck

Kind: `unknown`
Module: `src/analysis.ts`
Source: `src/analysis.ts:6:1`

## DoctorTargetMode

Kind: `unknown`
Module: `src/analysis.ts`
Source: `src/analysis.ts:7:1`

## runCli

Kind: `function`
Module: `src/cli.ts`
Source: `src/cli.ts:20:1`

### Signatures

- `(argv: readonly string[], options?: DoctorCliOptions) => Promise<DoctorCommandRunResult>`
  - argv: `readonly string[]`
  - options: `DoctorCliOptions` (optional)
  - returns: `Promise<DoctorCommandRunResult>`
