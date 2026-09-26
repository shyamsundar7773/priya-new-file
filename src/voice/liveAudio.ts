import { createAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64FromBytes(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    result += BASE64[a >> 2];
    result += BASE64[((a & 3) << 4) | (b >> 4)];
    result += index + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '=';
    result += index + 2 < bytes.length ? BASE64[c & 63] : '=';
  }
  return result;
}

function bytesFromBase64(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const output: number[] = [];
  for (let index = 0; index < clean.length; index += 4) {
    const a = BASE64.indexOf(clean[index]);
    const b = BASE64.indexOf(clean[index + 1]);
    const c = clean[index + 2] === '=' ? 0 : BASE64.indexOf(clean[index + 2]);
    const d = clean[index + 3] === '=' ? 0 : BASE64.indexOf(clean[index + 3]);
    output.push((a << 2) | (b >> 4));
    if (clean[index + 2] !== '=') output.push(((b & 15) << 4) | (c >> 2));
    if (clean[index + 3] !== '=') output.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(output);
}

function wavBytes(pcm: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, value: string) => Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  const blockAlign = channels * 2;
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcm.length, true);
  const result = new Uint8Array(44 + pcm.length);
  result.set(new Uint8Array(header));
  result.set(pcm, 44);
  return result;
}

export class PcmAudioOutput {
  private queue: string[] = [];
  private activeUri?: string;
  private player?: ReturnType<typeof createAudioPlayer>;
  private subscription?: { remove: () => void };
  private stopped = false;
  private enqueueChain = Promise.resolve();
  private generation = 0;
  private pendingEnqueues = 0;

  constructor(private readonly onPlaybackStateChange?: (playing: boolean) => void) {}

  get isBusy(): boolean {
    return this.pendingEnqueues > 0 || this.queue.length > 0 || Boolean(this.player);
  }

  async enqueue(base64Audio: string, sampleRate = 24000, channels = 1): Promise<void> {
    const generation = this.generation;
    this.pendingEnqueues += 1;
    const enqueue = this.enqueueChain
      .catch(() => undefined)
      .then(async () => {
        if (this.stopped || generation !== this.generation) return;
        const pcm = bytesFromBase64(base64Audio);
        const uri = `${FileSystem.cacheDirectory}priya-live-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;
        await FileSystem.writeAsStringAsync(uri, base64FromBytes(wavBytes(pcm, sampleRate, channels)), { encoding: FileSystem.EncodingType.Base64 });
        if (this.stopped || generation !== this.generation) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
          return;
        }
        this.queue.push(uri);
        await this.playNext();
      });
    this.enqueueChain = enqueue;
    try {
      await enqueue;
    } finally {
      this.pendingEnqueues -= 1;
      if (!this.isBusy) this.onPlaybackStateChange?.(false);
    }
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  clear(): void {
    this.generation += 1;
    this.queue.splice(0).forEach((uri) => { void FileSystem.deleteAsync(uri, { idempotent: true }); });
    this.subscription?.remove();
    this.subscription = undefined;
    this.player?.pause();
    this.player?.release();
    this.player = undefined;
    if (this.activeUri) void FileSystem.deleteAsync(this.activeUri, { idempotent: true });
    this.activeUri = undefined;
    this.onPlaybackStateChange?.(false);
  }

  private async playNext(): Promise<void> {
    if (this.stopped || this.player || this.queue.length === 0) return;
    const uri = this.queue.shift();
    if (!uri) return;
    this.activeUri = uri;
    const player = createAudioPlayer(uri);
    this.player = player;
    this.onPlaybackStateChange?.(true);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.subscription?.remove();
      this.subscription = undefined;
      player.release();
      this.player = undefined;
      this.activeUri = undefined;
      void FileSystem.deleteAsync(uri, { idempotent: true });
      void this.playNext();
      if (this.queue.length === 0 && this.pendingEnqueues === 0 && !this.player) this.onPlaybackStateChange?.(false);
    };
    this.subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish || (!status.playing && status.duration > 0 && status.currentTime >= status.duration)) finish();
    });
    player.play();
  }
}
