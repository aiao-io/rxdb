/** 闹钟与计时器到点的提示音：三声短促的正弦铃声，音量按传入值缩放。 */
export function playAlarmTone(volume = 1): void {
  const Audio = window.AudioContext;
  if (!Audio) return;
  const context = new Audio();
  const gain = context.createGain();
  gain.gain.value = volume;
  gain.connect(context.destination);
  const notes = [
    [0, 880],
    [0.25, 880],
    [0.5, 1174.66]
  ] as const;
  for (const [delay, frequency] of notes) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + 0.2);
  }
  setTimeout(() => void context.close(), 1500);
}
