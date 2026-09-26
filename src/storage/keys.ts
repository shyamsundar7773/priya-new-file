export const STORAGE_KEYS = {
  companions: '@priya-newux/companions',
  conversations: '@priya-newux/conversations',
  groupConversations: '@priya-newux/group-conversations',
  groups: '@priya-newux/groups',
  preferences: '@priya-newux/preferences',
} as const;

export function userStorageKeys(userId: string) {
  const safeUserId = encodeURIComponent(userId);
  return {
    companions: `${STORAGE_KEYS.companions}/${safeUserId}`,
    conversations: `${STORAGE_KEYS.conversations}/${safeUserId}`,
    groupConversations: `${STORAGE_KEYS.groupConversations}/${safeUserId}`,
    groups: `${STORAGE_KEYS.groups}/${safeUserId}`,
    preferences: `${STORAGE_KEYS.preferences}/${safeUserId}`,
  } as const;
}
