import {
  AgentRun,
  EvidenceItem,
  EventRecorder,
  EvidenceRecorder,
  TestScenario,
  TestWorld,
} from "./contracts";
import { assertWorldIsolation } from "./validation";

export interface TestConsole {
  createWorld(input: Omit<TestWorld, "createdAt">): TestWorld;
  selectScenario(scenario: TestScenario): void;
  inspectRun(run: AgentRun): AgentRun | undefined;
  inspectEvidence(worldId: string): Promise<EvidenceItem[]>;
}

export class InMemoryTestConsole implements TestConsole {
  private readonly worlds = new Map<string, TestWorld>();
  private readonly runs = new Map<string, AgentRun>();
  private selectedScenario?: TestScenario;

  public constructor(
    private readonly events: EventRecorder,
    private readonly evidence: EvidenceRecorder,
  ) {}

  public createWorld(input: Omit<TestWorld, "createdAt">): TestWorld {
    const world: TestWorld = { ...input, createdAt: new Date().toISOString() };
    if (this.worlds.has(world.worldId)) {
      throw new Error(`Test world ${world.worldId} already exists.`);
    }
    this.worlds.set(world.worldId, world);
    return world;
  }

  public selectScenario(scenario: TestScenario): void {
    this.selectedScenario = scenario;
  }

  public inspectRun(run: AgentRun): AgentRun | undefined {
    return this.runs.get(run.runId);
  }

  public async inspectEvidence(worldId: string): Promise<EvidenceItem[]> {
    const world = this.worlds.get(worldId);
    if (!world) {
      throw new Error(`Unknown test world ${worldId}.`);
    }
    const evidence = await this.evidence.list(worldId);
    assertWorldIsolation(world, evidence);
    return evidence;
  }

  public get scenario(): TestScenario | undefined {
    return this.selectedScenario;
  }

  public registerRun(run: AgentRun): void {
    if (!this.worlds.has(run.worldId)) {
      throw new Error(`Cannot register a run for unknown world ${run.worldId}.`);
    }
    this.runs.set(run.runId, run);
  }

  public async inspectEvents(worldId: string) {
    return this.events.list(worldId);
  }
}

