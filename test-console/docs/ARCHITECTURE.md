# Architecture

## Component boundaries

```text
Test Console UI
  -> Scenario/World services
  -> Run coordinator
  -> Evidence and event recorders
  -> Truth Graph
  -> Oracle engine
  -> AI Test Agent
  -> Defect and repair handoff
  -> Retest/regression coordinator
```

The console owns test metadata and evidence aggregation. An adapter will later
connect to the real Priya app; the adapter must never become the source of truth
for deterministic fixtures. The AI agent can investigate and explain, but cannot
invent evidence or directly modify Priya code.

## Evidence flow

Every requirement is represented as:

```text
REQUIREMENT -> REQUIRED EVIDENCE -> OBSERVATION -> ORACLE -> VERDICT
```

`TruthGraph.evidenceRequirements` defines the minimum trusted evidence and source
for each expectation. A result with missing evidence is `NOT_PROVEN`. A
contradictory deterministic observation produces `FAIL`, even if semantic or
visual interpretation says otherwise.

## Test World

A world has a deterministic seed/reference, account ownership, companion entity
ownership, and an explicit reset contract. Every state snapshot, event, and
evidence item carries world and account ownership. Cross-world or cross-account
evidence is rejected.

Prompt 0 defines reset capability but does not implement a reset engine. The
current contract marks reset as unsupported until a deterministic fixture
provider exists.

## Truth Graph and snapshots

The graph contains preconditions, ordered actions, expected state, expected
events, expected UI, semantic meaning, invariants, allowed variations, and
evidence requirements. Snapshots compare expected and observed state without
flattening the two into a single value.

## Events

Events are recorded with `SUPPORTED_EVENT`, `NOT_YET_CONNECTED`, or
`NATIVE_DEFERRED`. Prompt 0 does not claim Priya currently emits any of these
events. Native-only behavior must remain `NATIVE_DEFERRED`, not PASS or FAIL.

## Oracle architecture

`Oracle` is the common contract for exact, state, event, invariant, semantic,
visual, and temporal implementations. The semantic extension returns
`CORRECT_MEANING`, `INCORRECT_MEANING`, `AMBIGUOUS`, or
`INSUFFICIENT_EVIDENCE`; no semantic AI implementation is included in Prompt 0.

## Agent and defect lifecycle

The agent coordinates a run, gathers evidence, evaluates oracles, investigates
failures, creates a repair brief, and requests a targeted retest. Defect records
carry classification, confidence, reproduction count, evidence references,
suspected layer, root-cause fields, and separate retest/regression statuses.

```text
ORIGINAL TEST -> FAILURE -> REPAIR -> TARGETED RETEST -> RELATED REGRESSION TESTS
```

Passing only the original test is insufficient for verified repair.

## Protection rules

- This package must remain independent of Priya application source.
- `REFERENCE_READONLY`, the old project, and `PriyaCompanion-QA` are outside its
  write scope.
- No fake PASS result may be persisted.
- No evidence means no PASS.
- Deterministic contradiction wins over AI opinion.
- One transient failure is not a confirmed defect.
- Infrastructure, provider, auth, network, native, and environment failures are
  classified separately from product defects.

