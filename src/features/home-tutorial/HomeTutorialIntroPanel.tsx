import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EmotionUiTheme } from '../../utils/emotionUiTheme';
import type { ExplorationInfoUiLayout } from '../../utils/explorationInfoUiLayout';
import {
  HOME_TUTORIAL_INTRO_PANEL_TUNE,
  type HomeTutorialIntroFitLineTune,
  type HomeTutorialIntroPanelTune,
  type HomeTutorialStepContent,
} from './constants';
import {
  capRemToPanelWidth,
  getIntroPanelResponsiveLayout,
} from './responsive';
const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease, box-shadow 320ms ease';

const INTRO_PANEL_BASE_WIDTH = 880;
const INTRO_PANEL_LEFT_LINE_WIDTH = 4;
const MOMOCHIDORI_FAMILY = 'var(--font-family-momochidori)';

interface HomeTutorialIntroPanelProps {
  uiTheme: EmotionUiTheme;
  panel: ExplorationInfoUiLayout['currentWordPanel'];
  content: HomeTutorialStepContent;
  visible: boolean;
  viewportWidth: number;
  tune?: HomeTutorialIntroPanelTune;
}

function rem(value: number, scale: number): string {
  return `${(value * scale).toFixed(3)}rem`;
}

function remToPx(value: number, scale: number): number {
  return value * 16 * scale;
}

function momochidoriStyle(
  wght: number,
  wdth: number,
  extra?: CSSProperties,
): CSSProperties {
  return {
    fontFamily: MOMOCHIDORI_FAMILY,
    fontFeatureSettings: "'palt' 1",
    fontVariationSettings: `"wght" ${wght}, "wdth" ${wdth}`,
    ...extra,
  };
}

interface TightFit {
  wdth: number;
  letterSpacing: string;
}

function findTightFit(
  element: HTMLSpanElement,
  targetWidth: number,
  wght: number,
  wdthMin: number,
  wdthMax: number,
  autoFillWidth: boolean,
): TightFit {
  let best = 100;
  let lo = wdthMin;
  let hi = wdthMax;

  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    element.style.fontVariationSettings = `"wght" ${wght}, "wdth" ${mid}`;
    element.style.letterSpacing = '0px';
    const fits = element.scrollWidth <= targetWidth + 0.5;
    if (fits) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  element.style.fontVariationSettings = `"wght" ${wght}, "wdth" ${best}`;
  element.style.letterSpacing = '0px';

  if (!autoFillWidth) {
    return { wdth: best, letterSpacing: '0px' };
  }

  const remaining = targetWidth - element.scrollWidth;
  if (remaining <= 0.5) {
    return { wdth: best, letterSpacing: '0px' };
  }

  const charCount = element.textContent?.length ?? 1;
  const gapCount = Math.max(1, charCount - 1);
  const letterSpacingPx = remaining / gapCount;

  return {
    wdth: best,
    letterSpacing: `${letterSpacingPx}px`,
  };
}

function MomochidoriFitCell({
  text,
  cellWidth,
  cellHeight,
  fontSize,
  wght,
  color,
  align,
  valign = 'bottom',
  wdthMin,
  wdthMax,
  autoFillWidth,
  fitMode = 'auto',
  manualWdth,
  manualLetterSpacing,
  paddingLeftPx = 0,
  clipOverflow = true,
}: {
  text: string;
  cellWidth: number;
  cellHeight: number;
  fontSize: string;
  wght: number;
  color: string;
  align: 'left' | 'right';
  valign?: 'top' | 'bottom';
  wdthMin: number;
  wdthMax: number;
  autoFillWidth: boolean;
  fitMode?: 'auto' | 'manual';
  manualWdth?: number;
  manualLetterSpacing?: string;
  paddingLeftPx?: number;
  clipOverflow?: boolean;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<TightFit>({
    wdth: manualWdth ?? 100,
    letterSpacing: manualLetterSpacing ?? '0px',
  });

  const hasManualFit = fitMode === 'manual';

  useLayoutEffect(() => {
    if (hasManualFit) {
      setFit({
        wdth: manualWdth ?? 100,
        letterSpacing: manualLetterSpacing ?? '0px',
      });
      return;
    }

    const element = textRef.current;
    if (!element || cellWidth <= 0) {
      return;
    }

    setFit(
      findTightFit(
        element,
        Math.max(0, cellWidth - paddingLeftPx),
        wght,
        wdthMin,
        wdthMax,
        autoFillWidth,
      ),
    );
  }, [
    autoFillWidth,
    cellWidth,
    cellHeight,
    fitMode,
    fontSize,
    hasManualFit,
    manualLetterSpacing,
    manualWdth,
    paddingLeftPx,
    text,
    wdthMax,
    wdthMin,
    wght,
  ]);

  return (
    <div
      style={{
        width: cellWidth,
        height: cellHeight,
        display: 'flex',
        alignItems: valign === 'top' ? 'flex-start' : 'flex-end',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        overflow: clipOverflow ? 'hidden' : 'visible',
        flexShrink: 0,
        paddingLeft: paddingLeftPx,
        boxSizing: 'border-box',
      }}
    >
      <span
        ref={textRef}
        style={momochidoriStyle(wght, fit.wdth, {
          fontSize,
          lineHeight: `${cellHeight}px`,
          color,
          whiteSpace: 'nowrap',
          display: 'block',
          letterSpacing: fit.letterSpacing,
        })}
      >
        {text}
      </span>
    </div>
  );
}

function MomochidoriFitStack({
  lines,
  block,
  uiScale,
  color,
  align,
  paddingLeftPx = 0,
  clipOverflow = true,
  cellWidthRemOverride,
}: {
  lines: readonly string[];
  block: HomeTutorialIntroPanelTune['welcome'] | HomeTutorialIntroPanelTune['brand'];
  uiScale: number;
  color: string;
  align: 'left' | 'right';
  paddingLeftPx?: number;
  clipOverflow?: boolean;
  cellWidthRemOverride?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${Math.round(block.gapPx * uiScale)}px`,
        marginLeft: align === 'right' ? 'auto' : undefined,
        flexShrink: 0,
      }}
    >
      {lines.map((text, index) => {
        const lineTune: HomeTutorialIntroFitLineTune = block.lines?.[index] ?? {};
        const uncappedCellWidthRem = lineTune.cellWidthRem
          ?? cellWidthRemOverride
          ?? block.cellWidthRem;
        const baseCellWidthRem = cellWidthRemOverride != null
          ? Math.min(uncappedCellWidthRem, cellWidthRemOverride)
          : uncappedCellWidthRem;
        const cellWidth = remToPx(baseCellWidthRem, uiScale);
        const cellHeight = remToPx(
          lineTune.cellHeightRem ?? block.cellHeightRem,
          uiScale,
        );
        const fontSize = rem(lineTune.fontSizeRem ?? block.fontSizeRem, uiScale);

        return (
          <MomochidoriFitCell
            key={`${text}-${index}`}
            text={text}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            fontSize={fontSize}
            wght={lineTune.wght ?? block.wght}
            color={color}
            align={align}
            valign={block.valign}
            wdthMin={block.wdthMin}
            wdthMax={block.wdthMax}
            autoFillWidth={block.autoFillWidth}
            fitMode={lineTune.fit ?? 'auto'}
            manualWdth={lineTune.wdth}
            manualLetterSpacing={lineTune.letterSpacing}
            paddingLeftPx={paddingLeftPx}
            clipOverflow={clipOverflow}
          />
        );
      })}
    </div>
  );
}

export function HomeTutorialIntroPanel({
  uiTheme,
  panel,
  content,
  visible,
  viewportWidth,
  tune = HOME_TUTORIAL_INTRO_PANEL_TUNE,
}: HomeTutorialIntroPanelProps) {
  const uiScale = panel.width / INTRO_PANEL_BASE_WIDTH;
  const accent = uiTheme.accent;
  const bodyAccent = uiTheme.accentMuted;
  const responsive = useMemo(
    () => getIntroPanelResponsiveLayout(viewportWidth, panel.width),
    [viewportWidth, panel.width],
  );
  const displayScale = uiScale * responsive.contentScale;

  const catchphraseBoxWidthRem = capRemToPanelWidth(
    tune.catchphrase.boxWidthRem,
    responsive.catchphraseWidthRatio,
    displayScale,
    panel.width,
  );
  const welcomeCellWidthRem = capRemToPanelWidth(
    tune.welcome.cellWidthRem,
    responsive.welcomeWidthRatio,
    displayScale,
    panel.width,
  );
  const brandCellWidthRem = capRemToPanelWidth(
    tune.brand.cellWidthRem,
    responsive.brandWidthRatio,
    displayScale,
    panel.width,
  );
  const panelPaddingX = Math.max(12, Math.round(panel.paddingX * (responsive.mode === 'narrow' ? 0.85 : 1.1)));
  const panelPaddingY = Math.round(panel.paddingY * (responsive.mode === 'narrow' ? 0.8 : 0.9));

  const catchphraseLines = content.catchphraseLines ?? [content.title, '', ''];
  const welcomeDecorLines = content.welcomeDecorLines ?? [
    'WELCOME',
    'TO THE',
    content.titleRuby || 'ぷるちか',
  ];
  const bodyParagraphs = content.bodyParagraphs ?? [content.body];
  const welcomeSiteName = content.welcomeSiteName ?? 'PLUTCHIKA';
  const welcomeSubline = content.welcomeSubline ?? '';

  const brandLines = welcomeSubline
    ? [welcomeSiteName, welcomeSubline]
    : [welcomeSiteName];

  return (
    <aside
      className="font-momochidori"
      style={{
        position: 'absolute',
        top: `${panel.y}px`,
        left: `${panel.x}px`,
        width: `${panel.width}px`,
        minHeight: `${panel.height}px`,
        zIndex: 2,
        padding: `${panelPaddingY}px ${panelPaddingX}px`,
        border: 'none',
        borderRadius: 0,
        backgroundColor: 'transparent',
        boxShadow: 'none',
        color: uiTheme.textPrimary,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: `opacity 320ms ease, ${UI_COLOR_TRANSITION}`,
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: INTRO_PANEL_LEFT_LINE_WIDTH,
          transform: 'translateX(-50%)',
          backgroundColor: uiTheme.accentBorder,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          height: responsive.mode === 'narrow'
            ? `${Math.max(panel.height - panelPaddingY * 2, 0)}px`
            : undefined,
          minHeight: responsive.mode === 'narrow'
            ? undefined
            : rem(tune.layout.rootMinHeightRem, displayScale),
        }}
      >
        {responsive.mode === 'narrow' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              justifyContent: 'space-evenly',
            }}
          >
            <div style={{ alignSelf: 'flex-end' }}>
              <MomochidoriFitStack
                lines={brandLines}
                block={tune.brand}
                uiScale={displayScale}
                color={accent}
                align="right"
                cellWidthRemOverride={brandCellWidthRem}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: `${Math.round(tune.catchphrase.gapPx * displayScale)}px`,
                width: '100%',
                minWidth: 0,
              }}
            >
              {catchphraseLines.map((line) => (
                <p
                  key={line}
                  style={momochidoriStyle(
                    tune.catchphrase.wght,
                    tune.catchphrase.wdth,
                    {
                      margin: 0,
                      fontSize: rem(tune.catchphrase.fontSizeRem, displayScale),
                      lineHeight: tune.catchphrase.lineHeight,
                      letterSpacing: tune.catchphrase.letterSpacing,
                      color: uiTheme.textPrimary,
                    },
                  )}
                >
                  {line}
                </p>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: `${Math.round(tune.body.gapPx * displayScale)}px`,
                marginLeft: responsive.bodyMarginLeft,
                maxWidth: responsive.bodyMaxWidth,
                alignSelf: responsive.bodyAlignSelf,
                width: responsive.bodyAlignSelf === 'flex-end' ? responsive.bodyMaxWidth : '100%',
                textAlign: responsive.bodyTextAlign,
              }}
            >
              {bodyParagraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  style={momochidoriStyle(tune.body.wght, tune.body.wdth, {
                    margin: 0,
                    fontSize: rem(tune.body.fontSizeRem, displayScale),
                    lineHeight: tune.body.lineHeight,
                    letterSpacing: tune.body.letterSpacing,
                    color: bodyAccent,
                  })}
                >
                  {paragraph}
                </p>
              ))}
            </div>

            <MomochidoriFitStack
              lines={welcomeDecorLines}
              block={tune.welcome}
              uiScale={displayScale}
              color={accent}
              align="left"
              paddingLeftPx={remToPx(tune.welcome.paddingLeftRem, displayScale)}
              clipOverflow={tune.welcome.clipOverflow}
              cellWidthRemOverride={welcomeCellWidthRem}
            />
          </div>
        ) : (
          <>
        <div
          style={{
            display: 'flex',
            flexDirection: responsive.headerDirection,
            justifyContent: responsive.headerAlign,
            alignItems: responsive.headerDirection === 'column' ? 'stretch' : 'flex-start',
            gap: `${Math.round(tune.layout.headerRowGapPx * displayScale)}px`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: `${Math.round(tune.catchphrase.gapPx * displayScale)}px`,
              width: responsive.mode === 'narrow'
                ? '100%'
                : rem(catchphraseBoxWidthRem, displayScale),
              minHeight: rem(tune.catchphrase.boxMinHeightRem, displayScale),
              flex: responsive.mode === 'narrow' ? '1 1 auto' : '0 0 auto',
              minWidth: 0,
            }}
          >
            {catchphraseLines.map((line) => (
              <p
                key={line}
                style={momochidoriStyle(
                  tune.catchphrase.wght,
                  tune.catchphrase.wdth,
                  {
                    margin: 0,
                    fontSize: rem(tune.catchphrase.fontSizeRem, displayScale),
                    lineHeight: tune.catchphrase.lineHeight,
                    letterSpacing: tune.catchphrase.letterSpacing,
                    color: uiTheme.textPrimary,
                  },
                )}
              >
                {line}
              </p>
            ))}
          </div>

          <MomochidoriFitStack
            lines={brandLines}
            block={tune.brand}
            uiScale={displayScale}
            color={accent}
            align="right"
            cellWidthRemOverride={brandCellWidthRem}
          />
        </div>

        <div
          style={{
            position: 'relative',
            marginTop: `${Math.round(responsive.lowerMarginTopPx * displayScale)}px`,
            minHeight: rem(tune.layout.lowerMinHeightRem, displayScale),
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: responsive.mode === 'narrow' ? '0%' : tune.layout.glowLeft,
              top: tune.layout.glowTop,
              width: responsive.mode === 'narrow' ? '100%' : tune.layout.glowWidth,
              height: tune.layout.glowHeight,
              background: `radial-gradient(ellipse at 20% 50%, ${accent}40 0%, transparent 72%)`,
              filter: `blur(${Math.round(tune.layout.glowBlurPx * displayScale)}px)`,
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: responsive.welcomePosition,
              left: responsive.welcomePosition === 'absolute'
                ? rem(tune.welcome.leftRem, displayScale)
                : undefined,
              bottom: responsive.welcomePosition === 'absolute'
                ? rem(tune.welcome.bottomRem, displayScale)
                : undefined,
              marginBottom: responsive.welcomePosition === 'relative'
                ? `${Math.round(12 * displayScale)}px`
                : undefined,
            }}
          >
            <MomochidoriFitStack
              lines={welcomeDecorLines}
              block={tune.welcome}
              uiScale={displayScale}
              color={accent}
              align="left"
              paddingLeftPx={remToPx(tune.welcome.paddingLeftRem, displayScale)}
              clipOverflow={tune.welcome.clipOverflow}
              cellWidthRemOverride={welcomeCellWidthRem}
            />
          </div>

          <div
            style={{
              marginLeft: responsive.bodyMarginLeft,
              maxWidth: responsive.bodyMaxWidth,
              display: 'flex',
              flexDirection: 'column',
              gap: `${Math.round(tune.body.gapPx * displayScale)}px`,
              paddingTop: `${Math.round(tune.body.paddingTopPx * displayScale)}px`,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {bodyParagraphs.map((paragraph) => (
              <p
                key={paragraph}
                style={momochidoriStyle(tune.body.wght, tune.body.wdth, {
                  margin: 0,
                  fontSize: rem(tune.body.fontSizeRem, displayScale),
                  lineHeight: tune.body.lineHeight,
                  letterSpacing: tune.body.letterSpacing,
                  color: bodyAccent,
                })}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
          </>
        )}
      </div>
    </aside>
  );
}
