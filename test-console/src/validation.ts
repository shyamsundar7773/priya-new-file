import {
  EvidenceItem,
  EvidenceRequirement,
  OracleResult,
  TestWorld,
  TruthGraph,
  Verdict,
} from "./contracts";

export function assertWorldIsolation(world: TestWorld, evidence: EvidenceItem[]): void {
  for (const item of evidence) {
    if (item.ownership.worldId !== world.worldId || item.ownership.accountId !== world.accountId) {
      throw new Error(`Evidence ${item.evidenceId} crosses the test-world ownership boundary.`);
    }
  }
}

export function requiredEvidencePresent(
  requirement: EvidenceRequirement,
  evidence: EvidenceItem[],
): boolean {
  const matching = evidence.filter(
    (item) =>
      item.trusted &&
      requirement.types.includes(item.type) &&
      requirement.trustedSources.includes(item.source) &&
      item.supportsRequirementIds.includes(requirement.requirementId),
  );
  return matching.length >= requirement.minimumCount;
}

export function enforceTruthGraphEvidence(
  graph: TruthGraph,
  evidence: EvidenceItem[],
): void {
  for (const requirement of graph.evidenceRequirements) {
    if (!requiredEvidencePresent(requirement, evidence)) {
      throw new Error(`Required evidence is missing for ${requirement.requirementId}.`);
    }
  }
}

export function finalizeVerdict(
  result: OracleResult,
  requiredEvidence: boolean,
  contradictoryDeterministicEvidence: boolean,
): Verdict {
  if (contradictoryDeterministicEvidence) {
    return "FAIL";
  }
  if (result.result === "PASS" && !requiredEvidence) {
    return "NOT_PROVEN";
  }
  return result.result;
}

export function canClaimPass(results: OracleResult[], evidence: EvidenceItem[]): boolean {
  return (
    results.length > 0 &&
    results.every((result) => result.result === "PASS" && result.evidenceReferences.length > 0) &&
    evidence.length > 0 &&
    evidence.every((item) => item.trusted)
  );
}

