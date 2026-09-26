import type { Companion, MessageMention } from '../types';

export function getMentionQuery(value: string): string | null {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1] : null;
}

export function replaceMentionToken(value: string, query: string, member: Companion): string {
  return value.replace(new RegExp(`@${query}$`), `@${member.name} `);
}

export function addExplicitMention(current: MessageMention[], member: Companion): MessageMention[] {
  return current.some((mention) => mention.memberId === member.id)
    ? current
    : [...current, { memberId: member.id, displayName: member.name }];
}
