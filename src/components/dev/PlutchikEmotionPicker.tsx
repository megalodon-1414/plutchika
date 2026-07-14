import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import {
  BASIC_EMOTIONS,
  DYAD_EMOTIONS,
  getBasicEmotion,
  getEmotionById,
  isBasicEmotionId,
} from '../../data/emotions';
import { blendHex } from '../../utils/emotionColor';
import { resolvePrimaryEmotionLabel } from '../../utils/emotionCoordinates';

interface PlutchikEmotionPickerProps {
  value: EmotionId;
  onChange: (value: EmotionId) => void;
  label: string;
  hint?: string;
}

const WHEEL_SIZE = 340;
const CENTER = WHEEL_SIZE / 2;
const BASIC_RADIUS = 128;
const DYAD_RADIUS: Record<1 | 2 | 3, number> = {
  1: 96,
  2: 62,
  3: 34,
};

function emotionColor(id: EmotionId): string {
  const emotion = getEmotionById(id);
  if ('color' in emotion) {
    return emotion.color;
  }
  const [a, b] = emotion.components;
  return blendHex(getBasicEmotion(a).color, getBasicEmotion(b).color, 0.5);
}

function emotionLabel(id: EmotionId): string {
  return resolvePrimaryEmotionLabel(id);
}

function polarPosition(angleDeg: number, radius: number): { left: number; top: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    left: CENTER + Math.cos(rad) * radius,
    top: CENTER - Math.sin(rad) * radius,
  };
}

function dyadAngle(components: [BasicEmotionId, BasicEmotionId]): number {
  const a = getBasicEmotion(components[0]).angle;
  const b = getBasicEmotion(components[1]).angle;
  const radA = (a * Math.PI) / 180;
  const radB = (b * Math.PI) / 180;
  const x = Math.cos(radA) + Math.cos(radB);
  const y = Math.sin(radA) + Math.sin(radB);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function EmotionWheelButton({
  id,
  angleDeg,
  radius,
  size,
  selected,
  onSelect,
}: {
  id: EmotionId;
  angleDeg: number;
  radius: number;
  size: number;
  selected: boolean;
  onSelect: (id: EmotionId) => void;
}) {
  const color = emotionColor(id);
  const label = emotionLabel(id);
  const { left, top } = polarPosition(angleDeg, radius);
  const fontSize = size >= 48 ? '0.82rem' : size >= 36 ? '0.72rem' : '0.62rem';

  const style: CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: size,
    height: size,
    marginLeft: -size / 2,
    marginTop: -size / 2,
    borderRadius: '999px',
    border: selected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.18)',
    backgroundColor: color,
    color: '#0b0c10',
    fontSize,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    lineHeight: 1.15,
    padding: '2px',
    boxSizing: 'border-box',
    transform: selected ? 'scale(1.1)' : 'scale(1)',
    boxShadow: selected
      ? `0 0 0 3px ${color}, 0 8px 24px ${color}88`
      : `0 2px 10px rgba(0,0,0,0.35)`,
    transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
    zIndex: selected ? 3 : 1,
  };

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      style={style}
    >
      {label}
    </button>
  );
}

export function PlutchikEmotionPicker({ value, onChange, label, hint }: PlutchikEmotionPickerProps) {
  const selectedColor = emotionColor(value);
  const selectedLabel = emotionLabel(value);

  const dyadButtons = useMemo(
    () =>
      DYAD_EMOTIONS.map((dyad) => ({
        id: dyad.id,
        angleDeg: dyadAngle(dyad.components),
        radius: DYAD_RADIUS[dyad.distance],
        size: dyad.distance === 1 ? 38 : dyad.distance === 2 ? 32 : 28,
      })),
    [],
  );

  return (
    <section>
      <div style={{ marginBottom: '12px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: '#fff', fontWeight: 600 }}>
          {label}
        </h3>
        {hint && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5 }}>{hint}</p>
        )}
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '14px',
          padding: '8px 14px',
          borderRadius: '999px',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: `1px solid ${selectedColor}66`,
        }}
      >
        <span
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '999px',
            backgroundColor: selectedColor,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '0.9rem', color: '#fff' }}>{selectedLabel}</span>
        {isBasicEmotionId(value) && (
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>基本感情</span>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          width: WHEEL_SIZE,
          maxWidth: '100%',
          aspectRatio: '1',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '8%',
            borderRadius: '999px',
            border: '1px dashed rgba(255,255,255,0.08)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '22%',
            borderRadius: '999px',
            border: '1px dashed rgba(255,255,255,0.06)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '36%',
            borderRadius: '999px',
            border: '1px dashed rgba(255,255,255,0.05)',
          }}
        />

        {dyadButtons.map((dyad) => (
          <EmotionWheelButton
            key={dyad.id}
            id={dyad.id}
            angleDeg={dyad.angleDeg}
            radius={dyad.radius}
            size={dyad.size}
            selected={value === dyad.id}
            onSelect={onChange}
          />
        ))}

        {BASIC_EMOTIONS.map((emotion) => (
          <EmotionWheelButton
            key={emotion.id}
            id={emotion.id}
            angleDeg={emotion.angle}
            radius={BASIC_RADIUS}
            size={52}
            selected={value === emotion.id}
            onSelect={onChange}
          />
        ))}

        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '28px',
            height: '28px',
            borderRadius: '999px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        />
      </div>
    </section>
  );
}
