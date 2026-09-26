import type { Message } from '../types';
import { MockCallProvider, MockSpeechToTextProvider, MockTextToSpeechProvider } from './mockProviders';
import { claimActiveCall, createReconnectBudget, releaseActiveCall, transitionCallState } from './callState';
import { createIdempotentStop } from './lifecycle';
import { createAssistantVoiceMessage, createVoiceUserMessage, retryVoiceOperation } from './messagePipeline';
import { SpeechActivityDetector } from './speechActivity';

export async function runVoiceContractTests(): Promise<void> {
  const message: Message = {
    id: 'voice-test',
    fromMe: true,
    type: 'voice',
    voiceDuration: 3,
    voiceAudioUri: 'file:///recording.m4a',
    voicePlaybackAvailable: true,
    status: 'sent',
    timestamp: new Date(),
  };
  if (message.type !== 'voice' || !message.voiceAudioUri) throw new Error('voice metadata contract failed');
  const userMessage = createVoiceUserMessage('user-voice', 'file:///recording.m4a', 3);
  if (userMessage.type !== 'voice' || !userMessage.voiceAudioUri || userMessage.fromMe !== true) throw new Error('voice user pipeline message failed');
  const assistantMessage = createAssistantVoiceMessage('assistant-voice', 'Hello back', 'file:///reply.wav');
  if (assistantMessage.type !== 'voice' || !assistantMessage.voiceAudioUri || assistantMessage.fromMe !== false || !assistantMessage.text) throw new Error('assistant voice reply requirement failed');
  let attempts = 0;
  const retried = await retryVoiceOperation(async () => {
    attempts += 1;
    if (attempts < 2) throw new Error('temporary voice failure');
    return 'ok';
  });
  if (retried !== 'ok' || attempts !== 2) throw new Error('voice retry contract failed');
  const call = new MockCallProvider();
  await call.start();
  if (call.getState() !== 'connected') throw new Error('call lifecycle contract failed');
  await call.end();
  if (call.getState() !== 'ended') throw new Error('call end contract failed');
  if (transitionCallState('failed', 'connected') !== 'failed') throw new Error('failed call was revived');
  if (transitionCallState('failed', 'calling') !== 'calling') throw new Error('failed call could not be retried');
  if (transitionCallState('ended', 'speaking') !== 'ended') throw new Error('ended call resumed audio');
  if (transitionCallState('calling', 'connected') !== 'calling') throw new Error('call connected before its setup handshake');
  if (transitionCallState('connected', 'ended') !== 'ended') throw new Error('call termination contract failed');
  const reconnect = createReconnectBudget(1);
  if (!reconnect() || reconnect()) throw new Error('call reconnect was not bounded to one attempt');
  let previousSessionStopped = 0;
  const firstSession = {};
  const secondSession = {};
  await claimActiveCall(firstSession, async () => { previousSessionStopped += 1; });
  await claimActiveCall(secondSession, async () => {});
  await releaseActiveCall(secondSession);
  if (previousSessionStopped !== 1) throw new Error('second call did not stop the previous session');
  const detector = new SpeechActivityDetector(1400, 3, 8);
  const speech = new Int16Array(320);
  speech.fill(3000);
  const silence = new Int16Array(320);
  if (detector.update(speech.buffer) !== 'none' || detector.update(speech.buffer) !== 'none' || detector.update(speech.buffer) !== 'started') {
    throw new Error('speech activity start detection failed');
  }
  for (let index = 0; index < 7; index += 1) {
    if (detector.update(silence.buffer) !== 'none') throw new Error('speech activity ended too early');
  }
  if (detector.update(silence.buffer) !== 'ended') throw new Error('speech activity end detection failed');
  let stopCount = 0;
  const stop = createIdempotentStop(() => { stopCount += 1; });
  stop();
  stop();
  if (stopCount !== 1) throw new Error('AudioStream cleanup was not idempotent');
  try { await new MockSpeechToTextProvider().transcribe('missing'); throw new Error('STT should be unavailable'); } catch {}
  try { await new MockTextToSpeechProvider().speak('hello'); throw new Error('TTS should be unavailable'); } catch {}
}
