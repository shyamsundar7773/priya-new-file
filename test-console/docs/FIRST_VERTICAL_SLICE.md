# First vertical slice contract

Scenario: `scenario-memory-favorite-food`

1. Create a clean isolated world with a deterministic seed.
2. Create synthetic Account A and owned Priya companion.
3. Establish `favorite_food = biryani` through a deterministic fixture.
4. Capture a state snapshot and fixture evidence.
5. Record a `MEMORY_CREATED` event when the event source is connected.
6. Use the real Priya app and capture response UI evidence.
7. Ask a future semantic oracle to evaluate the response meaning.
8. Correlate the Truth Graph, state, event, UI, and semantic evidence.
9. Emit `PASS` only when all required evidence is trusted and present.

Negative contract:

- Expected: `favorite_food = biryani`
- Observed: `favorite_food = dosa`
- Required classification: semantic contradiction / `FAIL`, with evidence
  references. It must not be reported as only a screen mismatch.

Prompt 0 defines this contract only. The real app integration, deterministic
fixture setup, event connection, semantic evaluator, and actual PASS/FAIL
execution are `NOT_PROVEN`.

