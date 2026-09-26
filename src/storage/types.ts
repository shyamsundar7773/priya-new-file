import type { Companion, Group, Message } from '../types';

export const PERSISTENCE_SCHEMA_VERSION = 1;
export const SHORT_TERM_MEMORY_LIMIT = 20;

export interface PersistedEnvelope<T> {
  version: number;
  updatedAt: string;
  data: T;
}

export interface PersistedState {
  companions: Companion[];
  conversations: Record<string, Message[]>;
  groupConversations: Record<string, Message[]>;
  groups: Group[];
}

export interface StorageAdapter {
  read<T>(key: string): Promise<T | null>;
  write<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
