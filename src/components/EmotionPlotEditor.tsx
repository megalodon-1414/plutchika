import type { CSSProperties } from 'react';
import type { EmotionId } from '../data/emotions';
import { BASIC_EMOTIONS, DYAD_EMOTIONS, getEmotionById, isBasicEmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import { EMOTION_INTENSITY_MAX, clampIntensity, isPurePlot, normalizeUserPlotRow } from '../utils/emotionPlotBridge';
import { resolvePrimaryEmotionLabel } from '../utils/emotionCoordinates';

interface EmotionPlotEditorProps {
  plot: UserPlotRow;
  onChange: (plot: UserPlotRow) => void;
}

const selectStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '4px',
  border: '1px solid #1f2833',
  backgroundColor: '#0b0c10',
  color: '#fff',
  fontSize: '0.9rem',
};

function handlePrimaryChange(plot: UserPlotRow, primaryId: EmotionId): UserPlotRow {
  let secondaryId = plot.secondaryId;

  // 主感情を合成24に切り替えたときは、副感情が未設定相当なら成分の一方を初期値にする
  if (!isBasicEmotionId(primaryId) && isBasicEmotionId(plot.primaryId)) {
    const dyad = getEmotionById(primaryId);
    if ('components' in dyad) {
      secondaryId = dyad.components[0];
    }
  }

  return normalizeUserPlotRow({ ...plot, primaryId, secondaryId });
}

export function EmotionPlotEditor({ plot, onChange }: EmotionPlotEditorProps) {
  const pure = isPurePlot(plot);

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        <span style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#c5c6c7' }}>
          主感情（8基本 / 24中間）
        </span>
        <select
          value={plot.primaryId}
          onChange={(e) => onChange(handlePrimaryChange(plot, e.target.value as EmotionId))}
          style={selectStyle}
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
      </label>

      <label style={{ display: 'block', marginBottom: '12px' }}>
        <span style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#c5c6c7' }}>
          副感情（32感情・引かれる方向）
        </span>
        <select
          value={plot.secondaryId}
          onChange={(e) =>
            onChange(normalizeUserPlotRow({ ...plot, secondaryId: e.target.value as EmotionId }))
          }
          style={selectStyle}
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
      </label>

      <label style={{ display: 'block', marginBottom: '8px' }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem', color: '#c5c6c7' }}>
          <span>強度 (0〜{EMOTION_INTENSITY_MAX})</span>
          <span style={{ color: '#45f3ff' }}>{plot.intensity}</span>
        </span>
        <input
          type="range"
          min={0}
          max={EMOTION_INTENSITY_MAX}
          step={1}
          value={plot.intensity}
          onChange={(e) =>
            onChange(normalizeUserPlotRow({ ...plot, intensity: clampIntensity(Number(e.target.value)) }))
          }
          style={{ width: '100%', accentColor: '#45f3ff' }}
        />
      </label>

      <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.5 }}>
        {pure
          ? '主・副が同じ（純感情）→ その感情中心の周りを公転。強いほど中心近く、弱いほど外周。'
          : '主感情の領域から、副感情の方向へ強度に応じて配置されます。'}
      </p>
    </div>
  );
}
