export type CallUiState =
  | 'calling'
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'listening'
  | 'userSpeaking'
  | 'thinking'
  | 'speaking'
  | 'interrupting'
  | 'reconnecting'
  | 'ended'
  | 'failed';

const transitions: Record<CallUiState, readonly CallUiState[]> = {
  calling: ['connecting', 'failed', 'ended'],
  connecting: ['connected', 'listening', 'reconnecting', 'failed', 'ended'],
  ringing: ['connected', 'reconnecting', 'failed', 'ended'],
  connected: ['listening', 'userSpeaking', 'thinking', 'speaking', 'interrupting', 'reconnecting', 'failed', 'ended'],
  listening: ['connected', 'userSpeaking', 'thinking', 'speaking', 'interrupting', 'reconnecting', 'failed', 'ended'],
  userSpeaking: ['connected', 'listening', 'thinking', 'speaking', 'interrupting', 'reconnecting', 'failed', 'ended'],
  thinking: ['connected', 'listening', 'userSpeaking', 'speaking', 'interrupting', 'reconnecting', 'failed', 'ended'],
  speaking: ['connected', 'listening', 'userSpeaking', 'thinking', 'interrupting', 'reconnecting', 'failed', 'ended'],
  interrupting: ['connected', 'listening', 'userSpeaking', 'thinking', 'speaking', 'reconnecting', 'failed', 'ended'],
  reconnecting: ['connected', 'listening', 'userSpeaking', 'thinking', 'speaking', 'failed', 'ended'],
  failed: ['calling', 'ended'],
  ended: ['calling'],
};

export function transitionCallState(current: CallUiState, next: CallUiState): CallUiState {
  return current === next || transitions[current].includes(next) ? next : current;
}

export function createReconnectBudget(maxAttempts = 1): () => boolean {
  let attempts = 0;
  return () => {
    if (attempts >= maxAttempts) return false;
    attempts += 1;
    return true;
  };
}

let activeCall: { owner: object; stop: () => Promise<void> } | undefined;
let activeCallChange = Promise.resolve();

export function claimActiveCall(owner: object, stop: () => Promise<void>): Promise<void> {
  const change = activeCallChange.then(async () => {
    if (activeCall && activeCall.owner !== owner) await activeCall.stop();
    activeCall = { owner, stop };
  });
  activeCallChange = change.catch(() => undefined);
  return change;
}

export async function releaseActiveCall(owner: object): Promise<void> {
  const change = activeCallChange.then(() => {
    if (activeCall?.owner === owner) activeCall = undefined;
  });
  activeCallChange = change.catch(() => undefined);
  await change;
}
