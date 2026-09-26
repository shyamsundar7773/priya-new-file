import { appendProactiveEvent, appendScheduledMoment, cancelScheduledMoment, evaluateProactive, expireScheduledMoments, isWithinQuietHours, markProactiveDelivered, updateProactiveEventStatus, updateProactiveInvitation } from './engine';
import type { Companion } from '../types';

export function runProactiveContractTests(companion: Companion): void {
  const now = new Date('2026-09-23T06:00:00.000Z');
  const enabled = { ...companion, proactive: { ...companion.proactive, enabled: true, smartCheckins: true, quietHoursStart: '22:00', quietHoursEnd: '07:00', events: [] } };
  if (isWithinQuietHours(enabled.proactive, now)) throw new Error('quiet-hours daytime contract failed');
  if (isWithinQuietHours({ ...enabled.proactive, quietHoursStart: '00:00', quietHoursEnd: '00:00' }, now)) throw new Error('disabled quiet-hours contract failed');
  const decision = evaluateProactive(enabled, now, [], 'user-a');
  if (decision.status !== 'allowed' || !decision.event) throw new Error('enabled proactive contract failed');
  if (!('candidate' in decision) || decision.candidate.userId !== 'user-a') throw new Error('candidate provenance contract failed');
  const duplicate = evaluateProactive({ ...enabled, proactive: { ...enabled.proactive, events: [decision.event] } }, now, [decision.event], 'user-a');
  if (duplicate.status !== 'not-due') throw new Error('duplicate proactive contract failed');
  const highFrequency = { ...enabled, proactive: { ...enabled.proactive, frequency: 'high' as const, events: [] } };
  const highFirst = evaluateProactive(highFrequency, now, [], 'user-a');
  const highPersisted = 'event' in highFirst && highFirst.event && 'candidate' in highFirst
    ? { ...highFrequency, proactive: appendProactiveEvent(highFrequency.proactive, highFirst.event, highFirst.candidate, 'user-a') }
    : highFrequency;
  const highLater = evaluateProactive(highPersisted, new Date(now.getTime() + 5 * 60 * 60 * 1000), highPersisted.proactive.events || [], 'user-a');
  if (highLater.status !== 'allowed') throw new Error('proactive frequency contract failed');
  const disabled = evaluateProactive({ ...enabled, proactive: { ...enabled.proactive, enabled: false } }, now);
  if (disabled.status !== 'suppressed') throw new Error('disabled proactive contract failed');
  const notificationsDisabled = evaluateProactive({
    ...enabled,
    proactive: { ...enabled.proactive, channels: { chat: false, voice: true, call: false }, events: [] },
  }, now, [], 'user-a', enabled.memories, { notificationsEnabled: false });
  if (notificationsDisabled.status !== 'suppressed') throw new Error('notification-disabled contract failed');

  const quiet = evaluateProactive(enabled, new Date('2026-09-23T23:00:00.000Z'), [], 'user-a');
  if (quiet.status !== 'suppressed' || !('event' in quiet)) throw new Error('quiet-hours candidate persistence contract failed');

  const deliveredConfig = decision.status === 'allowed' && decision.event && 'candidate' in decision
    ? markProactiveDelivered(appendProactiveEvent(enabled.proactive, decision.event, decision.candidate, 'user-a'), decision.event.id)
    : enabled.proactive;
  if (!deliveredConfig.history?.some((item) => item.status === 'delivered')) throw new Error('delivery history contract failed');
  if (deliveredConfig.lastDeliveredAt === undefined) throw new Error('last delivered timestamp contract failed');

  const scheduled = appendScheduledMoment(enabled.proactive, {
    id: 'scheduled-1',
    userId: 'user-a',
    companionId: companion.id,
    label: 'Follow up',
    datetime: '2026-09-24T08:00:00.000Z',
    channel: 'chat',
  });
  if (scheduled.schedules.length !== enabled.proactive.schedules.length + 1) throw new Error('scheduled moment creation failed');
  const cancelled = cancelScheduledMoment(scheduled, 'scheduled-1');
  const cancelledSchedule = cancelled.schedules.find((item) => item.id === 'scheduled-1');
  if (cancelledSchedule?.status !== 'cancelled') throw new Error('scheduled moment cancellation failed');
  if (cancelledSchedule.label !== 'Follow up' || cancelledSchedule.datetime !== '2026-09-24T08:00:00.000Z' || cancelledSchedule.channel !== 'chat') {
    throw new Error('scheduled moment cancellation must preserve its details');
  }
  const dueScheduled = evaluateProactive({ ...enabled, proactive: scheduled }, new Date('2026-09-24T09:00:00.000Z'), [], 'user-a');
  if (dueScheduled.status !== 'allowed' || !('event' in dueScheduled)) throw new Error('scheduled moment execution eligibility failed');
  const executed = 'event' in dueScheduled && dueScheduled.event && 'candidate' in dueScheduled
    ? markProactiveDelivered(appendProactiveEvent(scheduled, dueScheduled.event, dueScheduled.candidate, 'user-a'), dueScheduled.event.id)
    : scheduled;
  if (executed.schedules.find((item) => item.id === 'scheduled-1')?.status !== 'executed') throw new Error('scheduled moment execution persistence failed');
  const minuteSchedule = appendScheduledMoment(enabled.proactive, {
    id: 'minute-schedule',
    userId: 'user-a',
    companionId: companion.id,
    label: 'One minute follow-up',
    datetime: new Date(now.getTime() + 60_000).toISOString(),
    channel: 'chat',
    createdAt: now.toISOString(),
  });
  const scheduledOnly = { ...enabled, proactive: { ...minuteSchedule, smartCheckins: false } };
  if (evaluateProactive(scheduledOnly, now, [], 'user-a').status === 'allowed') throw new Error('future minute schedule fired early');
  const minuteDue = evaluateProactive(scheduledOnly, new Date(now.getTime() + 60_001), [], 'user-a');
  if (minuteDue.status !== 'allowed' || !('event' in minuteDue) || minuteDue.event.channel !== 'chat') throw new Error('one-minute schedule did not become due');

  const disabledScheduled = appendScheduledMoment({
    ...enabled.proactive,
    channels: { chat: false, voice: false, call: false },
  }, {
    id: 'disabled-channel-schedule',
    label: 'Disabled channel',
    datetime: now.toISOString(),
    channel: 'call',
  });
  const disabledChannelDecision = evaluateProactive(
    { ...enabled, proactive: disabledScheduled },
    now,
    [],
    'user-a',
    enabled.memories,
    { notificationsEnabled: true },
  );
  if (disabledChannelDecision.status !== 'suppressed' || !disabledChannelDecision.event || disabledChannelDecision.event.status !== 'suppressed') {
    throw new Error('disabled scheduled channel must be persisted as suppressed');
  }

  const quietAtNight = new Date(2026, 8, 23, 23, 0);
  const retryAfterQuietConfig = { ...enabled.proactive, schedules: [{ id: 'quiet-schedule', label: 'Quiet follow-up', datetime: quietAtNight.toISOString(), channel: 'chat' as const, status: 'scheduled' as const }] };
  const quietDecision = evaluateProactive({ ...enabled, proactive: retryAfterQuietConfig }, quietAtNight, [], 'user-a');
  if (quietDecision.status !== 'suppressed' || !quietDecision.event) throw new Error('scheduled moment must be suppressed during quiet hours');
  const quietPersisted = appendProactiveEvent(retryAfterQuietConfig, quietDecision.event, 'candidate' in quietDecision ? quietDecision.candidate : undefined, 'user-a');
  const quietStillActive = evaluateProactive({ ...enabled, proactive: quietPersisted }, new Date(quietAtNight.getTime() + 5_000), quietPersisted.events, 'user-a');
  if (quietStillActive.status !== 'not-due') throw new Error('quiet-hour suppression should not be repeatedly emitted');
  const afterQuiet = new Date(quietAtNight);
  afterQuiet.setDate(afterQuiet.getDate() + 1);
  afterQuiet.setHours(8, 0, 0, 0);
  const resumed = evaluateProactive({ ...enabled, proactive: quietPersisted }, afterQuiet, quietPersisted.events, 'user-a');
  if (resumed.status !== 'allowed' || resumed.event.id !== quietDecision.event.id) {
    throw new Error(`quiet-hour schedule did not resume with the same event identity: ${resumed.status} ${'reason' in resumed ? resumed.reason : resumed.event.id} expected ${quietDecision.event.id}`);
  }

  if (decision.status === 'allowed' && decision.event) {
    const dispatching = updateProactiveEventStatus(
      appendProactiveEvent(enabled.proactive, decision.event, 'candidate' in decision ? decision.candidate : undefined, 'user-a'),
      decision.event.id,
      'dispatching',
    );
    const failed = updateProactiveEventStatus(dispatching, decision.event.id, 'dispatch_failed');
    if (failed.events?.find((item) => item.id === decision.event.id)?.status !== 'dispatch_failed') throw new Error('failed proactive delivery state was not persisted');
    const delivered = markProactiveDelivered(dispatching, decision.event.id);
    const deliveredAgain = markProactiveDelivered(delivered, decision.event.id);
    if (deliveredAgain.events?.find((item) => item.id === decision.event.id)?.status !== 'delivered') throw new Error('duplicate delivery changed delivered event state');
    const invitation = updateProactiveEventStatus(delivered, decision.event.id, 'invitation', now, { invitationStatus: 'pending', message: 'Call invitation' });
    const accepted = updateProactiveInvitation(invitation, decision.event.id, 'accepted');
    if (accepted.events?.find((item) => item.id === decision.event.id)?.payload?.invitationStatus !== 'accepted') throw new Error('call invitation acceptance was not persisted');
    const declined = updateProactiveInvitation(invitation, decision.event.id, 'declined');
    if (declined.events?.find((item) => item.id === decision.event.id)?.payload?.invitationStatus !== 'declined') throw new Error('call invitation decline was not persisted');
    if (updateProactiveInvitation(accepted, decision.event.id, 'declined') !== accepted) throw new Error('resolved invitation was changed a second time');
  }
  const expired = expireScheduledMoments(appendScheduledMoment(enabled.proactive, { id: 'old', label: 'Old', datetime: '2026-09-20T00:00:00.000Z', channel: 'chat' }), new Date('2026-09-24T00:00:00.000Z'));
  if (expired.schedules.find((item) => item.id === 'old')?.status !== 'expired') throw new Error('scheduled moment expiration failed');

  const userB = evaluateProactive({ ...enabled, proactive: { ...enabled.proactive, events: [] } }, now, [], 'user-b');
  if (userB.status !== 'allowed' || !('event' in userB) || userB.event.userId !== 'user-b') throw new Error('user isolation contract failed');
  const companionB = evaluateProactive({ ...enabled, id: 'latha', proactive: { ...enabled.proactive, events: [] } }, now, [], 'user-a');
  if (companionB.status !== 'allowed' || !('event' in companionB) || companionB.event.companionId !== 'latha') throw new Error('companion isolation contract failed');

  let repeated: Companion = enabled;
  for (let index = 0; index < 50; index += 1) {
    const result = evaluateProactive(repeated, new Date(now.getTime() + index * 60 * 60 * 1000), repeated.proactive.events || [], 'user-a');
    if ('event' in result && result.event && 'candidate' in result) {
      repeated = { ...repeated, proactive: appendProactiveEvent(repeated.proactive, result.event, result.candidate, 'user-a') };
    }
  }
  if ((repeated.proactive.events || []).length > 100 || (repeated.proactive.history || []).length > 200) throw new Error('proactive history bound failed');
}
