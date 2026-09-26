import type { Attachment } from './attachments/model';

export type Theme = 'dark' | 'light';
export type NotificationSettings = Record<'newMessages' | 'proactiveMessages' | 'scheduledReminders' | 'groupActivity' | 'missedCalls', boolean>;
export type EngineState = 'online' | 'offline' | 'recovering';
export type AIProviderStatus = EngineState | 'loading' | 'unavailable';
export type HydrationStatus = 'loading' | 'ready' | 'recovered';
export type TabName = 'chats' | 'companions' | 'groups' | 'settings';

export type ScreenType =
  | 'auth'
  | 'chats-list'
  | 'chat'
  | 'voice-call'
  | 'companions-list'
  | 'companion-profile'
  | 'companion-studio'
  | 'memory'
  | 'relationship'
  | 'proactive'
  | 'groups-list'
  | 'create-group'
  | 'group-chat'
  | 'settings'
  | 'settings-appearance'
  | 'settings-engine'
  | 'settings-notifications'
  | 'search'
  | 'create-character';

export interface NavScreen {
  type: ScreenType;
  companionId?: string;
  groupId?: string;
  studioTab?: string;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'queued';
export type MessageType = 'text' | 'voice' | 'call';
export type VoicePlayState = 'idle' | 'playing' | 'paused' | 'done';

export interface Message {
  id: string;
  fromMe: boolean;
  type: MessageType;
  text?: string;
  voiceDuration?: number;
  voicePlayState?: VoicePlayState;
  voicePlayProgress?: number;
  voiceAudioUri?: string;
  voicePlaybackAvailable?: boolean;
  voiceTranscription?: string;
  voiceWaveform?: number[];
  callId?: string;
  callStatus?: 'ended' | 'failed';
  callDuration?: number;
  callStartedAt?: string;
  callEndedAt?: string;
  callOutcome?: 'completed' | 'failed' | 'cancelled';
  callFailureReason?: string;
  callProvider?: 'gemini-live';
  callUserId?: string;
  callCompanionId?: string;
  status: MessageStatus;
  timestamp: Date;
  isGenerating?: boolean;
  replyToId?: string;
  replyToText?: string;
  replyToAuthor?: string;
  mentions?: MessageMention[];
  proactiveEventId?: string;
  groupId?: string;
  responseTargetId?: string;
  attachments?: Attachment[];
}

export interface MessageMention {
  memberId: string;
  displayName: string;
}

export type MemoryScope = 'user' | 'companion' | 'relationship' | 'group';
export type MemoryStatus = 'candidate' | 'accepted' | 'rejected' | 'merged' | 'superseded' | 'archived' | 'deleted';
export type MemorySource = 'conversation' | 'user' | 'system' | 'relationship';

export interface MemoryProvenance {
  conversationId?: string;
  messageId?: string;
  sourceText?: string;
  source?: string;
}

export interface Memory {
  id: string;
  userId?: string;
  companionId?: string;
  groupId?: string;
  scope?: MemoryScope;
  type?: string;
  category?: string;
  text: string;
  content?: string;
  fact?: string;
  savedAt?: string;
  source: MemorySource | 'conversation' | 'user';
  status?: MemoryStatus;
  confidence?: number;
  importance?: number;
  relevance?: number;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
  deleted?: boolean;
  lastAccessedAt?: string;
  accessCount?: number;
  reinforcementCount?: number;
  provenance?: MemoryProvenance;
  isLowValue?: boolean;
  reason?: string;
}

export type MemoryRecord = Memory;
export type CandidateMemory = Memory;

export interface RelationshipEntry {
  id: string;
  type: 'moment' | 'milestone' | 'shared';
  text: string;
  date: string;
}

export type RelationshipStage = 'new' | 'familiar' | 'comfortable' | 'close' | 'deep';
export type RelationshipEventType =
  | 'conversation_completed'
  | 'memory_reinforced'
  | 'voice_interaction_completed'
  | 'call_completed'
  | 'return_visit'
  | 'milestone_reached';

export interface RelationshipEvent {
  id: string;
  userId: string;
  companionId: string;
  type: RelationshipEventType;
  occurredAt: string;
  sourceMessageId?: string;
  provenance?: string;
}

export interface RelationshipMilestone {
  id: string;
  type: RelationshipEventType | 'first_conversation' | 'returning_interaction' | 'meaningful_memory';
  title: string;
  achievedAt: string;
  eventId: string;
}

export interface RelationshipState {
  userId: string;
  companionId: string;
  stage: RelationshipStage;
  familiarity: number;
  trust: number;
  closeness: number;
  interactionCount: number;
  conversationCount: number;
  firstInteractionAt?: string;
  lastInteractionAt?: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  events: RelationshipEvent[];
  milestones: RelationshipMilestone[];
}

export interface ProactiveConfig {
  enabled: boolean;
  smartCheckins: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  frequency: 'low' | 'medium' | 'high';
  channels: { chat: boolean; voice: boolean; call: boolean };
  schedules: ProactiveSchedule[];
  events?: ProactiveEvent[];
  candidates?: ProactiveCandidate[];
  history?: ProactiveHistoryRecord[];
  lastDeliveredAt?: string;
  lastEvaluatedAt?: string;
}

export interface ProactiveSchedule {
  id: string;
  eventId?: string;
  userId?: string;
  companionId?: string;
  label: string;
  datetime: string;
  channel: 'chat' | 'voice' | 'call';
  message?: string;
  status?: ProactiveEventStatus | 'executed';
  createdAt?: string;
  updatedAt?: string;
  triggerType?: 'scheduled-moment';
}

export type ProactiveEventStatus =
  | 'pending'
  | 'scheduled'
  | 'evaluating'
  | 'generated'
  | 'dispatching'
  | 'allowed'
  | 'suppressed'
  | 'delivered'
  | 'evaluation_failed'
  | 'dispatch_failed'
  | 'cancelled'
  | 'expired'
  | 'invitation';

export type ProactiveCandidateStatus = 'candidate' | 'rejected' | 'scheduled' | 'delivered' | 'dismissed' | 'expired' | 'failed';

export interface ProactiveCandidate {
  id: string;
  userId: string;
  companionId: string;
  type: ProactiveEvent['type'] | 'follow-up' | 'memory-based' | 'relationship-aware';
  status: ProactiveCandidateStatus;
  reason: string;
  fingerprint: string;
  createdAt: string;
  scheduledAt?: string;
  expiresAt?: string;
  sourceEventId?: string;
  sourceMemoryId?: string;
  message?: string;
}

export interface ProactiveHistoryRecord {
  id: string;
  userId: string;
  companionId: string;
  candidateId: string;
  status: ProactiveCandidateStatus | 'evaluated' | 'suppressed';
  reason: string;
  occurredAt: string;
}

export interface ProactiveEvent {
  id: string;
  userId?: string;
  companionId: string;
  type: 'smart-checkin' | 'scheduled-moment';
  triggerType?: 'smart-checkin' | 'scheduled-moment';
  createdAt: string;
  scheduledAt?: string;
  status: ProactiveEventStatus;
  channel: 'chat' | 'voice' | 'call';
  reason: string;
  payload?: { message?: string; scheduleId?: string; invitationStatus?: 'pending' | 'accepted' | 'declined' };
}

export interface Companion {
  id: string;
  name: string;
  tagline: string;
  avatarColor: string;
  avatarColor2: string;
  initial: string;
  language: string;
  personality: string;
  isPaused: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: string;
  isOnline: boolean;
  avatarImage?: string;
  removedFromChats?: boolean;
  memories: Memory[];
  relationship: RelationshipEntry[];
  relationshipState?: RelationshipState;
  proactive: ProactiveConfig;
  aiConfig?: CompanionAIConfig;
}

export interface CompanionAIConfig {
  personality: {
    warmth: number;
    playfulness: number;
    depth: number;
    formality: number;
  };
  language: {
    primary: string;
    secondary?: string;
    codeSwitching: boolean;
  };
  voice: {
    style: string;
    pace: number;
    warmth: number;
  };
  channels: {
    chat: boolean;
    voice: boolean;
    call: boolean;
    receipts: boolean;
  };
}

export interface Group {
  id: string;
  name: string;
  companionIds: string[];
  createdAt?: string;
  updatedAt?: string;
  avatar?: string;
  conversationId?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  archived?: boolean;
  groupMemories?: Memory[];
  proactive?: ProactiveConfig;
}

export interface AppState {
  theme: Theme;
  engineState: EngineState;
  conversations: Record<string, Message[]>;
  companions: Companion[];
  groups: Group[];
  activeTab: TabName;
  tabStacks: Record<TabName, NavScreen[]>;
}

export interface AppContextValue extends AppState {
  isAuthenticated: boolean;
  authStatus: import('./auth/types').AuthStatus;
  authUserId: string | null;
  authError: string | null;
  signIn: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  navigate: (screen: NavScreen) => void;
  navigateToTab: (tab: TabName, screen: NavScreen) => void;
  returnToChat: (companionId: string) => void;
  goBack: () => void;
  switchTab: (tab: TabName) => void;
  setTheme: (theme: Theme) => void;
  setEngineState: (state: EngineState) => void;
  sendMessage: (companionId: string, msg: Message) => void;
  updateMessage: (companionId: string, msgId: string, update: Partial<Message>) => void;
  addMessage: (companionId: string, msg: Message) => void;
  toggleCompanionPause: (companionId: string) => void;
  updateCompanion: (companionId: string, update: Partial<Companion>) => void;
  addCompanion: (companion: Companion) => void;
  deleteChat: (companionId: string) => void;
  removeCompanionFromChats: (companionId: string) => void;
  createGroup: (name: string, companionIds: string[]) => Group;
  sendGroupMessage: (groupId: string, msg: Message) => void;
  updateGroup: (groupId: string, update: Partial<Group>) => void;
  groupConversations: Record<string, Message[]>;
  addGroupMessage: (groupId: string, msg: Message) => void;
  clearUnread: (companionId: string) => void;
  clearGroupUnread: (groupId: string) => void;
  aiProviderStatus: AIProviderStatus;
  aiProcessing: boolean;
  requestAIResponse: (companionId: string, message: string, options?: {
    groupId?: string;
    groupMessages?: Message[];
    mentions?: MessageMention[];
    attachments?: Attachment[];
    mode?: import('./ai/types').AIConversationMode;
    requestId?: string;
  }) => Promise<import('./ai/types').AIResponse>;
  evaluateProactiveForCompanion: (companionId: string) => import('./proactive/engine').ProactiveDecision;
  evaluateAllProactive: () => void;
  acceptProactiveCall: (eventId: string) => void;
  declineProactiveCall: (eventId: string) => void;
  hydrationStatus: HydrationStatus;
  notificationSettings: NotificationSettings;
  setNotificationSetting: (key: keyof NotificationSettings, enabled: boolean) => void;
}
