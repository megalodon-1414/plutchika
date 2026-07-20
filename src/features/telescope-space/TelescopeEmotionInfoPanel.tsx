import { useEffect, useMemo, useState } from 'react';
import { getExplorationInfoUiLayout } from '../../utils/explorationInfoUiLayout';
import { getEmotionUiTheme } from '../../utils/emotionUiTheme';

export interface TelescopeEmotionInfoPanelProps {
  panelKey: string;
  label: string;
  color: string;
  description: string;
  /** 縦書きの区画ラベル（例: 検知中 / 選択中） */
  sectionLabel?: string;
  /** 横スクロールの英字ティッカー */
  tickerLabel?: string;
  /** 左側に別HUDがある場合の退避量 */
  leftOffset?: number;
  /** 画面上端からのオフセット（px）。未指定時は既定の上余白 */
  top?: number;
  /** パネル高さの画面比（既定 0.42） */
  heightRatio?: number;
  /**
   * false のとき absolute 配置せず、親のスタックレイアウトに従う。
   * レイヤー2で8感情＋24感情を縦に並べるときに使う。
   */
  positioned?: boolean;
}

function viewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * 望遠鏡左サイドの縦書き感情説明パネル。
 * レイヤー1の基本感情・レイヤー2の合成感情で同じ形を共有する。
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

  const layout = useMemo(() => {
    const base = getExplorationInfoUiLayout(
      viewport.width,
      viewport.height,
    ).currentWordPanel;
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
  }, [heightRatio, viewport]);
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
        @keyframes telescopeEmotionInfoTicker {
          from { transform: translateX(0); }
          to { transform: translateX(-45%); }
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
              <p
                style={{
                  position: 'absolute',
                  inset: 0,
                  margin: 0,
                  fontSize: layout.tickerFontSize,
                  letterSpacing: '0.14em',
                  lineHeight: `${layout.tickerHeight}px`,
                  color: theme.accentMuted,
                  whiteSpace: 'nowrap',
                  animation: 'telescopeEmotionInfoTicker 4.2s linear infinite',
                }}
              >
                {tickerLabel}
              </p>
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

