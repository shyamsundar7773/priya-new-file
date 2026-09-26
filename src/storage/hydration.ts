import type { Companion, Group, Message } from '../types';
import { userStorageKeys } from './keys';
import { asyncStorageAdapter } from './storage';
import { hydrateCompanions, hydrateConversations, hydrateGroups } from './serialize';

export interface HydratedState {
  companions: Companion[];
  conversations: Record<string, Message[]>;
  groupConversations: Record<string, Message[]>;
  groups: Group[];
}

export async function hydrateState(defaults: HydratedState, userId: string): Promise<HydratedState> {
  const keys = userStorageKeys(userId);
  const [companions, conversations, groupConversations, groups] = await Promise.all([
    asyncStorageAdapter.read<unknown>(keys.companions),
    asyncStorageAdapter.read<unknown>(keys.conversations),
    asyncStorageAdapter.read<unknown>(keys.groupConversations),
    asyncStorageAdapter.read<unknown>(keys.groups),
  ]);
  const unwrap = (value: unknown): unknown => {
    if (value && typeof value === 'object' && 'data' in value) return (value as { data: unknown }).data;
    return value;
  };
  const savedConversations = unwrap(conversations);
  return {
    companions: hydrateCompanions(unwrap(companions), defaults.companions, userId),
    conversations: savedConversations && Object.keys(savedConversations).length ? hydrateConversations(savedConversations) : defaults.conversations,
    groupConversations: hydrateConversations(unwrap(groupConversations)),
    groups: hydrateGroups(unwrap(groups), defaults.groups),
  };
}
