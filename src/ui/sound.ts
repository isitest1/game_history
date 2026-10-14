// 効果音（控えめ）。音のファイルは使わず、Web Audio で短い音を作る。最初は鳴らさない。

let ctx: AudioContext | null = null;
let enabled = false;

function beep(freq: number, dur: number, vol = 0.04, type: OscillatorType = 'sine'): void {
  if (!enabled || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export const sound = {
  unlock(on: boolean): void {
    enabled = on;
    if (on && !ctx) {
      try {
        ctx = new AudioContext();
      } catch {
        enabled = false;
      }
    }
  },
  set(on: boolean): void {
    this.unlock(on);
  },
  tick(): void {
    beep(880, 0.03, 0.015, 'square');
  },
  ding(): void {
    beep(660, 0.25, 0.04);
  },
  bell(): void {
    beep(220, 1.2, 0.05);
  },
};
