export type {
  DoctorAnalysisRequest,
  DoctorAnalysisResult,
  DoctorFixPlan,
  DoctorPlannedChange,
  DoctorPlannedChangeKind,
  DoctorTargetCheck,
  DoctorTargetMode,
} from './analysis.js';
export { analyzeDoctorTarget } from './analysis.js';
export { analyzeDoctorTargetWithCliLayout } from './cliLayoutAnalysis.js';
export { runCli } from './cli/standalone.js';
export {
  createDoctorRuntimeProvider,
  type CreateDoctorRuntimeProviderOptions,
} from './cli/index.js';
export type { DoctorCommandContext, DoctorCommandRunResult } from './commandContext.js';
export { createDefaultCommandContext } from './commandContext.js';
export type {
  DoctorDiagnostic,
  DoctorDiagnosticCode,
  DoctorDiagnosticSeverity,
  DoctorPolicyProfile,
  DoctorRuleId,
} from './diagnostics.js';
export {
  DOCTOR_CAPABILITIES,
  DOCTOR_COMMAND_CATEGORY,
  DOCTOR_PACKAGE_METADATA,
  DOCTOR_PACKAGE_NAME,
  DOCTOR_PACKAGE_VERSION,
} from './packageMetadata.js';
