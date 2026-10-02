import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { COMPANIONS, INITIAL_CONVERSATIONS, INITIAL_GROUPS } from './data';
import { buildAIRequest } from './ai/context';
import { createAIGateway } from './ai/gateway';
import { aiBackendUrl, backendHealthUrl, isAIBackendConfigured } from './ai/config';
import type { AIResponse } from './ai/types';
import type { AppContextValue, Companion, EngineState, Group, Message, MessageMention, NavScreen, NotificationSettings, ProactiveEvent, TabName, Theme } from './types';
import { appendProactiveEvent, evaluateProactive, expireScheduledMoments, markProactiveDelivered, updateProactiveEventStatus, updateProactiveInvitation } from './proactive/engine';
import type { ProactiveDecision } from './proactive/engine';
import { userStorageKeys } from './storage/keys';
import { asyncStorageAdapter } from './storage/storage';
import { hydrateState } from './storage/hydration';
import { getSession, signInWithGoogle, signInWithPassword as passwordSignIn, signOut as signOutService, signUpWithPassword as passwordSignUp } from './auth/authService';
import { supabase } from './auth/supabase';
import type { AuthStatus } from './auth/types';
import { DEFAULT_NOTIFICATION_SETTINGS, normalizePreferences } from './storage/preferences';
import { applyRelationshipSignal } from './relationship/engine';
import type { Attachment } from './attachments/model';
import { BackendTextToSpeechProvider } from './voice/backendTts';
import { createAssistantVoiceMessage } from './voice/messagePipeline';
import { createHealthCheckGeneration, engineHealthChecker } from './ai/engineHealth';
import { appendArchiveSafely, archiveRecordFromMessage, conversationArchive } from './archive';

const AppContext = createContext<AppContextValue | null>(null);

const INITIAL_TAB_STACKS: Record<TabName, NavScreen[]> = {
  chats: [{ type: 'chats-list' }],
  companions: [{ type: 'companions-list' }],
  groups: [{ type: 'groups-list' }],
  settings: [{ type: 'settings' }],
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>('dark');
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [preferencesUserId, setPreferencesUserId] = useState<string | null>(null);
  const [engineState, setEngineStateValue] = useState<EngineState>('online');
  const [activeTab, setActiveTab] = useState<TabName>('chats');
  const [tabStacks, setTabStacks] = useState<Record<TabName, NavScreen[]>>(INITIAL_TAB_STACKS);
  const [companions, setCompanions] = useState<Companion[]>(COMPANIONS);
  const companionsRef = useRef(companions);
  useEffect(() => {
    companionsRef.current = companions;
  }, [companions]);
  const proactiveDispatchingRef = useRef(false);
  const appActiveRef = useRef(AppState.currentState !== 'background');
  const engineHealthGenerationRef = useRef(createHealthCheckGeneration());
  const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS);
  const [conversations, setConversations] = useState<Record<string, Message[]>>(INITIAL_CONVERSATIONS);
  const [groupConversations, setGroupConversations] = useState<Record<string, Message[]>>({});
  const [hydrationStatus, setHydrationStatus] = useState<'loading' | 'ready' | 'recovered'>('loading');
  const hydratedRef = useRef(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const brain = useMemo(() => createAIGateway(), []);
  const currentAuthUserRef = useRef<string | null>(null);
  useEffect(() => {
    currentAuthUserRef.current = authUserId;
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    let active = true;
    const healthGeneration = engineHealthGenerationRef.current;
    const refreshEngineState = async () => {
      if (!active || AppState.currentState !== 'active') return;
      const generation = healthGeneration.begin();
      setEngineStateValue('recovering');
      if (!isAIBackendConfigured()) {
        if (active && healthGeneration.isCurrent(generation)) setEngineStateValue('online');
        return;
      }
      const healthUrl = backendHealthUrl(aiBackendUrl);
      const healthy = await engineHealthChecker.check(aiBackendUrl);
      if (!active || AppState.currentState !== 'active' || !healthGeneration.isCurrent(generation)) return;
      if (__DEV__) console.log(`[engine-health] url=${healthUrl} status=${healthy ? 'online' : 'offline'}`);
      setEngineStateValue(healthy ? 'online' : 'offline');
    };
    void refreshEngineState();
    const subscription = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      if (state === 'active') {
        void refreshEngineState();
      } else {
        healthGeneration.invalidate();
      }
    });
    return () => {
      active = false;
      healthGeneration.invalidate();
      subscription.remove();
    };
  }, [authUserId, brain]);

  useEffect(() => {
    let active = true;
    void getSession().then((session) => {
      if (!active) return;
      setAuthUserId(session?.user.id || null);
      setAuthStatus(session ? 'signed-in' : 'signed-out');
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : 'Unable to restore authentication.');
      setAuthStatus('signed-out');
    });
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user.id || null);
      setAuthStatus(session ? 'signed-in' : 'signed-out');
      hydratedRef.current = false;
      setCompanions(COMPANIONS);
      setConversations(INITIAL_CONVERSATIONS);
      setGroupConversations({});
      setGroups(INITIAL_GROUPS);
      setHydrationStatus('loading');
      if (!session) {
        setThemeState('dark');
        setNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
        setPreferencesUserId(null);
      }
    }).data.subscription;
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authUserId) return;
    let active = true;
    void asyncStorageAdapter.read<unknown>(userStorageKeys(authUserId).preferences).then((saved) => {
      if (!active) return;
      const value = saved && typeof saved === 'object' && 'data' in saved ? (saved as { data: unknown }).data : saved;
      const preferences = normalizePreferences(value);
      setThemeState(preferences.theme);
      setNotificationSettings(preferences.notificationSettings);
      setPreferencesUserId(authUserId);
    });
    return () => { active = false; };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    let active = true;
    hydratedRef.current = false;
    void (async () => {
      try {
        const localHydrated = await hydrateState({ companions: COMPANIONS, conversations: INITIAL_CONVERSATIONS, groupConversations: {}, groups: INITIAL_GROUPS }, authUserId);
        const archiveConversations = conversationArchive && typeof conversationArchive.loadUserConversations === 'function'
          ? await conversationArchive.loadUserConversations(authUserId)
          : {};

        const mergedConversations = Object.fromEntries(Array.from(new Set([...Object.keys(localHydrated.conversations), ...Object.keys(archiveConversations)])).map((conversationId) => {
          const merged = [...(localHydrated.conversations[conversationId] || []), ...(archiveConversations[conversationId] || [])];
          const deduped = new Map<string, Message>();
          for (const message of merged) deduped.set(message.id, message);
          return [conversationId, [...deduped.values()].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())];
        }));

        if (!active) return;
        setCompanions(localHydrated.companions);
        setConversations(mergedConversations);
        setGroupConversations(localHydrated.groupConversations);
        setGroups(localHydrated.groups);
        hydratedRef.current = true;
        setHydrationStatus('ready');
      } catch {
        if (!active) return;
        hydratedRef.current = true;
        setHydrationStatus('recovered');
      }
    })();
    return () => { active = false; };
  }, [authUserId]);

  useEffect(() => {
    if (!hydratedRef.current || !authUserId) return;
    void asyncStorageAdapter.write(userStorageKeys(authUserId).companions, { version: 1, updatedAt: new Date().toISOString(), data: companions });
  }, [companions, authUserId]);
  useEffect(() => {
    if (!hydratedRef.current || !authUserId) return;
    void asyncStorageAdapter.write(userStorageKeys(authUserId).conversations, { version: 1, updatedAt: new Date().toISOString(), data: conversations });
  }, [conversations, authUserId]);
  useEffect(() => {
    if (!hydratedRef.current || !authUserId) return;
    void asyncStorageAdapter.write(userStorageKeys(authUserId).groupConversations, { version: 1, updatedAt: new Date().toISOString(), data: groupConversations });
  }, [groupConversations, authUserId]);
  useEffect(() => {
    if (!hydratedRef.current || !authUserId) return;
    void asyncStorageAdapter.write(userStorageKeys(authUserId).groups, { version: 1, updatedAt: new Date().toISOString(), data: groups });
  }, [groups, authUserId]);
  useEffect(() => {
    if (!authUserId || preferencesUserId !== authUserId) return;
    void asyncStorageAdapter.write(userStorageKeys(authUserId).preferences, {
      version: 1,
      updatedAt: new Date().toISOString(),
      data: { theme, notificationSettings },
    });
  }, [authUserId, notificationSettings, preferencesUserId, theme]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.');
    }
  }, []);
  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try { await passwordSignIn(email, password); } catch (error: unknown) { setAuthError(error instanceof Error ? error.message : 'Authentication failed.'); }
  }, []);
  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      const result = await passwordSignUp(email, password);
      if (!result.session) setAuthError('Account created. Check your email to verify the account before signing in.');
    } catch (error: unknown) { setAuthError(error instanceof Error ? error.message : 'Account creation failed.'); }
  }, []);
  const signOut = useCallback(async () => {
    setAuthError(null);
    await signOutService().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : 'Unable to sign out.'));
    setAuthStatus('signed-out');
    setAuthUserId(null);
    setConversations({});
    setGroupConversations({});
    setTabStacks(INITIAL_TAB_STACKS);
    setActiveTab('chats');
  }, []);

  const navigate = useCallback((screen: NavScreen) => {
    setTabStacks((prev) => ({
      ...prev,
      [activeTab]: [...prev[activeTab], screen],
    }));
  }, [activeTab]);

  const navigateToTab = useCallback((tab: TabName, screen: NavScreen) => {
    setActiveTab(tab);
    setTabStacks((prev) => ({
      ...prev,
      [tab]: [...prev[tab], screen],
    }));
  }, []);

  const returnToChat = useCallback((companionId: string) => {
    setActiveTab('chats');
    setTabStacks((prev) => ({
      ...prev,
      chats: [{ type: 'chats-list' }, { type: 'chat', companionId }],
    }));
  }, []);

  const goBack = useCallback(() => {
    setTabStacks((prev) => {
      const stack = prev[activeTab];
      if (stack.length <= 1) return prev;
      return { ...prev, [activeTab]: stack.slice(0, -1) };
    });
  }, [activeTab]);

  const switchTab = useCallback((tab: TabName) => {
    setActiveTab(tab);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const setNotificationSetting = useCallback((key: keyof NotificationSettings, enabled: boolean) => {
    setNotificationSettings((current) => ({ ...current, [key]: enabled }));
  }, []);

  const setEngineState = useCallback((s: EngineState) => {
    setEngineStateValue(s);
  }, []);

  const requestAIResponse = useCallback(async (companionId: string, message: string, options?: { groupId?: string; groupMessages?: Message[]; mentions?: MessageMention[]; attachments?: Attachment[]; mode?: import('./ai/types').AIConversationMode; modality?: import('./brain/types').InteractionModality; requestId?: string }): Promise<AIResponse> => {
    const companion = companions.find((item) => item.id === companionId);
    if (!companion) {
      return {
        status: 'error',
        provider: 'mock',
        error: { code: 'UNAVAILABLE', message: 'The selected companion is unavailable.' },
      };
    }
    setAiProcessing(true);
    try {
      const history = conversations[companionId] || [];
      const group = options?.groupId ? groups.find((item) => item.id === options.groupId && !item.archived) : undefined;
      if (options?.groupId && (!group || !group.companionIds.includes(companionId))) {
        return { status: 'error', provider: 'local', error: { code: 'AUTHENTICATION', message: 'The selected companion is not a member of this group.' } };
      }
      const response = await brain.respond(buildAIRequest(companion, history, message, engineState, options?.mode || (options?.groupId ? 'group' : 'chat'), options?.groupId, options?.groupMessages, options?.mentions, authUserId || undefined, group, groups.find((item) => item.id === options?.groupId) ? companions : [], options?.attachments || [], options?.requestId, options?.modality));
      if (currentAuthUserRef.current !== authUserId) {
        return { status: 'error', provider: 'local', error: { code: 'AUTHENTICATION', message: 'The session changed while the request was pending.' } };
      }
      if (response.status === 'success') setEngineStateValue('online');
      else if (response.error?.code === 'UNAVAILABLE') setEngineStateValue('offline');
      return response;
    } finally {
      setAiProcessing(false);
    }
  }, [authUserId, brain, companions, conversations, engineState, groups]);

  const sendMessage = useCallback((companionId: string, msg: Message) => {
    setConversations((prev) => ({
      ...prev,
      [companionId]: [...(prev[companionId] || []), msg],
    }));
  }, []);

  const addMessage = useCallback((companionId: string, msg: Message) => {
    setConversations((prev) => ({
      ...prev,
      [companionId]: [...(prev[companionId] || []).filter((item) => item.id !== msg.id), msg],
    }));
    if (authUserId) {
      void appendArchiveSafely(conversationArchive, archiveRecordFromMessage({
        userId: authUserId,
        companionId,
        conversationId: companionId,
        message: msg,
      }));
    }
    if (!authUserId || !msg.fromMe) return;
    try {
      setCompanions((prev) => prev.map((companion) => {
        if (companion.id !== companionId) return companion;
        const type = msg.type === 'voice'
          ? 'voice_interaction_completed'
          : msg.type === 'call'
            ? 'call_completed'
            : 'conversation_completed';
        const previousState = companion.relationshipState;
        const signal = {
          id: `message:${msg.id}`,
          type: type as 'voice_interaction_completed' | 'call_completed' | 'conversation_completed',
          occurredAt: msg.timestamp.toISOString(),
          sourceMessageId: msg.id,
          provenance: msg.type === 'text' ? 'completed text conversation' : `completed ${msg.type} interaction`,
          meaningful: msg.type !== 'text' || Boolean(msg.text && msg.text.trim().length >= 18),
        };
        const nextState = applyRelationshipSignal(previousState, authUserId, companionId, signal);
        return { ...companion, relationshipState: nextState };
      }));
    } catch {
      // Relationship progression is non-critical and must not affect message persistence.
    }
  }, [authUserId]);

  const updateMessage = useCallback((companionId: string, msgId: string, update: Partial<Message>) => {
    const existing = conversations[companionId]?.find((message) => message.id === msgId);
    setConversations((prev) => ({
      ...prev,
      [companionId]: (prev[companionId] || []).map((m) => (m.id === msgId ? { ...m, ...update } : m)),
    }));
    if (authUserId && existing) {
      void appendArchiveSafely(conversationArchive, archiveRecordFromMessage({
        userId: authUserId,
        companionId,
        conversationId: companionId,
        message: { ...existing, ...update },
      }));
    }
  }, [authUserId, conversations]);

  const toggleCompanionPause = useCallback((companionId: string) => {
    setCompanions((prev) => prev.map((c) => (c.id === companionId ? { ...c, isPaused: !c.isPaused } : c)));
  }, []);

  const updateCompanion = useCallback((companionId: string, update: Partial<Companion>) => {
    setCompanions((prev) => prev.map((c) => (c.id === companionId ? { ...c, ...update } : c)));
  }, []);

  const addCompanion = useCallback((companion: Companion) => {
    setCompanions((prev) => [...prev, companion]);
  }, []);

  const deleteChat = useCallback((companionId: string) => {
    setConversations((prev) => {
      const next = { ...prev };
      delete next[companionId];
      return next;
    });
    setCompanions((prev) => prev.map((c) => (c.id === companionId ? { ...c, lastMessage: undefined, lastMessageTime: undefined, unreadCount: 0 } : c)));
  }, []);

  const removeCompanionFromChats = useCallback((companionId: string) => {
    setCompanions((prev) => prev.map((c) => (c.id === companionId ? { ...c, removedFromChats: true } : c)));
  }, []);

  const createGroup = useCallback((name: string, companionIds: string[]): Group => {
    const newGroup: Group = {
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      companionIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      conversationId: `conversation-group-${Date.now()}`,
      unreadCount: 0,
    };
    setGroups((prev) => [...prev, newGroup]);
    return newGroup;
  }, []);

  const sendGroupMessage = useCallback((groupId: string, msg: Message) => {
    setGroupConversations((prev) => ({
      ...prev,
      [groupId]: [...(prev[groupId] || []).filter((item) => item.id !== msg.id), msg],
    }));
  }, []);

  const addGroupMessage = useCallback((groupId: string, msg: Message) => {
    setGroupConversations((prev) => ({
      ...prev,
      [groupId]: [...(prev[groupId] || []).filter((item) => item.id !== msg.id), msg]
        .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime()),
    }));
    const group = groups.find((item) => item.id === groupId);
    const companionId = msg.responseTargetId || group?.companionIds[0];
    if (authUserId && group && companionId) {
      void appendArchiveSafely(conversationArchive, archiveRecordFromMessage({
        userId: authUserId,
        companionId,
        conversationId: group.conversationId || group.id,
        message: msg,
        extraMetadata: { groupId },
      }));
    }
  }, [authUserId, groups]);

  const updateGroup = useCallback((groupId: string, update: Partial<Group>) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...update, updatedAt: new Date().toISOString() } : g)));
  }, []);

  const persistProactive = useCallback(async (companionId: string, proactive: Companion['proactive']) => {
    const nextCompanions = companionsRef.current.map((item) => item.id === companionId ? { ...item, proactive } : item);
    companionsRef.current = nextCompanions;
    setCompanions(nextCompanions);
    if (authUserId && hydratedRef.current) {
      await asyncStorageAdapter.write(userStorageKeys(authUserId).companions, {
        version: 1,
        updatedAt: new Date().toISOString(),
        data: nextCompanions,
      });
    }
  }, [authUserId]);

  const dispatchProactiveEvent = useCallback(async (event: ProactiveEvent) => {
    if (proactiveDispatchingRef.current) return;
    proactiveDispatchingRef.current = true;
    const companion = companionsRef.current.find((item) => item.id === event.companionId);
    if (!companion || !authUserId) {
      proactiveDispatchingRef.current = false;
      return;
    }
    try {
      const initialConfig = updateProactiveEventStatus(companion.proactive, event.id, 'dispatching');
      await persistProactive(companion.id, initialConfig);
      const prompt = `Write a brief, warm proactive ${event.channel} check-in for the user. Context: ${event.payload?.message || event.reason}. Speak naturally as ${companion.name}; do not mention scheduling or automation.`;
      const response = await requestAIResponse(companion.id, prompt, { modality: 'proactive' });
      if (response.status !== 'success' || !response.text?.trim()) {
        throw new Error(response.error?.message || 'The companion could not prepare a proactive message.');
      }

      if (event.channel === 'chat') {
        addMessage(companion.id, {
          id: `proactive-message-${event.id}`,
          fromMe: false,
          type: 'text',
          text: response.text.trim(),
          status: 'delivered',
          timestamp: new Date(),
          proactiveEventId: event.id,
        });
      } else if (event.channel === 'voice') {
        const tts = new BackendTextToSpeechProvider();
        const audioUri = await tts.speak(response.text.trim(), companion.aiConfig?.voice);
        addMessage(companion.id, {
          ...createAssistantVoiceMessage(`proactive-message-${event.id}`, response.text.trim(), audioUri),
          proactiveEventId: event.id,
        });
      }

      const current = companionsRef.current.find((item) => item.id === companion.id);
      if (!current) return;
      let nextConfig = markProactiveDelivered(current.proactive, event.id);
      if (event.channel === 'call') {
        nextConfig = updateProactiveEventStatus(nextConfig, event.id, 'invitation', new Date(), {
          message: response.text.trim(),
          invitationStatus: 'pending',
        });
      }
      await persistProactive(companion.id, nextConfig);
      if (__DEV__) console.log(`[proactive] event_complete companionId=${companion.id} type=${event.type} channel=${event.channel}`);
    } catch (error: unknown) {
      const current = companionsRef.current.find((item) => item.id === companion.id);
      if (current) {
        try {
          await persistProactive(companion.id, updateProactiveEventStatus(current.proactive, event.id, 'dispatch_failed'));
        } catch (persistError: unknown) {
          if (__DEV__) console.error(`[proactive] failure_state_persist_failed companionId=${companion.id} type=${event.type} errorName=${persistError instanceof Error ? persistError.name : 'UnknownError'}`);
        }
      }
      if (__DEV__) console.warn(`[proactive] event_failed companionId=${companion.id} type=${event.type} channel=${event.channel} errorName=${error instanceof Error ? error.name : 'UnknownError'}`);
    } finally {
      proactiveDispatchingRef.current = false;
    }
  }, [addMessage, authUserId, persistProactive, requestAIResponse]);

  const evaluateProactiveForCompanion = useCallback((companionId: string): ProactiveDecision => {
    if (proactiveDispatchingRef.current) return { status: 'not-due', reason: 'A proactive message is currently being prepared.' };
    const companion = companionsRef.current.find((item) => item.id === companionId);
    if (!companion || !authUserId) return { status: 'suppressed', reason: 'Companion is unavailable.' };
    const normalizedCompanion = { ...companion, proactive: expireScheduledMoments(companion.proactive) };
    if (normalizedCompanion.proactive !== companion.proactive) {
      void persistProactive(companionId, normalizedCompanion.proactive).catch((error: unknown) => {
        if (__DEV__) console.error(`[proactive] state_persist_failed companionId=${companionId} errorName=${error instanceof Error ? error.name : 'UnknownError'}`);
      });
    }
    const recoverableEvent = (normalizedCompanion.proactive.events || []).find((event) =>
      event.status === 'allowed' || event.status === 'dispatching');
    if (recoverableEvent) {
      void dispatchProactiveEvent(recoverableEvent);
      const candidate = (normalizedCompanion.proactive.candidates || []).find((item) => item.sourceEventId === recoverableEvent.id);
      return candidate
        ? { status: 'allowed', event: recoverableEvent, candidate }
        : { status: 'not-due', reason: 'Recovering a previously started proactive event.' };
    }
    if (!normalizedCompanion.proactive.lastDeliveredAt && !normalizedCompanion.proactive.lastEvaluatedAt && normalizedCompanion.proactive.smartCheckins) {
      const proactive = { ...normalizedCompanion.proactive, lastEvaluatedAt: new Date().toISOString() };
      void persistProactive(companionId, proactive).catch((error: unknown) => {
        if (__DEV__) console.error(`[proactive] state_persist_failed companionId=${companionId} errorName=${error instanceof Error ? error.name : 'UnknownError'}`);
      });
      if (!normalizedCompanion.proactive.schedules.some((schedule) => schedule.status === 'scheduled' && Number.isFinite(new Date(schedule.datetime).getTime()) && new Date(schedule.datetime).getTime() <= Date.now())) {
        return { status: 'not-due', reason: 'Smart check-in frequency window has not elapsed.' };
      }
    }
    const decision = evaluateProactive(normalizedCompanion, new Date(), normalizedCompanion.proactive.events || [], authUserId, normalizedCompanion.memories, { notificationsEnabled: notificationSettings.proactiveMessages });
    if (__DEV__ && 'event' in decision && decision.event) {
      console.log(`[proactive] event_evaluated companionId=${companionId} type=${decision.event.type} channel=${decision.event.channel} status=${decision.status}`);
    }
    if ('event' in decision && decision.event) {
      const persisted = appendProactiveEvent(companion.proactive, decision.event, 'candidate' in decision ? decision.candidate : undefined, authUserId);
      if (decision.status === 'allowed') {
        void persistProactive(companionId, persisted)
          .then(() => dispatchProactiveEvent(decision.event))
          .catch((error: unknown) => {
            if (__DEV__) console.error(`[proactive] state_persist_failed companionId=${companionId} type=${decision.event?.type || 'unknown'} errorName=${error instanceof Error ? error.name : 'UnknownError'}`);
          });
      } else {
        void persistProactive(companionId, persisted).catch((error: unknown) => {
          if (__DEV__) console.error(`[proactive] state_persist_failed companionId=${companionId} type=${decision.event?.type || 'unknown'} errorName=${error instanceof Error ? error.name : 'UnknownError'}`);
        });
      }
    }
    return decision;
  }, [authUserId, dispatchProactiveEvent, notificationSettings.proactiveMessages, persistProactive]);

  const evaluateAllProactive = useCallback(() => {
    if (hydrationStatus !== 'ready' || !authUserId || !appActiveRef.current) return;
    for (const companion of companionsRef.current) {
      if (!companion.proactive.enabled || companion.isPaused) continue;
      const decision = evaluateProactiveForCompanion(companion.id);
      if (decision.status === 'allowed') break;
      if (proactiveDispatchingRef.current) break;
    }
  }, [authUserId, evaluateProactiveForCompanion, hydrationStatus]);

  useEffect(() => {
    if (hydrationStatus !== 'ready' || !authUserId) return;
    const evaluate = () => evaluateAllProactive();
    evaluate();
    const timer = setInterval(evaluate, 5000);
    const subscription = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      if (state === 'active') evaluate();
    });
    if (__DEV__) console.log(`[proactive] scheduler_started appState=${AppState.currentState || 'unknown'}`);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [authUserId, evaluateAllProactive, hydrationStatus]);

  const acceptProactiveCall = useCallback((eventId: string) => {
    const match = companionsRef.current
      .map((companion) => ({ companion, event: companion.proactive.events?.find((item) => item.id === eventId) }))
      .find((item) => item.event?.status === 'invitation' && item.event.payload?.invitationStatus === 'pending');
    if (!match?.event) return;
    updateCompanion(match.companion.id, {
      proactive: updateProactiveInvitation(match.companion.proactive, eventId, 'accepted'),
    });
    navigateToTab('chats', { type: 'voice-call', companionId: match.companion.id });
  }, [navigateToTab, updateCompanion]);

  const declineProactiveCall = useCallback((eventId: string) => {
    const match = companionsRef.current
      .map((companion) => ({ companion, event: companion.proactive.events?.find((item) => item.id === eventId) }))
      .find((item) => item.event?.status === 'invitation' && item.event.payload?.invitationStatus === 'pending');
    if (!match) return;
    updateCompanion(match.companion.id, {
      proactive: updateProactiveInvitation(match.companion.proactive, eventId, 'declined'),
    });
  }, [updateCompanion]);

  const clearUnread = useCallback((companionId: string) => {
    setCompanions((prev) => prev.map((c) => (c.id === companionId ? { ...c, unreadCount: 0 } : c)));
  }, []);

  const clearGroupUnread = useCallback((groupId: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g)));
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    isAuthenticated: authStatus === 'signed-in' && Boolean(authUserId),
    authStatus,
    authUserId,
    authError,
    signIn,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    theme,
    engineState,
    conversations,
    companions,
    groups,
    activeTab,
    tabStacks,
    navigate,
    navigateToTab,
    returnToChat,
    goBack,
    switchTab,
    setTheme,
    setEngineState,
    sendMessage,
    updateMessage,
    addMessage,
    toggleCompanionPause,
    updateCompanion,
    addCompanion,
    deleteChat,
    removeCompanionFromChats,
    createGroup,
    sendGroupMessage,
    updateGroup,
    groupConversations,
    addGroupMessage,
    clearUnread,
    clearGroupUnread,
    aiProviderStatus: engineState,
    aiProcessing,
    requestAIResponse,
    evaluateProactiveForCompanion,
    evaluateAllProactive,
    acceptProactiveCall,
    declineProactiveCall,
    hydrationStatus,
    notificationSettings,
    setNotificationSetting,
  }), [authStatus, authUserId, authError, signIn, signInWithPassword, signUpWithPassword, signOut, theme, engineState, conversations, companions, groups, activeTab, tabStacks, navigate, navigateToTab, returnToChat, goBack, switchTab, setTheme, setNotificationSetting, setEngineState, sendMessage, updateMessage, addMessage, toggleCompanionPause, updateCompanion, addCompanion, deleteChat, removeCompanionFromChats, createGroup, sendGroupMessage, updateGroup, groupConversations, addGroupMessage, clearUnread, clearGroupUnread, aiProcessing, requestAIResponse, evaluateProactiveForCompanion, evaluateAllProactive, acceptProactiveCall, declineProactiveCall, hydrationStatus, notificationSettings]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
