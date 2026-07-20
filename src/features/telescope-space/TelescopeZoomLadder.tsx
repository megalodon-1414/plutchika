import type { TelescopeSettledPhase } from './constants';

const ZOOM_LEVELS: readonly TelescopeSettledPhase[] = [
  'far',
  'wide',
  'detail',
  'region',
  'exploration',
];

const LEVEL_LABEL: Record<TelescopeSettledPhase, string> = {
  far: '遠景',
  wide: '銀河',
  detail: '詳細',
  region: '領域',
  exploration: '探索',
};

/** 感情を選んだときのレイヤー（LAYER 01 → 02 遷移時） */
const SELECTION_LAYER: TelescopeSettledPhase = 'wide';
const LEVEL_SLOT_SIZE = 22;
const LEVEL_SLOT_SIZE_HORIZONTAL = 16;
const LEVEL_DOT_SIZE = 16;
const LEVEL_DOT_SIZE_HORIZONTAL = 11;
const LEVEL_GAP = 48;
const LEVEL_GAP_HORIZONTAL = 20;
const PREVIOUS_LETTERS = [...'PREVIOUS'];
const PREVIOUS_LETTER_STEP_DEG = 22;
const PREVIOUS_LETTER_STEP_DEG_HORIZONTAL = 26;
const PREVIOUS_ORBIT_RADIUS = 22;
const PREVIOUS_ORBIT_RADIUS_HORIZONTAL = 13;
const PREVIOUS_LETTER_SIZE = '0.48rem';
const PREVIOUS_LETTER_SIZE_HORIZONTAL = '0.3rem';

export interface TelescopeZoomLadderEmotion {
  label: string;
  color: string;
}

interface TelescopeZoomLadderProps {
  current: TelescopeSettledPhase;
  busy: boolean;
  /** 現在より後ろ（ズームダウン）の段階へだけ戻せる */
  onRetreatTo: (level: TelescopeSettledPhase) => void;
  /** 詳細へ進むときに選んだ感情（選択時レイヤー円の左隣に表示） */
  selectedEmotion?: TelescopeZoomLadderEmotion | null;
  /** Layer3へ進むときに選んだ合成感情 */
  selectedDetailEmotion?: TelescopeZoomLadderEmotion | null;
  /** Layer4へ進むときに選んだ感情点 */
  selectedExplorationEmotion?: TelescopeZoomLadderEmotion | null;
  /** 縦並び（デスクトップ）/ 横並び（スマホ） */
  orientation?: 'vertical' | 'horizontal';
  /** 各ドット横の感情ラベルを出すか */
  showEmotionLabels?: boolean;
}

/** 各文字の下側を円の中心へ向けたまま、反時計回りに周回する。 */
function PreviousOrbitLabel({ compact = false }: { compact?: boolean }) {
  const orbitRadius = compact
    ? PREVIOUS_ORBIT_RADIUS_HORIZONTAL
    : PREVIOUS_ORBIT_RADIUS;
  const letterStep = compact
    ? PREVIOUS_LETTER_STEP_DEG_HORIZONTAL
    : PREVIOUS_LETTER_STEP_DEG;
  const letterStart =
    -((PREVIOUS_LETTERS.length - 1) * letterStep) / 2;
  const ringSize = orbitRadius * 2;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 0,
        height: 0,
        pointerEvents: 'none',
        animation: 'telescopeZoomPreviousSpin 7.5s linear infinite',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: ringSize,
          height: ringSize,
          border: '1px solid rgba(190, 205, 240, 0.3)',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 8px rgba(170, 195, 240, 0.12)',
        }}
      />
      {PREVIOUS_LETTERS.map((letter, index) => {
        const angle = letterStart + index * letterStep;
        return (
          <span
            key={`${letter}-${index}`}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '1em',
              height: '1em',
              display: 'grid',
              placeItems: 'center',
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${orbitRadius}px)`,
              transformOrigin: 'center',
              color: 'rgba(210, 220, 245, 0.88)',
              fontSize: compact
                ? PREVIOUS_LETTER_SIZE_HORIZONTAL
                : PREVIOUS_LETTER_SIZE,
              fontWeight: 650,
              lineHeight: 1,
              textShadow: '0 0 8px rgba(0,0,0,0.65)',
            }}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 拡大率ドット。デスクトップは右端縦並び、スマホは画面上端横並び。
 * 押下はズームダウンのみ（前進は不可）。
 */
export function TelescopeZoomLadder({
  current,
  busy,
  onRetreatTo,
  selectedEmotion = null,
  selectedDetailEmotion = null,
  selectedExplorationEmotion = null,
  orientation = 'vertical',
  showEmotionLabels = true,
}: TelescopeZoomLadderProps) {
  const currentIndex = ZOOM_LEVELS.indexOf(current);
  const previousLevel =
    currentIndex > 0 ? ZOOM_LEVELS[currentIndex - 1] : null;
  const horizontal = orientation === 'horizontal';
  const levelGap = horizontal ? LEVEL_GAP_HORIZONTAL : LEVEL_GAP;
  const slotSize = horizontal ? LEVEL_SLOT_SIZE_HORIZONTAL : LEVEL_SLOT_SIZE;
  const dotSize = horizontal ? LEVEL_DOT_SIZE_HORIZONTAL : LEVEL_DOT_SIZE;
  const levelStep = slotSize + levelGap;
  const lineInset = Math.round(slotSize / 2);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: horizontal ? 'row' : 'column',
        alignItems: 'center',
        gap: levelGap,
        pointerEvents: 'auto',
      }}
      role="group"
      aria-label="拡大率（後ろに戻るのみ）"
    >
      <style>{`
        @keyframes telescopeZoomPreviousSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(-360deg); }
        }
      `}</style>

      {/* 点同士をつなぐ線 */}
      <div
        aria-hidden
        style={
          horizontal
            ? {
                position: 'absolute',
                left: lineInset,
                right: lineInset,
                top: '50%',
                height: 1.25,
                transform: 'translateY(-50%)',
                background: 'rgba(180, 190, 220, 0.35)',
                pointerEvents: 'none',
              }
            : {
                position: 'absolute',
                top: lineInset,
                bottom: lineInset,
                left: '50%',
                width: 1.5,
                transform: 'translateX(-50%)',
                background: 'rgba(180, 190, 220, 0.35)',
                pointerEvents: 'none',
              }
        }
      />

      {/* 選択中の光だけをレベル間で連続移動させる */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          zIndex: 3,
          top: horizontal ? '50%' : 0,
          left: horizontal ? 0 : '50%',
          width: slotSize,
          height: slotSize,
          borderRadius: '50%',
          border: horizontal
            ? '1.5px solid rgba(244, 236, 247, 0.95)'
            : '2px solid rgba(244, 236, 247, 0.95)',
          background: 'rgba(244, 236, 247, 0.92)',
          boxShadow: horizontal
            ? '0 0 10px rgba(220, 230, 255, 0.65)'
            : '0 0 14px rgba(220, 230, 255, 0.72)',
          transform: horizontal
            ? `translateY(-50%) translateX(${currentIndex * levelStep}px)`
            : `translateX(-50%) translateY(${currentIndex * levelStep}px)`,
          transition:
            'transform 720ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          pointerEvents: 'none',
        }}
      />

      {ZOOM_LEVELS.map((level, index) => {
        const isCurrent = level === current;
        const isPrevious = level === previousLevel;
        const canRetreat = !busy && index < currentIndex;
        const showSelectedEmotion =
          showEmotionLabels &&
          Boolean(selectedEmotion) &&
          level === SELECTION_LAYER;
        const slotEmotion = !showEmotionLabels
          ? null
          : showSelectedEmotion
            ? selectedEmotion
            : level === 'detail'
              ? selectedDetailEmotion
              : level === 'region'
                ? selectedExplorationEmotion
                : null;

        return (
          <div
            key={level}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: slotSize,
              height: slotSize,
            }}
          >
            {slotEmotion ? (
              <span
                style={{
                  position: 'absolute',
                  right: 'calc(100% + 20px)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: slotEmotion.color,
                  fontSize: '0.72rem',
                  fontWeight: 650,
                  letterSpacing: '0.1em',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 10px rgba(0,0,0,0.55)',
                  pointerEvents: 'none',
                }}
              >
                {slotEmotion.label}
              </span>
            ) : null}

            {isPrevious ? <PreviousOrbitLabel compact={horizontal} /> : null}

            <button
              type="button"
              title={
                isCurrent
                  ? `現在: ${LEVEL_LABEL[level]}`
                  : canRetreat
                    ? `${LEVEL_LABEL[level]}へ戻る`
                    : LEVEL_LABEL[level]
              }
              disabled={!canRetreat}
              onClick={() => {
                if (canRetreat) {
                  onRetreatTo(level);
                }
              }}
              style={{
                position: 'relative',
                zIndex: 1,
                width: dotSize,
                height: dotSize,
                padding: 0,
                borderRadius: '50%',
                border: isPrevious
                  ? '1.5px solid rgba(200, 210, 240, 0.65)'
                  : '1.5px solid rgba(180, 190, 220, 0.4)',
                background: canRetreat
                  ? 'rgba(160, 175, 220, 0.5)'
                  : 'rgba(80, 90, 120, 0.35)',
                boxShadow: isPrevious
                  ? '0 0 10px rgba(180, 200, 240, 0.35)'
                  : 'none',
                cursor: canRetreat ? 'pointer' : 'default',
                opacity: busy && !isCurrent ? 0.45 : 1,
                transition:
                  'transform 0.2s ease, background 0.2s ease, width 0.2s ease',
                transform: 'none',
              }}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={LEVEL_LABEL[level]}
            />
          </div>
        );
      })}
    </div>
  );
}

export function zoomLevelIndex(phase: TelescopeSettledPhase): number {
  return ZOOM_LEVELS.indexOf(phase);
}
