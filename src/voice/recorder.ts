import { RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestMicrophonePermission } from './permissions';
import type { RecordingLifecycle } from './types';

export function useVoiceRecorder() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recorderState = useAudioRecorderState(recorder);
  const [lifecycle, setLifecycle] = useState<RecordingLifecycle>('idle');
  const [error, setError] = useState<string | undefined>();
  const [uri, setUri] = useState<string | undefined>();
  const configuredRef = useRef(false);

  const configure = useCallback(async () => {
    if (configuredRef.current) return;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    configuredRef.current = true;
  }, []);

  const start = useCallback(async () => {
    setError(undefined);
    setLifecycle('requesting-permission');
    try {
      const permission = await requestMicrophonePermission();
      if (!permission) {
        setLifecycle('failed');
        setError('Microphone permission was denied.');
        return false;
      }
      await configure();
      await recorder.prepareToRecordAsync();
      recorder.record();
      setUri(undefined);
      setLifecycle('recording');
      return true;
    } catch {
      setLifecycle('failed');
      setError('Recording is unavailable on this device.');
      return false;
    }
  }, [configure, recorder]);

  const pause = useCallback(() => {
    try {
      recorder.pause();
      setLifecycle('paused');
    } catch {
      setError('Recording could not be paused.');
    }
  }, [recorder]);

  const resume = useCallback(() => {
    try {
      recorder.record();
      setLifecycle('recording');
    } catch {
      setError('Recording could not be resumed.');
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    try {
      await recorder.stop();
      setUri(recorder.uri || undefined);
      setLifecycle('preview');
      return recorder.uri || undefined;
    } catch {
      setLifecycle('failed');
      setError('Recording could not be stopped.');
      return undefined;
    }
  }, [recorder]);

  const discard = useCallback(() => {
    setUri(undefined);
    setLifecycle('idle');
    setError(undefined);
  }, []);

  useEffect(() => () => {
    void setAudioModeAsync({ allowsRecording: false });
  }, []);

  return useMemo(() => ({
    lifecycle,
    isRecording: recorderState.isRecording,
    duration: Math.max(0, Math.round(recorderState.durationMillis / 1000)),
    uri,
    error,
    start,
    pause,
    resume,
    stop,
    discard,
  }), [discard, error, lifecycle, pause, recorderState.durationMillis, recorderState.isRecording, resume, start, stop, uri]);
}
