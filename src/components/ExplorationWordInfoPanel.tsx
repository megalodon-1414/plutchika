import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { UserPlotRow } from '../types/userPlot';
import { EMOTION_INTENSITY_MAX } from '../utils/emotionPlotBridge';
import { getExplorationInfoUiLayout } from '../utils/explorationInfoUiLayout';
import { getPrimaryEmotionColor } from '../utils/emotionPlotBridge';
import { getEmotionUiTheme } from '../utils/emotionUiTheme';
import { LoopingTickerText } from './LoopingTickerText';

interface ExplorationWordInfoPanelProps {
  plot: UserPlotRow;
  /** 右側に別HUDがある場合の退避量 */
  rightOffset?: number;
  /** 引き出し線などの外部参照用 */
  panelRef?: MutableRefObject<HTMLElement | null>;
}

function viewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * 旧感情空間の「現在の語」パネルと同じ情報構成・縦書き表現。
 * 感情色テーマと explorationInfoUiLayout を共有する。
 */
export function ExplorationWordInfoPanel({
  plot,
  rightOffset = 210,
  panelRef,
}: ExplorationWordInfoPanelProps) {
  const [viewport, setViewport] = useState(viewportSize);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport(viewportSize()));
    };
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, []);

  const layout = useMemo(
    () => getExplorationInfoUiLayout(viewport.width, viewport.height).currentWordPanel,
    [viewport],
  );
  const theme = useMemo(
    () => getEmotionUiTheme(getPrimaryEmotionColor(plot.primaryId), 'dark'),
    [plot.primaryId],
  );
  const meaning =
    plot.meaning?.trim() || 'この単語の意味データはまだ登録されていません。';

  return (
    <aside
      key={plot.word_id}
      ref={(el) => {
        if (panelRef) {
          panelRef.current = el;
        }
      }}
      aria-label={`${plot.word_id}の説明`}
      style={{
        position: 'absolute',
        top: '50%',
        right: Math.max(rightOffset, Math.round(viewport.width * 0.09)),
        width: 'max-content',
        maxWidth: `calc(100vw - ${rightOffset + 24}px)`,
        minHeight: layout.height,
        zIndex: 3,
        padding: `${layout.paddingY}px ${layout.paddingX}px`,
        border: `1px solid ${theme.accentBorder}`,
        borderLeft: `4px solid ${theme.accentBorderStrong}`,
        borderRadius: layout.borderRadius,
        backgroundColor: theme.panelBackground,
        boxShadow: theme.panelShadow,
        backdropFilter: 'blur(12px)',
        color: theme.textPrimary,
        pointerEvents: 'none',
        transform: 'translateY(-50%)',
        boxSizing: 'border-box',
        animation: 'telescopeWordInfoEnter 420ms cubic-bezier(.22,.61,.36,1) both',
      }}
    >
      <style>{`
        @keyframes telescopeWordInfoEnter {
          from { opacity: 0; transform: translate(18px, calc(-50% + 10px)); }
          to { opacity: 1; transform: translate(0, -50%); }
        }
        @keyframes telescopeCurrentWordArrowPulse {
          0%, 100% { opacity: .45; transform: translateX(0); }
          50% { opacity: 1; transform: translateX(-4px); }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row-reverse',
          alignItems: 'stretch',
          gap: layout.gap,
          minHeight: layout.innerMinHeight,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
            alignItems: 'flex-start',
            gap: layout.innerGap,
            paddingLeft: layout.paddingLeft,
            borderLeft: `1px solid ${theme.divider}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: layout.innerGap,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 0,
                height: 0,
                borderTop: `${layout.arrowBorder}px solid transparent`,
                borderBottom: `${layout.arrowBorder}px solid transparent`,
                borderRight: `${layout.arrowBorder + 4}px solid ${theme.accentMuted}`,
                animation:
                  'telescopeCurrentWordArrowPulse 900ms ease-in-out infinite',
              }}
            />
            <p
              style={{
                writingMode: 'vertical-rl',
                margin: 0,
                fontSize: layout.sectionLabelFontSize,
                letterSpacing: '0.18em',
                color: theme.accentMuted,
              }}
            >
              現在の語
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: layout.innerGap,
              width: layout.wordColumnWidth,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: layout.wordColumnWidth,
                height: layout.tickerHeight,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <LoopingTickerText
                text="CURRENT WORD"
                fontSize={layout.tickerFontSize}
                letterSpacing="0.14em"
                lineHeight={`${layout.tickerHeight}px`}
                color={theme.accentMuted}
                durationSec={7.2}
              />
            </div>
            <h2
              className="font-momochidori font-momochidori--medium"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                fontSize: layout.wordFontSize,
                lineHeight: 1.25,
                letterSpacing: '0.08em',
              }}
            >
              {plot.word_id}
            </h2>
            {plot.ruby?.trim() ? (
              <p
                style={{
                  writingMode: 'vertical-rl',
                  margin: 0,
                  fontSize: `calc(${layout.wordFontSize} * .78)`,
                  lineHeight: 1.35,
                  letterSpacing: '0.1em',
                  color: theme.textMuted,
                }}
              >
                {`【${plot.ruby.trim()}】`}
              </p>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
            alignItems: 'flex-start',
            gap: layout.bodyTextGap,
          }}
        >
          <p
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              margin: 0,
              maxHeight: layout.bodyMaxHeight,
              fontSize: layout.bodyFontSize,
              lineHeight: 1.9,
              letterSpacing: '0.06em',
              color: theme.textSecondary,
            }}
          >
            {meaning}
          </p>
          {plot.usageExample?.trim() ? (
            <p
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                maxHeight: layout.bodyMaxHeight,
                fontSize: layout.usageFontSize,
                lineHeight: 1.8,
                letterSpacing: '0.06em',
                color: theme.textMuted,
                whiteSpace: 'nowrap',
              }}
            >
              {`用例：${plot.usageExample.trim()}`}
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: layout.innerGap,
          }}
        >
          <p
            style={{
              writingMode: 'vertical-rl',
              margin: 0,
              fontSize: layout.metaFontSize,
              letterSpacing: '0.14em',
              color: theme.textMuted,
            }}
          >
            強度
          </p>
          <div
            style={{
              width: layout.intensityBarWidth,
              height: layout.intensityBarHeight,
              overflow: 'hidden',
              borderRadius: 999,
              backgroundColor: theme.divider,
              display: 'flex',
              alignItems: 'flex-end',
            }}
          >
            <div
              style={{
                width: '100%',
                height: `${(plot.intensity / EMOTION_INTENSITY_MAX) * 100}%`,
                borderRadius: 999,
                background: `linear-gradient(180deg, ${theme.intensityGradientStart}, ${theme.intensityGradientEnd})`,
              }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
