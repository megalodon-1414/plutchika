import type { CSSProperties } from 'react';
import type { EmotionId } from '../../data/emotions';
import { BASIC_EMOTIONS, DYAD_EMOTIONS } from '../../data/emotions';
import { resolvePrimaryEmotionLabel } from '../../utils/emotionCoordinates';

interface EmotionSelectProps {
  value: EmotionId;
  onChange: (value: EmotionId) => void;
  style?: CSSProperties;
}

const defaultStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderRadius: '4px',
  border: '1px solid #1f2833',
  backgroundColor: '#0b0c10',
  color: '#fff',
  fontSize: '0.85rem',
};

export function EmotionSelect({ value, onChange, style }: EmotionSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as EmotionId)}
      style={{ ...defaultStyle, ...style }}
    >
      <optgroup label="基本8感情">
            {BASIC_EMOTIONS.map((emotion) => (
              <option key={emotion.id} value={emotion.id}>
                {resolvePrimaryEmotionLabel(emotion.id)}
              </option>
            ))}
      </optgroup>
      <optgroup label="中間24感情">
            {DYAD_EMOTIONS.map((dyad) => (
              <option key={dyad.id} value={dyad.id}>
                {resolvePrimaryEmotionLabel(dyad.id)}
              </option>
            ))}
      </optgroup>
    </select>
  );
}
