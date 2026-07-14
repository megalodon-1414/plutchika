import type { EmotionUiTheme } from '../../utils/emotionUiTheme';
import type { ExplorationInfoUiLayout } from '../../utils/explorationInfoUiLayout';
import type { HomeTutorialStepContent } from './constants';

const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease, box-shadow 320ms ease';

interface HomeTutorialIntroPanelProps {
  uiTheme: EmotionUiTheme;
  panel: ExplorationInfoUiLayout['currentWordPanel'];
  content: HomeTutorialStepContent;
  visible: boolean;
}

export function HomeTutorialIntroPanel({
  uiTheme,
  panel,
  content,
  visible,
}: HomeTutorialIntroPanelProps) {
  return (
    <aside
      style={{
        position: 'absolute',
        top: `${panel.y}px`,
        left: `${panel.x}px`,
        width: `${panel.width}px`,
        minHeight: `${panel.height}px`,
        zIndex: 2,
        padding: `${panel.paddingY}px ${panel.paddingX}px`,
        border: `1px solid ${uiTheme.accentBorder}`,
        borderLeft: `4px solid ${uiTheme.accentBorderStrong}`,
        borderRadius: `${panel.borderRadius}px`,
        backgroundColor: uiTheme.panelBackground,
        boxShadow: uiTheme.panelShadow,
        backdropFilter: 'blur(12px)',
        color: uiTheme.textPrimary,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: `opacity 320ms ease, ${UI_COLOR_TRANSITION}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row-reverse',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: `${panel.gap}px`,
          minHeight: `${panel.innerMinHeight}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
            alignItems: 'flex-start',
            gap: `${panel.innerGap}px`,
            paddingLeft: `${panel.paddingLeft}px`,
            borderLeft: `1px solid ${uiTheme.divider}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: `${panel.innerGap}px`,
            }}
          >
            <span
              style={{
                display: 'block',
                width: 0,
                height: 0,
                borderTop: `${panel.arrowBorder}px solid transparent`,
                borderBottom: `${panel.arrowBorder}px solid transparent`,
                borderRight: `${panel.arrowBorder + 4}px solid ${uiTheme.accentMuted}`,
                animation: 'homeTutorialArrowPulse 900ms ease-in-out infinite',
              }}
            />
            <p
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                fontSize: panel.sectionLabelFontSize,
                letterSpacing: '0.18em',
                color: uiTheme.accentMuted,
              }}
            >
              {content.sectionLabel}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: `${panel.innerGap}px`,
              width: `${panel.wordColumnWidth}px`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${panel.wordColumnWidth}px`,
                height: `${panel.tickerHeight}px`,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <p
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  margin: 0,
                  fontSize: panel.tickerFontSize,
                  letterSpacing: '0.14em',
                  lineHeight: `${panel.tickerHeight}px`,
                  color: uiTheme.accentMuted,
                  whiteSpace: 'nowrap',
                  animation: 'homeTutorialTicker 4.2s linear infinite',
                }}
              >
                {content.ticker}
              </p>
            </div>
            <h1
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                fontSize: panel.wordFontSize,
                lineHeight: 1.25,
                letterSpacing: '0.12em',
              }}
            >
              {content.title}
            </h1>
            <p
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                margin: 0,
                fontSize: `calc(${panel.wordFontSize} * 0.78)`,
                lineHeight: 1.35,
                letterSpacing: '0.1em',
                color: uiTheme.textMuted,
              }}
            >
              {`【${content.titleRuby}】`}
            </p>
          </div>
        </div>

        <p
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            margin: 0,
            maxHeight: `${panel.bodyMaxHeight}px`,
            fontSize: panel.bodyFontSize,
            lineHeight: 1.9,
            letterSpacing: '0.06em',
            color: uiTheme.textSecondary,
          }}
        >
          {content.body}
        </p>

        <p
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            margin: 0,
            fontSize: panel.metaFontSize,
            letterSpacing: '0.12em',
            color: uiTheme.textMuted,
          }}
        >
          {content.note}
        </p>
      </div>
    </aside>
  );
}
