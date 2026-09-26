export type SpeechActivity = 'started' | 'ended' | 'none';

export class SpeechActivityDetector {
  private active = false;
  private speechFrames = 0;
  private silenceFrames = 0;

  constructor(
    private readonly threshold = 1400,
    private readonly framesToStart = 3,
    private readonly framesToEnd = 8,
  ) {}

  update(data: ArrayBuffer): SpeechActivity {
    const samples = new Int16Array(data);
    if (!samples.length) return 'none';
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / samples.length);

    if (rms >= this.threshold) {
      this.speechFrames += 1;
      this.silenceFrames = 0;
      if (!this.active && this.speechFrames >= this.framesToStart) {
        this.active = true;
        return 'started';
      }
    } else {
      this.speechFrames = 0;
      if (this.active) {
        this.silenceFrames += 1;
        if (this.silenceFrames >= this.framesToEnd) {
          this.active = false;
          this.silenceFrames = 0;
          return 'ended';
        }
      }
    }
    return 'none';
  }

  reset(): void {
    this.active = false;
    this.speechFrames = 0;
    this.silenceFrames = 0;
  }
}
