import type { Companion, Group, Memory, Message } from '../types';
import { boundShortTermContext } from '../ai/attachmentContext';

export interface GroupAIContext {
  group: { id: string; name: string; memberIds: string[] };
  participants: { id: string; name: string; identity: string; personality: string; language: string }[];
  memories: Memory[];
  shortTerm: Message[];
  targetCompanionId?: string;
  proactive: string[];
  currentRequest: string;
}

export interface GroupLiveContext {
  groupId: string;
  participants: GroupAIContext['participants'];
  selectedCompanionId?: string;
  shortTerm: Message[];
  groupMemories: Memory[];
  currentTurn: string;
}

export function selectGroupResponseTarget(group: Group, companions: Companion[], text: string, targetId?: string): Companion | undefined {
  const members = group.companionIds.map((id) => companions.find((companion) => companion.id === id)).filter(Boolean) as Companion[];
  if (targetId) return members.find((member) => member.id === targetId);
  const normalized = text.toLowerCase();
  return members.find((member) => normalized.includes(member.name.toLowerCase()) || normalized.includes(`@${member.name.toLowerCase()}`)) || members[0];
}

export function buildGroupAIContext(options: {
  group: Group;
  companions: Companion[];
  messages: Message[];
  userMessage: string;
  targetCompanionId?: string;
}): GroupAIContext {
  const members = options.group.companionIds
    .map((id) => options.companions.find((companion) => companion.id === id))
    .filter(Boolean) as Companion[];
  const target = selectGroupResponseTarget(options.group, options.companions, options.userMessage, options.targetCompanionId);
  const memories = (options.group.groupMemories || []).filter((memory) =>
    memory.groupId === options.group.id &&
    memory.scope === 'group' &&
    !memory.archived &&
    !memory.deleted &&
    memory.status !== 'superseded',
  ).slice(-8);
  const proactive = (options.group.proactive?.schedules || [])
    .filter((schedule) => (schedule.status || 'scheduled') === 'scheduled')
    .slice(0, 2)
    .map((schedule) => schedule.message ? `${schedule.label}: ${schedule.message}` : schedule.label);
  return {
    group: { id: options.group.id, name: options.group.name, memberIds: [...options.group.companionIds] },
    participants: members.map((member) => ({
      id: member.id,
      name: member.name,
      identity: member.tagline,
      personality: member.personality,
      language: member.language,
    })),
    memories,
    shortTerm: boundShortTermContext(options.messages),
    targetCompanionId: target?.id,
    proactive,
    currentRequest: options.userMessage,
  };
}
