import {
  EvidenceItem,
  EventRecorder,
  EvidenceRecorder,
  InMemoryTestConsole,
  MEMORY_FAVORITE_FOOD_SCENARIO,
  RecordedEvent,
  TestWorld,
  OracleResult,
  canClaimPass,
  enforceTruthGraphEvidence,
  finalizeVerdict,
} from "./index";

class MemoryRecorder<T extends { ownership: { worldId: string } }> {
  public constructor(private readonly values: T[] = []) {}
  public async record(value: T): Promise<void> {
    this.values.push(value);
  }
  public async list(worldId: string): Promise<T[]> {
    return this.values.filter((value) => value.ownership.worldId === worldId);
  }
}

function makeWorld(): TestWorld {
  return {
    worldId: "world-memory-001",
    accountId: "account-a",
    createdAt: new Date().toISOString(),
    deterministicSeed: "memory-favorite-food-seed",
    reference: "prompt-0-baseline",
    isolationBoundary: "account-a-only",
    reset: { supported: false, baselineReference: "clean-memory-baseline" },
    entities: {
      companions: ["companion-priya"],
      relationships: [],
      memories: ["memory-favorite-food"],
      chats: [],
      proactive: [],
      voice: [],
      groups: [],
      attachments: [],
    },
  };
}

function evidence(
  evidenceId: string,
  type: EvidenceItem["type"],
  requirementId: string,
  source: EvidenceItem["source"],
): EvidenceItem {
  return {
    evidenceId,
    type,
    capturedAt: new Date().toISOString(),
    ownership: {
      worldId: "world-memory-001",
      accountId: "account-a",
      companionId: "companion-priya",
    },
    source,
    trusted: true,
    summary: evidenceId,
    payload: {},
    supportsRequirementIds: [requirementId],
  };
}

async function main(): Promise<void> {
  const world = makeWorld();
  const eventRecorder = new MemoryRecorder<RecordedEvent>() as EventRecorder;
  const evidenceRecorder = new MemoryRecorder<EvidenceItem>() as EvidenceRecorder;
  const testConsole = new InMemoryTestConsole(eventRecorder, evidenceRecorder);
  testConsole.createWorld(world);
  testConsole.selectScenario(MEMORY_FAVORITE_FOOD_SCENARIO);

  const items = [
    evidence("state-memory", "state_snapshot", "expected-memory-fact", "test_console"),
    evidence("fixture-memory", "fixture", "expected-memory-fact", "fixture_provider"),
    evidence(
      "event-memory-created",
      "event",
      "expected-memory-created-event",
      "test_console",
    ),
    evidence("answer-screen", "screenshot", "expected-favorite-food-answer", "priya_app"),
    evidence(
      "answer-semantic",
      "semantic_evaluation",
      "expected-favorite-food-answer",
      "oracle",
    ),
  ];
  for (const item of items) {
    await evidenceRecorder.record(item);
  }
  enforceTruthGraphEvidence(MEMORY_FAVORITE_FOOD_SCENARIO.truthGraph, items);

  const passingResult: OracleResult = {
    oracleId: "oracle-memory-pass",
    kind: "semantic",
    requirementId: "expected-favorite-food-answer",
    expected: { favorite_food: "biryani" },
    observed: { favorite_food: "biryani" },
    result: "PASS",
    confidence: 0.95,
    evidenceReferences: ["answer-screen", "answer-semantic"],
    explanation: "Contract-only semantic result supplied by a future oracle.",
  };
  if (!canClaimPass([passingResult], items)) {
    throw new Error("A fully evidenced contract result should be pass-eligible.");
  }
  if (finalizeVerdict(passingResult, true, false) !== "PASS") {
    throw new Error("Expected a proven result to remain PASS.");
  }
  if (finalizeVerdict(passingResult, false, false) !== "NOT_PROVEN") {
    throw new Error("Missing evidence must not become PASS.");
  }
  if (finalizeVerdict(passingResult, true, true) !== "FAIL") {
    throw new Error("Contradictory deterministic evidence must override AI opinion.");
  }
  const observed = await testConsole.inspectEvidence(world.worldId);
  if (observed.length !== items.length) {
    throw new Error("Evidence recorder did not preserve the world boundary.");
  }
  console.log("Test Console contract tests passed; real Priya workflow remains NOT_PROVEN.");
}

void main();
