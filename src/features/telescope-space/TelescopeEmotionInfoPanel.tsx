import { useEffect, useMemo, useState } from 'react';
import { LoopingTickerText } from '../../components/LoopingTickerText';
import { getExplorationInfoUiLayout } from '../../utils/explorationInfoUiLayout';
import { getEmotionUiTheme } from '../../utils/emotionUiTheme';

/** 感情説明UIをスマホ向け下ドック＋横書きに切り替える幅 */
export const TELESCOPE_EMOTION_INFO_MOBILE_MAX_WIDTH = 640;

export interface TelescopeEmotionInfoPanelProps {
  panelKey: string;
  label: string;
  color: string;
  description: string;
  /** 区画ラベル（例: 検知中） */
  sectionLabel?: string;
  /** 英字ティッカー */
  tickerLabel?: string;
  /** 左側に別HUDがある場合の退避量（デスクトップ縦書き時） */
  leftOffset?: number;
  /** 画面上端からのオフセット（px）。未指定時は既定の上余白 */
  top?: number;
  /** パネル高さの画面比（デスクトップ縦書き時、既定 0.42） */
  heightRatio?: number;
  /**
   * false のとき absolute 配置せず、親のスタック／ドックレイアウトに従う。
   */
  positioned?: boolean;
  /**
   * horizontal: スマホ向け横書き。
   * vertical: デスクトップ向け縦書き。
   * auto: 画面幅で切り替える（既定）。
   */
  writingDirection?: 'auto' | 'vertical' | 'horizontal';
}

function viewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useTelescopeEmotionInfoMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => viewportSize().width <= TELESCOPE_EMOTION_INFO_MOBILE_MAX_WIDTH,
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setMobile(viewportSize().width <= TELESCOPE_EMOTION_INFO_MOBILE_MAX_WIDTH);
      });
    };
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, []);

  return mobile;
}

/**
 * 望遠鏡の感情説明パネル。
 * デスクトップは左サイド縦書き、スマホは下ドック横書き。
 */
export function TelescopeEmotionInfoPanel({
  panelKey,
  label,
  color,
  description,
  sectionLabel = '検知中',
  tickerLabel = 'DETECTING',
  leftOffset = 28,
  top,
  heightRatio = 0.42,
  positioned = true,
  writingDirection = 'auto',
}: TelescopeEmotionInfoPanelProps) {
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

  const horizontal =
    writingDirection === 'horizontal' ||
    (writingDirection === 'auto' &&
      viewport.width <= TELESCOPE_EMOTION_INFO_MOBILE_MAX_WIDTH);

  const layout = useMemo(() => {
    const base = getExplorationInfoUiLayout(
      viewport.width,
      viewport.height,
    ).currentWordPanel;
    if (horizontal) {
      return {
        paddingY: Math.max(10, Math.round(base.paddingY * 0.55)),
        paddingX: Math.max(12, Math.round(base.paddingX * 0.7)),
        borderRadius: base.borderRadius,
        gap: Math.round(base.gap * 0.55),
        innerGap: Math.round(base.innerGap * 0.45),
        sectionLabelFontSize: '0.58rem',
        tickerFontSize: '0.55rem',
        wordFontSize: 'clamp(1.05rem, 4.8vw, 1.35rem)',
        bodyFontSize: 'clamp(0.68rem, 2.9vw, 0.82rem)',
        arrowBorder: Math.max(4, Math.round(base.arrowBorder * 0.85)),
      };
    }
    const panelMaxHeight = Math.round(viewport.height * heightRatio);
    const paddingY = Math.round(base.paddingY * 0.9);
    const paddingX = Math.round(base.paddingX * 1.35);
    const innerMaxHeight = Math.max(120, panelMaxHeight - paddingY * 2);
    return {
      ...base,
      height: panelMaxHeight,
      innerMinHeight: innerMaxHeight,
      bodyMaxHeight: innerMaxHeight,
      wordColumnWidth: Math.round(base.wordColumnWidth * 1.2),
      wordFontSize: `calc(${base.wordFontSize} * 0.82)`,
      bodyFontSize: `calc(${base.bodyFontSize} * 0.74)`,
      bodyColumnWidth: Math.round(base.wordColumnWidth * 2.4),
      sectionLabelFontSize: `calc(${base.sectionLabelFontSize} * 0.92)`,
      gap: Math.round(base.gap * 1.15),
      innerGap: Math.round(base.innerGap * 0.85),
      paddingLeft: Math.round(base.paddingLeft * 1.25),
      paddingY,
      paddingX,
    };
  }, [heightRatio, horizontal, viewport]);
  const theme = useMemo(
    () => getEmotionUiTheme(color, 'dark'),
    [color],
  );
  const sideInset = Math.max(
    leftOffset + 12,
    Math.round(viewport.width * 0.055),
  );
  const topInset =
    top ?? Math.max(72, Math.round(viewport.height * 0.1));

  if (horizontal) {
    return (
      <aside
        key={panelKey}
        aria-label={`${label}の説明`}
        style={{
          position: positioned ? 'absolute' : 'relative',
          left: positioned ? 12 : undefined,
          right: positioned ? 12 : undefined,
          bottom: positioned ? 16 : undefined,
          width: positioned ? 'auto' : '100%',
          flex: positioned ? undefined : '1 1 0',
          minWidth: 0,
          maxHeight: '34vh',
          zIndex: 3,
          padding: `${layout.paddingY}px ${layout.paddingX}px`,
          border: `1px solid ${theme.accentBorder}`,
          borderTop: `3px solid ${theme.accentBorderStrong}`,
          borderRadius: layout.borderRadius,
          backgroundColor: theme.panelBackground,
          boxShadow: theme.panelShadow,
          backdropFilter: 'blur(12px)',
          color: theme.textPrimary,
          pointerEvents: 'none',
          boxSizing: 'border-box',
          overflow: 'hidden',
          animation:
            'telescopeEmotionInfoEnterMobile 420ms cubic-bezier(.22,.61,.36,1) both',
        }}
      >
        <style>{`
          @keyframes telescopeEmotionInfoEnterMobile {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes telescopeEmotionInfoArrowPulseH {
            0%, 100% { opacity: .45; transform: translateY(0); }
            50% { opacity: 1; transform: translateY(-3px); }
          }
        `}</style>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: layout.gap,
            minHeight: 0,
            height: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: layout.innerGap,
              paddingBottom: layout.innerGap,
              borderBottom: `1px solid ${theme.divider}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: `${layout.arrowBorder}px solid transparent`,
                  borderRight: `${layout.arrowBorder}px solid transparent`,
                  borderBottom: `${layout.arrowBorder + 3}px solid ${theme.accentMuted}`,
                  animation:
                    'telescopeEmotionInfoArrowPulseH 900ms ease-in-out infinite',
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: layout.sectionLabelFontSize,
                  letterSpacing: '0.14em',
                  color: theme.accentMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {sectionLabel}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
                flex: 1,
              }}
            >
              <div
                style={{
                  height: 14,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <LoopingTickerText
                  text={tickerLabel}
                  fontSize={layout.tickerFontSize}
                  letterSpacing="0.12em"
                  lineHeight="14px"
                  color={theme.accentMuted}
                  durationSec={Math.max(5.5, tickerLabel.length * 0.55)}
                />
              </div>
              <h2
                className="font-momochidori font-momochidori--medium"
                style={{
                  margin: 0,
                  fontSize: layout.wordFontSize,
                  lineHeight: 1.2,
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {label}
              </h2>
            </div>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: layout.bodyFontSize,
              lineHeight: 1.65,
              letterSpacing: '0.04em',
              color: theme.textSecondary,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      key={panelKey}
      aria-label={`${label}の説明`}
      style={{
        position: positioned ? 'absolute' : 'relative',
        top: positioned ? topInset : undefined,
        left: sideInset,
        width: 'max-content',
        minWidth: Math.round(viewport.width * 0.18),
        maxWidth: `calc(50vw - ${sideInset}px)`,
        maxHeight: layout.height,
        height: layout.height,
        zIndex: 3,
        padding: `${layout.paddingY}px ${layout.paddingX}px`,
        border: `1px solid ${theme.accentBorder}`,
        borderRight: `4px solid ${theme.accentBorderStrong}`,
        borderRadius: layout.borderRadius,
        backgroundColor: theme.panelBackground,
        boxShadow: theme.panelShadow,
        backdropFilter: 'blur(12px)',
        color: theme.textPrimary,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        overflow: 'hidden',
        flexShrink: 0,
        animation:
          'telescopeEmotionInfoEnter 420ms cubic-bezier(.22,.61,.36,1) both',
      }}
    >
      <style>{`
        @keyframes telescopeEmotionInfoEnter {
          from { opacity: 0; transform: translate(-18px, 10px); }
          to { opacity: 1; transform: translate(0, 0); }
        }
        @keyframes telescopeEmotionInfoArrowPulse {
          0%, 100% { opacity: .45; transform: translateX(0); }
          50% { opacity: 1; transform: translateX(4px); }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row-reverse',
          alignItems: 'stretch',
          gap: layout.gap,
          maxHeight: layout.innerMinHeight,
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
                borderLeft: `${layout.arrowBorder + 4}px solid ${theme.accentMuted}`,
                animation:
                  'telescopeEmotionInfoArrowPulse 900ms ease-in-out infinite',
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
              {sectionLabel}
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
                text={tickerLabel}
                fontSize={layout.tickerFontSize}
                letterSpacing="0.14em"
                lineHeight={`${layout.tickerHeight}px`}
                color={theme.accentMuted}
                durationSec={Math.max(5.5, tickerLabel.length * 0.55)}
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
              {label}
            </h2>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: layout.bodyColumnWidth,
            height: layout.bodyMaxHeight,
            maxHeight: layout.bodyMaxHeight,
            boxSizing: 'border-box',
          }}
        >
          <p
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              margin: 0,
              maxHeight: '100%',
              fontSize: layout.bodyFontSize,
              lineHeight: 1.85,
              letterSpacing: '0.06em',
              color: theme.textSecondary,
            }}
          >
            {description}
          </p>
        </div>
      </div>
    </aside>
  );
}
