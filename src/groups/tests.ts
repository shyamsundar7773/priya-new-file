import type { Companion, Group, Message } from '../types';
import { addExplicitMention, getMentionQuery } from './mentions';
import { buildAIRequest } from '../ai/context';
import { findGroup } from './selection';
import { buildGroupAIContext, selectGroupResponseTarget } from './context';

export function runGroupContractTests(companion: Companion): void {
  const groupA: Group = { id: 'group-a', name: 'A', companionIds: [companion.id], unreadCount: 0 };
  const groupB: Group = { id: 'group-b', name: 'B', companionIds: [], unreadCount: 0 };
  const message: Message = { id: 'group-message', fromMe: true, type: 'text', text: '@Priya hello', status: 'sent', timestamp: new Date(), mentions: [{ memberId: companion.id, displayName: companion.name }] };
  if (groupA.id === groupB.id || groupA.companionIds[0] !== companion.id) throw new Error('group isolation contract failed');
  if (message.mentions?.[0].memberId !== companion.id) throw new Error('explicit mention contract failed');
  if (getMentionQuery('email me at hello@example.com') !== null) throw new Error('ordinary @ text became a mention');
  if (addExplicitMention([], companion).length !== 1 || addExplicitMention(addExplicitMention([], companion), companion).length !== 1) throw new Error('mention deduplication contract failed');
  if (buildAIRequest(companion, [], 'hello', 'online', 'group', groupA.id, [message], message.mentions).memoryContext.length !== 0) throw new Error('private companion memory leaked into group context');
  if (findGroup([groupA, groupB], 'missing') !== null) throw new Error('invalid group silently resolved');
  const latha: Companion = { ...companion, id: 'latha', name: 'Latha' };
  const groupContext = buildGroupAIContext({ group: { ...groupA, name: 'Circle', companionIds: [companion.id, latha.id], groupMemories: [{ id: 'gm', text: 'The group likes quiet evenings', source: 'conversation', scope: 'group', groupId: groupA.id, status: 'accepted' }] }, companions: [companion, latha], messages: [message], userMessage: '@Latha what do you think?', targetCompanionId: latha.id });
  if (groupContext.memories.length !== 1 || groupContext.participants.length !== 2 || groupContext.targetCompanionId !== latha.id) throw new Error('group context did not preserve explicit group boundaries');
  if (selectGroupResponseTarget(groupA, [companion], 'hello')?.id !== companion.id) throw new Error('group target policy was not deterministic');
  const ordered = [...groupContext.shortTerm].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  if (ordered[0]?.id !== message.id) throw new Error('group message ordering contract failed');
}
