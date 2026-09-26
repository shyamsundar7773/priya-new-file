import type { Group } from '../types';

export function findGroup(groups: Group[], groupId: string): Group | null {
  return groups.find((group) => group.id === groupId) || null;
}
