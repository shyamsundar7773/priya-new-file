import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useVoicePlayer() {
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [error, setError] = useState<string | undefined>();

  const toggle = useCallback(async (uri: string) => {
    setError(undefined);
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (playingUri === uri && playerRef.current) {
        playerRef.current.pause();
        setPlayingUri(null);
        return false;
      }
      subscriptionRef.current?.remove();
      playerRef.current?.release();
      const player = createAudioPlayer(uri);
      playerRef.current = player;
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        const progress = status.duration > 0 ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;
        setPlaybackProgress(progress);
        setPlaybackDuration(status.duration);
        if (status.didJustFinish) {
          setPlayingUri(null);
          setPlaybackProgress(100);
          subscription.remove();
          subscriptionRef.current = null;
        }
      });
      subscriptionRef.current = subscription;
      player.play();
      setPlayingUri(uri);
      setPlaybackProgress(0);
      return true;
    } catch {
      setError('This voice message is no longer available for playback.');
      setPlayingUri(null);
      return false;
    }
  }, [playingUri]);

  const stop = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    playerRef.current?.pause();
    setPlayingUri(null);
  }, []);

  useEffect(() => () => {
    subscriptionRef.current?.remove();
    playerRef.current?.release();
  }, []);

  return { playingUri, playbackProgress, playbackDuration, error, toggle, stop };
}
