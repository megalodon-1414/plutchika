import type { CSSProperties } from 'react';
import type { EmotionId } from '../../data/emotions';
import { getBasicEmotion, getEmotionById, isBasicEmotionId } from '../../data/emotions';
import type { UserPlotRow } from '../../types/userPlot';
import {
  EMOTION_INTENSITY_MAX,
  clampIntensity,
  isPurePlot,
  normalizeUserPlotRow,
} from '../../utils/emotionPlotBridge';
import { blendHex } from '../../utils/emotionColor';
import { PlutchikEmotionPicker } from './PlutchikEmotionPicker';
import { wordTypeLabel } from '../../utils/emotionWordsBridge';

interface DevWordQuizCardProps {
  plot: UserPlotRow;
  index: number;
  total: number;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onChange: (plot: UserPlotRow) => void;
  onNext: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onDelete: () => void;
  canGoPrevious: boolean;
  isDeleting: boolean;
}

function handlePrimaryChange(plot: UserPlotRow, primaryId: EmotionId): UserPlotRow {
  let secondaryId = plot.secondaryId;

  if (!isBasicEmotionId(primaryId) && isBasicEmotionId(plot.primaryId)) {
    const dyad = getEmotionById(primaryId);
    if ('components' in dyad) {
      secondaryId = dyad.components[0];
    }
  }

  return normalizeUserPlotRow({ ...plot, primaryId, secondaryId });
}

function emotionColor(id: EmotionId): string {
  const emotion = getEmotionById(id);
  if ('color' in emotion) {
    return emotion.color;
  }
  const [a, b] = emotion.components;
  return blendHex(getBasicEmotion(a).color, getBasicEmotion(b).color, 0.5);
}

const presetButtonStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: '999px',
  border: '1px solid rgba(255,255,255,0.14)',
  backgroundColor: 'rgba(255,255,255,0.04)',
  color: '#d1d5db',
  fontSize: '0.78rem',
  cursor: 'pointer',
};

function saveStatusText(status: DevWordQuizCardProps['saveStatus']): string {
  switch (status) {
    case 'saving':
      return '保存中…';
    case 'saved':
      return '保存済み';
    case 'error':
      return '保存に失敗しました';
    default:
      return '未保存の変更は「次へ」で保存されます';
  }
}

function saveStatusColor(status: DevWordQuizCardProps['saveStatus']): string {
  switch (status) {
    case 'saving':
      return '#45f3ff';
    case 'saved':
      return '#7bc96f';
    case 'error':
      return '#ff0055';
    default:
      return '#9ca3af';
  }
}

export function DevWordQuizCard({
  plot,
  index,
  total,
  saveStatus,
  onChange,
  onNext,
  onSkip,
  onPrevious,
  onDelete,
  canGoPrevious,
  isDeleting,
}: DevWordQuizCardProps) {
  const pure = isPurePlot(plot);
  const primaryColor = emotionColor(plot.primaryId);
  const secondaryColor = emotionColor(plot.secondaryId);
  const gradient = `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})`;

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
          {index + 1} / {total}
        </div>
        <div style={{ fontSize: '0.82rem', color: saveStatusColor(saveStatus) }}>
          {saveStatusText(saveStatus)}
        </div>
      </div>

      <div
        style={{
          width: '100%',
          height: '4px',
          borderRadius: '999px',
          backgroundColor: 'rgba(255,255,255,0.08)',
          marginBottom: '20px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${((index + 1) / total) * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #45f3ff, #c39bd3)',
            transition: 'width 240ms ease',
          }}
        />
      </div>

      <article
        style={{
          padding: '24px 28px',
          borderRadius: '16px',
          backgroundColor: '#111318',
          border: '1px solid #1f2833',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
              {plot.word_id}
            </h2>
            {plot.ruby && (
              <p style={{ margin: '6px 0 0', fontSize: '1rem', color: '#45f3ff' }}>{plot.ruby}</p>
            )}
          </div>
          {plot.wordType && (
            <span
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                backgroundColor: 'rgba(69, 243, 255, 0.1)',
                color: '#45f3ff',
                fontSize: '0.8rem',
              }}
            >
              {wordTypeLabel(plot.wordType)}
            </span>
          )}
        </div>

        {plot.meaning && (
          <p style={{ margin: '18px 0 0', fontSize: '1rem', color: '#e5e7eb', lineHeight: 1.7 }}>
            {plot.meaning}
          </p>
        )}
        {plot.usageExample && (
          <p
            style={{
              margin: '12px 0 0',
              fontSize: '0.92rem',
              color: '#9ca3af',
              lineHeight: 1.6,
              fontStyle: 'italic',
            }}
          >
            「{plot.usageExample}」
          </p>
        )}
      </article>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '28px',
          marginBottom: '28px',
        }}
      >
        <PlutchikEmotionPicker
          label="主感情"
          hint="この言葉の中心となる感情"
          value={plot.primaryId}
          onChange={(primaryId) => onChange(handlePrimaryChange(plot, primaryId))}
        />
        <PlutchikEmotionPicker
          label="副感情"
          hint="主感情から引かれる方向"
          value={plot.secondaryId}
          onChange={(secondaryId) =>
            onChange(normalizeUserPlotRow({ ...plot, secondaryId }))
          }
        />
      </div>

      <section
        style={{
          padding: '20px 24px',
          borderRadius: '14px',
          backgroundColor: '#111318',
          border: '1px solid #1f2833',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '14px',
            gap: '12px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#fff', fontWeight: 600 }}>
            強度
          </h3>
          <span
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color: '#45f3ff',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {plot.intensity}
          </span>
        </div>

        <div
          style={{
            position: 'relative',
            height: '12px',
            borderRadius: '999px',
            background: gradient,
            marginBottom: '10px',
            opacity: 0.85,
          }}
        />
        <input
          type="range"
          min={0}
          max={EMOTION_INTENSITY_MAX}
          step={1}
          value={plot.intensity}
          onChange={(event) =>
            onChange(
              normalizeUserPlotRow({
                ...plot,
                intensity: clampIntensity(Number(event.target.value)),
              }),
            )
          }
          style={{ width: '100%', accentColor: '#45f3ff', marginBottom: '12px' }}
        />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[10, 25, 40].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() =>
                onChange(normalizeUserPlotRow({ ...plot, intensity: preset }))
              }
              style={{
                ...presetButtonStyle,
                borderColor: plot.intensity === preset ? '#45f3ff' : presetButtonStyle.border as string,
                color: plot.intensity === preset ? '#45f3ff' : presetButtonStyle.color,
              }}
            >
              {preset === 10 ? '弱' : preset === 25 ? '中' : '強'} ({preset})
            </button>
          ))}
        </div>

        <p style={{ margin: '14px 0 0', fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.5 }}>
          {pure
            ? '主・副が同じ → その感情の中心付近に配置されます。'
            : '主感情の領域から、副感情の方向へ強度に応じて配置されます。'}
        </p>
      </section>

      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={onNext}
          disabled={isDeleting}
          style={{
            flex: '1 1 200px',
            padding: '14px 20px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#45f3ff',
            color: '#0b0c10',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: isDeleting ? 'wait' : 'pointer',
            opacity: isDeleting ? 0.6 : 1,
          }}
        >
          保存して次へ →
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={isDeleting}
          style={{
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid #1f2833',
            backgroundColor: 'transparent',
            color: '#9ca3af',
            fontSize: '0.92rem',
            cursor: isDeleting ? 'wait' : 'pointer',
          }}
        >
          スキップ
        </button>
        {canGoPrevious && (
          <button
            type="button"
            onClick={onPrevious}
            disabled={isDeleting}
            style={{
              padding: '14px 18px',
              borderRadius: '10px',
              border: '1px solid #1f2833',
              backgroundColor: 'transparent',
              color: '#c39bd3',
              fontSize: '0.92rem',
              cursor: isDeleting ? 'wait' : 'pointer',
            }}
          >
            ← 前へ
          </button>
        )}
      </div>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 0, 85, 0.45)',
            backgroundColor: 'transparent',
            color: '#ff8fab',
            fontSize: '0.85rem',
            cursor: isDeleting ? 'wait' : 'pointer',
          }}
        >
          {isDeleting ? '削除中…' : 'この単語をテーブルから削除'}
        </button>
      </div>

      <p style={{ margin: '16px 0 0', fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
        Enter = 次へ　/　S = スキップ
      </p>
    </div>
  );
}
