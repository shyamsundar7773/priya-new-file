import type { RelationshipState } from '../types';
import { relationshipContext } from './engine';

export interface RelationshipContext {
  stage: RelationshipState['stage'];
  familiarity: number;
  trust: number;
  closeness: number;
  milestones: string[];
}

export function buildRelationshipContext(state: RelationshipState | undefined, groupMode = false): RelationshipContext | undefined {
  if (groupMode) return undefined;
  const relationship = relationshipContext(state);
  if (!relationship) return undefined;
  return {
    stage: relationship.stage,
    familiarity: relationship.familiarity,
    trust: relationship.trust,
    closeness: relationship.closeness,
    milestones: relationship.milestones.slice(-3).map((milestone) => milestone.title),
  };
}
