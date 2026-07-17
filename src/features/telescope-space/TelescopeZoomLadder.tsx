import type { TelescopeSettledPhase } from './constants';

const ZOOM_LEVELS: readonly TelescopeSettledPhase[] = ['far', 'wide', 'detail'];

const LEVEL_LABEL: Record<TelescopeSettledPhase, string> = {
  far: '遠景',
  wide: '銀河',
  detail: '詳細',
};

/** 感情を選んだときのレイヤー（LAYER 01 → 02 遷移時） */
const SELECTION_LAYER: TelescopeSettledPhase = 'wide';
const LEVEL_SLOT_SIZE = 22;
const LEVEL_GAP = 48;
const LEVEL_STEP = LEVEL_SLOT_SIZE + LEVEL_GAP;
const PREVIOUS_LETTERS = [...'PREVIOUS'];
const PREVIOUS_LETTER_STEP_DEG = 18;
const PREVIOUS_LETTER_START_DEG =
  -((PREVIOUS_LETTERS.length - 1) * PREVIOUS_LETTER_STEP_DEG) / 2;

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
}

/** 各文字の下側を円の中心へ向けたまま、反時計回りに周回する。 */
function PreviousOrbitLabel() {
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
          width: 44,
          height: 44,
          border: '1px solid rgba(190, 205, 240, 0.3)',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 8px rgba(170, 195, 240, 0.12)',
        }}
      />
      {PREVIOUS_LETTERS.map((letter, index) => {
        const angle =
          PREVIOUS_LETTER_START_DEG + index * PREVIOUS_LETTER_STEP_DEG;
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
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-22px)`,
              transformOrigin: 'center',
              color: 'rgba(210, 220, 245, 0.88)',
              fontSize: '0.58rem',
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
 * のぞき穴の外右端に縦並びの拡大率ドット。
 * 押下はズームダウンのみ（前進は不可）。
 */
export function TelescopeZoomLadder({
  current,
  busy,
  onRetreatTo,
  selectedEmotion = null,
}: TelescopeZoomLadderProps) {
  const currentIndex = ZOOM_LEVELS.indexOf(current);
  const previousLevel =
    currentIndex > 0 ? ZOOM_LEVELS[currentIndex - 1] : null;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: LEVEL_GAP,
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

      {/* 点同士をつなぐ縦線 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 11,
          bottom: 11,
          left: '50%',
          width: 1.5,
          transform: 'translateX(-50%)',
          background: 'rgba(180, 190, 220, 0.35)',
          pointerEvents: 'none',
        }}
      />

      {/* 選択中の光だけをレベル間で連続移動させる */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          zIndex: 3,
          top: 0,
          left: '50%',
          width: LEVEL_SLOT_SIZE,
          height: LEVEL_SLOT_SIZE,
          borderRadius: '50%',
          border: '2px solid rgba(244, 236, 247, 0.95)',
          background: 'rgba(244, 236, 247, 0.92)',
          boxShadow: '0 0 14px rgba(220, 230, 255, 0.72)',
          transform: `translateX(-50%) translateY(${currentIndex * LEVEL_STEP}px)`,
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
          Boolean(selectedEmotion) && level === SELECTION_LAYER;

        return (
          <div
            key={level}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: LEVEL_SLOT_SIZE,
              height: LEVEL_SLOT_SIZE,
            }}
          >
            {showSelectedEmotion && selectedEmotion ? (
              <span
                style={{
                  position: 'absolute',
                  right: 'calc(100% + 20px)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: selectedEmotion.color,
                  fontSize: '0.72rem',
                  fontWeight: 650,
                  letterSpacing: '0.1em',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 10px rgba(0,0,0,0.55)',
                  pointerEvents: 'none',
                }}
              >
                {selectedEmotion.label}
              </span>
            ) : null}

            {isPrevious ? <PreviousOrbitLabel /> : null}

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
                width: 16,
                height: 16,
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
