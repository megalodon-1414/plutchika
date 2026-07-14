import type { EmotionWord, StateWord, WordData } from '../types/word';
import { spreadAngle, toPlotFrequency } from './plotTransform';

const PLUTCHIK_HUES: readonly [number, number][] = [
  [0, 48],
  [45, 84],
  [90, 134],
  [135, 180],
  [180, 236],
  [225, 280],
  [270, 0],
  [315, 24],
  [360, 48],
];

function lerpHue(from: number, to: number, t: number): number {
  let diff = to - from;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (from + diff * t + 360) % 360;
}

function plutchikHue(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;

  for (let i = 0; i < PLUTCHIK_HUES.length - 1; i++) {
    const [startAngle, startHue] = PLUTCHIK_HUES[i];
    const [endAngle, endHue] = PLUTCHIK_HUES[i + 1];

    if (normalized >= startAngle && normalized <= endAngle) {
      const t = (normalized - startAngle) / (endAngle - startAngle);
      return lerpHue(startHue, endHue, t);
    }
  }

  return PLUTCHIK_HUES[0][1];
}

function frequencyToLightness(frequency: number): number {
  return 25 + (frequency / 100) * 55;
}

export interface WordHslComponents {
  hue: number;
  brightness: number;
  saturation: number;
}

export function getWordHslComponents(word: WordData): WordHslComponents {
  if (word.type === 'emotion') {
    return {
      hue: plutchikHue(spreadAngle(word.angle, word.id)),
      saturation: word.intensity,
      brightness: frequencyToLightness(toPlotFrequency(word.frequency)),
    };
  }

  return {
    hue: ((word.perception + 10) / 20) * 360,
    saturation: (Math.abs(word.quality) / 10) * 100,
    brightness: frequencyToLightness(word.frequency),
  };
}

export function getEmotionColor(word: EmotionWord): string {
  const { hue, saturation, brightness } = getWordHslComponents(word);
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${brightness.toFixed(1)}%)`;
}

export function getStateColor(word: StateWord): string {
  const { hue, saturation, brightness } = getWordHslComponents(word);
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${brightness.toFixed(1)}%)`;
}

export function getWordColor(word: WordData): string {
  return word.type === 'emotion' ? getEmotionColor(word) : getStateColor(word);
}
