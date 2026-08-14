import type { AuthOAuthProviderId, AuthOAuthTransportId } from '@ankhorage/contracts/auth';
import type { AppDeployEnvironmentId, AppDeployTargetId } from '@ankhorage/contracts/deploy';

export type DoctorReadinessStatus = 'missing' | 'ready' | 'unsupported';

export interface DoctorReadiness {
  readonly callbackScheme?: string;
  readonly category: 'auth-oauth';
  readonly environment: AppDeployEnvironmentId;
  readonly hostRequirement?: 'development-or-standalone-build';
  readonly message: string;
  readonly provider: AuthOAuthProviderId;
  readonly status: DoctorReadinessStatus;
  readonly target: AppDeployTargetId;
  readonly transport: AuthOAuthTransportId;
}
