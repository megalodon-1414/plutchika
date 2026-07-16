import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingLoadingScreen } from '../../components/landing/LandingLoadingScreen';
import { MainLandingLogo, MAIN_LANDING_LOGO_TUNE } from '../../components/landing/MainLandingLogo';
import {
  findDyadByComponents,
  getBasicEmotion,
  type BasicEmotionId,
} from '../../data/emotions';
import { ROUTES } from '../../routes/paths';
import { blendHex } from '../../utils/emotionColor';
import { DEFAULT_EMOTION_UI_ACCENT, getEmotionUiTheme } from '../../utils/emotionUiTheme';
import {
  HOME_LANDING_INTRO_MOVE_MS,
  HOME_TUTORIAL_BASIC_EMOTION_BLURBS,
  HOME_TUTORIAL_DYAD_EMOTION_BLURBS,
  HOME_TUTORIAL_CAMERA_TRANSITION_MS,
  HOME_TUTORIAL_INTRO_PANEL_TUNE,
  HOME_TUTORIAL_LOADING_FADE_MS,
  HOME_TUTORIAL_LOADING_MIN_MS,
  HOME_TUTORIAL_PANEL_FADE_MS,
  HOME_TUTORIAL_STEP2_PANEL_TUNE,
  HOME_TUTORIAL_STEP3_PANEL_TUNE,
  HOME_TUTORIAL_STEPS,
} from './constants';
import { HomeTutorialCanvas, type HomeLandingIntroPhase } from './HomeTutorialCanvas';
import { HomeTutorialIntroPanel } from './HomeTutorialIntroPanel';
import { getHomeTutorialPanelLayout } from './panelLayout';

const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease';

function buildStep3BodyParagraphs(selectedEmotionIds: readonly BasicEmotionId[]): string[] {
  if (selectedEmotionIds.length === 0) {
    return [];
  }

  if (selectedEmotionIds.length === 2) {
    const [aId, bId] = selectedEmotionIds;
    const a = getBasicEmotion(aId);
    const b = getBasicEmotion(bId);
    const dyad = findDyadByComponents(aId, bId);
    if (dyad) {
      const lines = HOME_TUTORIAL_DYAD_EMOTION_BLURBS[dyad.label] ?? [
        `「${a.label}」と「${b.label}」が`,
        '混ざり合った合成感情。',
      ];
      return [dyad.label, lines[0], lines[1]];
    }
    return [
      '対立する感情',
      `「${a.label}」と「${b.label}」は`,
      '環上で向かい合うペアです。',
    ];
  }

  const emotion = getBasicEmotion(selectedEmotionIds[0]);
  const [line1, line2] = HOME_TUTORIAL_BASIC_EMOTION_BLURBS[emotion.id];
  return [emotion.label, line1, line2];
}

export function HomeTutorialView() {
  const mainRef = useRef<HTMLElement>(null);
  const [mainSize, setMainSize] = useState({ width: 0, height: 0 });
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [panelStepIndex, setPanelStepIndex] = useState(0);
  const [sphereScreenPoint, setSphereScreenPoint] = useState<{
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isLandingChromeVisible, setIsLandingChromeVisible] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isLoadingFading, setIsLoadingFading] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [landingIntroPhase, setLandingIntroPhase] = useState<HomeLandingIntroPhase>('pending');
  const [selectedEmotionIds, setSelectedEmotionIds] = useState<BasicEmotionId[]>([]);
  const loadingStartedAtRef = useRef(Date.now());
  const transitionTimersRef = useRef<number[]>([]);

  const uiTheme = useMemo(() => getEmotionUiTheme(DEFAULT_EMOTION_UI_ACCENT, 'dark'), []);
  const activeStep = HOME_TUTORIAL_STEPS[activeStepIndex] ?? HOME_TUTORIAL_STEPS[0];
  const panelStep = HOME_TUTORIAL_STEPS[panelStepIndex] ?? HOME_TUTORIAL_STEPS[0];
  const panelLayout = useMemo(
    () => getHomeTutorialPanelLayout(mainSize.width, mainSize.height, 'intro'),
    [mainSize.width, mainSize.height],
  );
  const panelTune =
    panelStep.id === 'emotion-petals'
      ? HOME_TUTORIAL_STEP3_PANEL_TUNE
      : panelStep.id === 'emotion-wheel'
        ? HOME_TUTORIAL_STEP2_PANEL_TUNE
        : HOME_TUTORIAL_INTRO_PANEL_TUNE;

  const step3SelectionLabel = useMemo(() => {
    if (selectedEmotionIds.length === 0) {
      return '紡錘を選ぶ';
    }
    return selectedEmotionIds.map((id) => getBasicEmotion(id).label).join('＋');
  }, [selectedEmotionIds]);

  const { welcomeDecorLines, welcomeColor } = useMemo(() => {
    if (panelStep.id !== 'emotion-petals' || selectedEmotionIds.length === 0) {
      return {
        welcomeDecorLines: undefined as readonly string[] | undefined,
        welcomeColor: undefined as string | undefined,
      };
    }

    if (selectedEmotionIds.length === 1) {
      const emotion = getBasicEmotion(selectedEmotionIds[0]);
      return {
        welcomeDecorLines: [emotion.label],
        welcomeColor: emotion.color,
      };
    }

    const a = getBasicEmotion(selectedEmotionIds[0]);
    const b = getBasicEmotion(selectedEmotionIds[1]);
    const blended = blendHex(a.color, b.color, 0.5);
    const dyad = findDyadByComponents(a.id, b.id);
    if (dyad) {
      return {
        welcomeDecorLines: [dyad.label],
        welcomeColor: blended,
      };
    }
    return {
      welcomeDecorLines: ['対立する感情'],
      welcomeColor: blended,
    };
  }, [panelStep.id, selectedEmotionIds]);

  const panelContent = useMemo(() => {
    const content = panelStep.content;
    if (!content) {
      return null;
    }
    if (panelStep.id !== 'emotion-petals') {
      return content;
    }

    return {
      ...content,
      welcomeDecorLines: welcomeDecorLines ?? content.welcomeDecorLines,
      bodyParagraphs: buildStep3BodyParagraphs(selectedEmotionIds),
    };
  }, [panelStep.content, panelStep.id, selectedEmotionIds, welcomeDecorLines]);

  const guidePanel = {
    x: panelLayout.panel.x,
    y: panelLayout.panel.y,
    width: panelLayout.panel.width,
    height: panelLayout.panel.height,
    anchorX: panelLayout.guideAnchor.x,
    anchorY: panelLayout.guideAnchor.y,
  };
  const showIntroPanel = Boolean(panelContent && activeStep.showIntroPanel !== false);

  const clearTransitionTimers = useCallback(() => {
    transitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    transitionTimersRef.current = [];
  }, []);

  const handleEmotionToggle = useCallback((id: BasicEmotionId) => {
    setSelectedEmotionIds((prev) => {
      const existingIndex = prev.indexOf(id);
      if (existingIndex >= 0) {
        return prev.filter((emotionId) => emotionId !== id);
      }
      if (prev.length < 2) {
        return [...prev, id];
      }
      return [prev[1], id];
    });
  }, []);

  useEffect(() => {
    const element = mainRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      setMainSize({ width: element.clientWidth, height: element.clientHeight });
    };
    const observer = new ResizeObserver(updateSize);
    updateSize();
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => () => clearTransitionTimers(), [clearTransitionTimers]);

  const handleCanvasReady = useCallback(() => {
    setIsCanvasReady(true);
  }, []);

  useEffect(() => {
    if (!isCanvasReady || !isPageLoading) {
      return;
    }

    const elapsed = Date.now() - loadingStartedAtRef.current;
    const remaining = Math.max(0, HOME_TUTORIAL_LOADING_MIN_MS - elapsed);
    const fadeTimer = window.setTimeout(() => {
      setIsLoadingFading(true);
    }, remaining);
    const hideTimer = window.setTimeout(() => {
      setIsPageLoading(false);
      setIsLoadingFading(false);
      setLandingIntroPhase('moving');
    }, remaining + HOME_TUTORIAL_LOADING_FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [isCanvasReady, isPageLoading]);

  useEffect(() => {
    if (landingIntroPhase !== 'moving') {
      return;
    }

    const introTimer = window.setTimeout(() => {
      setLandingIntroPhase('done');
      setIsLandingChromeVisible(true);
    }, HOME_LANDING_INTRO_MOVE_MS);

    return () => window.clearTimeout(introTimer);
  }, [landingIntroPhase]);

  const handleStepSelect = useCallback((nextIndex: number) => {
    if (
      isTransitioning ||
      nextIndex === activeStepIndex ||
      nextIndex < 0 ||
      nextIndex >= HOME_TUTORIAL_STEPS.length
    ) {
      return;
    }

    const currentStep = HOME_TUTORIAL_STEPS[activeStepIndex];
    const nextStep = HOME_TUTORIAL_STEPS[nextIndex];
    const leavingMain = currentStep.showLandingChrome === true;
    const enteringMain = nextStep.showLandingChrome === true;
    const enteringPanel = nextStep.showIntroPanel === true && nextStep.content;

    clearTransitionTimers();
    setIsTransitioning(true);
    if (currentStep.id === 'emotion-petals' || nextStep.id !== 'emotion-petals') {
      setSelectedEmotionIds([]);
    }

    if (enteringPanel) {
      setIsPanelVisible(false);
    } else if (!enteringMain) {
      setIsPanelVisible(false);
    }

    if (leavingMain) {
      setIsLandingChromeVisible(false);
    }

    const fadeDelay = enteringPanel || leavingMain || enteringMain ? HOME_TUTORIAL_PANEL_FADE_MS : 0;

    const startCameraMoveTimer = window.setTimeout(() => {
      setActiveStepIndex(nextIndex);
      setSphereScreenPoint(null);
    }, fadeDelay);

    const finishTimer = window.setTimeout(() => {
      if (enteringMain) {
        setIsLandingChromeVisible(true);
        setIsPanelVisible(false);
      } else if (enteringPanel && nextStep.content) {
        setPanelStepIndex(nextIndex);
        setIsPanelVisible(true);
      }
      setIsTransitioning(false);
    }, fadeDelay + HOME_TUTORIAL_CAMERA_TRANSITION_MS);

    transitionTimersRef.current = [startCameraMoveTimer, finishTimer];
  }, [activeStepIndex, clearTransitionTimers, isTransitioning]);

  const showGuideLine =
    showIntroPanel &&
    isPanelVisible &&
    !isTransitioning &&
    sphereScreenPoint?.visible &&
    mainSize.width > 0 &&
    mainSize.height > 0;

  const guideLineEnd = {
    x: guidePanel.x + guidePanel.width * guidePanel.anchorX,
    y: guidePanel.y + guidePanel.height * guidePanel.anchorY,
  };
  /** STEP3 は紡錘の内側で線が見えないよう、球側を大きく引っ込める */
  const guideLineStart = (() => {
    if (!sphereScreenPoint) {
      return guideLineEnd;
    }
    if (panelStep.id !== 'emotion-petals') {
      return { x: sphereScreenPoint.x, y: sphereScreenPoint.y };
    }
    const dx = guideLineEnd.x - sphereScreenPoint.x;
    const dy = guideLineEnd.y - sphereScreenPoint.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) {
      return { x: sphereScreenPoint.x, y: sphereScreenPoint.y };
    }
    const inset = Math.min(length * 0.45, Math.max(160, mainSize.width * 0.18));
    return {
      x: sphereScreenPoint.x + (dx / length) * inset,
      y: sphereScreenPoint.y + (dy / length) * inset,
    };
  })();

  const uiScale = panelLayout.scale;
  const showLandingHeading =
    isLandingChromeVisible && !isPageLoading && landingIntroPhase === 'done';
  const showLandingMapLink = !isPageLoading;
  const introWelcomeColor =
    panelStep.id === 'emotion-petals' ? welcomeColor : undefined;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: uiTheme.uiText,
        backgroundColor: uiTheme.shell,
        overflow: 'hidden',
        transition: UI_COLOR_TRANSITION,
      }}
    >
      <main ref={mainRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <LandingLoadingScreen visible={isPageLoading} fading={isLoadingFading} />

        <HomeTutorialCanvas
          activeStepIndex={activeStepIndex}
          landingIntroPhase={landingIntroPhase}
          selectedEmotionIds={selectedEmotionIds}
          selectionLabel={step3SelectionLabel}
          showSelectionLabel={!(panelStep.id === 'emotion-petals' && mainSize.width < 640)}
          onEmotionToggle={handleEmotionToggle}
          onActiveSphereScreenPosition={setSphereScreenPoint}
          onStepSelect={handleStepSelect}
          onReady={handleCanvasReady}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: MAIN_LANDING_LOGO_TUNE.rightInset,
            transform: `translateY(${MAIN_LANDING_LOGO_TUNE.offsetY}px)`,
            pointerEvents: 'none',
            zIndex: 1,
            opacity: showLandingHeading ? 1 : 0,
            transition: `opacity ${HOME_TUTORIAL_PANEL_FADE_MS}ms ease`,
          }}
        >
          <MainLandingLogo />
        </div>

        {showGuideLine && sphereScreenPoint && (
          <>
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${mainSize.width} ${mainSize.height}`}
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              <line
                x1={guideLineStart.x}
                y1={guideLineStart.y}
                x2={guideLineEnd.x}
                y2={guideLineEnd.y}
                stroke={uiTheme.guideLine}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${mainSize.width} ${mainSize.height}`}
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 4,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              <circle
                cx={guideLineEnd.x}
                cy={guideLineEnd.y}
                r={4}
                fill={uiTheme.accent}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </>
        )}

        {panelContent ? (
          <HomeTutorialIntroPanel
            uiTheme={uiTheme}
            panel={panelLayout.panel}
            content={panelContent}
            visible={showIntroPanel && isPanelVisible}
            viewportWidth={mainSize.width}
            tune={panelTune}
            welcomeColor={introWelcomeColor}
            bodyAlignRight={panelStep.id === 'emotion-petals'}
            step3MobilePinned={panelStep.id === 'emotion-petals'}
            sphereScreenPoint={
              panelStep.id === 'emotion-petals' && sphereScreenPoint?.visible
                ? { x: sphereScreenPoint.x, y: sphereScreenPoint.y }
                : null
            }
          />
        ) : null}

        {showLandingMapLink && (
        <div
          style={{
            position: 'absolute',
            right: '16px',
            bottom: '16px',
            zIndex: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: `${Math.round(8 * uiScale)}px`,
          }}
        >
          <Link
            to={ROUTES.telescopeSpace}
            style={{
              padding: `${Math.round(8 * uiScale)}px ${Math.round(14 * uiScale)}px`,
              border: `1px solid ${uiTheme.controlBorder}`,
              borderRadius: `${Math.round(8 * uiScale)}px`,
              backgroundColor: uiTheme.controlBackground,
              color: uiTheme.controlText,
              fontSize: `${(0.78 * uiScale).toFixed(3)}rem`,
              letterSpacing: '0.06em',
              textDecoration: 'none',
              backdropFilter: 'blur(10px)',
            }}
          >
            望遠鏡空間（実験）
          </Link>
          <Link
            to={ROUTES.emotionMap}
            style={{
              padding: `${Math.round(8 * uiScale)}px ${Math.round(14 * uiScale)}px`,
              border: `1px solid ${uiTheme.controlBorder}`,
              borderRadius: `${Math.round(8 * uiScale)}px`,
              backgroundColor: uiTheme.controlBackground,
              color: uiTheme.controlText,
              fontSize: `${(0.78 * uiScale).toFixed(3)}rem`,
              letterSpacing: '0.06em',
              textDecoration: 'none',
              backdropFilter: 'blur(10px)',
            }}
          >
            感情MAPへ
          </Link>
        </div>
        )}
      </main>
    </div>
  );
}
