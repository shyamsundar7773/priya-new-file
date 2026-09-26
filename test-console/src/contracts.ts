export type Id = string;
export type IsoTimestamp = string;

export type VerificationStatus =
  | "EXPECTED"
  | "OBSERVED"
  | "PROVEN"
  | "NOT_PROVEN"
  | "CONTRADICTED";

export type Verdict =
  | "PASS"
  | "FAIL"
  | "NOT_PROVEN"
  | "BLOCKED"
  | "NOT_APPLICABLE"
  | "NATIVE_DEFERRED";

export type EvidenceType =
  | "screenshot"
  | "ui_hierarchy"
  | "state_snapshot"
  | "event"
  | "fixture"
  | "semantic_evaluation"
  | "visual_comparison"
  | "timing"
  | "log"
  | "error"
  | "reproduction_result";

export type EvidenceSource =
  | "test_console"
  | "priya_app"
  | "fixture_provider"
  | "automation"
  | "oracle"
  | "developer";

export type ConnectionStatus =
  | "SUPPORTED_EVENT"
  | "NOT_YET_CONNECTED"
  | "NATIVE_DEFERRED";

export type EventName =
  | "CHAT_SENT"
  | "CHAT_RESPONSE_STARTED"
  | "CHAT_RESPONSE_COMPLETED"
  | "MEMORY_CANDIDATE_DETECTED"
  | "MEMORY_CREATED"
  | "MEMORY_UPDATED"
  | "MEMORY_RETRIEVED"
  | "COMPANION_SELECTED"
  | "COMPANION_SWITCHED"
  | "PROACTIVE_SCHEDULE_CREATED"
  | "PROACTIVE_TRIGGERED"
  | "PROACTIVE_DELIVERED"
  | "VOICE_STARTED"
  | "VOICE_ENDED";

export type OracleKind =
  | "exact"
  | "state"
  | "event"
  | "invariant"
  | "semantic"
  | "visual"
  | "temporal";

export type FailureClassification =
  | "PRODUCT_DEFECT"
  | "TEST_DEFECT"
  | "FIXTURE_DEFECT"
  | "AUTOMATION_DEFECT"
  | "SELECTOR_DEFECT"
  | "TIMING_DEFECT"
  | "STATE_DEFECT"
  | "NAVIGATION_DEFECT"
  | "PROVIDER_DEPENDENCY"
  | "NETWORK_DEPENDENCY"
  | "AUTH_DEPENDENCY"
  | "NATIVE_DEPENDENCY"
  | "ENVIRONMENT_ISSUE"
  | "NOT_PROVEN";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type RetestStatus =
  | "NOT_REQUESTED"
  | "REQUESTED"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "BLOCKED"
  | "NOT_PROVEN";

export interface Ownership {
  accountId: Id;
  companionId?: Id;
  worldId: Id;
}

export interface TestWorld {
  worldId: Id;
  accountId: Id;
  createdAt: IsoTimestamp;
  deterministicSeed: string;
  reference: string;
  isolationBoundary: string;
  reset: {
    supported: boolean;
    lastResetAt?: IsoTimestamp;
    baselineReference: string;
  };
  entities: {
    companions: Id[];
    relationships: Id[];
    memories: Id[];
    chats: Id[];
    proactive: Id[];
    voice: Id[];
    groups: Id[];
    attachments: Id[];
  };
}

export interface Requirement {
  requirementId: Id;
  text: string;
  expected: unknown;
  requiredEvidence: EvidenceType[];
  oracle: OracleKind;
  allowedVariations?: unknown[];
}

export interface Action {
  actionId: Id;
  name: string;
  parameters: Record<string, unknown>;
  order: number;
  nativeDeferred?: boolean;
}

export interface TruthGraph {
  scenarioId: Id;
  preconditions: Requirement[];
  actions: Action[];
  expectedState: Requirement[];
  expectedEvents: Requirement[];
  expectedUi: Requirement[];
  expectedSemanticMeaning: Requirement[];
  invariants: Requirement[];
  allowedVariations: string[];
  evidenceRequirements: EvidenceRequirement[];
}

export interface EvidenceRequirement {
  requirementId: Id;
  types: EvidenceType[];
  minimumCount: number;
  trustedSources: EvidenceSource[];
}

export interface StateSnapshot {
  snapshotId: Id;
  label: string;
  capturedAt: IsoTimestamp;
  ownership: Ownership;
  stateData: Record<string, unknown>;
  source: EvidenceSource;
  comparison?: {
    expectedSnapshotId?: Id;
    status: VerificationStatus;
    differences: string[];
  };
}

export interface RecordedEvent {
  eventId: Id;
  name: EventName;
  status: ConnectionStatus;
  occurredAt: IsoTimestamp;
  ownership: Ownership;
  payload: Record<string, unknown>;
  source: EvidenceSource;
}

export interface EvidenceItem {
  evidenceId: Id;
  type: EvidenceType;
  capturedAt: IsoTimestamp;
  ownership: Ownership;
  source: EvidenceSource;
  trusted: boolean;
  summary: string;
  payload: Record<string, unknown>;
  supportsRequirementIds: Id[];
  contradictsRequirementIds?: Id[];
}

export interface OracleResult {
  oracleId: Id;
  kind: OracleKind;
  requirementId: Id;
  expected: unknown;
  observed: unknown;
  result: Verdict;
  confidence: number;
  evidenceReferences: Id[];
  explanation: string;
}

export interface OracleContext {
  requirement: Requirement;
  world: TestWorld;
  evidence: EvidenceItem[];
  snapshots: StateSnapshot[];
  events: RecordedEvent[];
}

export interface Oracle {
  readonly kind: OracleKind;
  evaluate(context: OracleContext): Promise<OracleResult>;
}

export interface SemanticEvaluation {
  meaning:
    | "CORRECT_MEANING"
    | "INCORRECT_MEANING"
    | "AMBIGUOUS"
    | "INSUFFICIENT_EVIDENCE";
  rationale: string;
  evidenceReferences: Id[];
}

export interface SemanticOracle extends Oracle {
  readonly kind: "semantic";
  evaluateMeaning(context: OracleContext): Promise<SemanticEvaluation>;
}

export interface TestScenario {
  scenarioId: Id;
  name: string;
  description: string;
  truthGraph: TruthGraph;
}

export interface AgentRun {
  runId: Id;
  scenarioId: Id;
  worldId: Id;
  status: "PLANNED" | "RUNNING" | "COMPLETED" | "BLOCKED";
  evidenceIds: Id[];
  oracleResultIds: Id[];
  startedAt?: IsoTimestamp;
  completedAt?: IsoTimestamp;
}

export interface FailureInvestigation {
  classification: FailureClassification;
  confidence: number;
  evidenceReferences: Id[];
  explanation: string;
  suspectedLayer?: string;
}

export interface RepairBrief {
  briefId: Id;
  defectId: Id;
  whatFailed: string;
  expected: unknown;
  observed: unknown;
  reproduction: string;
  evidenceReferences: Id[];
  likelyLayer: string;
  rootCauseHypothesis: string;
  constraints: string[];
  regressionRisks: string[];
  requiredRetest: string[];
}

export interface Defect {
  defectId: Id;
  scenarioId: Id;
  testWorldId: Id;
  classification: FailureClassification;
  severity: Severity;
  confidence: number;
  expected: unknown;
  observed: unknown;
  reproductionCount: number;
  evidenceReferences: Id[];
  suspectedLayer?: string;
  rootCauseHypothesis?: string;
  confirmedRootCause?: string;
  developerRepairBrief?: RepairBrief;
  retestStatus: RetestStatus;
  regressionStatus: RetestStatus;
}

export interface RetestPlan {
  retestId: Id;
  originalRunId: Id;
  defectId: Id;
  targetedScenarioId: Id;
  relatedRegressionScenarioIds: Id[];
  status: RetestStatus;
  results: Id[];
}

export interface AiTestAgent {
  understandScenario(scenario: TestScenario): Promise<void>;
  coordinateRun(run: AgentRun): Promise<AgentRun>;
  collectEvidence(run: AgentRun): Promise<EvidenceItem[]>;
  evaluate(run: AgentRun): Promise<OracleResult[]>;
  investigateFailure(
    run: AgentRun,
    results: OracleResult[],
    evidence: EvidenceItem[],
  ): Promise<FailureInvestigation>;
  createRepairBrief(
    defect: Defect,
    investigation: FailureInvestigation,
  ): Promise<RepairBrief>;
  requestTargetedRetest(defect: Defect, plan: RetestPlan): Promise<RetestPlan>;
  analyzeRegression(plan: RetestPlan): Promise<RetestPlan>;
}

export interface EventRecorder {
  record(event: RecordedEvent): Promise<void>;
  list(worldId: Id): Promise<RecordedEvent[]>;
}

export interface EvidenceRecorder {
  record(item: EvidenceItem): Promise<void>;
  list(worldId: Id): Promise<EvidenceItem[]>;
}

export const MEMORY_FAVORITE_FOOD_SCENARIO: TestScenario = {
  scenarioId: "scenario-memory-favorite-food",
  name: "Memory: favorite_food = biryani",
  description: "A semantic memory is established and later recalled by the real app.",
  truthGraph: {
    scenarioId: "scenario-memory-favorite-food",
    preconditions: [
      {
        requirementId: "precondition-clean-world",
        text: "The world is reset to its deterministic baseline.",
        expected: { reset: true },
        requiredEvidence: ["state_snapshot"],
        oracle: "state",
      },
    ],
    actions: [
      {
        actionId: "action-establish-memory",
        name: "Establish favorite food",
        parameters: { key: "favorite_food", value: "biryani" },
        order: 1,
      },
      {
        actionId: "action-ask-favorite-food",
        name: "Ask the application about favorite food",
        parameters: { prompt: "What is my favorite food?" },
        order: 2,
      },
    ],
    expectedState: [
      {
        requirementId: "expected-memory-fact",
        text: "The deterministic memory contains favorite_food = biryani.",
        expected: { key: "favorite_food", value: "biryani" },
        requiredEvidence: ["state_snapshot", "fixture"],
        oracle: "state",
      },
    ],
    expectedEvents: [
      {
        requirementId: "expected-memory-created-event",
        text: "A memory-created event is recorded for the owned world.",
        expected: { name: "MEMORY_CREATED", status: "SUPPORTED_EVENT" },
        requiredEvidence: ["event"],
        oracle: "event",
      },
    ],
    expectedUi: [],
    expectedSemanticMeaning: [
      {
        requirementId: "expected-favorite-food-answer",
        text: "The response conveys that the favorite food is biryani.",
        expected: { favorite_food: "biryani" },
        requiredEvidence: ["screenshot", "ui_hierarchy", "semantic_evaluation"],
        oracle: "semantic",
      },
    ],
    invariants: [
      {
        requirementId: "invariant-account-companion-ownership",
        text: "Memory evidence belongs to Account A and Priya only.",
        expected: { accountId: "account-a", companionId: "companion-priya" },
        requiredEvidence: ["state_snapshot", "event"],
        oracle: "invariant",
      },
    ],
    allowedVariations: [
      "The response may use different wording while preserving the same fact.",
    ],
    evidenceRequirements: [
      {
        requirementId: "expected-memory-fact",
        types: ["state_snapshot", "fixture"],
        minimumCount: 2,
        trustedSources: ["test_console", "fixture_provider"],
      },
      {
        requirementId: "expected-memory-created-event",
        types: ["event"],
        minimumCount: 1,
        trustedSources: ["priya_app", "test_console"],
      },
      {
        requirementId: "expected-favorite-food-answer",
        types: ["semantic_evaluation", "screenshot", "ui_hierarchy"],
        minimumCount: 2,
        trustedSources: ["priya_app", "oracle"],
      },
    ],
  },
};

