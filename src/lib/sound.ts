// Web Audio API Security Alert Sound Synthesizer
// Works in all modern browsers without external audio assets or network requests

export const playSecurityWarningSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const playBeep = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Two-tone rapid alarm pattern
    playBeep(880, now, 0.15);
    playBeep(659.25, now + 0.18, 0.18);
    playBeep(880, now + 0.38, 0.15);
    playBeep(659.25, now + 0.55, 0.22);
  } catch (err) {
    console.warn('Unable to play security sound:', err);
  }
};
