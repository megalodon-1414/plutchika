import type { CSSProperties } from 'react';
import type { EmotionUiTheme } from '../utils/emotionUiTheme';
import type { SearchProximityTrend } from '../utils/searchGame';
import { formatWarpJourneyDistance } from '../utils/searchGame';

const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease, box-shadow 320ms ease';

const SEGMENT_COUNT = 12;

interface SearchGameHudProps {
  targetWord: string;
  distance: number;
  proximity: number;
  trend: SearchProximityTrend;
  found: boolean;
  uiTheme: EmotionUiTheme;
  onQuit: () => void;
  onNextRound?: () => void;
}

function trendLabel(trend: SearchProximityTrend, found: boolean): string {
  if (found) {
    return '発見';
  }
  if (trend === 'closer') {
    return '近づいている';
  }
  if (trend === 'farther') {
    return '遠ざかっている';
  }
  return '同じくらい';
}

export function SearchGameHud({
  targetWord,
  distance,
  proximity,
  trend,
  found,
  uiTheme,
  onQuit,
  onNextRound,
}: SearchGameHudProps) {
  const filledSegments = Math.round(proximity * SEGMENT_COUNT);
  const meterColor = found
    ? uiTheme.accentSoft
    : trend === 'closer'
      ? uiTheme.accentMuted
      : trend === 'farther'
        ? uiTheme.textMuted
        : uiTheme.accent;

  const panelStyle: CSSProperties = {
    position: 'absolute',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    maxWidth: 'min(720px, calc(100% - 48px))',
    padding: '12px 16px',
    borderRadius: '12px',
    border: `1px solid ${found ? uiTheme.accentBorderStrong : uiTheme.holoBorder}`,
    background: uiTheme.holoPanel,
    boxShadow: `0 0 18px ${uiTheme.holoGlow}`,
    backdropFilter: 'blur(10px)',
    transition: UI_COLOR_TRANSITION,
  };

  return (
    <div style={panelStyle} role="status" aria-live="polite">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
        <span
          style={{
            fontSize: '0.68rem',
            letterSpacing: '0.16em',
            color: uiTheme.holoSubtext,
            textTransform: 'uppercase',
          }}
        >
          お題
        </span>
        <span
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: uiTheme.holoText,
            textShadow: `0 0 10px ${uiTheme.holoGlow}`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '220px',
          }}
        >
          {targetWord}
        </span>
      </div>

      <div
        style={{
          width: '1px',
          alignSelf: 'stretch',
          background: uiTheme.divider,
          opacity: 0.7,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '180px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '0.68rem', letterSpacing: '0.14em', color: uiTheme.holoSubtext }}>
            ワープ道のり
          </span>
          <span style={{ fontSize: '0.78rem', color: meterColor, fontVariantNumeric: 'tabular-nums' }}>
            {formatWarpJourneyDistance(distance, found)}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '3px',
            alignItems: 'flex-end',
            height: '22px',
          }}
          aria-label={`近さ ${Math.round(proximity * 100)}パーセント`}
        >
          {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
            const active = index < filledSegments;
            const height = 8 + (index / (SEGMENT_COUNT - 1)) * 14;
            return (
              <div
                key={index}
                style={{
                  flex: 1,
                  height: `${height}px`,
                  borderRadius: '2px',
                  background: active ? meterColor : uiTheme.divider,
                  opacity: active ? 0.35 + (index / SEGMENT_COUNT) * 0.65 : 0.35,
                  boxShadow: active ? `0 0 8px ${uiTheme.accentGlow}` : 'none',
                  transition: 'background-color 220ms ease, opacity 220ms ease, box-shadow 220ms ease',
                }}
              />
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderBottom: trend === 'closer' || found ? `8px solid ${meterColor}` : '8px solid transparent',
              borderTop: trend === 'farther' ? `8px solid ${meterColor}` : '8px solid transparent',
              transform: trend === 'farther' ? 'translateY(2px)' : trend === 'closer' || found ? 'translateY(-1px)' : 'none',
              opacity: trend === 'steady' && !found ? 0.35 : 1,
            }}
          />
          <span style={{ fontSize: '0.74rem', color: meterColor, letterSpacing: '0.06em' }}>
            {trendLabel(trend, found)}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {found && onNextRound && (
          <button
            type="button"
            onClick={onNextRound}
            style={{
              height: '30px',
              padding: '0 12px',
              borderRadius: '8px',
              border: `1px solid ${uiTheme.accentBorderStrong}`,
              background: uiTheme.controlBackground,
              color: uiTheme.controlText,
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              boxShadow: `0 0 10px ${uiTheme.accentGlow}`,
              transition: UI_COLOR_TRANSITION,
            }}
          >
            次のお題
          </button>
        )}
        <button
          type="button"
          onClick={onQuit}
          style={{
            height: '30px',
            padding: '0 12px',
            borderRadius: '8px',
            border: `1px solid ${uiTheme.controlBorder}`,
            background: 'transparent',
            color: uiTheme.textSecondary,
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            transition: UI_COLOR_TRANSITION,
          }}
        >
          終了
        </button>
      </div>
    </div>
  );
}
