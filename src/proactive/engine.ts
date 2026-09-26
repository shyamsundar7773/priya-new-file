import type {
  Companion,
  Memory,
  ProactiveCandidate,
  ProactiveConfig,
  ProactiveEvent,
  ProactiveHistoryRecord,
  ProactiveSchedule,
} from '../types';

export type ProactiveDecision =
  | { status: 'allowed'; event: ProactiveEvent; candidate: ProactiveCandidate }
  | { status: 'suppressed'; reason: string; event?: ProactiveEvent; candidate?: ProactiveCandidate }
  | { status: 'not-due'; reason: string };

export interface ProactiveDeliveryAdapter {
  deliver(event: ProactiveEvent): Promise<void>;
}

export interface ProactiveEvaluationOptions {
  notificationsEnabled?: boolean;
}

function minutes(value: string): number {
  const [hours, mins] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) return -1;
  return hours * 60 + mins;
}

export function isWithinQuietHours(config: ProactiveConfig, now: Date): boolean {
  const start = minutes(config.quietHoursStart);
  const end = minutes(config.quietHoursEnd);
  if (start < 0 || end < 0 || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function proactiveFrequencyIntervalMs(frequency: ProactiveConfig['frequency']): number {
  if (frequency === 'high') return 4 * 60 * 60 * 1000;
  if (frequency === 'medium') return 12 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function eventId(userId: string, companionId: string, type: ProactiveEvent['type'], key: string): string {
  return `proactive-${userId}-${companionId}-${type}-${key}`;
}

function fingerprint(type: string, reason: string, message?: string): string {
  return `${type}:${reason}:${(message || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

function smartCheckinBucket(frequency: ProactiveConfig['frequency'], now: Date): string {
  return String(Math.floor(now.getTime() / proactiveFrequencyIntervalMs(frequency)));
}

function scheduleDue(schedule: ProactiveSchedule, now: Date): boolean {
  const dueAt = new Date(schedule.datetime);
  return schedule.status !== 'cancelled' && schedule.status !== 'executed' && schedule.status !== 'expired'
    && schedule.status !== 'delivered' && schedule.status !== 'dispatch_failed' && schedule.status !== 'evaluation_failed'
    && !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= now.getTime();
}

function createCandidate(
  userId: string,
  companion: Companion,
  type: ProactiveCandidate['type'],
  reason: string,
  now: Date,
  message?: string,
  sourceMemoryId?: string,
  sourceEventId?: string,
  scheduledAt?: string,
): ProactiveCandidate {
  return {
    id: `candidate-${userId}-${companion.id}-${type}-${now.getTime()}`,
    userId,
    companionId: companion.id,
    type,
    status: 'candidate',
    reason,
    fingerprint: fingerprint(type, reason, message),
    createdAt: now.toISOString(),
    scheduledAt,
    sourceMemoryId,
    sourceEventId,
    message,
  };
}

function historyHasRecentFingerprint(config: ProactiveConfig, candidate: ProactiveCandidate, now: Date): boolean {
  const cooldown = Math.min(proactiveFrequencyIntervalMs('high'), 4 * 60 * 60 * 1000);
  return (config.candidates || []).some((item) =>
    item.fingerprint === candidate.fingerprint
    && item.status === 'delivered'
    && now.getTime() - new Date(item.createdAt).getTime() < cooldown,
  ) || (config.history || []).some((item) =>
    item.status === 'delivered'
    && item.reason === candidate.reason
    && now.getTime() - new Date(item.occurredAt).getTime() < cooldown,
  );
}

function buildSmartMessage(companion: Companion, memory?: Memory): string {
  if (memory) return `I was thinking about ${memory.text.toLowerCase().replace(/[.!?]+$/, '')}. How is that going?`;
  const stage = companion.relationshipState?.stage;
  if (stage === 'close' || stage === 'deep') return 'How has your day been going since we last talked?';
  if (stage === 'comfortable' || stage === 'familiar') return 'How are things going today?';
  return 'Just checking in — how are you doing today?';
}

export function evaluateProactive(
  companion: Companion,
  now = new Date(),
  existingEvents: ProactiveEvent[] = companion.proactive.events || [],
  userId = 'anonymous',
  memories: Memory[] = companion.memories,
  options: ProactiveEvaluationOptions = {},
): ProactiveDecision {
  const config = companion.proactive;
  if (companion.isPaused) return { status: 'suppressed', reason: 'This companion is paused.' };
  if (!config.enabled) return { status: 'suppressed', reason: 'Proactive behavior is disabled.' };

  const dueSchedule = config.schedules.find((schedule) => scheduleDue(schedule, now));
  if (!dueSchedule && !config.smartCheckins) return { status: 'suppressed', reason: 'Smart check-ins are disabled.' };

  const lastSmartCheckinAt = config.lastDeliveredAt || config.lastEvaluatedAt;
  if (!dueSchedule && lastSmartCheckinAt) {
    const elapsed = now.getTime() - new Date(lastSmartCheckinAt).getTime();
    if (Number.isFinite(elapsed) && elapsed < proactiveFrequencyIntervalMs(config.frequency)) {
      return { status: 'not-due', reason: 'Frequency window has not elapsed.' };
    }
  }

  const type: ProactiveEvent['type'] = dueSchedule ? 'scheduled-moment' : 'smart-checkin';
  const key = dueSchedule ? dueSchedule.id : smartCheckinBucket(config.frequency, now);
  const id = dueSchedule?.eventId || eventId(userId, companion.id, type, key);
  const existingEvent = existingEvents.find((event) => event.id === id);
  if (existingEvent && !['suppressed', 'dispatch_failed', 'evaluation_failed'].includes(existingEvent.status)
    || (config.history || []).some((item) => item.candidateId === id && item.status === 'delivered')) {
    return { status: 'not-due', reason: 'This proactive event was already evaluated.' };
  }

  const channel = dueSchedule?.channel || (config.channels.chat ? 'chat' : config.channels.voice ? 'voice' : config.channels.call ? 'call' : undefined);
  if (!channel) return { status: 'suppressed', reason: 'No proactive delivery channel is enabled.' };
  const suppressionReason = !config.channels[channel]
    ? `The ${channel} delivery channel is disabled.`
    : options.notificationsEnabled === false
      ? 'Proactive notifications are disabled.'
      : undefined;
  if (existingEvent?.status === 'suppressed' && (
    existingEvent.reason === suppressionReason
    || (!suppressionReason && isWithinQuietHours(config, now))
  )) {
    return { status: 'not-due', reason: existingEvent.reason };
  }

  const memory = !dueSchedule
    ? memories.filter((item) => !item.archived && !item.deleted && item.status !== 'rejected').sort((a, b) => (b.importance || 0) - (a.importance || 0))[0]
    : undefined;
  const reason = dueSchedule ? `Scheduled moment: ${dueSchedule.label}` : memory ? 'Follow-up on a meaningful memory' : `Smart check-in (${config.frequency} frequency)`;
  const message = dueSchedule?.message || buildSmartMessage(companion, memory);
  const candidate = createCandidate(userId, companion, dueSchedule ? 'scheduled-moment' : memory ? 'memory-based' : 'smart-checkin', reason, now, message, memory?.id, id, dueSchedule?.datetime);
  if (historyHasRecentFingerprint(config, candidate, now)) return { status: 'not-due', reason: 'Cooldown prevents a repetitive proactive message.' };

  const quiet = !suppressionReason && isWithinQuietHours(config, now);
  const suppressedReason = suppressionReason || (quiet ? 'Quiet hours are active.' : undefined);
  const event: ProactiveEvent = {
    id,
    userId,
    companionId: companion.id,
    type,
    triggerType: type,
    createdAt: now.toISOString(),
    scheduledAt: dueSchedule?.datetime,
    status: suppressedReason ? 'suppressed' : 'allowed',
    channel,
    reason: suppressedReason || reason,
    payload: { message, scheduleId: dueSchedule?.id },
  };
  return suppressedReason
    ? { status: 'suppressed', reason: suppressedReason, event, candidate: { ...candidate, status: 'scheduled' } }
    : { status: 'allowed', event, candidate };
}

export function appendProactiveEvent(config: ProactiveConfig, event: ProactiveEvent, candidate?: ProactiveCandidate, userId = event.userId || 'anonymous'): ProactiveConfig {
  const events = config.events || [];
  const candidates = config.candidates || [];
  const history = config.history || [];
  const previousEvent = events.find((item) => item.id === event.id);
  if (previousEvent && ['delivered', 'cancelled', 'expired', 'invitation'].includes(previousEvent.status)) return config;
  const nextEvents = previousEvent
    ? events.map((item) => item.id === event.id ? { ...item, ...event, payload: { ...item.payload, ...event.payload } } : item)
    : [...events, event].slice(-100);
  const nextCandidate = candidate ? { ...candidate, status: event.status === 'delivered' ? 'delivered' : candidate.status } : undefined;
  const nextHistory: ProactiveHistoryRecord = {
    id: `history-${event.id}`,
    userId,
    companionId: event.companionId,
    candidateId: candidate?.id || event.id,
    status: event.status === 'delivered' ? 'delivered' : event.status === 'suppressed' ? 'suppressed' : 'evaluated',
    reason: event.reason,
    occurredAt: event.createdAt,
  };
  return {
    ...config,
    events: nextEvents,
    candidates: nextCandidate ? [...candidates.filter((item) => item.id !== nextCandidate.id), nextCandidate].slice(-100) : candidates,
    history: [...history.filter((item) => item.id !== nextHistory.id), nextHistory].slice(-200),
    lastDeliveredAt: event.status === 'delivered' ? event.createdAt : config.lastDeliveredAt,
  };
}

export function updateProactiveEventStatus(
  config: ProactiveConfig,
  eventId: string,
  status: ProactiveEvent['status'],
  now = new Date(),
  payload?: ProactiveEvent['payload'],
): ProactiveConfig {
  const event = (config.events || []).find((item) => item.id === eventId);
  if (!event || (['delivered', 'cancelled', 'expired', 'invitation'].includes(event.status) && status !== 'invitation')) return config;
  const updatedEvent = { ...event, status, payload: { ...event.payload, ...payload } };
  const events = config.events?.map((item) => item.id === eventId ? updatedEvent : item) || [];
  const candidateId = config.candidates?.find((item) => item.sourceEventId === eventId)?.id || eventId;
  const history = config.history?.map((item) => item.candidateId === candidateId
    ? { ...item, status: status === 'suppressed' ? 'suppressed' as const : status === 'delivered' || status === 'invitation' ? 'delivered' as const : 'evaluated' as const, occurredAt: now.toISOString() }
    : item) || [];
  const scheduleId = event.payload?.scheduleId;
  return {
    ...config,
    events,
    history,
    schedules: scheduleId
      ? config.schedules.map((item) => item.id === scheduleId ? { ...item, status: status === 'invitation' ? 'executed' : status, updatedAt: now.toISOString() } : item)
      : config.schedules,
  };
}

export function updateProactiveInvitation(
  config: ProactiveConfig,
  eventId: string,
  invitationStatus: 'accepted' | 'declined',
): ProactiveConfig {
  const event = (config.events || []).find((item) => item.id === eventId);
  if (!event || event.status !== 'invitation' || event.payload?.invitationStatus !== 'pending') return config;
  return {
    ...config,
    events: (config.events || []).map((item) => item.id === eventId
      ? { ...item, payload: { ...item.payload, invitationStatus } }
      : item),
  };
}

export function markProactiveDelivered(config: ProactiveConfig, eventId: string, now = new Date()): ProactiveConfig {
  const event = (config.events || []).find((item) => item.id === eventId);
  if (!event || event.status === 'delivered') return config;
  const candidateId = (config.candidates || []).find((item) => item.sourceEventId === eventId)?.id
    || (config.history || []).find((item) => item.candidateId === eventId)?.candidateId;
  const scheduleId = event.payload?.scheduleId;
  return {
    ...config,
    events: (config.events || []).map((item) => item.id === eventId ? { ...item, status: 'delivered' } : item),
    candidates: (config.candidates || []).map((item) => item.id === candidateId || item.sourceEventId === eventId ? { ...item, status: 'delivered' } : item),
    history: (config.history || []).map((item) => item.candidateId === (candidateId || eventId) ? { ...item, status: 'delivered', occurredAt: now.toISOString() } : item),
    schedules: scheduleId ? (config.schedules || []).map((item) => item.id === scheduleId ? { ...item, status: 'executed', updatedAt: now.toISOString() } : item) : config.schedules,
    lastDeliveredAt: now.toISOString(),
  };
}

export function expireScheduledMoments(config: ProactiveConfig, now = new Date(), maxAgeMs = 24 * 60 * 60 * 1000): ProactiveConfig {
  let changed = false;
  const schedules = config.schedules.map((schedule) => {
      const timestamp = new Date(schedule.datetime).getTime();
      if (schedule.status === 'scheduled' && Number.isFinite(timestamp) && now.getTime() - timestamp > maxAgeMs) {
        changed = true;
        return { ...schedule, status: 'expired' as const, updatedAt: now.toISOString() };
      }
      return schedule;
    });
  return changed ? { ...config, schedules } : config;
}

export function updateScheduledMoment(config: ProactiveConfig, schedule: ProactiveSchedule): ProactiveConfig {
  return { ...config, schedules: config.schedules.map((item) => item.id === schedule.id ? { ...item, ...schedule, updatedAt: new Date().toISOString() } : item) };
}

export function cancelScheduledMoment(config: ProactiveConfig, scheduleId: string): ProactiveConfig {
  const now = new Date().toISOString();
  const schedule = config.schedules.find((item) => item.id === scheduleId);
  if (!schedule || schedule.status !== 'scheduled') return config;
  const eventIdToCancel = schedule.eventId;
  return {
    ...config,
    schedules: config.schedules.map((item) => item.id === scheduleId ? { ...item, status: 'cancelled', updatedAt: now } : item),
    events: eventIdToCancel
      ? (config.events || []).map((event) => event.id === eventIdToCancel && event.status !== 'delivered' ? { ...event, status: 'cancelled' } : event)
      : config.events,
  };
}

export function appendScheduledMoment(config: ProactiveConfig, schedule: ProactiveSchedule): ProactiveConfig {
  if (config.schedules.some((item) => item.id === schedule.id)) return config;
  const normalized = {
    ...schedule,
    eventId: schedule.eventId || eventId(schedule.userId || 'anonymous', schedule.companionId || 'unknown', 'scheduled-moment', schedule.id),
    triggerType: 'scheduled-moment' as const,
    status: 'scheduled' as const,
    createdAt: schedule.createdAt || new Date().toISOString(),
  };
  return { ...config, schedules: [...config.schedules, normalized] };
}
