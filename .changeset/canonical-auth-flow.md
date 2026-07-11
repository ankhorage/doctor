---
'@ankhorage/doctor': minor
---

Validate app manifest JSON files against the canonical `infra.auth.flow` contract, normalize omitted flow values through the contracts resolver, reject removed `settings.authFlow` configuration with a manual-migration diagnostic, and validate authorization only when it is explicitly configured.
