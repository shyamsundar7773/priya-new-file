import type { NotificationSettings, Theme } from '../types';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  newMessages: true,
  proactiveMessages: true,
  scheduledReminders: false,
  groupActivity: true,
  missedCalls: true,
};

export interface UserPreferences {
  theme: Theme;
  notificationSettings: NotificationSettings;
}

export function normalizePreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== 'object') {
    return { theme: 'dark', notificationSettings: DEFAULT_NOTIFICATION_SETTINGS };
  }
  const preferences = value as { theme?: unknown; notificationSettings?: unknown };
  const theme = preferences.theme === 'light' ? 'light' : 'dark';
  const notificationSettings = preferences.notificationSettings && typeof preferences.notificationSettings === 'object'
    ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...(preferences.notificationSettings as Partial<NotificationSettings>) }
    : DEFAULT_NOTIFICATION_SETTINGS;
  return { theme, notificationSettings };
}
