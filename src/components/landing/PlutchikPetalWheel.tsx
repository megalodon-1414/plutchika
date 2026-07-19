import { useState } from 'react';
import type { BasicEmotionId } from '../../data/emotions';
import { BASIC_EMOTIONS } from '../../data/emotions';
import { buildPlutchikPetalPath } from '../../utils/plutchikPetalPath';

const VIEW_SIZE = 420;
const CENTER = VIEW_SIZE / 2;
const OUTER_RADIUS = 168;
const SECTOR_HALF_SPREAD = 22.5;
/** joy を 12 時方向に合わせる */
const ANGLE_OFFSET = -90;

/** 花びら単体の不透明度。低めにしてガラスのような透明感を出し、重なり部分は screen 合成で明るく溶け合わせる。 */
const PETAL_FILL_OPACITY = 0.78;

const DEFAULT_PROMPT_LABEL = '花びらを選ぶ';
const DEFAULT_PROMPT_COLOR = '#9f8aaa';

interface PlutchikPetalWheelProps {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  /** 選択中の感情語をグラフィック上部に表示するか（panel-3の2輪構成では、組み合わせ名を別途下部に出すためfalseにする）。 */
  showLabel?: boolean;
  /** 選択（または選択解除）のたびに呼ばれる。複数の輪の選択状態を親でまとめて見たい場合に使う。 */
  onSelectionChange?: (id: BasicEmotionId | null) => void;
}

const petals = BASIC_EMOTIONS.map((emotion) => {
  const renderAngle = emotion.angle + ANGLE_OFFSET;
  return {
    id: emotion.id,
    label: emotion.label,
    color: emotion.color,
    d: buildPlutchikPetalPath(CENTER, CENTER, renderAngle, OUTER_RADIUS, SECTOR_HALF_SPREAD),
  };
});

/**
 * プルチックの感情環（8花びら）。花びらをクリックするとその感情語をグラフィック上部に表示し、
 * 選択中の花びらだけ少し大きく・縁が白くグロウする（他の花びらは変化しない）。
 */
export function PlutchikPetalWheel({
  size = 'min(46vh, 420px)',
  className,
  style,
  showLabel = true,
  onSelectionChange,
}: PlutchikPetalWheelProps) {
  const [selectedId, setSelectedId] = useState<BasicEmotionId | null>(null);
  const selected = petals.find((petal) => petal.id === selectedId) ?? null;

  const selectPetal = (id: BasicEmotionId) => {
    const next = selectedId === id ? null : id;
    setSelectedId(next);
    onSelectionChange?.(next);
  };

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5em', ...style }}
    >
      <style>
        {`
          @keyframes plutchik-petal-wheel-glow {
            0%, 100% {
              filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.55)) drop-shadow(0 0 10px rgba(255, 255, 255, 0.35));
            }
            50% {
              filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.95)) drop-shadow(0 0 20px rgba(255, 255, 255, 0.65));
            }
          }
          .plutchik-petal-wheel__petal {
            cursor: pointer;
            transform-box: view-box;
            transform-origin: ${CENTER}px ${CENTER}px;
            transform: scale(1);
            transition:
              transform 0.35s ease,
              stroke-opacity 0.35s ease;
          }
          .plutchik-petal-wheel__petal--selected {
            transform: scale(1.14);
            animation: plutchik-petal-wheel-glow 2.2s ease-in-out infinite;
          }
        `}
      </style>
      {showLabel && (
        <div
          style={{
            fontSize: '1.05em',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: selected ? selected.color : DEFAULT_PROMPT_COLOR,
            transition: 'color 0.3s ease',
          }}
        >
          {selected ? selected.label : DEFAULT_PROMPT_LABEL}
        </div>
      )}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        style={{ display: 'block', overflow: 'visible' }}
        role="group"
        aria-label="プルチックの感情環。花びらを選ぶと感情語が表示されます。"
      >
        {petals.map((petal) => {
          const isSelected = petal.id === selectedId;
          return (
            <path
              key={petal.id}
              d={petal.d}
              fill={petal.color}
              fillOpacity={PETAL_FILL_OPACITY}
              stroke="#ffffff"
              strokeWidth={3}
              strokeOpacity={isSelected ? 0.9 : 0}
              style={{ mixBlendMode: 'screen' }}
              className={`plutchik-petal-wheel__petal${isSelected ? ' plutchik-petal-wheel__petal--selected' : ''}`}
              onClick={() => selectPetal(petal.id)}
              role="button"
              aria-label={petal.label}
              aria-pressed={isSelected}
            />
          );
        })}
      </svg>
    </div>
  );
}
