# Status taxonomy

## Truth and observation

- `EXPECTED`: present in the Truth Graph.
- `OBSERVED`: captured from a source but not yet proven.
- `PROVEN`: supported by required trusted evidence.
- `NOT_PROVEN`: evidence is missing or insufficient.
- `CONTRADICTED`: deterministic observation conflicts with expectation.

## Verdicts

- `PASS`: expected behavior proven with required evidence.
- `FAIL`: deterministic or oracle evidence contradicts expectation.
- `NOT_PROVEN`: insufficient evidence for a conclusion.
- `BLOCKED`: execution could not proceed.
- `NOT_APPLICABLE`: requirement does not apply to this run.
- `NATIVE_DEFERRED`: cannot be faithfully validated in the current Expo Go
  environment and must be covered by standalone/EAS validation.

## Event connection

- `SUPPORTED_EVENT`: recorder has a real supported source.
- `NOT_YET_CONNECTED`: contract exists, source integration does not.
- `NATIVE_DEFERRED`: source requires native validation.

## Failure classifications

The supported classifications are `PRODUCT_DEFECT`, `TEST_DEFECT`,
`FIXTURE_DEFECT`, `AUTOMATION_DEFECT`, `SELECTOR_DEFECT`, `TIMING_DEFECT`,
`STATE_DEFECT`, `NAVIGATION_DEFECT`, `PROVIDER_DEPENDENCY`,
`NETWORK_DEPENDENCY`, `AUTH_DEPENDENCY`, `NATIVE_DEPENDENCY`,
`ENVIRONMENT_ISSUE`, and `NOT_PROVEN`.

