import type { TelescopeSettledPhase } from './constants';

const ZOOM_LEVELS: readonly TelescopeSettledPhase[] = ['far', 'wide', 'detail'];

const LEVEL_LABEL: Record<TelescopeSettledPhase, string> = {
  far: '遠景',
  wide: '銀河',
  detail: '詳細',
};

interface TelescopeZoomLadderProps {
  current: TelescopeSettledPhase;
  busy: boolean;
  /** 現在より後ろ（ズームダウン）の段階へだけ戻せる */
  onRetreatTo: (level: TelescopeSettledPhase) => void;
}

/**
 * のぞき穴の外右端に縦並びの拡大率ドット。
 * 押下はズームダウンのみ（前進は不可）。
 */
export function TelescopeZoomLadder({
  current,
  busy,
  onRetreatTo,
}: TelescopeZoomLadderProps) {
  const currentIndex = ZOOM_LEVELS.indexOf(current);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 48,
        pointerEvents: 'auto',
      }}
      role="group"
      aria-label="拡大率（後ろに戻るのみ）"
    >
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

      {ZOOM_LEVELS.map((level, index) => {
        const isCurrent = level === current;
        const canRetreat = !busy && index < currentIndex;

        return (
          <button
            key={level}
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
              width: isCurrent ? 22 : 16,
              height: isCurrent ? 22 : 16,
              padding: 0,
              borderRadius: '50%',
              border: isCurrent
                ? '2px solid rgba(244, 236, 247, 0.95)'
                : '1.5px solid rgba(180, 190, 220, 0.4)',
              background: isCurrent
                ? 'rgba(244, 236, 247, 0.92)'
                : canRetreat
                  ? 'rgba(160, 175, 220, 0.5)'
                  : 'rgba(80, 90, 120, 0.35)',
              boxShadow: isCurrent ? '0 0 14px rgba(220, 230, 255, 0.65)' : 'none',
              cursor: canRetreat ? 'pointer' : 'default',
              opacity: busy && !isCurrent ? 0.45 : 1,
              transition: 'transform 0.2s ease, background 0.2s ease, width 0.2s ease',
              transform: isCurrent ? 'scale(1.06)' : 'none',
            }}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={LEVEL_LABEL[level]}
          />
        );
      })}
    </div>
  );
}

export function zoomLevelIndex(phase: TelescopeSettledPhase): number {
  return ZOOM_LEVELS.indexOf(phase);
}
