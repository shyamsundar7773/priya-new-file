/* eslint-disable react-hooks/refs */
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  BackHandler,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from './AppContext';
import { formatTime } from './data';
import type { Companion, Message, MessageMention, NavScreen, ProactiveSchedule, TabName } from './types';
import { useVoiceRecorder } from './voice/recorder';
import { useVoicePlayer } from './voice/player';
import { BackendTextToSpeechProvider } from './voice/backendTts';
import { CallService } from './voice/callService';
import { findGroup } from './groups/selection';
import { transitionCallState, type CallUiState } from './voice/callState';
import { useAudioStream } from 'expo-audio';
import { buildAIRequest } from './ai/context';
import { addExplicitMention, getMentionQuery, replaceMentionToken } from './groups/mentions';
import { transcribeVoiceRecording } from './voice/backendSpeechToText';
import { createIdempotentStop } from './voice/lifecycle';
import { createAssistantVoiceMessage, createVoiceMessageRequestId, createVoiceMessageTimer, createVoiceUserMessage, retryVoiceOperation, safeVoiceMessageFailureReason } from './voice/messagePipeline';
import { extractMemoryCandidate } from './storage/memoryStore';
import { localMemoryProvider } from './memory/provider';
import { appendScheduledMoment, cancelScheduledMoment } from './proactive/engine';
import { selectGroupResponseTarget } from './groups/context';
import { createAttachment, markAttachmentState, type Attachment } from './attachments/model';
import { appendArchiveSafely, archiveRecordFromMessage, conversationArchive } from './archive';

const palette = {
  dark: {
    bg: '#1C0F18',
    bg2: '#281520',
    bg3: '#34202C',
    panels: '#24121D',
    card: '#2A1522',
    text: '#F5E8EE',
    sub: '#C490A0',
    muted: '#8A6070',
    border: '#3C2030',
    accent: '#D4728A',
    accent2: '#E8909C',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
    online: '#6FD8A0',
  },
  light: {
    bg: '#FFF5F2',
    bg2: '#FFFFFF',
    bg3: '#FFF0EB',
    panels: '#FFF8F6',
    card: '#FFFFFF',
    text: '#2C1420',
    sub: '#7A5068',
    muted: '#B898A8',
    border: '#F0D4DC',
    accent: '#C85070',
    accent2: '#E07090',
    success: '#1F9D72',
    warning: '#EAB308',
    danger: '#DC2626',
    online: '#3EBF7A',
  },
} as const;

function getColorTheme(theme: 'light' | 'dark') {
  return palette[theme];
};

function safeCallControlError(error: unknown): { errorName: string; errorMessage: string } {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorMessage = (error instanceof Error ? error.message : String(error))
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(access[_-]?token|api[_-]?key|authorization)\b([=: ]+)[^\s,;]+/gi, '$1$2[redacted]')
    .slice(0, 180);
  return { errorName, errorMessage };
}

function useAndroidBottomInset() {
  const { height: windowHeight } = useWindowDimensions();
  const screenHeight = Dimensions.get('screen').height;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return React.useMemo(() => {
    if (Platform.OS !== 'android' || keyboardVisible) return 0;
    return Math.max(0, screenHeight - windowHeight);
  }, [keyboardVisible, screenHeight, windowHeight]);
}

function Icon({ name, color, size = 21 }: { name: React.ComponentProps<typeof Ionicons>['name']; color: string; size?: number }) {
  return <Ionicons name={name} color={color} size={size} />;
}

function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  const { theme } = useApp();
  const c = getColorTheme(theme);
  return (
    <View style={[styles.header, { backgroundColor: c.bg2, borderBottomColor: c.border }]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.iconButton}>
          <Icon name="arrow-back" color={c.text} size={21} />
        </TouchableOpacity>
      ) : <View style={{ width: 28 }} />}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={[styles.headerTitle, { color: c.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: c.sub }]}>{subtitle}</Text> : null}
      </View>
      {right ?? <View style={{ width: 28 }} />}
    </View>
  );
}

function AvatarBubble({ companion, size = 40, showOnline = false, onPress }: { companion: Companion; size?: number; showOnline?: boolean; onPress?: () => void }) {
  const { theme } = useApp();
  const c = getColorTheme(theme);
  return (
    <Pressable onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: companion.avatarColor, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: showOnline ? 2 : 0, borderColor: c.bg2 }}>
      {companion.avatarImage ? (
        <Image source={{ uri: companion.avatarImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <View style={{ width: '100%', height: '100%', backgroundColor: companion.avatarColor, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: size * 0.42, fontWeight: '700' }}>{companion.initial}</Text>
        </View>
      )}
      {showOnline ? <View style={{ position: 'absolute', right: 1, bottom: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: companion.isOnline ? c.online : c.muted, borderWidth: 2, borderColor: c.bg2 }} /> : null}
    </Pressable>
  );
}

function SwipeableMessage({ message, companion, onReply, onTogglePlay, onSpeak, isPlaying, playProgress = 0 }: { message: Message; companion: Companion; onReply: () => void; onTogglePlay?: () => void; onSpeak?: () => void; isPlaying?: boolean; playProgress?: number }) {
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 90) {
          onReply();
        }
      },
    }),
  ).current;

  const { theme } = useApp();
  const c = getColorTheme(theme);

  return (
    <View {...panResponder.panHandlers} style={[styles.messageRow, message.fromMe ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
      {!message.fromMe ? <AvatarBubble companion={companion} size={28} /> : null}
      <View style={{ alignItems: message.fromMe ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
        <Pressable onLongPress={onReply} style={[styles.bubble, message.fromMe ? { backgroundColor: c.accent, alignSelf: 'flex-end' } : { backgroundColor: c.bg3, alignSelf: 'flex-start' }]}>
        {message.replyToText ? <Text style={{ color: c.sub, fontSize: 11, marginBottom: 4 }}>Replying to {message.replyToAuthor}</Text> : null}
        {message.attachments?.map((attachment) => (
          <View key={attachment.id} style={{ marginBottom: 8 }}>
            {attachment.localUri && attachment.kind !== 'file' && attachment.mimeType.startsWith('image/') ? (
              <Image source={{ uri: attachment.localUri }} style={{ width: 180, height: 140, borderRadius: 12 }} resizeMode="cover" />
            ) : null}
            <Text style={{ color: message.fromMe ? 'rgba(255,255,255,0.82)' : c.sub, fontSize: 11 }}>
              {attachment.missing ? 'Media unavailable' : `${attachment.fileName || attachment.kind} · ${attachment.mimeType}`}
            </Text>
          </View>
        ))}
        {message.type === 'call' ? (
          <View style={styles.callMessage}>
            <View style={styles.callMessageIcon}><Icon name="call" color={message.fromMe ? '#fff' : c.accent} size={16} /></View>
            <View>
              <Text style={{ color: message.fromMe ? '#fff' : c.text, fontWeight: '700' }}>Voice call</Text>
              <Text style={{ color: message.fromMe ? 'rgba(255,255,255,0.78)' : c.sub, fontSize: 12, marginTop: 2 }}>{formatDuration(message.callDuration || 0)}</Text>
            </View>
          </View>
        ) : message.type === 'voice' ? (
          <TouchableOpacity onPress={onTogglePlay} style={styles.voiceMessage}>
            <Icon name={isPlaying ? 'pause' : 'play'} color={message.fromMe ? '#fff' : c.accent} size={18} />
            <View style={styles.waveform}>{[8, 14, 20, 12, 18, 10, 16, 7, 13].map((height, index) => <View key={index} style={[styles.waveBar, { height, backgroundColor: index / 9 * 100 < playProgress ? c.accent2 : message.fromMe ? 'rgba(255,255,255,0.75)' : c.accent }]} />)}</View>
            <Text style={{ color: message.fromMe ? '#fff' : c.text, fontSize: 12 }}>{message.voiceDuration || 0}s</Text>
          </TouchableOpacity>
        ) : <View>
          <Text style={[styles.messageText, { color: message.fromMe ? '#fff' : c.text }]}>{message.text}</Text>
          {!message.fromMe && message.text && onSpeak ? <TouchableOpacity onPress={onSpeak} style={{ alignSelf: 'flex-end', marginTop: 8, padding: 3 }} accessibilityLabel="Play message aloud">
            <Icon name="volume-high-outline" color={c.accent2} size={17} />
          </TouchableOpacity> : null}
        </View>}
        </Pressable>
        <Text style={[styles.metaText, { color: message.fromMe ? c.sub : c.muted }]}>{formatTime(message.timestamp)} {message.fromMe && message.status !== 'failed' ? '✓✓' : ''}</Text>
      </View>
    </View>
  );
}

export function AuthScreen() {
  const { signIn, signInWithPassword, signUpWithPassword, theme, authError, authStatus } = useApp();
  const c = getColorTheme(theme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.authCard}>
        <View style={[styles.authLogo, { backgroundColor: c.accent }]}><Icon name="flower-outline" color="#fff" size={42} /></View>
        <Text style={[styles.logo, { color: c.text }]}>Priya</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.subTitle, { color: c.accent2 }]}>Your AI companion, always with you</Text>
        <TouchableOpacity style={[styles.googleButton, { backgroundColor: c.bg2, borderColor: c.border }]} onPress={signIn}>
          <Text style={styles.googleMark}>G</Text><Text style={[styles.googleButtonText, { color: c.text }]}>Continue with Google</Text>
        </TouchableOpacity>
        <TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.bg2, borderColor: c.border, color: c.text, marginTop: 14 }]} />
        <TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.bg2, borderColor: c.border, color: c.text, marginTop: 10 }]} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <TouchableOpacity onPress={() => signInWithPassword(email, password)} style={[styles.secondaryButton, { borderColor: c.border, backgroundColor: c.bg2, flex: 1 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Sign In</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => signUpWithPassword(email, password)} style={[styles.secondaryButton, { borderColor: c.border, backgroundColor: c.bg2, flex: 1 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Create Account</Text></TouchableOpacity>
        </View>
        {authError ? <Text style={{ color: c.danger, textAlign: 'center', marginTop: 14 }}>{authError}</Text> : null}
        {authStatus === 'loading' ? <Text style={{ color: c.sub, textAlign: 'center', marginTop: 10 }}>Restoring session…</Text> : null}
        <Text style={[styles.termsText, { color: c.muted }]}>By continuing, you agree to our Terms of Service and{'\n'}Privacy Policy.</Text>
        <Text style={[styles.versionText, { color: c.muted, marginTop: 'auto' }]}>PRIYA COMPANION · Prototype</Text>
      </View>
    </View>
  );
}

export function ChatsListScreen() {
  const { companions, navigate, theme, deleteChat, removeCompanionFromChats } = useApp();
  const c = getColorTheme(theme);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const onSelect = (companionId: string) => {
    if (selectionMode) {
      setSelectedChatId(companionId);
      return;
    }
    navigate({ type: 'chat', companionId });
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Chats" right={<TouchableOpacity onPress={() => navigate({ type: 'search' })}><Icon name="search-outline" color={c.sub} size={21} /></TouchableOpacity>} />
      {selectionMode && selectedChatId ? (
        <View style={[styles.inlineActions, { backgroundColor: c.bg2, borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={() => { deleteChat(selectedChatId); setSelectionMode(false); setSelectedChatId(null); }}><Text style={{ color: c.danger, fontWeight: '700' }}>Delete Chat</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => { removeCompanionFromChats(selectedChatId); setSelectionMode(false); setSelectedChatId(null); }}><Text style={{ color: c.warning, fontWeight: '700' }}>Delete Contact</Text></TouchableOpacity>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.flatList}>
        {companions.filter((item) => !item.removedFromChats).map((companion) => (
          <TouchableOpacity key={companion.id} style={[styles.chatRow, { backgroundColor: c.bg, borderBottomColor: c.border }, selectionMode && selectedChatId === companion.id ? { backgroundColor: c.bg3 } : null]} onPress={() => onSelect(companion.id)} onLongPress={() => { setSelectionMode(true); setSelectedChatId(companion.id); }}>
            <AvatarBubble companion={companion} size={46} showOnline />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.nameText, { color: c.text }]}>{companion.name}</Text>
                <Text style={[styles.timeText, { color: c.sub }]}>{companion.lastMessageTime || 'Now'}</Text>
              </View>
              <Text style={[styles.previewText, { color: c.sub }]} numberOfLines={2}>{companion.lastMessage || 'Start a conversation'}</Text>
            </View>
            {companion.unreadCount > 0 ? <View style={[styles.badge, { backgroundColor: c.accent }]}><Text style={styles.badgeText}>{companion.unreadCount}</Text></View> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function ChatScreen({ companionId }: { companionId?: string }) {
  const { companions, conversations, theme, goBack, navigate, engineState, addMessage, updateMessage, clearUnread, updateCompanion, requestAIResponse, aiProcessing, authUserId } = useApp();
  const c = getColorTheme(theme);
  const companion = companions.find((item) => item.id === companionId) || companions[0];
  const messages = conversations[companionId || companion.id] || [];
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; author: string } | null>(null);
  const [voiceMode, setVoiceMode] = useState<'idle' | 'recording' | 'paused' | 'preview'>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [showCameraSheet, setShowCameraSheet] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const wasAwayFromLatestRef = useRef(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const voiceRecorder = useVoiceRecorder();
  const voicePlayer = useVoicePlayer();
  const ttsProvider = useRef(new BackendTextToSpeechProvider()).current;
  const [ttsError, setTtsError] = useState<string | null>(null);
  const voiceRequestId = useRef(0);
  const voiceInFlight = useRef(false);
  const playbackProgress = useRef(0);
  const playbackTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const voiceTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  React.useEffect(() => { clearUnread(companion.id); }, [companion.id, clearUnread]);
  React.useEffect(() => {
    if (wasAwayFromLatestRef.current) return;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);
  React.useEffect(() => () => {
    clearInterval(playbackTimer.current);
    clearInterval(voiceTimer.current);
  }, []);

  const chooseImage = async (source: 'library' | 'camera') => {
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setTtsError(source === 'camera' ? 'Camera permission was denied.' : 'Photo library permission was denied.');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setSelectedAttachment(createAttachment({
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || (source === 'camera' ? 'camera-photo.jpg' : 'selected-photo.jpg'),
        fileSize: asset.fileSize,
        kind: source === 'camera' ? 'camera-image' : 'image',
        userId: authUserId || undefined,
        companionId: companion.id,
      }));
      setShowAttachmentSheet(false);
      setShowCameraSheet(false);
      setTtsError(null);
    } catch (error: unknown) {
      setTtsError(error instanceof Error ? error.message : 'Unable to select media.');
    }
  };

  const sendText = () => {
    if (!draft.trim() && !selectedAttachment) return;
    const messageId = `msg-${Date.now()}`;
    const attachment = selectedAttachment ? markAttachmentState({ ...selectedAttachment, messageId }, 'pending') : undefined;
    const msg: Message = {
      id: messageId,
      fromMe: true,
      type: 'text',
      text: draft.trim() || undefined,
      status: engineState === 'offline' ? 'queued' : 'sending',
      timestamp: new Date(),
      attachments: attachment ? [attachment] : undefined,
      ...(replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text, replyToAuthor: replyTo.author } : {}),
    };
    addMessage(companion.id, msg);
    setDraft('');
    setSelectedAttachment(null);
    setReplyTo(null);
    if (engineState === 'offline') return;
    const sentAt = Date.now();
    if (__DEV__) console.log(`[chat-timing] send requestId=${msg.id} appSendOverheadMs=${Date.now() - sentAt}`);
    void requestAIResponse(companion.id, msg.text || 'Please help me understand this attachment.', { attachments: attachment ? [attachment] : [] }).then((response) => {
      if (response.status !== 'success' || !response.text) {
        updateMessage(companion.id, msg.id, { status: response.status === 'offline' ? 'queued' : 'failed', attachments: attachment ? [markAttachmentState(attachment, 'failed', 'failed')] : undefined });
        return;
      }
      updateMessage(companion.id, msg.id, { status: 'delivered', attachments: attachment ? [markAttachmentState(attachment, 'sent', 'ready')] : undefined });
      addMessage(companion.id, {
        id: `resp-${Date.now()}`,
        fromMe: false,
        type: 'text',
        text: response.text,
        status: 'delivered',
        timestamp: new Date(),
      });
      if (__DEV__) console.log(`[chat-timing] ui_rendered requestId=${msg.id} totalPerceivedMs=${Date.now() - sentAt}`);
    }).catch(() => {
      updateMessage(companion.id, msg.id, { status: 'failed', attachments: attachment ? [markAttachmentState(attachment, 'failed', 'failed')] : undefined });
    });
  };

  const handleVoiceState = async () => {
    if (voiceMode === 'idle') {
      const started = await voiceRecorder.start();
      if (started) {
        setVoiceMode('recording');
        setRecordSeconds(0);
      } else {
        setVoiceMode('idle');
      }
    } else if (voiceMode === 'recording') {
      voiceRecorder.pause();
      setVoiceMode('paused');
    } else if (voiceMode === 'paused') {
      voiceRecorder.resume();
      setVoiceMode('recording');
    } else {
      await voiceRecorder.stop();
      setVoiceMode('idle');
      setRecordSeconds(0);
    }
  };

  const stopRecording = async () => {
    const uri = await voiceRecorder.stop();
    if (uri) {
      setRecordSeconds(voiceRecorder.duration);
      setVoiceMode('preview');
    }
  };

  const toggleVoicePlayback = (message: Message) => {
      if (message.voiceAudioUri) {
        void voicePlayer.toggle(message.voiceAudioUri).then((started) => setPlayingId(started ? message.id : null));
        return;
      }
      if (playingId === message.id) {
        clearInterval(playbackTimer.current);
        setPlayingId(null);
        return;
      }
      clearInterval(playbackTimer.current);
      const duration = Math.max(message.voiceDuration || 1, 1);
      setPlayingId(message.id);
      setPlayProgress(0);
      playbackProgress.current = 0;
      updateMessage(companion.id, message.id, { voicePlayState: 'playing', voicePlayProgress: 0 });
      playbackTimer.current = setInterval(() => {
        const progress = Math.min(playbackProgress.current + (100 / (duration * 20)), 100);
        playbackProgress.current = progress;
        setPlayProgress(progress);
        updateMessage(companion.id, message.id, { voicePlayProgress: progress });
        if (progress >= 100) {
          clearInterval(playbackTimer.current);
          setPlayingId(null);
          updateMessage(companion.id, message.id, { voicePlayState: 'done', voicePlayProgress: 100 });
        }
      }, 50);
    };

    const speakMessage = async (message: Message) => {
      if (!message.text) return;
      setTtsError(null);
      try {
        const uri = await ttsProvider.speak(message.text, companion.aiConfig?.voice);
        await voicePlayer.toggle(uri);
      } catch (error: unknown) {
        setTtsError(error instanceof Error ? error.message : 'Voice playback is unavailable.');
      }
    };

  const sendVoice = async () => {
    const audioUri = voiceRecorder.uri;
    if (!audioUri || engineState === 'offline' || voiceInFlight.current) return;
    voiceInFlight.current = true;
    const requestId = ++voiceRequestId.current;
    const operationId = createVoiceMessageRequestId();
    setTtsError(null);
    const voiceMessageId = `v-${operationId}`;
    const msg: Message = {
      ...createVoiceUserMessage(voiceMessageId, audioUri, recordSeconds || 12),
      status: 'sending',
    };
    const elapsedMs = createVoiceMessageTimer();
    if (__DEV__) console.log(`[voice-message] stage=recording_ready requestId=${operationId} durationSeconds=${recordSeconds || 12}`);
    addMessage(companion.id, msg);
    setVoiceMode('idle');
    setRecordSeconds(0);
    setPreviewPlaying(false);
    voiceRecorder.discard();
    try {
      const transcription = await retryVoiceOperation(() => transcribeVoiceRecording(audioUri, `${operationId}:stt`));
      if (__DEV__) console.log(`[voice-message] stage=stt_complete requestId=${operationId} durationMs=${elapsedMs()} transcriptLength=${transcription.text.length}`);
      updateMessage(companion.id, msg.id, { text: transcription.text });
      const candidate = extractMemoryCandidate(transcription.text, {
        companionId: companion.id,
        scope: 'companion',
        source: 'conversation',
        provenance: { messageId: msg.id, sourceText: transcription.text, source: 'voice-transcription' },
      });
      if (candidate.status !== 'rejected') {
        updateCompanion(companion.id, {
          memories: localMemoryProvider.promote(companion.memories, candidate),
        });
      }
      const response = await retryVoiceOperation(() => requestAIResponse(companion.id, transcription.text, {
        mode: 'voice',
        requestId: `${operationId}:chat`,
      }));
      const assistantText = response.text;
      if (response.status !== 'success' || !assistantText) throw new Error(response.error?.message || 'Voice AI response unavailable.');
      if (__DEV__) console.log(`[voice-message] stage=chat_complete requestId=${operationId} durationMs=${elapsedMs()}`);
      const audioReplyUri = await retryVoiceOperation(() => ttsProvider.speak(assistantText, companion.aiConfig?.voice, `${operationId}:tts`));
      updateMessage(companion.id, msg.id, { status: 'delivered', text: transcription.text });
      const assistantVoice = createAssistantVoiceMessage(`resp-voice-${msg.id}`, assistantText, audioReplyUri);
      addMessage(companion.id, assistantVoice);
      if (__DEV__) console.log(`[voice-message] stage=message_inserted requestId=${operationId} durationMs=${elapsedMs()}`);
      if (voiceRequestId.current === requestId) {
        setTtsError(null);
        const playbackRequested = await voicePlayer.toggle(audioReplyUri);
        if (playbackRequested) {
          if (__DEV__) console.log(`[voice-message] stage=playback_requested requestId=${operationId} durationMs=${elapsedMs()}`);
        } else {
          if (__DEV__) console.warn(`[voice-message] stage=playback_failed requestId=${operationId} category=audio`);
          setTtsError('The response is ready, but audio playback is unavailable.');
        }
      }
    } catch (error: unknown) {
      updateMessage(companion.id, msg.id, { status: 'failed' });
      if (voiceRequestId.current === requestId) {
        setTtsError(error instanceof Error ? error.message : 'Voice message processing failed.');
      }
      if (__DEV__) console.warn(`[voice-message] stage=failed requestId=${operationId} category=${safeVoiceMessageFailureReason(error)} durationMs=${elapsedMs()}`);
    } finally {
      voiceInFlight.current = false;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0}
      style={[styles.screen, { backgroundColor: c.bg }]}
      enabled
    >
      {avatarViewerOpen ? (
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: c.bg2, width: '84%' }]}>
            <AvatarBubble companion={companion} size={120} />
            <Text style={[styles.sectionHeading, { color: c.text, marginTop: 16 }]}>{companion.name}</Text>
            <TouchableOpacity onPress={async () => {
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.8 });
              if (!result.canceled && result.assets[0]) {
                updateCompanion(companion.id, { avatarImage: result.assets[0].uri });
              }
            }} style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 16 }]}><Text style={styles.primaryButtonText}>Change Image</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setAvatarViewerOpen(false); navigate({ type: 'companion-studio', companionId: companion.id }); }} style={[styles.secondaryButton, { backgroundColor: c.bg3, borderColor: c.border, marginTop: 12 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>!</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setAvatarViewerOpen(false)} style={{ marginTop: 16 }}><Text style={{ color: c.sub }}>Close</Text></TouchableOpacity>
          </View>
        </View>
      ) : null}
      <View style={[styles.chatHeader, { backgroundColor: c.bg2, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.iconButton}><Icon name="arrow-back" color={c.text} /></TouchableOpacity>
        <TouchableOpacity onPress={() => navigate({ type: 'companion-profile', companionId: companion.id })} style={styles.chatIdentity}>
          <AvatarBubble companion={companion} size={40} showOnline onPress={() => setAvatarViewerOpen(true)} />
          <View><Text style={[styles.chatName, { color: c.text }]}>{companion.name}</Text><Text style={{ color: companion.isPaused ? c.accent : c.online, fontSize: 12 }}>{companion.isPaused ? 'Paused' : companion.isOnline ? 'Online' : 'Away'}</Text></View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigate({ type: 'voice-call', companionId: companion.id })} style={[styles.roundIcon, { backgroundColor: c.bg3 }]}><Icon name="call-outline" color={c.text} size={18} /></TouchableOpacity>
        <TouchableOpacity onPress={() => navigate({ type: 'companion-profile', companionId: companion.id })} style={[styles.roundIcon, { backgroundColor: c.bg3 }]}><Icon name="ellipsis-horizontal" color={c.text} size={18} /></TouchableOpacity>
      </View>
      {companion.isPaused ? <View style={[styles.noticeBar, { backgroundColor: '#332B1F', borderColor: '#8B5E2B' }]}><Text style={{ color: '#FCD34D' }}>Paused: messages will queue until resumed.</Text></View> : null}
      {engineState !== 'online' ? <View style={[styles.noticeBar, { backgroundColor: engineState === 'offline' ? '#3B1F2B' : '#332B1F', borderColor: engineState === 'offline' ? '#8B3A55' : '#8B5E2B' }]}><Text style={{ color: engineState === 'offline' ? '#FCA5A5' : '#FCD34D' }}>{engineState === 'offline' ? 'Companion engine is offline. Messages will be queued.' : 'Companion engine is recovering. Messages may take a moment.'}</Text></View> : null}
      <View style={{ flex: 1, position: 'relative' }}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 72 }} onContentSizeChange={() => {
        if (!wasAwayFromLatestRef.current) scrollRef.current?.scrollToEnd({ animated: false });
      }} onScroll={(event) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const awayFromLatest = contentSize.height - (contentOffset.y + layoutMeasurement.height) > 80;
        wasAwayFromLatestRef.current = awayFromLatest;
        setShowLatest(awayFromLatest);
      }} scrollEventThrottle={16}>
        {messages.map((message) => (
          <SwipeableMessage key={message.id} message={message} companion={companion} onReply={() => setReplyTo({ id: message.id, text: message.text || 'Voice message', author: message.fromMe ? 'You' : companion.name })} onSpeak={() => void speakMessage(message)} onTogglePlay={() => toggleVoicePlayback(message)} isPlaying={message.voiceAudioUri ? voicePlayer.playingUri === message.voiceAudioUri : playingId === message.id} playProgress={message.voiceAudioUri && voicePlayer.playingUri === message.voiceAudioUri ? voicePlayer.playbackProgress : playingId === message.id ? playProgress : message.voicePlayProgress || 0} />
        ))}
        {aiProcessing ? <View style={[styles.typingIndicator, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={{ color: c.sub }}>{companion.name} is thinking…</Text></View> : null}
        {ttsError ? <Text style={{ color: c.danger, marginTop: 8 }}>{ttsError}</Text> : null}
      </ScrollView>
      {showLatest ? <TouchableOpacity testID="chat-jump-to-latest" accessibilityLabel="Jump to latest message" onPress={() => { wasAwayFromLatestRef.current = false; scrollRef.current?.scrollToEnd({ animated: true }); setShowLatest(false); }} style={[styles.latestButton, { backgroundColor: c.bg2, borderColor: c.border, bottom: 12 }]}><Icon name="arrow-down" color={c.accent} size={20} /></TouchableOpacity> : null}
      </View>
      {replyTo ? (
        <View style={[styles.replyBar, { backgroundColor: c.bg2, borderColor: c.border }]}>
          <Text style={{ color: c.accent, fontWeight: '600' }}>Replying to {replyTo.author}</Text>
          <Text style={{ color: c.sub }} numberOfLines={1}>{replyTo.text}</Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}><Text style={{ color: c.sub }}>Cancel</Text></TouchableOpacity>
        </View>
      ) : null}
      {voiceMode !== 'idle' ? (
        <View style={[styles.recordingBar, { backgroundColor: c.bg2, borderColor: c.border }]}>
          <View style={styles.recordingInfo}><View style={[styles.recordDot, { backgroundColor: voiceMode === 'recording' ? '#EF4444' : c.accent }]} /><Text style={{ color: c.text }}>{voiceMode === 'preview' ? 'Preview' : voiceMode === 'paused' ? 'Paused' : 'Recording'} • {voiceRecorder.duration || recordSeconds}s</Text></View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => { voiceRecorder.discard(); clearInterval(voiceTimer.current); setVoiceMode('idle'); setRecordSeconds(0); setPreviewPlaying(false); }} style={[styles.smallAction, { backgroundColor: c.bg3 }]}><Icon name="trash-outline" color={c.text} size={18} /></TouchableOpacity>
            {voiceMode !== 'preview' ? <TouchableOpacity onPress={handleVoiceState} style={[styles.smallAction, { backgroundColor: c.bg3 }]}><Icon name={voiceMode === 'recording' ? 'pause' : 'play'} color={c.text} size={18} /></TouchableOpacity> : null}
            {voiceMode === 'recording' || voiceMode === 'paused' ? <TouchableOpacity onPress={stopRecording} style={[styles.smallAction, { backgroundColor: c.bg3 }]}><Icon name="stop" color={c.text} size={18} /></TouchableOpacity> : null}
            {voiceMode === 'preview' ? <TouchableOpacity onPress={() => setPreviewPlaying((value) => !value)} style={[styles.smallAction, { backgroundColor: c.bg3 }]}><Icon name={previewPlaying ? 'pause' : 'play'} color={c.text} size={18} /></TouchableOpacity> : null}
            {voiceMode === 'preview' ? <TouchableOpacity onPress={sendVoice} style={[styles.smallAction, { backgroundColor: c.accent }]}><Icon name="send" color="#fff" size={18} /></TouchableOpacity> : null}
          </View>
        </View>
      ) : null}
      <View testID="chat-composer" style={[styles.composer, { backgroundColor: c.bg2, borderTopColor: c.border }]}>
        <TouchableOpacity onPress={() => setShowAttachmentSheet(true)} accessibilityLabel="Add attachment" style={[styles.composeIcon, { backgroundColor: c.bg3 }]}><Icon name="add" color={c.sub} /></TouchableOpacity>
        <TouchableOpacity onPress={() => setShowCameraSheet(true)} accessibilityLabel="Open camera" style={[styles.composeIcon, { backgroundColor: c.bg3 }]}><Icon name="camera-outline" color={c.sub} /></TouchableOpacity>
        <TextInput
          testID="chat-message-input"
          accessibilityLabel="Message composer"
          value={draft}
          onChangeText={setDraft}
          placeholder="Message..."
          placeholderTextColor={c.sub}
          style={[styles.input, styles.chatMessageInput, { backgroundColor: c.bg3, color: c.text }]}
          multiline
          scrollEnabled
          returnKeyType="default"
        />
        <TouchableOpacity testID="chat-voice-button" onPress={handleVoiceState} accessibilityLabel="Voice message" style={[styles.composeIcon, { backgroundColor: c.bg3 }]}><Icon name="mic-outline" color={c.sub} /></TouchableOpacity>
        <TouchableOpacity testID="chat-send-button" onPress={sendText} accessibilityLabel="Send message" style={[styles.sendButton, { backgroundColor: c.accent }]}><Icon name="send" color="#fff" size={18} /></TouchableOpacity>
      </View>
      {showAttachmentSheet ? <View style={styles.bottomOverlay}><View style={[styles.attachSheet, { backgroundColor: c.bg2 }]}><View style={[styles.sheetHandle, { backgroundColor: c.border }]} /><View style={styles.attachGrid}>{[
        ['image-outline', 'Photo / Gallery', '#8B5CF6'],
        ['document-text-outline', 'Document', '#3B82F6'],
        ['location-outline', 'Location', '#10B981'],
        ['person-outline', 'Contact', '#F59E0B'],
      ].map(([icon, label, color]) => <TouchableOpacity key={label} onPress={async () => {
        if (label === 'Photo / Gallery') await chooseImage('library');
        if (label === 'Document') setTtsError('Document selection is not available in this build.');
        setShowAttachmentSheet(false);
      }} style={styles.attachOption}><View style={[styles.attachIcon, { backgroundColor: `${color}22`, borderColor: `${color}66` }]}><Icon name={icon as React.ComponentProps<typeof Ionicons>['name']} color={color} size={25} /></View><Text style={{ color: c.sub, fontSize: 11, textAlign: 'center' }}>{label}</Text></TouchableOpacity>)}</View></View></View> : null}
      {selectedAttachment ? <View style={[styles.attachmentPreview, { backgroundColor: c.bg2, borderColor: c.border }]}>
        {selectedAttachment.localUri ? <Image source={{ uri: selectedAttachment.localUri }} style={{ width: 52, height: 52, borderRadius: 8 }} /> : null}
        <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '600' }}>{selectedAttachment.fileName || 'Attachment'}</Text><Text style={{ color: c.sub, fontSize: 11 }}>{selectedAttachment.mimeType}</Text></View>
        <TouchableOpacity onPress={() => setSelectedAttachment(null)}><Icon name="close-circle" color={c.sub} size={22} /></TouchableOpacity>
      </View> : null}
      {showCameraSheet ? <View style={styles.cameraOverlay}><View style={styles.cameraPreview}><Icon name="camera-outline" color="rgba(255,255,255,0.35)" size={60} /></View><View style={styles.cameraControls}><TouchableOpacity onPress={() => setShowCameraSheet(false)} style={styles.cameraClose}><Icon name="close" color="#fff" size={24} /></TouchableOpacity><TouchableOpacity onPress={() => void chooseImage('camera')} style={styles.shutter}><View style={styles.shutterInner} /></TouchableOpacity><TouchableOpacity onPress={() => setShowCameraSheet(false)} style={styles.cameraClose}><Icon name="flash-outline" color="#fff" size={24} /></TouchableOpacity></View></View> : null}
    </KeyboardAvoidingView>
  );
}

export function CompanionsListScreen() {
  const { companions, navigate, theme, hydrationStatus } = useApp();
  const c = getColorTheme(theme);
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.companionsHeader, { backgroundColor: c.bg2, borderBottomColor: c.border }]}>
        <Text style={[styles.companionsTitle, { color: c.text }]}>Companions</Text>
        <TouchableOpacity accessibilityLabel="Create character" onPress={() => navigate({ type: 'create-character' })} style={[styles.addCompanionButton, { backgroundColor: c.accent }]}>
          <Icon name="add" color="#fff" size={23} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.companionGrid}>
        {hydrationStatus === 'loading' ? (
          <View style={styles.stateBlock}><Icon name="sync-outline" color={c.accent} size={28} /><Text style={[styles.stateTitle, { color: c.text }]}>Loading companions…</Text><Text style={[styles.stateMessage, { color: c.sub }]}>Restoring your companion list.</Text></View>
        ) : companions.length === 0 ? (
          <View style={styles.stateBlock}><Icon name="people-outline" color={c.accent} size={34} /><Text style={[styles.stateTitle, { color: c.text }]}>No companions yet</Text><Text style={[styles.stateMessage, { color: c.sub }]}>Create your first companion to get started.</Text><TouchableOpacity accessibilityLabel="Create your first companion" onPress={() => navigate({ type: 'create-character' })} style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 16 }]}><Text style={styles.primaryButtonText}>Create companion</Text></TouchableOpacity></View>
        ) : companions.map((companion) => (
          <TouchableOpacity key={companion.id} style={[styles.companionCard, { backgroundColor: c.bg2, borderColor: c.border }]} onPress={() => navigate({ type: 'companion-profile', companionId: companion.id })}>
            <AvatarBubble companion={companion} size={80} showOnline />
            <Text style={[styles.nameText, { color: c.text, marginTop: 14 }]}>{companion.name}</Text>
            <Text style={[styles.previewText, { color: c.accent2, textAlign: 'center', minHeight: 38 }]}>{companion.tagline}</Text>
            <View style={[styles.languagePill, { backgroundColor: c.bg3 }]}><Text style={{ color: c.accent2, fontSize: 12 }}>{companion.language}</Text></View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function CompanionProfileScreen({ companionId }: { companionId: string }) {
  const { companions, navigate, goBack, theme, toggleCompanionPause } = useApp();
  const c = getColorTheme(theme);
  const companion = companions.find((item) => item.id === companionId) || companions[0];
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title={companion.name} onBack={goBack} right={<TouchableOpacity onPress={() => toggleCompanionPause(companion.id)}><Text style={{ color: c.accent }}>{companion.isPaused ? 'Resume' : 'Pause'}</Text></TouchableOpacity>} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={[styles.heroPanel, { backgroundColor: c.bg2, borderColor: c.border }]}>
          <TouchableOpacity accessibilityLabel={`View ${companion.name} image`} onPress={() => setAvatarViewerOpen(true)} style={[styles.avatarHero, { backgroundColor: companion.avatarColor }]}>
            {companion.avatarImage ? <Image source={{ uri: companion.avatarImage }} style={styles.avatarHeroImage} resizeMode="cover" /> : <Text style={styles.avatarTextLarge}>{companion.initial}</Text>}
          </TouchableOpacity>
          <Text style={[styles.heroName, { color: c.text }]}>{companion.name}</Text>
          <Text style={[styles.heroTag, { color: c.sub }]}>{companion.tagline}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity onPress={() => navigate({ type: 'chat', companionId: companion.id })} style={[styles.primaryButton, { backgroundColor: c.accent }]}><Text style={styles.primaryButtonText}>Message</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => navigate({ type: 'voice-call', companionId: companion.id })} style={[styles.secondaryButton, { backgroundColor: c.bg3, borderColor: c.border }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Call</Text></TouchableOpacity>
          </View>
        </View>
        <View style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}
        >
          <Text style={[styles.sectionHeading, { color: c.text }]}>Studio</Text>
          {['Identity & Personality', 'Memory', 'Relationship', 'Proactive Behavior'].map((label) => (
            <TouchableOpacity key={label} onPress={() => navigate({ type: label === 'Memory' ? 'memory' : label === 'Relationship' ? 'relationship' : label === 'Proactive Behavior' ? 'proactive' : 'companion-studio', companionId: companion.id })} style={[styles.listRow, { borderBottomColor: c.border }]}>
              <Text style={{ color: c.text }}>{label}</Text>
              <Text style={{ color: c.sub }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
          <Text style={[styles.sectionHeading, { color: c.text }]}>About</Text>
          <Text style={{ color: c.sub, lineHeight: 22 }}>{companion.personality}</Text>
        </View>
      </ScrollView>
      {avatarViewerOpen ? <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: c.bg2, width: '84%' }]}>
          <AvatarBubble companion={companion} size={180} />
          <Text style={[styles.sectionHeading, { color: c.text, marginTop: 16 }]}>{companion.name}</Text>
          <TouchableOpacity onPress={() => { setAvatarViewerOpen(false); navigate({ type: 'companion-studio', companionId: companion.id }); }} style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 16 }]}><Text style={styles.primaryButtonText}>Change Image</Text></TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Open companion studio" onPress={() => { setAvatarViewerOpen(false); navigate({ type: 'companion-studio', companionId: companion.id }); }} style={[styles.secondaryButton, { backgroundColor: c.bg3, borderColor: c.border, marginTop: 12 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>!</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setAvatarViewerOpen(false)} style={{ marginTop: 16 }}><Text style={{ color: c.sub }}>Close</Text></TouchableOpacity>
        </View>
      </View> : null}
    </View>
  );
}

export function CompanionStudioScreen({ companionId }: { companionId: string }) {
  const { companions, theme, updateCompanion, goBack } = useApp();
  const c = getColorTheme(theme);
  const companion = companions.find((item) => item.id === companionId) || companions[0];
  const savedAI = companion.aiConfig;
  const languageParts = companion.language.split('&').map((value) => value.trim());
  const [name, setName] = useState(companion.name);
  const [personality, setPersonality] = useState(companion.personality);
  const [primaryLanguage] = useState(savedAI?.language.primary || languageParts[0] || 'English');
  const [secondaryLanguage] = useState(savedAI?.language.secondary || languageParts[1] || 'English');
  const [codeSwitching, setCodeSwitching] = useState(savedAI?.language.codeSwitching ?? languageParts.length > 1);
  const [warmth, setWarmth] = useState(savedAI?.personality.warmth ?? 75);
  const [playfulness, setPlayfulness] = useState(savedAI?.personality.playfulness ?? 55);
  const [depth, setDepth] = useState(savedAI?.personality.depth ?? 80);
  const [formality, setFormality] = useState(savedAI?.personality.formality ?? 25);
  const [pace, setPace] = useState(savedAI?.voice.pace ?? 50);
  const [voiceWarmth, setVoiceWarmth] = useState(savedAI?.voice.warmth ?? 80);
  const [channels, setChannels] = useState(savedAI?.channels ?? { chat: true, voice: false, call: false, receipts: true });
  const [tab, setTab] = useState<'Identity' | 'Personality' | 'Language' | 'Voice' | 'Channel'>('Identity');
  const [saved, setSaved] = useState(false);
  const tabs = ['Identity', 'Personality', 'Language', 'Voice', 'Channel'] as const;
  const save = () => {
    updateCompanion(companion.id, {
      name,
      personality,
      language: companion.language,
      aiConfig: {
        personality: { warmth, playfulness, depth, formality },
        language: { primary: primaryLanguage, secondary: secondaryLanguage, codeSwitching },
        voice: { style: 'Warm & Natural', pace, warmth: voiceWarmth },
        channels,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.studioHeader, { backgroundColor: c.bg2, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.iconButton}><Icon name="arrow-back" color={c.text} size={22} /></TouchableOpacity>
        <Text style={[styles.studioTitle, { color: c.text }]}>Companion Studio</Text>
        <TouchableOpacity onPress={save} style={[styles.savePill, { backgroundColor: c.accent }]}><Text style={styles.savePillText}>Save</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.studioTabs, { backgroundColor: c.bg2, borderBottomColor: c.border }]}>{tabs.map((item) => <TouchableOpacity key={item} onPress={() => setTab(item)} style={[styles.studioTab, tab === item && { borderBottomColor: c.accent }]}><Text style={{ color: tab === item ? c.accent : c.sub, fontWeight: tab === item ? '700' : '500' }}>{item}</Text></TouchableOpacity>)}</ScrollView>
      <ScrollView key={tab} style={styles.studioContent} contentContainerStyle={styles.studioContentInner} keyboardShouldPersistTaps="handled">
        {tab === 'Identity' ? <><Text style={[styles.studioIntroLabel, { color: c.accent2 }]}>Display Name</Text><TextInput value={name} onChangeText={setName} style={[styles.studioField, { backgroundColor: c.bg2, borderColor: c.border, color: c.text }]} /><Text style={[styles.studioIntroLabel, { color: c.accent2 }]}>Tagline</Text><TextInput value={companion.tagline} editable={false} style={[styles.studioField, { backgroundColor: c.bg2, borderColor: c.border, color: c.text }]} /><Text style={[styles.studioIntroLabel, { color: c.accent2 }]}>Personality</Text><TextInput value={personality} onChangeText={setPersonality} multiline style={[styles.studioField, styles.studioTextarea, { backgroundColor: c.bg2, borderColor: c.border, color: c.text }]} /></> : null}
        {tab === 'Personality' ? <><Text style={[styles.studioIntro, { color: c.accent2 }]}>Fine-tune how {companion.name} expresses herself.</Text><StudioSlider label="Warmth" value={warmth} onChange={setWarmth} c={c} /><StudioSlider label="Playfulness" value={playfulness} onChange={setPlayfulness} c={c} /><StudioSlider label="Depth" value={depth} onChange={setDepth} c={c} /><StudioSlider label="Formality" value={formality} onChange={setFormality} c={c} /></> : null}
        {tab === 'Language' ? <><Text style={[styles.studioIntro, { color: c.accent2 }]}>Configure language and code-switching.</Text><Text style={[styles.studioIntroLabel, { color: c.accent2 }]}>Primary Language</Text><View style={[styles.studioField, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={{ color: c.text }}>{primaryLanguage}</Text></View><Text style={[styles.studioIntroLabel, { color: c.accent2 }]}>Secondary Language</Text><View style={[styles.studioField, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={{ color: c.text }}>{secondaryLanguage}</Text></View><StudioToggleRow title="Natural code-switching" subtitle="Mix languages naturally" value={codeSwitching} onChange={setCodeSwitching} c={c} /></> : null}
        {tab === 'Voice' ? <><Text style={[styles.studioIntro, { color: c.accent2 }]}>Configure {companion.name}&apos;s voice.</Text><Text style={[styles.studioIntroLabel, { color: c.accent2 }]}>Voice Style</Text><View style={[styles.studioField, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={{ color: c.text }}>Warm &amp; Natural</Text></View><StudioSlider label="Speaking Pace" value={pace} onChange={setPace} c={c} /><StudioSlider label="Voice Warmth" value={voiceWarmth} onChange={setVoiceWarmth} c={c} /></> : null}
        {tab === 'Channel' ? <><Text style={[styles.studioIntro, { color: c.accent2 }]}>Control how {companion.name} communicates.</Text><StudioToggleRow title="Chat messages" subtitle="Receive text replies" value={channels.chat} onChange={(value) => setChannels((current) => ({ ...current, chat: value }))} c={c} /><StudioToggleRow title="Voice messages" subtitle="Receive voice memo replies" value={channels.voice} onChange={(value) => setChannels((current) => ({ ...current, voice: value }))} c={c} /><StudioToggleRow title="Calls" subtitle="Allow companion to call you" value={channels.call} onChange={(value) => setChannels((current) => ({ ...current, call: value }))} c={c} /><StudioToggleRow title="Read receipts" subtitle={`Let ${companion.name} know when you've read`} value={channels.receipts} onChange={(value) => setChannels((current) => ({ ...current, receipts: value }))} c={c} /></> : null}
        {saved ? <View style={[styles.savedToast, { backgroundColor: c.bg3, borderColor: c.border }]}><Icon name="checkmark-circle" color={c.success} /><Text style={{ color: c.text }}>Saved</Text></View> : null}
      </ScrollView>
    </View>
  );
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function StudioSlider({ label, value, onChange, c }: { label: string; value: number; onChange: (value: number) => void; c: ReturnType<typeof getColorTheme> }) {
  const trackWidth = useRef(0);
  const updateFromX = (x: number) => onChange(Math.max(0, Math.min(100, Math.round((x / Math.max(trackWidth.current, 1)) * 100))));
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => updateFromX(event.nativeEvent.locationX),
    onPanResponderMove: (event) => updateFromX(event.nativeEvent.locationX),
  })).current;
  return <View style={styles.sliderBlock}><View style={styles.sliderLabelRow}><Text style={[styles.sliderLabel, { color: c.text }]}>{label}</Text><Text style={[styles.sliderValue, { color: c.accent }]}>{value}%</Text></View><View onLayout={(event) => { trackWidth.current = event.nativeEvent.layout.width; }} {...responder.panHandlers} style={[styles.sliderTrack, { backgroundColor: c.bg3 }]}><View style={[styles.sliderFill, { width: `${value}%`, backgroundColor: c.accent }]} /><View style={[styles.sliderThumb, { left: `${value}%`, backgroundColor: c.accent }]} /></View></View>;
}

function StudioToggleRow({ title, subtitle, value, onChange, c }: { title: string; subtitle: string; value: boolean; onChange: (value: boolean) => void; c: ReturnType<typeof getColorTheme> }) {
  return <TouchableOpacity onPress={() => onChange(!value)} style={[styles.studioToggleRow, { borderBottomColor: c.border }]}><View style={{ flex: 1 }}><Text style={[styles.studioToggleTitle, { color: c.text }]}>{title}</Text><Text style={[styles.studioToggleSubtitle, { color: c.accent2 }]}>{subtitle}</Text></View><View style={[styles.switch, { backgroundColor: value ? c.accent : c.bg3 }]}><View style={[styles.switchThumb, value && { alignSelf: 'flex-end' }]} /></View></TouchableOpacity>;
}

export function MemoryScreen({ companionId }: { companionId: string }) {
  const { companions, theme, goBack } = useApp();
  const c = getColorTheme(theme);
  const companion = companions.find((item) => item.id === companionId) || companions[0];
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Memory" subtitle={companion.name} onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {companion.memories.map((memory) => (
          <View key={memory.id} style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
            <Text style={{ color: c.text, fontWeight: '600' }}>{memory.category}</Text>
            <Text style={{ color: c.sub, marginTop: 6 }}>{memory.text}</Text>
            <Text style={{ color: c.muted, marginTop: 10, fontSize: 12 }}>{memory.savedAt}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function RelationshipScreen({ companionId }: { companionId: string }) {
  const { companions, theme, goBack } = useApp();
  const c = getColorTheme(theme);
  const companion = companions.find((item) => item.id === companionId) || companions[0];
  const relationship = companion.relationshipState;
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Relationship" subtitle={companion.name} onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {relationship ? <View style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
          <Text style={[styles.sectionHeading, { color: c.text }]}>{relationship.stage[0].toUpperCase() + relationship.stage.slice(1)}</Text>
          <Text style={{ color: c.sub, marginTop: 6 }}>{relationship.conversationCount} conversations · {relationship.interactionCount} interactions</Text>
          <Text style={{ color: c.sub, marginTop: 4 }}>Familiarity {relationship.familiarity}% · Trust {relationship.trust}% · Closeness {relationship.closeness}%</Text>
        </View> : null}
        {relationship?.milestones.slice().reverse().map((milestone) => (
          <View key={milestone.id} style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>MILESTONE</Text>
            <Text style={{ color: c.text, marginTop: 6 }}>{milestone.title}</Text>
            <Text style={{ color: c.sub, marginTop: 10, fontSize: 12 }}>{milestone.achievedAt}</Text>
          </View>
        ))}
        {companion.relationship.map((entry) => (
          <View key={entry.id} style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{entry.type.toUpperCase()}</Text>
            <Text style={{ color: c.text, marginTop: 6 }}>{entry.text}</Text>
            <Text style={{ color: c.sub, marginTop: 10, fontSize: 12 }}>{entry.date}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function ProactiveScreen({ companionId }: { companionId: string }) {
  const { companions, theme, authUserId, updateCompanion, evaluateProactiveForCompanion, goBack } = useApp();
  const c = getColorTheme(theme);
  const companion = companions.find((item) => item.id === companionId) || companions[0];
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleLabel, setScheduleLabel] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleDelay, setScheduleDelay] = useState<1 | 2 | 5>(1);
  const [scheduleChannel, setScheduleChannel] = useState<'chat' | 'voice' | 'call'>('chat');
  const config = companion.proactive;
  const updateConfig = (update: Partial<typeof config>) => updateCompanion(companion.id, { proactive: { ...config, ...update } });
  const addSchedule = () => {
    if (!scheduleLabel.trim()) return;
    if (!config.channels[scheduleChannel]) {
      Alert.alert('Channel disabled', `Enable ${scheduleChannel} in Channels before scheduling it.`);
      return;
    }
    const schedule: ProactiveSchedule = {
      id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: authUserId || undefined,
      companionId: companion.id,
      label: scheduleLabel.trim(),
      datetime: new Date(Date.now() + scheduleDelay * 60_000).toISOString(),
      channel: scheduleChannel,
      message: scheduleMessage.trim() || undefined,
      triggerType: 'scheduled-moment',
    };
    updateConfig({ schedules: appendScheduledMoment(config, schedule).schedules });
    setScheduleLabel('');
    setScheduleMessage('');
    setScheduleDelay(1);
    setScheduleChannel('chat');
    setShowSchedule(false);
  };
  const evaluateNow = () => {
    const decision = evaluateProactiveForCompanion(companion.id);
    Alert.alert(
      decision.status === 'allowed' ? 'Check-in started' : decision.status === 'suppressed' ? 'Check-in suppressed' : 'No check-in due',
      decision.status === 'allowed' ? `Preparing a ${decision.event.channel} message from ${companion.name}.` : decision.reason,
    );
  };
  const openSchedule = () => {
    const firstEnabled = (['chat', 'voice', 'call'] as const).find((channel) => config.channels[channel]);
    if (firstEnabled) setScheduleChannel(firstEnabled);
    setShowSchedule(true);
  };
  const editQuietHours = () => Alert.alert('Quiet Hours', 'Choose when proactive check-ins should be suppressed.', [
    { text: 'Off', onPress: () => updateConfig({ quietHoursStart: '00:00', quietHoursEnd: '00:00' }) },
    { text: '10:00 PM – 7:00 AM', onPress: () => updateConfig({ quietHoursStart: '22:00', quietHoursEnd: '07:00' }) },
    { text: '11:00 PM – 7:00 AM', onPress: () => updateConfig({ quietHoursStart: '23:00', quietHoursEnd: '07:00' }) },
    { text: 'Cancel', style: 'cancel' },
  ]);
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Proactive" subtitle={companion.name} onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
          <View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={[styles.sectionHeading, { color: c.text }]}>Smart Check-ins</Text><Text style={{ color: c.sub }}>Let {companion.name} reach out first</Text></View><TouchableOpacity onPress={() => updateConfig({ smartCheckins: !config.smartCheckins })} style={[styles.switch, { backgroundColor: config.smartCheckins ? c.accent : c.bg3 }]}><View style={[styles.switchThumb, config.smartCheckins && { alignSelf: 'flex-end' }]} /></TouchableOpacity></View>
          <View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={[styles.sectionHeading, { color: c.text }]}>Quiet Hours</Text><Text style={{ color: c.sub }}>{config.quietHoursStart === config.quietHoursEnd ? 'Off' : `${config.quietHoursStart} — ${config.quietHoursEnd}`}</Text></View><TouchableOpacity onPress={editQuietHours} style={[styles.secondaryButton, { borderColor: c.border, backgroundColor: c.bg3 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Edit</Text></TouchableOpacity></View>
          <Text style={[styles.settingLabel, { color: c.muted, marginTop: 18 }]}>CHANNELS</Text>
          {Object.entries(config.channels).map(([channel, enabled]) => <View key={channel} style={[styles.settingRow, { borderBottomColor: c.border }]}><Text style={{ color: c.text, textTransform: 'capitalize' }}>{channel}</Text><TouchableOpacity onPress={() => updateConfig({ channels: { ...config.channels, [channel]: !enabled } })} style={[styles.switch, { backgroundColor: enabled ? c.accent : c.bg3 }]}><View style={[styles.switchThumb, enabled && { alignSelf: 'flex-end' }]} /></TouchableOpacity></View>)}
        </View>
        <TouchableOpacity onPress={openSchedule} style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 16 }]}><Icon name="add" color="#fff" size={17} /><Text style={styles.primaryButtonText}> Schedule Moment</Text></TouchableOpacity>
        <TouchableOpacity onPress={evaluateNow} style={[styles.secondaryButton, { borderColor: c.border, backgroundColor: c.bg3, marginTop: 10 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Evaluate now</Text></TouchableOpacity>
        {config.schedules.map((schedule) => {
          const scheduledTime = new Date(schedule.datetime);
          const displayedTime = Number.isNaN(scheduledTime.getTime()) ? schedule.datetime : scheduledTime.toLocaleString();
          return <View key={schedule.id} style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={[styles.nameText, { color: c.text }]}>{schedule.label}</Text><Text style={{ color: c.sub, marginTop: 5 }}>{displayedTime} · {schedule.channel} · {schedule.status || 'scheduled'}</Text>{schedule.status === 'scheduled' ? <TouchableOpacity onPress={() => updateCompanion(companion.id, { proactive: cancelScheduledMoment(config, schedule.id) })} style={[styles.secondaryButton, { borderColor: c.border, backgroundColor: c.bg3, marginTop: 10 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Cancel</Text></TouchableOpacity> : null}</View>;
        })}
        {(config.events || []).slice(-5).reverse().map((event) => <View key={event.id} style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={[styles.nameText, { color: c.text }]}>{event.reason}</Text><Text style={{ color: c.sub, marginTop: 5 }}>{event.channel} · {event.status}</Text></View>)}
      </ScrollView>
      {showSchedule ? <View style={styles.bottomOverlay}><View style={[styles.attachSheet, { backgroundColor: c.bg2 }]}><Text style={[styles.sectionHeading, { color: c.text }]}>Schedule Moment</Text><TextInput value={scheduleLabel} onChangeText={setScheduleLabel} placeholder="Moment title" placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.bg3, borderColor: c.border, color: c.text }]} /><TextInput value={scheduleMessage} onChangeText={setScheduleMessage} placeholder="Optional message or context" placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.bg3, borderColor: c.border, color: c.text, marginTop: 10 }]} /><Text style={[styles.settingLabel, { color: c.muted, marginTop: 14 }]}>WHEN</Text><View style={{ flexDirection: 'row', gap: 8 }}>{([1, 2, 5] as const).map((delay) => <TouchableOpacity key={delay} testID={`proactive-delay-${delay}`} onPress={() => setScheduleDelay(delay)} style={[styles.secondaryButton, { flex: 1, borderColor: scheduleDelay === delay ? c.accent : c.border, backgroundColor: c.bg3 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>{delay} min</Text></TouchableOpacity>)}</View><Text style={[styles.settingLabel, { color: c.muted, marginTop: 14 }]}>DELIVER AS</Text><View style={{ flexDirection: 'row', gap: 8 }}>{(['chat', 'voice', 'call'] as const).map((channel) => <TouchableOpacity key={channel} testID={`proactive-channel-${channel}`} disabled={!config.channels[channel]} onPress={() => setScheduleChannel(channel)} style={[styles.secondaryButton, { flex: 1, borderColor: scheduleChannel === channel ? c.accent : c.border, backgroundColor: c.bg3, opacity: config.channels[channel] ? 1 : 0.45 }]}><Text style={[styles.secondaryButtonText, { color: c.text, textTransform: 'capitalize' }]}>{channel}</Text></TouchableOpacity>)}</View><View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}><TouchableOpacity onPress={() => setShowSchedule(false)} style={[styles.secondaryButton, { borderColor: c.border, backgroundColor: c.bg3, flex: 1 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={addSchedule} style={[styles.primaryButton, { backgroundColor: c.accent, flex: 1 }]}><Text style={styles.primaryButtonText}>Save</Text></TouchableOpacity></View></View></View> : null}
    </View>
  );
}

export function GroupsListScreen() {
  const { groups, companions, navigate, theme } = useApp();
  const c = getColorTheme(theme);
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Groups" right={<TouchableOpacity onPress={() => navigate({ type: 'create-group' })} style={[styles.newButton, { backgroundColor: c.accent }]}><Icon name="add" color="#fff" size={18} /><Text style={{ color: '#fff', fontWeight: '700' }}>New</Text></TouchableOpacity>} />
      <ScrollView contentContainerStyle={styles.flatList}>
        {groups.map((group) => (
          <TouchableOpacity key={group.id} style={[styles.groupRow, { backgroundColor: c.bg, borderBottomColor: c.border }]} onPress={() => navigate({ type: 'group-chat', groupId: group.id })}>
            <View style={styles.groupAvatars}>{group.companionIds.slice(0, 2).map((id, index) => { const member = companions.find((item) => item.id === id); return member ? <View key={id} style={[styles.groupAvatarPosition, { left: index * 22, zIndex: 2 - index }]}><AvatarBubble companion={member} size={40} /></View> : null; })}</View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.nameText, { color: c.text }]}>{group.name}</Text>
              <Text style={[styles.previewText, { color: c.accent2 }]}>{group.lastMessage || 'No messages yet'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 10 }}><Text style={[styles.timeText, { color: c.accent }]}>{group.lastMessageTime || ''}</Text>{group.unreadCount > 0 ? <View style={[styles.badge, { backgroundColor: c.accent }]}><Text style={styles.badgeText}>{group.unreadCount}</Text></View> : null}</View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function CreateGroupScreen() {
  const { companions, navigate, createGroup, theme } = useApp();
  const c = getColorTheme(theme);
  const [selected, setSelected] = useState<string[]>(['priya', 'latha']);
  const [name, setName] = useState('New Circle');
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Create Group" onBack={() => navigate({ type: 'groups-list' })} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.sectionHeading, { color: c.text }]}>Group name</Text>
        <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: c.bg2, borderColor: c.border, color: c.text }]} />
        <Text style={[styles.sectionHeading, { color: c.text, marginTop: 16 }]}>Participants</Text>
        {companions.map((companion) => (
          <Pressable key={companion.id} onPress={() => setSelected((current) => current.includes(companion.id) ? current.filter((id) => id !== companion.id) : [...current, companion.id])} style={[styles.listRow, { borderBottomColor: c.border, backgroundColor: c.bg2 }]}>
            <Text style={{ color: c.text }}>{companion.name}</Text>
            <Text style={{ color: selected.includes(companion.id) ? c.accent : c.sub }}>{selected.includes(companion.id) ? '✓' : '○'}</Text>
          </Pressable>
        ))}
        <TouchableOpacity onPress={() => {
          const newGroup = createGroup(name || 'New Circle', selected);
          navigate({ type: 'group-chat', groupId: newGroup.id });
        }} style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 20 }]}><Text style={styles.primaryButtonText}>Create Group</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export function GroupChatScreen({ groupId }: { groupId: string }) {
  const { groups, companions, groupConversations, theme, addGroupMessage, updateGroup, requestAIResponse, goBack } = useApp();
  const c = getColorTheme(theme);
  const group = findGroup(groups, groupId);
  const messages = group ? groupConversations[groupId] || [] : [];
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; author: string } | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentions, setMentions] = useState<MessageMention[]>([]);
  const [voiceMode, setVoiceMode] = useState<'idle' | 'recording' | 'paused' | 'preview'>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const messageSequence = useRef(0);
  const voiceTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const voiceRecorder = useVoiceRecorder();
  const groupTtsProvider = useRef(new BackendTextToSpeechProvider()).current;
  const groupVoicePlayer = useVoicePlayer();
  const members = group ? group.companionIds.map((id) => companions.find((item) => item.id === id)).filter(Boolean) as Companion[] : [];
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    messageSequence.current += 1;
    const message: Message = { id: `g-${messageSequence.current}`, fromMe: true, type: 'text', text, mentions: mentions.length ? mentions : undefined, status: 'sent', timestamp: new Date(), ...(replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text, replyToAuthor: replyTo.author } : {}) };
    if (!group) return;
    addGroupMessage(group.id, message);
    setDraft('');
    setReplyTo(null);
    setMentions([]);
    setMentionQuery(null);
    updateGroup(group.id, { lastMessage: text, lastMessageTime: 'Now' });
    const participant = mentions[0]?.memberId || members[0]?.id;
    if (participant) {
      const response = await requestAIResponse(participant, text, { groupId: group.id, groupMessages: [...messages, message], mentions });
      if (response.status === 'success' && response.text) {
        messageSequence.current += 1;
        addGroupMessage(group.id, { id: `ga-${messageSequence.current}`, fromMe: false, type: 'text', text: response.text, status: 'sent', timestamp: new Date() });
      }
    }
  };
  const selectMention = (member: Companion) => {
    const query = mentionQuery || '';
    const nextDraft = replaceMentionToken(draft, query, member);
    setDraft(nextDraft);
    setMentions((current) => addExplicitMention(current, member));
    setMentionQuery(null);
  };
  const handleVoice = () => {
    if (voiceMode === 'idle') {
      setRecordSeconds(0);
      setVoiceMode('recording');
      voiceTimer.current = setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    } else if (voiceMode === 'recording') {
      clearInterval(voiceTimer.current);
      setVoiceMode('paused');
    } else if (voiceMode === 'paused') {
      setVoiceMode('recording');
      voiceTimer.current = setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    } else {
      clearInterval(voiceTimer.current);
      if (recordSeconds > 0 && group) {
        messageSequence.current += 1;
        addGroupMessage(group.id, { id: `gv-${messageSequence.current}`, fromMe: true, type: 'voice', voiceDuration: recordSeconds, status: 'sent', timestamp: new Date(), voicePlayState: 'idle' });
      }
      setVoiceMode('idle');
      setRecordSeconds(0);
    }
  };
  const sendGroupVoice = async () => {
    if (!group || !voiceRecorder.uri) return;
    const audioUri = voiceRecorder.uri;
    const messageId = `gv-${group.id}-${audioUri}-${messageSequence.current + 1}`;
    const voiceMessage: Message = {
      ...createVoiceUserMessage(messageId, audioUri, voiceRecorder.duration),
      groupId: group.id,
      status: 'sending',
    };
    addGroupMessage(group.id, voiceMessage);
    voiceRecorder.discard();
    setVoiceMode('idle');
    setRecordSeconds(0);
    try {
      const transcription = await retryVoiceOperation(() => transcribeVoiceRecording(audioUri));
      const target = selectGroupResponseTarget(group, members, transcription.text);
      const response = await retryVoiceOperation(() => requestAIResponse(target?.id || members[0]?.id || '', transcription.text, {
        groupId: group.id,
        groupMessages: [...messages, { ...voiceMessage, text: transcription.text }],
        mentions: target ? [{ memberId: target.id, displayName: target.name }] : [],
        mode: 'voice',
      }));
      if (response.status !== 'success' || !response.text) throw new Error(response.error?.message || 'Group voice response unavailable.');
      const assistantText = response.text;
      const audioReplyUri = await retryVoiceOperation(() => groupTtsProvider.speak(assistantText, target?.aiConfig?.voice));
      addGroupMessage(group.id, { ...voiceMessage, text: transcription.text, status: 'delivered', voiceTranscription: transcription.text });
      addGroupMessage(group.id, {
        id: `gvr-${messageId}`,
        groupId: group.id,
        fromMe: false,
        type: 'voice',
        text: response.text,
        voiceAudioUri: audioReplyUri,
        voicePlaybackAvailable: true,
        voiceDuration: 0,
        status: 'delivered',
        timestamp: new Date(),
        responseTargetId: target?.id,
        voicePlayState: 'idle',
      });
    } catch (error: unknown) {
      addGroupMessage(group.id, { ...voiceMessage, status: 'failed', text: error instanceof Error ? error.message : 'Group voice processing failed.' });
    }
  };
  React.useEffect(() => () => clearInterval(voiceTimer.current), []);
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: c.bg }]} enabled>
      <ScreenHeader title={group?.name || 'Group'} subtitle={group ? `${members.length} companions` : 'Unavailable'} onBack={goBack} right={<View style={styles.groupHeaderAvatars}>{members.slice(0, 3).map((member) => <AvatarBubble key={member.id} companion={member} size={28} />)}</View>} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {!group ? <View style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={[styles.sectionHeading, { color: c.text }]}>Group unavailable</Text><Text style={{ color: c.sub, marginTop: 6 }}>This group no longer exists.</Text><TouchableOpacity onPress={goBack} style={[styles.secondaryButton, { borderColor: c.border, backgroundColor: c.bg3, marginTop: 14 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Go back</Text></TouchableOpacity></View> : null}
        {group ? messages.map((message) => (
          <Pressable key={message.id} onPress={() => { if (message.voiceAudioUri) void groupVoicePlayer.toggle(message.voiceAudioUri); }} onLongPress={() => setReplyTo({ id: message.id, text: message.text || '', author: message.fromMe ? 'You' : 'Group member' })} style={{ marginBottom: 8, alignItems: message.fromMe ? 'flex-end' : 'flex-start' }}>
            <View style={[styles.bubble, message.fromMe ? { backgroundColor: c.accent } : { backgroundColor: c.bg3 }]}>
              {message.replyToText ? <Text style={{ color: message.fromMe ? 'rgba(255,255,255,0.75)' : c.accent2, fontSize: 11, marginBottom: 5 }}>Replying to {message.replyToAuthor}: {message.replyToText}</Text> : null}
              {message.type === 'voice' ? <View style={styles.voiceMessage}><Icon name={message.voiceAudioUri && groupVoicePlayer.playingUri === message.voiceAudioUri ? 'pause' : 'play'} color={message.fromMe ? '#fff' : c.accent} size={18} /><View style={styles.waveform}>{[8, 14, 20, 12, 18, 10, 16].map((height, index) => <View key={index} style={[styles.waveBar, { height, backgroundColor: message.fromMe ? 'rgba(255,255,255,0.75)' : c.accent }]} />)}</View><Text style={{ color: message.fromMe ? '#fff' : c.text }}>{message.voiceDuration || 0}s</Text></View> : <Text style={{ color: message.fromMe ? '#fff' : c.text }}>{message.text}</Text>}
            </View>
          </Pressable>
        )) : null}
      </ScrollView>
      {replyTo ? <View style={[styles.replyBar, { backgroundColor: c.bg2, borderColor: c.border }]}><View style={{ flex: 1 }}><Text style={{ color: c.accent, fontWeight: '700' }}>Replying to {replyTo.author}</Text><Text style={{ color: c.sub }} numberOfLines={1}>{replyTo.text}</Text></View><TouchableOpacity onPress={() => setReplyTo(null)}><Icon name="close" color={c.sub} /></TouchableOpacity></View> : null}
      {voiceMode !== 'idle' ? <View style={[styles.recordingBar, { backgroundColor: c.bg2, borderColor: c.border }]}><View style={styles.recordingInfo}><View style={[styles.recordDot, { backgroundColor: voiceMode === 'recording' ? c.danger : c.accent }]} /><Text style={{ color: c.text }}>{voiceMode === 'preview' ? 'Preview' : voiceMode === 'paused' ? 'Paused' : 'Recording'} · {voiceRecorder.duration || recordSeconds}s</Text></View><View style={{ flexDirection: 'row', gap: 8 }}><TouchableOpacity onPress={() => { voiceRecorder.discard(); clearInterval(voiceTimer.current); setVoiceMode('idle'); setRecordSeconds(0); }} style={styles.smallAction}><Icon name="trash-outline" color={c.text} size={18} /></TouchableOpacity>{voiceMode !== 'preview' ? <TouchableOpacity onPress={() => { if (voiceMode === 'recording') { voiceRecorder.pause(); clearInterval(voiceTimer.current); setVoiceMode('paused'); } else { voiceRecorder.resume(); setVoiceMode('recording'); } }} style={styles.smallAction}><Icon name={voiceMode === 'recording' ? 'pause' : 'play'} color={c.text} size={18} /></TouchableOpacity> : null}{voiceMode === 'recording' || voiceMode === 'paused' ? <TouchableOpacity onPress={async () => { clearInterval(voiceTimer.current); await voiceRecorder.stop(); setVoiceMode('preview'); }} style={styles.smallAction}><Icon name="checkmark" color={c.text} size={18} /></TouchableOpacity> : null}{voiceMode === 'preview' ? <TouchableOpacity onPress={() => void sendGroupVoice()} style={[styles.smallAction, { backgroundColor: c.accent }]}><Icon name="send" color="#fff" size={18} /></TouchableOpacity> : null}</View></View> : null}
      <View style={[styles.composer, { backgroundColor: c.bg2, borderTopColor: c.border }]}>
        <TouchableOpacity onPress={() => setShowAttach(true)} style={[styles.composeIcon, { backgroundColor: c.bg3 }]}><Icon name="add" color={c.sub} /></TouchableOpacity>
        <TouchableOpacity onPress={() => setShowCamera(true)} style={[styles.composeIcon, { backgroundColor: c.bg3 }]}><Icon name="camera-outline" color={c.sub} /></TouchableOpacity>
        <TextInput value={draft} onChangeText={(value) => { setDraft(value); setMentionQuery(getMentionQuery(value)); }} placeholder="Message the group..." placeholderTextColor={c.sub} style={[styles.input, { flex: 1, backgroundColor: c.bg3, color: c.text }]} />
        <TouchableOpacity onPress={async () => { if (voiceMode === 'idle') { const started = await voiceRecorder.start(); if (started) { setVoiceMode('recording'); setRecordSeconds(0); } } else { handleVoice(); } }} style={[styles.composeIcon, { backgroundColor: c.bg3 }]}><Icon name="mic-outline" color={c.sub} /></TouchableOpacity>
        <TouchableOpacity onPress={send} style={[styles.sendButton, { backgroundColor: c.accent }]}><Icon name="send" color="#fff" size={18} /></TouchableOpacity>
      </View>
      {mentionQuery !== null ? <View style={[styles.mentionMenu, { backgroundColor: c.bg2, borderColor: c.border }]}>{members.filter((member) => member.name.toLowerCase().includes(mentionQuery.toLowerCase())).map((member) => <TouchableOpacity key={member.id} onPress={() => selectMention(member)} style={styles.mentionRow}><AvatarBubble companion={member} size={28} /><Text style={{ color: c.text }}>{member.name}</Text></TouchableOpacity>)}</View> : null}
      {showAttach ? <View style={styles.bottomOverlay}><View style={[styles.attachSheet, { backgroundColor: c.bg2 }]}><View style={[styles.sheetHandle, { backgroundColor: c.border }]} /><View style={styles.attachGrid}>{[['image-outline', 'Photo / Gallery'], ['document-text-outline', 'Document'], ['location-outline', 'Location'], ['person-outline', 'Contact']].map(([icon, label]) => <TouchableOpacity key={label} onPress={() => setShowAttach(false)} style={styles.attachOption}><View style={[styles.attachIcon, { backgroundColor: c.bg3, borderColor: c.border }]}><Icon name={icon as React.ComponentProps<typeof Ionicons>['name']} color={c.accent} size={25} /></View><Text style={{ color: c.sub, fontSize: 11 }}>{label}</Text></TouchableOpacity>)}</View></View></View> : null}
      {showCamera ? <View style={styles.cameraOverlay}><View style={styles.cameraPreview}><Icon name="camera-outline" color="rgba(255,255,255,0.35)" size={60} /></View><View style={styles.cameraControls}><TouchableOpacity onPress={() => setShowCamera(false)} style={styles.cameraClose}><Icon name="close" color="#fff" size={24} /></TouchableOpacity><TouchableOpacity onPress={() => setShowCamera(false)} style={styles.shutter}><View style={styles.shutterInner} /></TouchableOpacity><TouchableOpacity onPress={() => setShowCamera(false)} style={styles.cameraClose}><Icon name="flash-outline" color="#fff" size={24} /></TouchableOpacity></View></View> : null}
    </KeyboardAvoidingView>
  );
}

export function SettingsScreen() {
  const { theme, navigate, signOut } = useApp();
  const c = getColorTheme(theme);
  const items = [
    { label: 'Appearance', description: 'Theme and display preferences', icon: 'color-palette-outline' as const, screen: 'settings-appearance' as const },
    { label: 'Notifications', description: 'Push notifications and alerts', icon: 'notifications-outline' as const, screen: 'settings-notifications' as const },
    { label: 'Companion Engine', description: 'Engine state and connectivity', icon: 'flash-outline' as const, screen: 'settings-engine' as const },
    { label: 'Privacy', description: 'Data and conversation privacy', icon: 'lock-closed-outline' as const },
    { label: 'Accessibility', description: 'Text size, contrast, motion', icon: 'accessibility-outline' as const },
    { label: 'Developer', description: 'Advanced settings and debug', icon: 'construct-outline' as const },
    { label: 'About', description: 'Version and licenses', icon: 'information-circle-outline' as const },
  ];
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={[styles.settingsList, { backgroundColor: c.bg2, borderColor: c.border }]}>
          {items.map((item, index) => <TouchableOpacity key={item.label} onPress={() => item.screen && navigate({ type: item.screen })} style={[styles.settingsRow, index < items.length - 1 && { borderBottomColor: c.border, borderBottomWidth: 1 }, !item.screen && { opacity: 0.5 }]}>
            <View style={[styles.settingsIcon, { backgroundColor: c.bg3 }]}><Icon name={item.icon} color={item.screen ? c.accent : c.muted} size={20} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.nameText, { color: c.text }]}>{item.label}</Text><Text style={[styles.previewText, { color: c.sub }]}>{item.description}</Text></View>
            {item.screen ? <Icon name="chevron-forward" color={c.muted} size={18} /> : null}
          </TouchableOpacity>)}
        </View>
        <TouchableOpacity onPress={signOut} style={[styles.signOutButton, { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.22)' }]}><Icon name="log-out-outline" color="#EF4444" size={18} /><Text style={{ color: '#EF4444', fontWeight: '700' }}>Sign Out</Text></TouchableOpacity>
        <Text style={[styles.versionText, { color: c.muted }]}>Priya Companion{'\n'}Version 1.0.0-prototype</Text>
      </ScrollView>
    </View>
  );
}

function SettingsSubscreen({ title, children }: { title: string; children: React.ReactNode }) {
  const { goBack, theme } = useApp();
  const c = getColorTheme(theme);
  return <View style={[styles.screen, { backgroundColor: c.bg }]}><ScreenHeader title={title} onBack={goBack} /><ScrollView contentContainerStyle={{ padding: 20 }}>{children}</ScrollView></View>;
}

export function AppearanceSettingsScreen() {
  const { theme, setTheme } = useApp();
  const c = getColorTheme(theme);
  return <SettingsSubscreen title="Appearance"><Text style={[styles.settingLabel, { color: c.muted }]}>THEME</Text><View style={styles.themeChoices}>{(['dark', 'light'] as const).map((item) => <TouchableOpacity key={item} onPress={() => setTheme(item)} style={[styles.themeChoice, { backgroundColor: c.bg2, borderColor: theme === item ? c.accent : c.border }]}><View style={[styles.themePreview, { backgroundColor: item === 'dark' ? '#1C0F18' : '#FFF5F2' }]} /><Text style={{ color: c.text, fontWeight: '600' }}>{item === 'dark' ? 'Dark' : 'Light'}</Text><Icon name={theme === item ? 'radio-button-on' : 'radio-button-off'} color={theme === item ? c.accent : c.muted} size={20} /></TouchableOpacity>)}</View></SettingsSubscreen>;
}

export function NotificationsSettingsScreen() {
  const { theme, notificationSettings, setNotificationSetting } = useApp();
  const c = getColorTheme(theme);
  const settings: { key: keyof typeof notificationSettings; label: string }[] = [
    { key: 'newMessages', label: 'New messages' },
    { key: 'proactiveMessages', label: 'Proactive messages' },
    { key: 'scheduledReminders', label: 'Scheduled reminders' },
    { key: 'groupActivity', label: 'Group activity' },
    { key: 'missedCalls', label: 'Missed calls' },
  ];
  return <SettingsSubscreen title="Notifications">{settings.map(({ key, label }) => <View key={key} style={[styles.settingRow, { borderBottomColor: c.border }]}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '600' }}>{label}</Text><Text style={{ color: c.sub, fontSize: 12, marginTop: 3 }}>Manage {label.toLowerCase()}</Text></View><TouchableOpacity onPress={() => setNotificationSetting(key, !notificationSettings[key])} style={[styles.switch, { backgroundColor: notificationSettings[key] ? c.accent : c.bg3 }]}><View style={[styles.switchThumb, notificationSettings[key] && { alignSelf: 'flex-end' }]} /></TouchableOpacity></View>)}</SettingsSubscreen>;
}

export function EngineSettingsScreen() {
  const { theme, engineState, setEngineState, companions, toggleCompanionPause } = useApp();
  const c = getColorTheme(theme);
  const statusColor = engineState === 'online' ? c.online : engineState === 'recovering' ? '#FBBF24' : '#EF4444';
  return <SettingsSubscreen title="Companion Engine"><View style={[styles.engineCard, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={[styles.sectionHeading, { color: c.text }]}>Engine Status</Text><View style={styles.engineStatus}><View style={[styles.statusDot, { backgroundColor: statusColor }]} /><Text style={{ color: statusColor, fontWeight: '600' }}>{engineState === 'online' ? 'Online' : engineState === 'recovering' ? 'Recovering...' : 'Offline'}</Text></View><TouchableOpacity disabled={engineState === 'recovering'} onPress={() => { if (engineState === 'online') setEngineState('offline'); else { setEngineState('recovering'); setTimeout(() => setEngineState('online'), 1200); } }} style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 18 }]}><Text style={styles.primaryButtonText}>{engineState === 'online' ? 'Turn Off' : 'Turn On'}</Text></TouchableOpacity></View><Text style={[styles.settingLabel, { color: c.muted }]}>COMPANION STATUS</Text><View style={[styles.settingsList, { backgroundColor: c.bg2, borderColor: c.border }]}>{companions.map((companion, index) => <View key={companion.id} style={[styles.settingsRow, index < companions.length - 1 && { borderBottomColor: c.border, borderBottomWidth: 1 }]}><View style={[styles.statusDot, { backgroundColor: companion.isPaused || engineState === 'offline' ? '#EF4444' : c.online }]} /><Text style={{ color: c.text, flex: 1, marginLeft: 12 }}>{companion.name}</Text><TouchableOpacity onPress={() => toggleCompanionPause(companion.id)}><Text style={{ color: c.accent, fontWeight: '600' }}>{companion.isPaused ? 'Resume' : 'Pause'}</Text></TouchableOpacity></View>)}</View></SettingsSubscreen>;
}

export function SearchScreen() {
  const { theme, companions, conversations, navigate, goBack, switchTab } = useApp();
  const c = getColorTheme(theme);
  const [query, setQuery] = useState('');
  const matchingCompanions = query.trim() ? companions.filter((companion) => companion.name.toLowerCase().includes(query.toLowerCase())) : [];
  const messageResults = query.trim() ? companions.flatMap((companion) => (conversations[companion.id] || []).filter((message) => message.text?.toLowerCase().includes(query.toLowerCase())).slice(-3).map((message) => ({ companion, message }))) : [];

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.searchHeader, { backgroundColor: c.bg2, borderBottomColor: c.border }]}><TouchableOpacity onPress={goBack} style={styles.iconButton}><Icon name="arrow-back" color={c.text} /></TouchableOpacity><View style={[styles.searchInputWrap, { backgroundColor: c.bg3, borderColor: c.border }]}><Icon name="search-outline" color={c.muted} size={17} /><TextInput autoFocus placeholder="Search messages and companions..." placeholderTextColor={c.muted} value={query} onChangeText={setQuery} style={[styles.searchInput, { color: c.text }]} />{query ? <TouchableOpacity onPress={() => setQuery('')}><Icon name="close" color={c.muted} size={16} /></TouchableOpacity> : null}</View></View>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        {!query.trim() ? <Text style={[styles.searchEmpty, { color: c.muted }]}>Search your conversations</Text> : null}
        {query.trim() && matchingCompanions.length === 0 && messageResults.length === 0 ? <Text style={[styles.searchEmpty, { color: c.muted }]}>No results for &quot;{query}&quot;</Text> : null}
        {matchingCompanions.length > 0 ? <><Text style={[styles.searchSectionLabel, { color: c.muted }]}>COMPANIONS</Text>{matchingCompanions.map((companion) => <TouchableOpacity key={companion.id} onPress={() => { switchTab('chats'); navigate({ type: 'chat', companionId: companion.id }); }} style={[styles.searchResult, { borderBottomColor: c.border }]}><AvatarBubble companion={companion} size={44} /><View><Text style={[styles.nameText, { color: c.text }]}>{companion.name}</Text><Text style={{ color: c.sub }}>{companion.tagline}</Text></View></TouchableOpacity>)}</> : null}
        {messageResults.length > 0 ? <><Text style={[styles.searchSectionLabel, { color: c.muted }]}>MESSAGES</Text>{messageResults.map(({ companion, message }) => <TouchableOpacity key={`${companion.id}-${message.id}`} onPress={() => { switchTab('chats'); navigate({ type: 'chat', companionId: companion.id }); }} style={[styles.searchResult, { borderBottomColor: c.border }]}><AvatarBubble companion={companion} size={40} /><View style={{ flex: 1 }}><Text style={[styles.nameText, { color: c.text }]}>{message.fromMe ? 'You' : companion.name}</Text><Text style={{ color: c.sub }}>{message.text}</Text></View></TouchableOpacity>)}</> : null}
      </ScrollView>
    </View>
  );
}

export function VoiceCallScreen({ companionId }: { companionId?: string }) {
  const { companions, conversations, theme, returnToChat, addMessage, engineState, authUserId, requestAIResponse } = useApp();
  const c = getColorTheme(theme);
  const companion = companions.find((item) => item.id === companionId) || companions[0];
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [callState, setCallState] = useState<CallUiState>('calling');
  const [callError, setCallError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  const endedRef = useRef(false);
  const endingPromiseRef = useRef<Promise<void> | null>(null);
  const persistedRef = useRef(false);
  const callIdRef = useRef<string | undefined>(undefined);
  const callStartedAtRef = useRef<string | undefined>(undefined);
  const callStateRef = useRef<CallUiState>(callState);
  const callService = useRef(new CallService()).current;
  const sessionGenerationRef = useRef(0);
  const failedGenerationRef = useRef(0);
  const startInProgressRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const startCallRef = useRef<(() => void) | undefined>(undefined);
  const mountedRef = useRef(true);
  const connectedOnceRef = useRef(false);
  const callErrorRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const speakerRef = useRef(true);
  const microphoneActiveRef = useRef(false);
  const audioStream = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16', onBuffer: (buffer) => callService.sendAudio(buffer) });
  const stopAudioOnceRef = useRef<(() => void) | null>(null);
  if (!stopAudioOnceRef.current) {
    stopAudioOnceRef.current = createIdempotentStop(() => {
      audioStream.stream.stop();
      microphoneActiveRef.current = false;
      if (__DEV__) console.log('[live-audio] stream_stopped');
    });
  }
  const stopAudioOnce = () => {
    stopAudioOnceRef.current?.();
  };
  const resetAudioStop = useCallback(() => {
    stopAudioOnceRef.current = createIdempotentStop(() => {
      audioStream.stream.stop();
      microphoneActiveRef.current = false;
      if (__DEV__) console.log('[live-audio] stream_stopped');
    });
  }, [audioStream.stream]);
  const logCallControl = useCallback((action: string, result: 'action_start' | 'action_success' | 'action_error', error?: unknown) => {
    if (!__DEV__) return;
    const diagnostics = callService.getDiagnostics();
    const safeError = error === undefined ? undefined : safeCallControlError(error);
    console.log(`[voice-call-control] ${result} ${JSON.stringify({
      callSessionId: callIdRef.current || 'unknown',
      currentCallState: callStateRef.current,
      action,
      timestamp: new Date().toISOString(),
      audio: {
        muted: mutedRef.current,
        speaker: speakerRef.current,
        microphoneActive: microphoneActiveRef.current,
        outputBusy: diagnostics.outputBusy,
      },
      websocketState: diagnostics.websocketState,
      ...(safeError || {}),
    })}`);
  }, [callService]);
  const runCallControl = useCallback(async (action: string, operation: () => Promise<void>, onError?: (error: unknown) => Promise<void>) => {
    logCallControl(action, 'action_start');
    try {
      await operation();
      logCallControl(action, 'action_success');
    } catch (error: unknown) {
      logCallControl(action, 'action_error', error);
      if (onError) {
        try {
          await onError(error);
        } catch (handlerError: unknown) {
          logCallControl(`${action}_error_handler`, 'action_error', handlerError);
        }
      }
    }
  }, [logCallControl]);
  const transition = useCallback((next: CallUiState) => {
    const resolved = transitionCallState(callStateRef.current, next);
    callStateRef.current = resolved;
    if (mountedRef.current) setCallState(resolved);
  }, []);
  const handleLiveSemanticTurn = useCallback(async (turnText: string) => {
    const transcript = turnText.trim();
    if (!transcript || !authUserId || endedRef.current) return;
    const liveRequestId = `live-turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (__DEV__) console.log(`[live-semantic] brain_dispatch requestId=${liveRequestId} length=${transcript.length}`);
    try {
      const request = buildAIRequest(companion, conversations[companion.id] || [], transcript, engineState, 'call', undefined, [], [], authUserId || undefined, undefined, [], [], liveRequestId, 'live_call');
      if (__DEV__) console.log(`[live-semantic] memory_context_attached requestId=${liveRequestId} memoryCount=${request.memoryContext.length}`);
      await requestAIResponse(companion.id, transcript, { mode: 'call', modality: 'live_call', requestId: liveRequestId });
      const archiveMessage: Message = {
        id: `live-semantic-${liveRequestId}`,
        fromMe: true,
        type: 'call',
        text: transcript,
        status: 'sent',
        timestamp: new Date(),
        callId: callIdRef.current,
        callStatus: 'ended',
        callOutcome: 'completed',
        callProvider: 'gemini-live',
        callUserId: authUserId || undefined,
        callCompanionId: companion.id,
      };
      await appendArchiveSafely(conversationArchive, archiveRecordFromMessage({
        userId: authUserId,
        companionId: companion.id,
        conversationId: companion.id,
        message: archiveMessage,
        extraMetadata: {
          callId: callIdRef.current,
          callProvider: 'gemini-live',
          callUserId: authUserId,
          callCompanionId: companion.id,
          modality: 'live_call',
        },
      }));
      if (__DEV__) console.log(`[live-semantic] archive_success requestId=${liveRequestId} callId=${callIdRef.current || 'unknown'}`);
    } catch (error: unknown) {
      if (__DEV__) console.warn(`[live-semantic] archive_failed requestId=${liveRequestId} category=brain_bridge error=${error instanceof Error ? error.message : 'unknown'}`);
    }
  }, [authUserId, companion, conversations, engineState, requestAIResponse]);
  const friendlyCallError = useCallback((error: string, beforeReady: boolean) => {
    const normalized = error.toLowerCase();
    if (normalized.includes('permission') || normalized.includes('microphone')) return 'Microphone access is needed for calls.';
    return beforeReady ? `Couldn’t connect to ${companion.name}.` : 'Audio connection was interrupted.';
  }, [companion.name]);
  const failAttempt = useCallback(async (generation: number, error: string) => {
    if (generation !== sessionGenerationRef.current || endedRef.current || failedGenerationRef.current === generation) return;
    failedGenerationRef.current = generation;
    startInProgressRef.current = false;
    const beforeReady = !connectedOnceRef.current;
    const friendly = friendlyCallError(error, beforeReady);
    callErrorRef.current = friendly;
    if (mountedRef.current) setCallError(friendly);
    transition('failed');
    unsubscribeRef.current?.();
    unsubscribeRef.current = undefined;
    try {
      stopAudioOnce();
    } catch (stopError: unknown) {
      logCallControl('failure_mic_stop', 'action_error', stopError);
    }
    try {
      await callService.end();
    } catch (cleanupError) {
      logCallControl('failure_cleanup', 'action_error', cleanupError);
    }
  }, [callService, friendlyCallError, logCallControl, transition]);
  const finishCall = useCallback(async () => {
    if (endingPromiseRef.current) return endingPromiseRef.current;
    endedRef.current = true;
    sessionGenerationRef.current += 1;
    unsubscribeRef.current?.();
    unsubscribeRef.current = undefined;
    const outcome = callStateRef.current === 'failed' ? 'failed' : 'completed';
    transition('ended');
    endingPromiseRef.current = (async () => {
      let cleanupError: unknown;
      let cleanupFailed = false;
      try {
        stopAudioOnce();
      } catch (error: unknown) {
        cleanupError = error;
        cleanupFailed = true;
      }
      try {
        await callService.end();
      } catch (error) {
        if (!cleanupFailed) cleanupError = error;
        cleanupFailed = true;
        if (__DEV__) logCallControl('end_cleanup', 'action_error', error);
      }
      if (!persistedRef.current) {
        persistedRef.current = true;
        const endedAt = new Date();
        const startedAt = callStartedAtRef.current ? new Date(callStartedAtRef.current) : endedAt;
        addMessage(companion.id, {
          id: callIdRef.current || `call-${endedAt.getTime()}`,
          callId: callIdRef.current,
          fromMe: true,
          type: 'call',
          callStatus: outcome === 'failed' ? 'failed' : 'ended',
          callDuration: durationRef.current,
          callStartedAt: startedAt.toISOString(),
          callEndedAt: endedAt.toISOString(),
          callOutcome: outcome,
          callFailureReason: outcome === 'failed' ? callErrorRef.current || 'Priya couldn’t continue the call.' : undefined,
          callProvider: 'gemini-live',
          callUserId: authUserId || undefined,
          callCompanionId: companion.id,
          status: outcome === 'failed' ? 'failed' : 'sent',
          timestamp: endedAt,
        });
      }
      callService.setSemanticTurnHandler(() => undefined);
      returnToChat(companion.id);
      if (cleanupFailed) throw cleanupError;
    })();
    return endingPromiseRef.current;
  }, [addMessage, authUserId, callService, companion.id, logCallControl, returnToChat, transition]);
  const startCall = useCallback(async () => {
    if (endedRef.current || startInProgressRef.current || !['calling', 'failed'].includes(callStateRef.current)) return;
    startInProgressRef.current = true;
    const generation = ++sessionGenerationRef.current;
    failedGenerationRef.current = 0;
    connectedOnceRef.current = false;
    callErrorRef.current = null;
    endingPromiseRef.current = null;
    durationRef.current = 0;
    if (mountedRef.current) {
      setDuration(0);
      setCallError(null);
      mutedRef.current = false;
      speakerRef.current = true;
      setMuted(false);
      setSpeaker(true);
    }
    transition('calling');
    resetAudioStop();
    const onProviderState = (state: import('./voice/liveSession').LiveSessionState, error?: string) => {
      if (!mountedRef.current || generation !== sessionGenerationRef.current || endedRef.current) return;
      if (state === 'connecting' || state === 'providerConnecting' || state === 'setupPending') {
        transition('connecting');
      } else if (state === 'connected') {
        transition('listening');
        if (!connectedOnceRef.current) {
          connectedOnceRef.current = true;
          if (__DEV__) console.log(`[live-audio] requestId=${callIdRef.current} microphone_start`);
          void audioStream.stream.start().then(() => {
            if (generation !== sessionGenerationRef.current || endedRef.current) stopAudioOnce();
            else {
              microphoneActiveRef.current = true;
              if (__DEV__) console.log(`[live-audio] requestId=${callIdRef.current} microphone_started`);
            }
          }).catch((streamError: unknown) => {
            void failAttempt(generation, streamError instanceof Error ? streamError.message : 'Microphone startup failed.');
          });
        }
      } else if (state === 'userSpeaking') {
        transition('userSpeaking');
      } else if (state === 'thinking') {
        transition('thinking');
      } else if (state === 'modelSpeaking') {
        transition('speaking');
      } else if (state === 'interrupted') {
        transition('interrupting');
      } else if (state === 'reconnecting') {
        transition('reconnecting');
      } else if (state === 'failed') {
        void failAttempt(generation, error || 'Call connection failed.');
      } else if (state === 'ended') {
        void finishCall().catch((error: unknown) => {
          logCallControl('provider_end', 'action_error', error);
        });
      }
    };
    unsubscribeRef.current?.();
    unsubscribeRef.current = callService.onStateChange(onProviderState);
    callService.setSemanticTurnHandler(handleLiveSemanticTurn);
    const request = buildAIRequest(companion, conversations[companion.id] || [], '', engineState, 'call', undefined, [], [], authUserId || undefined);
    try {
      await callService.start(companion.id, {
        requestId: callIdRef.current,
        companion: request.companion,
        memoryContext: request.memoryContext.map((memory) => memory.text),
        relationshipContext: request.attachedContext?.relationship,
        proactiveContext: request.attachedContext?.proactive,
        recentConversation: request.history.map(({ fromMe, type, text }) => ({ fromMe, type, text })),
      });
      startInProgressRef.current = false;
    } catch (error: unknown) {
      startInProgressRef.current = false;
      await failAttempt(generation, error instanceof Error ? error.message : 'Call connection failed.');
    }
  }, [audioStream.stream, authUserId, callService, companion, conversations, engineState, failAttempt, finishCall, handleLiveSemanticTurn, logCallControl, resetAudioStop, transition]);
  startCallRef.current = () => { void startCall(); };
  React.useEffect(() => {
    mountedRef.current = true;
    endedRef.current = false;
    persistedRef.current = false;
    endingPromiseRef.current = null;
    durationRef.current = 0;
    callStateRef.current = 'calling';
    const startedAt = new Date();
    callStartedAtRef.current = startedAt.toISOString();
    callIdRef.current = `call-${startedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    startCallRef.current?.();
    return () => {
      endedRef.current = true;
      mountedRef.current = false;
      sessionGenerationRef.current += 1;
      startInProgressRef.current = false;
      callService.setSemanticTurnHandler(() => undefined);
      unsubscribeRef.current?.();
      unsubscribeRef.current = undefined;
      try {
        stopAudioOnce();
      } catch (error: unknown) {
        logCallControl('unmount_mic_stop', 'action_error', error);
      }
      void callService.end().catch((error: unknown) => {
        logCallControl('unmount_cleanup', 'action_error', error);
      });
    };
  }, [callService, logCallControl]);
  const timerState = ['connected', 'listening', 'userSpeaking', 'thinking', 'speaking', 'interrupting'].includes(callState);
  React.useEffect(() => {
    if (!timerState) return;
    const timer = setInterval(() => {
      durationRef.current += 1;
      setDuration(durationRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [timerState]);
  const endCall = useCallback((action = 'end_call') => {
    void runCallControl(action, finishCall);
  }, [finishCall, runCallControl]);
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      endCall('back');
      return true;
    });
    return () => subscription.remove();
  }, [endCall]);
  const formatDuration = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;
  const ready = ['connected', 'listening', 'userSpeaking', 'thinking', 'speaking', 'interrupting'].includes(callState);
  const callStatus = callState === 'calling'
    ? `Calling ${companion.name}…`
    : callState === 'connecting'
      ? 'Connecting…'
      : callState === 'reconnecting'
        ? 'Reconnecting…'
        : callState === 'failed'
          ? callError || `Couldn’t connect to ${companion.name}.`
          : callState === 'ended'
            ? 'Call ended'
            : callState === 'userSpeaking'
              ? 'Listening to you…'
              : callState === 'thinking'
                ? `${companion.name} is thinking…`
                : callState === 'speaking'
                  ? `${companion.name} is speaking…`
                  : callState === 'interrupting'
                    ? 'Listening…'
                    : callState === 'connected' || callState === 'listening'
                      ? 'Listening…'
                      : formatDuration;
  return (
    <View style={[styles.callScreen, { backgroundColor: '#1C0F18' }]}>
      <View style={[styles.callGlow, { backgroundColor: companion.avatarColor }]} />
      <View style={styles.callContent}>
        <View style={styles.callAvatarWrap}>{['calling', 'connecting', 'ringing', 'reconnecting'].includes(callState) ? <><View style={[styles.callRing, { borderColor: c.accent2 }]} /><View style={[styles.callRing, styles.callRingLarge, { borderColor: c.accent2 }]} /></> : null}<AvatarBubble companion={companion} size={124} showOnline /></View>
        <Text style={styles.callName}>{companion.name}</Text>
        <Text style={styles.callStatus}>{callStatus}</Text>
        {ready ? <View style={styles.connectedBadge}><View style={[styles.statusDot, { backgroundColor: c.online }]} /><Text style={{ color: '#fff' }}>{formatDuration}</Text></View> : null}
      </View>
      <View style={styles.callControls}>
        {ready ? <View style={styles.callActionRow}><TouchableOpacity onPress={() => { const next = !mutedRef.current; void runCallControl(next ? 'mute' : 'unmute', async () => { await callService.setMuted(next); mutedRef.current = next; setMuted(next); }, async (error) => { await failAttempt(sessionGenerationRef.current, error instanceof Error ? error.message : 'Microphone control failed.'); }); }} style={styles.callAction}><Icon name={muted ? 'mic-off' : 'mic'} color="#fff" size={22} /><Text style={styles.callActionText}>{muted ? 'Unmute' : 'Mute'}</Text></TouchableOpacity><TouchableOpacity onPress={() => { const next = !speakerRef.current; void runCallControl(next ? 'speaker' : 'earpiece', async () => { await callService.setSpeaker(next); speakerRef.current = next; setSpeaker(next); }, async (error) => { await failAttempt(sessionGenerationRef.current, error instanceof Error ? error.message : 'Audio route unavailable.'); }); }} style={styles.callAction}><Icon name={speaker ? 'volume-high' : 'volume-low'} color="#fff" size={22} /><Text style={styles.callActionText}>{speaker ? 'Speaker' : 'Earpiece'}</Text></TouchableOpacity><TouchableOpacity style={styles.callAction}><Icon name="keypad-outline" color="#fff" size={22} /><Text style={styles.callActionText}>Keypad</Text></TouchableOpacity></View> : null}
        {callState === 'failed' ? <TouchableOpacity onPress={() => void startCall()} style={[styles.secondaryButton, { backgroundColor: c.bg3, borderColor: c.border, marginBottom: 18 }]}><Text style={[styles.secondaryButtonText, { color: '#fff' }]}>Try again</Text></TouchableOpacity> : null}
        <TouchableOpacity disabled={callState === 'ended'} onPress={() => endCall()} style={styles.endCallButton}><Icon name="call" color="#fff" size={28} /></TouchableOpacity><Text style={styles.endCallLabel}>{callState === 'ended' ? 'Call ended' : 'End call'}</Text>
      </View>
    </View>
  );
}

export function CreateCharacterScreen() {
  const { theme, addCompanion, navigate } = useApp();
  const c = getColorTheme(theme);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [avatarColor, setAvatarColor] = useState('#D4728A');
  const [avatarImage, setAvatarImage] = useState<string | undefined>();
  const [trait, setTrait] = useState('Playful & Fun');
  const colors = ['#D4728A', '#8E74B8', '#3EAD83', '#D87A50', '#5A9CDD', '#A074BE', '#D49A4C', '#5B91A3'];
  const traits = ['Warm & Caring', 'Playful & Fun', 'Thoughtful', 'Motivating', 'Calm & Peaceful', 'Intellectual'];
  const chooseAvatarImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) setAvatarImage(result.assets[0].uri);
    } catch (error: unknown) {
      console.error('[create-character] avatar selection failed', error);
    }
  };
  const create = () => {
    const safeName = name.trim() || 'Shyam';
    const newCompanion: Companion = {
      id: `char-${Date.now()}`, name: safeName, tagline: tagline.trim() || 'Your new companion',
      avatarColor, avatarColor2: avatarColor, avatarImage, initial: safeName.slice(0, 1).toUpperCase(), language: 'English',
      personality: trait, isPaused: false, unreadCount: 0, isOnline: true, memories: [], relationship: [],
      proactive: { enabled: true, smartCheckins: true, quietHoursStart: '22:00', quietHoursEnd: '07:00', frequency: 'medium', channels: { chat: true, voice: false, call: false }, schedules: [] },
    };
    addCompanion(newCompanion); navigate({ type: 'companion-profile', companionId: newCompanion.id });
  };
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Create Character" subtitle={`${step === 1 ? 'Identity' : step === 2 ? 'Style' : step === 3 ? 'Voice' : 'Preview'} · Step ${step} of 4`} onBack={() => step === 1 ? navigate({ type: 'companions-list' }) : setStep(step - 1)} right={step === 4 ? <TouchableOpacity onPress={create} style={[styles.newButton, { backgroundColor: c.accent }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Create ✓</Text></TouchableOpacity> : undefined} />
      <View style={[styles.progressLine, { width: `${step * 25}%`, backgroundColor: c.accent }]} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {step === 1 ? <><TouchableOpacity accessibilityLabel="Choose character avatar from gallery" onPress={() => void chooseAvatarImage()} style={styles.createAvatarWrap}><View style={[styles.createAvatar, { backgroundColor: avatarColor }]}>{avatarImage ? <Image source={{ uri: avatarImage }} style={styles.createAvatarImage} /> : <Text style={styles.avatarTextLarge}>{(name || 'N').slice(0, 1).toUpperCase()}</Text>}</View><View style={[styles.avatarPlus, { backgroundColor: c.accent }]}><Icon name="add" color="#fff" size={18} /></View></TouchableOpacity><Text style={[styles.centerHint, { color: c.sub }]}>Choose an avatar image or style below</Text><Text style={[styles.settingLabel, { color: c.muted }]}>AVATAR STYLE</Text><View style={styles.colorGrid}>{colors.map((color) => <TouchableOpacity key={color} onPress={() => setAvatarColor(color)} style={[styles.colorChoice, { backgroundColor: color, borderColor: avatarColor === color ? '#fff' : 'transparent' }]}><Text style={styles.avatarText}>{(name || 'N').slice(0, 1).toUpperCase()}</Text></TouchableOpacity>)}</View><Text style={[styles.settingLabel, { color: c.muted, marginTop: 26 }]}>CHARACTER NAME *</Text><TextInput value={name} onChangeText={setName} placeholder="e.g. Ananya, Meera, Kavya..." placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.bg2, borderColor: c.accent, color: c.text }]} /><Text style={[styles.settingLabel, { color: c.muted, marginTop: 24 }]}>SHORT DESCRIPTION</Text><TextInput value={tagline} onChangeText={setTagline} placeholder="e.g. Your creative, joyful companion" placeholderTextColor={c.sub} style={[styles.input, { backgroundColor: c.bg2, borderColor: c.border, color: c.text }]} /></> : null}
        {step === 2 ? <><Text style={[styles.createIntro, { color: c.accent2 }]}>Choose up to 3 personality traits. These shape how <Text style={{ color: c.text, fontWeight: '700' }}>{name || 'your companion'}</Text> talks and feels.</Text>{traits.map((item, index) => <TouchableOpacity key={item} onPress={() => setTrait(item)} style={[styles.traitRow, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={{ fontSize: 24 }}>{['🫂', '😄', '🌿', '💪', '🌊', '📚'][index]}</Text><Text style={[styles.nameText, { color: c.text, flex: 1 }]}>{item}</Text><Icon name={trait === item ? 'radio-button-on' : 'radio-button-off'} color={trait === item ? c.accent : c.border} size={25} /></TouchableOpacity>)}</> : null}
        {step === 3 ? <><Text style={[styles.createIntro, { color: c.accent2 }]}>Choose how your companion sounds and responds.</Text><View style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={[styles.sectionHeading, { color: c.text }]}>Language</Text><Text style={{ color: c.accent2 }}>English</Text></View><View style={[styles.sectionCard, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={[styles.sectionHeading, { color: c.text }]}>Tone</Text><Text style={{ color: c.accent2 }}>{trait}</Text></View></> : null}
        {step === 4 ? <><Text style={[styles.createIntro, { color: c.accent2 }]}>Here&apos;s a preview of your new companion.</Text><View style={[styles.previewCard, { backgroundColor: c.bg2, borderColor: c.border }]}><View style={[styles.createAvatar, { backgroundColor: avatarColor }]}><Text style={styles.avatarTextLarge}>{(name || 'S').slice(0, 1).toUpperCase()}</Text></View><Text style={[styles.heroName, { color: c.text }]}>{name || 'Shyam'}</Text><Text style={[styles.heroTag, { color: c.accent2 }]}>{tagline || 'jolly'}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}><View style={[styles.languagePill, { backgroundColor: c.bg3 }]}><Text style={{ color: c.accent2 }}>English</Text></View><View style={[styles.languagePill, { backgroundColor: c.bg3 }]}><Text style={{ color: c.accent2 }}>😄 {trait}</Text></View></View></View><Text style={[styles.createIntro, { color: c.accent2, textAlign: 'center', marginTop: 20 }]}>{name || 'Shyam'} will appear in your Companions and Chats.</Text><TouchableOpacity onPress={create} style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 20 }]}><Text style={styles.primaryButtonText}>Create {name || 'Shyam'} 🌸</Text></TouchableOpacity></> : null}
        {step < 4 ? <TouchableOpacity onPress={() => setStep(step + 1)} style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 24 }]}><Text style={styles.primaryButtonText}>Continue</Text></TouchableOpacity> : null}
      </ScrollView>
    </View>
  );
}

export function renderScreen(screen: NavScreen): React.ReactNode {
  switch (screen.type) {
    case 'auth':
      return <AuthScreen />;
    case 'chats-list':
      return <ChatsListScreen />;
    case 'chat':
      return <ChatScreen companionId={screen.companionId} />;
    case 'companions-list':
      return <CompanionsListScreen />;
    case 'companion-profile':
      return <CompanionProfileScreen companionId={screen.companionId || 'priya'} />;
    case 'companion-studio':
      return <CompanionStudioScreen companionId={screen.companionId || 'priya'} />;
    case 'memory':
      return <MemoryScreen companionId={screen.companionId || 'priya'} />;
    case 'relationship':
      return <RelationshipScreen companionId={screen.companionId || 'priya'} />;
    case 'proactive':
      return <ProactiveScreen companionId={screen.companionId || 'priya'} />;
    case 'groups-list':
      return <GroupsListScreen />;
    case 'create-group':
      return <CreateGroupScreen />;
    case 'group-chat':
      return <GroupChatScreen groupId={screen.groupId || 'group-1'} />;
    case 'settings':
      return <SettingsScreen />;
    case 'settings-appearance':
      return <AppearanceSettingsScreen />;
    case 'settings-notifications':
      return <NotificationsSettingsScreen />;
    case 'settings-engine':
      return <EngineSettingsScreen />;
    case 'search':
      return <SearchScreen />;
    case 'voice-call':
      return <VoiceCallScreen companionId={screen.companionId || 'priya'} />;
    case 'create-character':
      return <CreateCharacterScreen />;
    default:
      return <ChatsListScreen />;
  }
}

export function BottomTabs() {
  const { activeTab, switchTab, theme, companions, groups } = useApp();
  const c = getColorTheme(theme);
  const bottomInset = useAndroidBottomInset();
  const tabs: { key: TabName; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; unread: number }[] = [
    { key: 'chats', label: 'Chats', icon: 'chatbubble-outline', unread: companions.reduce((sum, item) => sum + item.unreadCount, 0) },
    { key: 'companions', label: 'Companions', icon: 'person-outline', unread: 0 },
    { key: 'groups', label: 'Groups', icon: 'people-outline', unread: groups.reduce((sum, item) => sum + item.unreadCount, 0) },
    { key: 'settings', label: 'Settings', icon: 'settings-outline', unread: 0 },
  ];

  return (
    <View style={[styles.bottomBar, { backgroundColor: c.bg2, borderTopColor: c.border, paddingBottom: Math.max(8, bottomInset + 8) }]}>
      {tabs.map((tab) => (
        <Pressable key={tab.key} testID={`bottom-tab-${tab.key}`} accessibilityLabel={`${tab.label} tab`} onPress={() => switchTab(tab.key)} style={styles.tabButton}>
          <View><Icon name={tab.icon} color={activeTab === tab.key ? c.accent : c.sub} size={22} />{tab.unread > 0 ? <View style={[styles.tabBadge, { backgroundColor: c.accent }]}><Text style={styles.tabBadgeText}>{tab.unread}</Text></View> : null}</View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabText, { color: activeTab === tab.key ? c.accent : c.sub, fontWeight: activeTab === tab.key ? '700' : '400' }]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AppShell() {
  const { isAuthenticated, authStatus, activeTab, tabStacks, goBack, companions, theme, acceptProactiveCall, declineProactiveCall } = useApp();
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const stack = tabStacks[activeTab];
      if (stack.length <= 1) return false;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [activeTab, goBack, tabStacks]);
  if (authStatus === 'loading') return <AuthScreen />;
  if (!isAuthenticated) return <AuthScreen />;
  const stack = tabStacks[activeTab] || [{ type: 'chats-list' }];
  const current = stack[stack.length - 1];
  const c = getColorTheme(theme);
  const pendingCall = companions.flatMap((companion) => (companion.proactive.events || [])
    .filter((event) => event.status === 'invitation' && event.payload?.invitationStatus === 'pending')
    .map((event) => ({ companion, event })))[0];
  return (
    <View style={{ flex: 1 }}>
      {renderScreen(current)}
      {current.type !== 'voice-call' ? <BottomTabs /> : null}
      {pendingCall && current.type !== 'voice-call' ? <View style={[styles.proactiveInvitation, { backgroundColor: c.bg2, borderColor: c.border }]}><Text style={[styles.nameText, { color: c.text }]}>{pendingCall.companion.name} is inviting you to a call</Text><Text style={{ color: c.sub, marginTop: 5 }}>{pendingCall.event.payload?.message}</Text><View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}><TouchableOpacity onPress={() => declineProactiveCall(pendingCall.event.id)} style={[styles.secondaryButton, { flex: 1, borderColor: c.border, backgroundColor: c.bg3 }]}><Text style={[styles.secondaryButtonText, { color: c.text }]}>Decline</Text></TouchableOpacity><TouchableOpacity onPress={() => acceptProactiveCall(pendingCall.event.id)} style={[styles.primaryButton, { flex: 1, backgroundColor: c.accent }]}><Text style={styles.primaryButtonText}>Accept</Text></TouchableOpacity></View></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1 },
  chatHeader: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: 1 },
  chatIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatName: { fontSize: 16, fontWeight: '600' },
  roundIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSubtitle: { fontSize: 12 },
  iconButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  authCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  authLogo: { width: 96, height: 96, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logo: { fontSize: 32, fontWeight: '800', marginBottom: 6 },
  subTitle: { fontSize: 14, marginBottom: 18, maxWidth: '92%' },
  helpText: { fontSize: 14, marginBottom: 24 },
  googleButton: { width: '100%', minHeight: 52, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 32 },
  googleMark: { color: '#4285F4', fontSize: 22, fontWeight: '800' },
  googleButtonText: { fontSize: 16, fontWeight: '700' },
  termsText: { textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 22 },
  primaryButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontWeight: '700', fontSize: 15 },
  listWrap: { padding: 16, gap: 12 },
  flatList: { paddingBottom: 16 },
  chatRow: { minHeight: 80, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1 },
  nameText: { fontSize: 16, fontWeight: '600' },
  previewText: { fontSize: 12, marginTop: 4 },
  timeText: { fontSize: 11 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarLarge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarHero: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  avatarHeroImage: { width: '100%', height: '100%', borderRadius: 46 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  avatarTextLarge: { color: '#fff', fontSize: 32, fontWeight: '700' },
  badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  bubble: { maxWidth: '100%', borderRadius: 16, padding: 12 },
  messageText: { fontSize: 14, lineHeight: 20 },
  metaText: { fontSize: 10, marginTop: 6 },
  voiceMessage: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 150 },
  waveform: { flex: 1, height: 22, flexDirection: 'row', alignItems: 'center', gap: 3 },
  waveBar: { width: 3, borderRadius: 2 },
  latestButton: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 5, elevation: 5 },
  noticeBar: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1 },
  typingIndicator: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, marginTop: 4, marginBottom: 4 },
  replyBar: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, gap: 4 },
  recordingBar: { padding: 12, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordingInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordDot: { width: 8, height: 8, borderRadius: 4 },
  composer: { paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1 },
  composeIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E8F0' },
  groupHeaderAvatars: { flexDirection: 'row', gap: -5 },
  mentionMenu: { position: 'absolute', bottom: 62, left: 12, right: 12, borderWidth: 1, borderRadius: 16, paddingVertical: 6, zIndex: 10 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  studioTabs: { paddingHorizontal: 12, gap: 4, borderBottomWidth: 1 },
  studioTab: { paddingHorizontal: 10, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  traitChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  selectRow: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  savedToast: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginTop: 18 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flex: 1 },
  chatMessageInput: { minHeight: 40, maxHeight: 120, textAlignVertical: 'top' },
  searchHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  searchInputWrap: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14 },
  searchEmpty: { textAlign: 'center', padding: 40, fontSize: 15 },
  searchSectionLabel: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  searchResult: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendButtonText: { color: '#fff', fontWeight: '700' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '80%', borderRadius: 20, padding: 22, alignItems: 'center' },
  bottomOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 20 },
  proactiveInvitation: { position: 'absolute', left: 16, right: 16, bottom: 88, zIndex: 19, borderWidth: 1, borderRadius: 18, padding: 16, elevation: 8 },
  attachSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 36 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  attachGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  attachOption: { flex: 1, alignItems: 'center', gap: 8 },
  attachIcon: { width: 56, height: 56, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  attachmentPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1 },
  cameraOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000', zIndex: 30, justifyContent: 'space-between' },
  cameraPreview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraControls: { height: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  cameraClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  companionsHeader: { height: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, borderBottomWidth: 1 },
  companionsTitle: { fontSize: 28, fontWeight: '800' },
  addCompanionButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  companionGrid: { padding: 20, paddingBottom: 24, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  companionCard: { width: '47%', minHeight: 256, borderWidth: 1, borderRadius: 22, padding: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  languagePill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  groupRow: { minHeight: 100, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1 },
  groupAvatars: { width: 64, height: 48, position: 'relative' },
  groupAvatarPosition: { position: 'absolute', top: 4 },
  newButton: { borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroPanel: { borderWidth: 1, borderRadius: 24, padding: 24, alignItems: 'center' },
  heroName: { fontSize: 28, fontWeight: '700', marginTop: 12 },
  heroTag: { fontSize: 14, marginTop: 4 },
  callScreen: { flex: 1, overflow: 'hidden' },
  callGlow: { position: 'absolute', width: 420, height: 420, borderRadius: 210, opacity: 0.16, top: -100, alignSelf: 'center' },
  callContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  callAvatarWrap: { alignItems: 'center', justifyContent: 'center', width: 220, height: 220 },
  callRing: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 1, opacity: 0.55 },
  callRingLarge: { width: 210, height: 210, borderRadius: 105, opacity: 0.25 },
  callName: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 18 },
  callStatus: { color: 'rgba(255,255,255,0.72)', fontSize: 15, marginTop: 8 },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  callControls: { alignItems: 'center', paddingBottom: 36 },
  callActionRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginBottom: 30 },
  callAction: { alignItems: 'center', gap: 6 },
  callActionText: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  endCallButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '135deg' }] },
  endCallLabel: { color: 'rgba(255,255,255,0.8)', marginTop: 8, fontSize: 12 },
  sectionCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14 },
  sectionHeading: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  progressLine: { height: 3 },
  createAvatarWrap: { alignItems: 'center', marginTop: 18, position: 'relative' },
  createAvatar: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  createAvatarImage: { width: '100%', height: '100%', borderRadius: 50 },
  avatarPlus: { position: 'absolute', right: '35%', bottom: -2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1C0F18' },
  centerHint: { textAlign: 'center', marginTop: 20, fontSize: 15 },
  stateBlock: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateTitle: { fontSize: 18, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  stateMessage: { fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' },
  colorChoice: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  createIntro: { fontSize: 18, lineHeight: 28, marginBottom: 20 },
  traitRow: { minHeight: 78, borderWidth: 1, borderRadius: 20, paddingHorizontal: 20, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 18 },
  previewCard: { minHeight: 300, borderWidth: 1, borderRadius: 24, padding: 26, alignItems: 'center', justifyContent: 'center' },
  settingsList: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', marginBottom: 18 },
  settingsRow: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  signOutButton: { minHeight: 50, borderWidth: 1, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  versionText: { textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 18 },
  settingLabel: { fontSize: 12, letterSpacing: 1, fontWeight: '700', marginBottom: 12 },
  themeChoices: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  themeChoice: { flex: 1, minHeight: 140, borderWidth: 2, borderRadius: 18, padding: 12, alignItems: 'center', justifyContent: 'space-between' },
  themePreview: { width: 58, height: 78, borderRadius: 12, borderWidth: 1, borderColor: '#C85070' },
  settingRow: { minHeight: 70, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  switch: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  engineCard: { borderWidth: 1, borderRadius: 20, padding: 20, marginBottom: 24 },
  engineStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  tabBadge: { position: 'absolute', top: -5, right: -8, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  inlineActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  controlButton: { width: 100, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  smallAction: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  bottomBar: { minHeight: 72, flexDirection: 'row', borderTopWidth: 1, paddingHorizontal: 8, paddingTop: 7, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, zIndex: 10, elevation: 10 },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, zIndex: 1 },
  tabText: { fontSize: 12, fontWeight: '600', maxWidth: '100%' },
  studioHeader: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, gap: 14 },
  studioTitle: { flex: 1, fontSize: 22, fontWeight: '800' },
  savePill: { borderRadius: 22, paddingHorizontal: 20, paddingVertical: 11 },
  savePillText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  studioContent: { flex: 1 },
  studioContentInner: { paddingHorizontal: 26, paddingTop: 26, paddingBottom: 28 },
  studioIntro: { fontSize: 18, lineHeight: 25, marginBottom: 26 },
  studioIntroLabel: { fontSize: 16, fontWeight: '600', marginBottom: 12, marginTop: 0 },
  studioField: { minHeight: 58, borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'center', marginBottom: 26, fontSize: 18 },
  studioTextarea: { minHeight: 170, textAlignVertical: 'top', lineHeight: 28 },
  sliderBlock: { marginBottom: 30 },
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sliderLabel: { fontSize: 18, fontWeight: '600' },
  sliderValue: { fontSize: 17, fontWeight: '700' },
  sliderTrack: { height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#8A8A8A', justifyContent: 'center' },
  sliderFill: { position: 'absolute', left: 0, top: -1, bottom: -1, borderRadius: 5 },
  sliderThumb: { position: 'absolute', top: -7, width: 24, height: 24, borderRadius: 12, marginLeft: -12 },
  studioToggleRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, gap: 16 },
  studioToggleTitle: { fontSize: 18, fontWeight: '700' },
  studioToggleSubtitle: { fontSize: 15, marginTop: 5 },
  callMessage: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 150 },
  callMessageIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
});
