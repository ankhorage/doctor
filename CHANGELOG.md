# Changelog

## 0.7.1

### Patch Changes

- 628d468: Update DEVTOOLS

## 0.7.0

### Minor Changes

- 9cdfeaf: Validate canonical secret-store selection and OAuth credential references, reject inline secret values, duplicate provider IDs, invalid callback routes, and enabled OAuth providers without a configured secret store.

## 0.6.0

### Minor Changes

- aa57950: Validate app manifest JSON files against the canonical `infra.auth.flow` contract, normalize omitted flow values through the contracts resolver, reject removed `settings.authFlow` configuration with a manual-migration diagnostic, and validate authorization only when it is explicitly configured.

## 0.5.0

### Minor Changes

- 23a5302: Validate canonical `./cli` exports, reject `@ankh/*` workspace aliases and active `ankhorage4` source references, and enforce direct Studio ownership of runtime and drag-and-drop packages.

## 0.4.0

### Minor Changes

- 1d1a8fd: Enforce the canonical `src/cli/index.ts` provider layout, reject root `src/cli.ts` files, and move the Doctor standalone executable under `src/cli/`.

## 0.3.1

### Patch Changes

- 0c1f5c2: Expose the package command provider.

## 0.3.0

### Minor Changes

- 0c86ddb: Add a profile-based doctor policy engine with non-mutating fix plans.

## 0.2.1

### Patch Changes

- d514f5f: Trigger release

## 0.2.0

### Minor Changes

- ab58890: Bootstrap `@ankhorage/doctor` as an executable Ankh provider and standalone CLI with lightweight repo/package diagnostics.

All notable changes to this project will be documented in this file.
