import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import { getBasicEmotion, getEmotionById, isBasicEmotionId } from '../../data/emotions';
import { ExplorationWordInfoPanel, explorationUiSlideAnimation, EXPLORATION_UI_TRANSITION_KEYFRAMES } from '../../components/ExplorationWordInfoPanel';
import { fetchEmotionWordsAsPlots } from '../../services/emotionWords';
import type { UserPlotRow } from '../../types/userPlot';
import { complementaryHex, landButtonFlowGradient } from '../../utils/emotionColor';
import { getPrimaryEmotionColor } from '../../utils/emotionPlotBridge';
import { mergeWithSeedPlots } from '../../utils/seedPlots';
import type { TelescopeSettledPhase, TelescopeZoomPhase } from './constants';
import {
  TelescopeEyepiece,
  telescopeEyepieceDiameter,
} from './TelescopeEyepiece';
import {
  TelescopeGuideLabelHud,
  TelescopeInnerTrackLabel,
  TelescopeRegionPositionHud,
  TelescopeRimEmotionIcons,
} from './TelescopeEyepieceHud';
import {
  createTelescopeRegionIndicatorState,
  createTelescopeSegmentFocusState,
  resolveFocusBasicId,
  type TelescopeViewFocus,
} from './TelescopeGalaxyLayer';
import {
  getLayer3SegmentGuideLabel,
  getLayer3SegmentIndexForPlot,
  getLayer3SegmentIndexForProgress,
  groupPlotsByLayer3Segment,
  LAYER3_SEGMENT_COUNT,
  pickRandomPlotIdInSegment,
} from './layer3Segments';
import { getTelescopeRegionDefinition } from './layer3Region';
import {
  createTelescopeExplorationHudState,
  isTelescopeExplorationSelectablePlot,
  TELESCOPE_EXPLORATION_VIEW,
  type TelescopeExplorationHudState,
} from './layer4Exploration';
import { plotColorFromRow } from '../../utils/plotFromUserPlot';
import { getEmotionWordPath } from '../../utils/emotionWordSlug';
import {
  getBasicEmotionDescription,
  getDyadEmotionDescription,
} from '../../data/basicEmotionDescriptions';
import { setTelescopeAimMode, setTelescopePinHidden } from './telescopeAim';
import { TelescopeEmotionInfoPanel, useTelescopeEmotionInfoMobile } from './TelescopeEmotionInfoPanel';
import { TelescopeSpaceCanvas } from './TelescopeSpaceCanvas';
import { TelescopeZoomLadder, zoomLevelIndex } from './TelescopeZoomLadder';
import {
  resolveTelescopeExplorationRestore,
  TELESCOPE_RESTORE_STATE_KEY,
  type TelescopeLocationState,
} from './telescopeRestore';
import { getEmotionWordSlug } from '../../utils/emotionWordSlug';

function isBusyPhase(phase: TelescopeZoomPhase): boolean {
  return (
    phase === 'approaching' ||
    phase === 'zooming-in' ||
    phase === 'entering-region' ||
    phase === 'leaving-region' ||
    phase === 'entering-exploration' ||
    phase === 'leaving-exploration' ||
    phase === 'zooming-out' ||
    phase === 'retreating'
  );
}

function settledFromPhase(phase: TelescopeZoomPhase): TelescopeSettledPhase {
  if (
    phase === 'exploration' ||
    phase === 'entering-exploration' ||
    phase === 'leaving-exploration'
  ) {
    return 'exploration';
  }
  if (
    phase === 'region' ||
    phase === 'entering-region' ||
    phase === 'leaving-region'
  ) {
    return 'region';
  }
  if (phase === 'detail' || phase === 'zooming-in') {
    return 'detail';
  }
  if (phase === 'wide' || phase === 'zooming-out' || phase === 'approaching') {
    return 'wide';
  }
  return 'far';
}

function apertureForPhase(phase: TelescopeZoomPhase): number {
  switch (phase) {
    case 'far':
      return 0;
    case 'approaching':
      return 0.35;
    case 'wide':
    case 'zooming-out':
      return 0.7;
    case 'zooming-in':
    case 'detail':
    case 'entering-region':
    case 'region':
    case 'leaving-region':
    case 'entering-exploration':
    case 'exploration':
    case 'leaving-exploration':
      // TelescopeEyepiece の sizeScale = 0.9 + aperture * 0.1 により1.2倍。
      return 3;
    case 'retreating':
      return 0.25;
  }
}

/**
 * レンズ視野の水平オフセット。
 * デスクトップのレイヤー4では右側の単語説明UIを見やすくするため視野ごと左へずらす。
 * スマホでは上方向シフトを使うため水平は動かさない。
 */
function eyepieceShiftXForPhase(
  phase: TelescopeZoomPhase,
  mobile: boolean,
): string {
  if (mobile) {
    return '0px';
  }
  switch (phase) {
    case 'entering-exploration':
    case 'exploration':
      return '-13vw';
    default:
      return '0px';
  }
}

/**
 * レンズ視野の垂直オフセット。
 * スマホのレイヤー4では下の単語説明UIを見やすくするため視野ごと上へずらす。
 */
function eyepieceShiftYForPhase(
  phase: TelescopeZoomPhase,
  mobile: boolean,
): string {
  if (!mobile) {
    return '0px';
  }
  switch (phase) {
    case 'entering-exploration':
    case 'exploration':
      return '-11vh';
    default:
      return '0px';
  }
}

/**
 * 画面クランプ後にさらに掛けるレンズ倍率。
 * 深い階層では円が画面高さを超えて広がる（上下は切れて見える）。
 */
function eyepieceOverscanForPhase(phase: TelescopeZoomPhase): number {
  switch (phase) {
    case 'entering-region':
    case 'region':
    case 'leaving-region':
      return 1.15;
    case 'entering-exploration':
    case 'exploration':
    case 'leaving-exploration':
      return 1.3;
    default:
      return 1;
  }
}

const EMPTY_FOCUS: TelescopeViewFocus = { nearest: null, nearby: [] };

/**
 * レイヤー4セグメント移動矢印の楕円軌道。
 * 角度は画面座標（y下向き）基準。index 0 = 前へ、1 = 次へ。
 */
const EXPLORATION_ARROW_BASE_ANGLES = [
  Math.PI + Math.PI / 6 + (10 * Math.PI) / 180,
  Math.PI/6 + (10 * Math.PI) / 180,
] as const;
/** 楕円半径（レンズ幅・高さに対する%） */
const EXPLORATION_ARROW_RX = 32;
/** 見回し操作と同じ扁平率をかけた縦半径 */
const EXPLORATION_ARROW_RY =
  EXPLORATION_ARROW_RX * TELESCOPE_EXPLORATION_VIEW.orbitEcc;
const EXPLORATION_ARROW_SIZE = 78;
/** 矢印中心から引き出し線の始点までの距離（px） */
const EXPLORATION_ARROW_LABEL_GAP = 34;
/** 引き出し線の長さ（px） */
const EXPLORATION_ARROW_LABEL_LINE = 42;

function explorationArrowBasePosition(index: number): {
  left: string;
  top: string;
} {
  const theta = EXPLORATION_ARROW_BASE_ANGLES[index];
  return {
    left: `${50 + EXPLORATION_ARROW_RX * Math.cos(theta)}%`,
    top: `${50 + EXPLORATION_ARROW_RY * Math.sin(theta)}%`,
  };
}

/** レイヤー4: 選択プロット点から単語説明パネルへの引き出し線 */
function ExplorationGuideLine({
  hud,
  panelRef,
  color,
}: {
  hud: MutableRefObject<TelescopeExplorationHudState>;
  panelRef: MutableRefObject<HTMLElement | null>;
  color: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = requestAnimationFrame(sync);
      const svg = svgRef.current;
      const line = lineRef.current;
      const dot = dotRef.current;
      const panel = panelRef.current;
      if (!svg || !line || !dot) {
        return;
      }
      const state = hud.current;
      if (!panel || !state.plotVisible) {
        line.style.opacity = '0';
        dot.style.opacity = '0';
        return;
      }
      const rect = svg.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const x1 = state.plotClientX - rect.left;
      const y1 = state.plotClientY - rect.top;
      // 下ドック（横書き）パネルなら上辺中央、右サイドなら左辺中央へ結ぶ
      const dockBottom =
        panelRect.bottom > window.innerHeight * 0.72 &&
        panelRect.width > window.innerWidth * 0.45;
      const x2 = dockBottom
        ? panelRect.left + panelRect.width * 0.5 - rect.left
        : panelRect.left - rect.left - 6;
      const y2 = dockBottom
        ? panelRect.top - rect.top - 4
        : panelRect.top + panelRect.height * 0.5 - rect.top;
      line.setAttribute('x1', `${x1}`);
      line.setAttribute('y1', `${y1}`);
      line.setAttribute('x2', `${x2}`);
      line.setAttribute('y2', `${y2}`);
      dot.setAttribute('cx', `${x1}`);
      dot.setAttribute('cy', `${y1}`);
      line.style.opacity = '0.62';
      dot.style.opacity = '0.85';
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [hud, panelRef]);

  return (
    <svg
      ref={svgRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <line
        ref={lineRef}
        stroke={color}
        strokeWidth={1.4}
        style={{
          opacity: 0,
          filter: `drop-shadow(0 0 4px ${color})`,
          transition: 'opacity 240ms ease',
        }}
      />
      <circle
        ref={dotRef}
        r={3.2}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        style={{ opacity: 0, transition: 'opacity 240ms ease' }}
      />
    </svg>
  );
}

function getInfoUiScale(): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  return Math.max(
    0.6,
    Math.min(1, window.innerWidth / 1180, window.innerHeight / 780),
  );
}

/**
 * 望遠鏡モチーフの感情語探索空間（実験用）。
 * 既存 `/map` とは独立。円形接眼の中だけで階層ズームする。
 */
export function TelescopeSpaceView() {
  const location = useLocation();
  const navigate = useNavigate();
  const [zoomPhase, setZoomPhase] = useState<TelescopeZoomPhase>('far');
  const [viewFocus, setViewFocus] = useState<TelescopeViewFocus>(EMPTY_FOCUS);
  const [focusBasicId, setFocusBasicId] = useState<BasicEmotionId | null>(null);
  const [selectedDyadId, setSelectedDyadId] = useState<EmotionId | null>(null);
  const [explorationPlotId, setExplorationPlotId] = useState<string | null>(
    null,
  );
  /** 矢印移動時の UI 入場方向。点クリック時は null */
  const [segmentUiDirection, setSegmentUiDirection] = useState<-1 | 1 | null>(
    null,
  );
  const [explorationSegmentIndex, setExplorationSegmentIndex] = useState<
    number | null
  >(null);
  const [explorationArrowPulse, setExplorationArrowPulse] = useState<{
    direction: -1 | 1;
    at: number;
  } | null>(null);
  const [wordPlots, setWordPlots] = useState<UserPlotRow[]>([]);
  const [infoUiScale, setInfoUiScale] = useState(getInfoUiScale);
  const [layer2HudActive, setLayer2HudActive] = useState(false);
  const retreatTargetRef = useRef<TelescopeSettledPhase | null>(null);
  const regionIndicatorRef = useRef(createTelescopeRegionIndicatorState());
  const segmentFocusRef = useRef(createTelescopeSegmentFocusState());
  const explorationHudRef = useRef(createTelescopeExplorationHudState());
  const explorationArrowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const explorationArrowLabelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const explorationPanelRef = useRef<HTMLElement | null>(null);
  /** 単語詳細から戻ったときの復元を一度だけ適用する */
  const restoreAppliedRef = useRef(false);

  useEffect(() => {
    let frame = 0;
    const updateScale = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setInfoUiScale(getInfoUiScale());
      });
    };
    window.addEventListener('resize', updateScale);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWordPlots = async () => {
      try {
        const fetched = await fetchEmotionWordsAsPlots();
        if (!cancelled) {
          setWordPlots(mergeWithSeedPlots(fetched));
        }
      } catch {
        if (!cancelled) {
          setWordPlots(mergeWithSeedPlots([]));
        }
      }
    };
    void loadWordPlots();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 単語詳細の「Mapに戻る」から来たとき、探索レイヤーのその語へ復帰する */
  useEffect(() => {
    if (restoreAppliedRef.current || wordPlots.length === 0) {
      return;
    }
    const restore = (location.state as TelescopeLocationState | null)?.[
      TELESCOPE_RESTORE_STATE_KEY
    ];
    if (!restore?.wordId) {
      return;
    }

    const plot =
      wordPlots.find((row) => row.word_id === restore.wordId) ??
      wordPlots.find((row) => getEmotionWordSlug(row) === restore.wordId);
    if (!plot) {
      restoreAppliedRef.current = true;
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    const target = resolveTelescopeExplorationRestore(plot);
    restoreAppliedRef.current = true;
    navigate(location.pathname, { replace: true, state: {} });
    if (!target) {
      return;
    }

    setFocusBasicId(target.focusBasicId);
    setSelectedDyadId(target.dyadId);
    setExplorationPlotId(target.wordId);
    setExplorationSegmentIndex(target.segmentIndex);
    setLayer2HudActive(false);
    /* 5段階目（探索）確定状態へ。意味パネルが出る zoomPhase==='exploration' に直接入る */
    setZoomPhase('exploration');
  }, [wordPlots, location.state, location.pathname, navigate]);

  const busy = isBusyPhase(zoomPhase);
  const settled = settledFromPhase(zoomPhase);
  const aperture = useMemo(() => apertureForPhase(zoomPhase), [zoomPhase]);
  const eyepieceOverscan = useMemo(
    () => eyepieceOverscanForPhase(zoomPhase),
    [zoomPhase],
  );
  const emotionInfoMobile = useTelescopeEmotionInfoMobile();
  const eyepieceShiftX = useMemo(
    () => eyepieceShiftXForPhase(zoomPhase, emotionInfoMobile),
    [zoomPhase, emotionInfoMobile],
  );
  const eyepieceShiftY = useMemo(
    () => eyepieceShiftYForPhase(zoomPhase, emotionInfoMobile),
    [zoomPhase, emotionInfoMobile],
  );
  const explorationArrowSize = emotionInfoMobile
    ? Math.round(EXPLORATION_ARROW_SIZE * 0.62)
    : EXPLORATION_ARROW_SIZE;
  const explorationArrowLabelLine = emotionInfoMobile
    ? Math.round(EXPLORATION_ARROW_LABEL_LINE * 0.7)
    : EXPLORATION_ARROW_LABEL_LINE;
  const explorationArrowLabelGap = emotionInfoMobile
    ? Math.round(EXPLORATION_ARROW_LABEL_GAP * 0.7)
    : EXPLORATION_ARROW_LABEL_GAP;
  const showHud = true;
  const showRimGlow = settled !== 'far';

  const startZoomOutStep = useCallback((from: TelescopeSettledPhase) => {
    if (from === 'exploration') {
      setZoomPhase('leaving-exploration');
    } else if (from === 'region') {
      setZoomPhase('leaving-region');
    } else if (from === 'detail') {
      setZoomPhase('zooming-out');
    } else if (from === 'wide') {
      setZoomPhase('retreating');
    }
  }, []);

  const handleCanvasClickZoom = useCallback(() => {
    if (busy) {
      return;
    }
    retreatTargetRef.current = null;
    setZoomPhase((prev) => {
      if (prev === 'far') {
        return 'approaching';
      }
      if (prev === 'wide') {
        const locked = resolveFocusBasicId(viewFocus.nearest?.id);
        if (!locked) {
          return prev;
        }
        setLayer2HudActive(false);
        setFocusBasicId(locked);
        return 'zooming-in';
      }
      if (prev === 'detail') {
        const nearestId = viewFocus.nearest?.id as EmotionId | undefined;
        if (!nearestId?.startsWith('dyad-')) {
          return prev;
        }
        setSelectedDyadId(nearestId);
        setLayer2HudActive(false);
        return 'entering-region';
      }
      if (prev === 'region') {
        const focus = segmentFocusRef.current;
        if (
          !focus.active ||
          focus.segmentIndex == null ||
          focus.plotIds.length === 0 ||
          focus.closeness < 0.05
        ) {
          return prev;
        }
        const startId = pickRandomPlotIdInSegment(focus.plotIds);
        if (!startId) {
          return prev;
        }
        setSegmentUiDirection(null);
        setExplorationPlotId(startId);
        setExplorationSegmentIndex(focus.segmentIndex);
        setLayer2HudActive(false);
        return 'entering-exploration';
      }
      return prev;
    });
  }, [busy, viewFocus.nearest?.id]);

  const handleRetreatTo = useCallback(
    (level: TelescopeSettledPhase) => {
      if (busy) {
        return;
      }
      const current = settledFromPhase(zoomPhase);
      if (zoomLevelIndex(level) >= zoomLevelIndex(current)) {
        return;
      }
      retreatTargetRef.current = level;
      if (
        current === 'detail' ||
        current === 'region' ||
        current === 'exploration'
      ) {
        setLayer2HudActive(false);
      }
      startZoomOutStep(current);
    },
    [busy, zoomPhase, startZoomOutStep],
  );

  const handleZoomComplete = useCallback(
    (phase: TelescopeSettledPhase) => {
      setZoomPhase(phase);
      if (phase === 'wide' || phase === 'far') {
        setFocusBasicId(null);
        setLayer2HudActive(false);
      }
      if (phase === 'detail') {
        setSelectedDyadId(null);
        setExplorationPlotId(null);
        setExplorationSegmentIndex(null);
        setLayer2HudActive(true);
      }
      if (phase === 'region') {
        setExplorationPlotId(null);
        setExplorationSegmentIndex(null);
      }
      const target = retreatTargetRef.current;
      if (target && zoomLevelIndex(phase) > zoomLevelIndex(target)) {
        startZoomOutStep(phase);
        return;
      }
      retreatTargetRef.current = null;
    },
    [startZoomOutStep],
  );

  const handleSelectExplorationPlot = useCallback(
    (id: string) => {
      setSegmentUiDirection(null);
      setExplorationPlotId(id);
      const plot = wordPlots.find((row) => row.word_id === id);
      if (!plot || !selectedDyadId) {
        return;
      }
      const region = getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
      if (!region) {
        return;
      }
      const index = getLayer3SegmentIndexForPlot(region, plot);
      if (index >= 0) {
        setExplorationSegmentIndex(index);
      }
    },
    [wordPlots, selectedDyadId, focusBasicId],
  );

  const handleViewFocus = useCallback((focus: TelescopeViewFocus) => {
    setViewFocus(focus);
  }, []);

  const detailHudMode = settled === 'detail' && layer2HudActive;
  const regionHudMode = settled === 'region';
  const explorationHudMode = settled === 'exploration';
  const layer1HudMode = settled === 'wide';
  const layer2HudMode = settled === 'detail';
  /** レイヤー1検知 / レイヤー2へ持ち越した選択中の基本感情 */
  const basicEmotionInfo = useMemo(() => {
    if (layer1HudMode) {
      const nearest = viewFocus.nearest;
      if (!nearest || !isBasicEmotionId(nearest.id as BasicEmotionId)) {
        return null;
      }
      return {
        id: nearest.id as BasicEmotionId,
        label: nearest.label,
        color: nearest.color,
        description: getBasicEmotionDescription(nearest.id as BasicEmotionId),
        sectionLabel: '検知中',
        tickerLabel: 'DETECTING',
      };
    }
    if (layer2HudMode && focusBasicId) {
      const emotion = getBasicEmotion(focusBasicId);
      return {
        id: focusBasicId,
        label: emotion.label,
        color: emotion.color,
        description: getBasicEmotionDescription(focusBasicId),
        sectionLabel: '検知中',
        tickerLabel: 'DETECTING',
      };
    }
    return null;
  }, [layer1HudMode, layer2HudMode, viewFocus.nearest, focusBasicId]);
  /** レイヤー2で検知中の合成感情（24） */
  const dyadEmotionInfo = useMemo(() => {
    if (!layer2HudMode) {
      return null;
    }
    const nearest = viewFocus.nearest;
    if (!nearest || !nearest.id.startsWith('dyad-')) {
      return null;
    }
    return {
      id: nearest.id as EmotionId,
      label: nearest.label,
      color: nearest.color,
      description: getDyadEmotionDescription(nearest.id as EmotionId),
      sectionLabel: '検知中',
      tickerLabel: 'DETECTING',
    };
  }, [layer2HudMode, viewFocus.nearest]);
  // スマホは画面中央検知、デスクトップはカーソル検知
  useEffect(() => {
    setTelescopeAimMode(emotionInfoMobile ? 'center' : 'cursor');
    return () => setTelescopeAimMode('cursor');
  }, [emotionInfoMobile]);

  const [regionGuideLabel, setRegionGuideLabel] = useState<string | null>(null);
  const [regionGuideColor, setRegionGuideColor] = useState<string | null>(null);

  // レイヤー3: カメラ位置の区画に合わせてガイド文言を更新
  useEffect(() => {
    if (!regionHudMode || !selectedDyadId) {
      setRegionGuideLabel(null);
      setRegionGuideColor(null);
      return;
    }
    const region = getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
    if (!region) {
      setRegionGuideLabel(null);
      setRegionGuideColor(null);
      return;
    }
    const midLabel = getEmotionById(selectedDyadId).label;
    const midColor = getPrimaryEmotionColor(selectedDyadId);
    let lastIndex = -2;
    let frame = 0;
    const sync = () => {
      const index = getLayer3SegmentIndexForProgress(
        regionIndicatorRef.current.progress,
      );
      if (index !== lastIndex) {
        lastIndex = index;
        setRegionGuideLabel(
          getLayer3SegmentGuideLabel(
            index,
            region.start.label,
            midLabel,
            region.end.label,
          ),
        );
        const perSide = Math.floor((LAYER3_SEGMENT_COUNT - 3) / 2);
        const dyadIndex = perSide + 1;
        if (index <= 0) {
          setRegionGuideColor(region.start.color);
        } else if (index >= LAYER3_SEGMENT_COUNT - 1) {
          setRegionGuideColor(region.end.color);
        } else if (index === dyadIndex) {
          setRegionGuideColor(midColor);
        } else if (index <= perSide) {
          // start側: 端寄りは start 色、中間寄りは mid 色
          setRegionGuideColor(
            index === 1 ? region.start.color : midColor,
          );
        } else {
          setRegionGuideColor(
            index === LAYER3_SEGMENT_COUNT - 2 ? region.end.color : midColor,
          );
        }
      }
      frame = requestAnimationFrame(sync);
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [regionHudMode, selectedDyadId, focusBasicId]);

  // 矢印が消えるときに pointerleave が発火しないケースへの保険
  useEffect(() => {
    if (!explorationHudMode) {
      setTelescopePinHidden(false);
    }
    return () => setTelescopePinHidden(false);
  }, [explorationHudMode]);

  // レイヤー4のカメラ回転（画面中心支点）に矢印HUDを毎フレーム追従させる。
  // 空間の見た目に合わせ、円ではなく扁平な楕円軌道上を動かす。
  useEffect(() => {
    if (!explorationHudMode) {
      return;
    }
    let frame = 0;
    const sync = () => {
      const yaw = explorationHudRef.current.yaw;
      for (let index = 0; index < EXPLORATION_ARROW_BASE_ANGLES.length; index++) {
        const el = explorationArrowRefs.current[index];
        if (!el) {
          continue;
        }
        const base = EXPLORATION_ARROW_BASE_ANGLES[index];
        const theta = base + yaw;
        const leftPct = 50 + EXPLORATION_ARROW_RX * Math.cos(theta);
        const topPct = 50 + EXPLORATION_ARROW_RY * Math.sin(theta);
        el.style.left = `${leftPct}%`;
        el.style.top = `${topPct}%`;
        // 画面中心から矢印位置への見かけの方位をまっすぐ指す。
        // index 0（前へ）は三角形が左向きなので半回転補正する。
        const apparent = Math.atan2(
          EXPLORATION_ARROW_RY * Math.sin(theta),
          EXPLORATION_ARROW_RX * Math.cos(theta),
        );
        const pointing = index === 0 ? apparent + Math.PI : apparent;
        el.style.transform = `translate(-50%, -50%) rotate(${pointing}rad)`;

        // 引き出し線ラベル: 矢印と同じ点に置き、下半分なら上へ・上半分なら下へ伸ばす
        const labelEl = explorationArrowLabelRefs.current[index];
        if (labelEl) {
          labelEl.style.left = `${leftPct}%`;
          labelEl.style.top = `${topPct}%`;
          const extendUp = topPct >= 50;
          const line = labelEl.children[0] as HTMLElement | undefined;
          const text = labelEl.children[1] as HTMLElement | undefined;
          if (line && text) {
            if (extendUp) {
              line.style.top = `${-(explorationArrowLabelGap + explorationArrowLabelLine)}px`;
              line.style.height = `${explorationArrowLabelLine}px`;
              text.style.top = `${-(explorationArrowLabelGap + explorationArrowLabelLine + 6)}px`;
              text.style.transform = 'translate(-50%, -100%)';
            } else {
              line.style.top = `${explorationArrowLabelGap}px`;
              line.style.height = `${explorationArrowLabelLine}px`;
              text.style.top = `${explorationArrowLabelGap + explorationArrowLabelLine + 6}px`;
              text.style.transform = 'translate(-50%, 0)';
            }
          }
        }
      }
      frame = requestAnimationFrame(sync);
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [
    explorationHudMode,
    explorationArrowLabelGap,
    explorationArrowLabelLine,
  ]);
  const selectedEmotion = useMemo(() => {
    if (!focusBasicId) {
      return null;
    }
    const emotion = getBasicEmotion(focusBasicId);
    return { label: emotion.label, color: emotion.color };
  }, [focusBasicId]);
  const selectedDyad = useMemo(() => {
    if (!selectedDyadId) {
      return null;
    }
    const emotion = getEmotionById(selectedDyadId);
    return 'components' in emotion
      ? { label: emotion.label, color: getPrimaryEmotionColor(selectedDyadId) }
      : null;
  }, [selectedDyadId]);
  // 感情空間と同系色だと埋もれるため、矢印は補色寄りの色にする
  const explorationArrowColor = useMemo(
    () => (selectedDyad ? complementaryHex(selectedDyad.color) : '#f4ecf7'),
    [selectedDyad],
  );
  // 矢印が指す方向の基本感情（index 0 = 前へ = start 側、1 = 次へ = end 側）
  const explorationArrowTargets = useMemo(() => {
    const region = getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
    if (!region) {
      return null;
    }
    return [region.start.label, region.end.label] as const;
  }, [selectedDyadId, focusBasicId]);
  const selectedExplorationPlot = useMemo(
    () =>
      explorationPlotId
        ? wordPlots.find((row) => row.word_id === explorationPlotId) ?? null
        : null,
    [explorationPlotId, wordPlots],
  );
  const selectedExploration = useMemo(
    () =>
      selectedExplorationPlot
        ? {
            label: selectedExplorationPlot.word_id,
            color: plotColorFromRow(selectedExplorationPlot),
          }
        : null,
    [selectedExplorationPlot],
  );
  const landButtonGradient = useMemo(
    () => landButtonFlowGradient(selectedExploration?.color ?? '#9aa3c7'),
    [selectedExploration?.color],
  );
  const explorationPlotsBySegment = useMemo(() => {
    if (!selectedDyadId) {
      return new Map<number, string[]>();
    }
    const region = getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
    if (!region) {
      return new Map<number, string[]>();
    }
    return groupPlotsByLayer3Segment(
      region,
      wordPlots.filter((plot) =>
        isTelescopeExplorationSelectablePlot(region, plot),
      ),
    );
  }, [selectedDyadId, focusBasicId, wordPlots]);
  /** 指定方向で次に点が入っている区画を探す（空き区画は飛ばす） */
  const findOccupiedExplorationSegment = useCallback(
    (fromIndex: number, direction: -1 | 1): number | null => {
      const segmentCount = LAYER3_SEGMENT_COUNT;
      for (
        let index = fromIndex + direction;
        index >= 0 && index < segmentCount;
        index += direction
      ) {
        if ((explorationPlotsBySegment.get(index)?.length ?? 0) > 0) {
          return index;
        }
      }
      return null;
    },
    [explorationPlotsBySegment],
  );
  const handleMoveExplorationSegment = useCallback(
    (direction: -1 | 1) => {
      if (explorationSegmentIndex == null || busy) {
        return;
      }
      const nextIndex = findOccupiedExplorationSegment(
        explorationSegmentIndex,
        direction,
      );
      if (nextIndex == null) {
        return;
      }
      const nextPlotIds = explorationPlotsBySegment.get(nextIndex) ?? [];
      const nextPlotId = pickRandomPlotIdInSegment(nextPlotIds);
      if (!nextPlotId) {
        return;
      }
      setSegmentUiDirection(direction);
      setExplorationSegmentIndex(nextIndex);
      setExplorationPlotId(nextPlotId);
    },
    [
      busy,
      explorationPlotsBySegment,
      explorationSegmentIndex,
      findOccupiedExplorationSegment,
    ],
  );
  const canMoveExplorationPrevious =
    explorationSegmentIndex != null &&
    findOccupiedExplorationSegment(explorationSegmentIndex, -1) != null;
  const canMoveExplorationNext =
    explorationSegmentIndex != null &&
    findOccupiedExplorationSegment(explorationSegmentIndex, 1) != null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: `
          radial-gradient(ellipse at 50% 45%, #0a0d18 0%, #03040a 55%, #010104 100%)
        `,
        color: '#f4ecf7',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(1.5px 1.5px at 20% 30%, rgba(200,210,240,0.35), transparent),
            radial-gradient(1px 1px at 70% 20%, rgba(200,210,240,0.28), transparent),
            radial-gradient(1.2px 1.2px at 40% 70%, rgba(200,210,240,0.22), transparent),
            radial-gradient(1px 1px at 85% 60%, rgba(200,210,240,0.3), transparent),
            radial-gradient(1px 1px at 15% 80%, rgba(200,210,240,0.2), transparent)`,
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />

      <TelescopeEyepiece
        aperture={aperture}
        overscan={eyepieceOverscan}
        shiftX={eyepieceShiftX}
        shiftY={eyepieceShiftY}
        rimGlowColor={selectedEmotion?.color}
        innerOverlay={
          <>
            <TelescopeInnerTrackLabel
              focus={viewFocus}
              visible={showHud}
              detailMode={detailHudMode}
              regionMode={regionHudMode || explorationHudMode}
            />
            {detailHudMode ? (
              <TelescopeRimEmotionIcons
                focus={viewFocus}
                visible={showRimGlow}
                detailMode
              />
            ) : null}
            {/* レイヤー3 現在位置インジケータ — 接眼円の内側左下に固定 */}
            {regionHudMode ? (
              <div
                style={{
                  position: 'absolute',
                  left: '25%',
                  bottom: '30%',
                  transform: 'translate(-50%, 50%)',
                  pointerEvents: 'none',
                }}
              >
                <TelescopeRegionPositionHud state={regionIndicatorRef} />
              </div>
            ) : null}
          </>
        }
        rimOverlay={
          !detailHudMode ? (
            <TelescopeRimEmotionIcons
              focus={viewFocus}
              visible={showRimGlow}
              detailMode={false}
            />
          ) : null
        }
      >
        <TelescopeSpaceCanvas
          zoomPhase={zoomPhase}
          focusBasicId={focusBasicId}
          selectedDyadId={selectedDyadId}
          wordPlots={wordPlots}
          onZoomComplete={handleZoomComplete}
          onCanvasClickZoom={handleCanvasClickZoom}
          onLayer2RotationComplete={() => setLayer2HudActive(true)}
          onViewFocus={handleViewFocus}
          regionIndicator={regionIndicatorRef}
          segmentFocus={segmentFocusRef}
          explorationPlotId={explorationPlotId}
          explorationSegmentIndex={explorationSegmentIndex}
          explorationHud={explorationHudRef}
          onSelectExplorationPlot={handleSelectExplorationPlot}
        />
      </TelescopeEyepiece>

      {/* ガイドラベル — レンズ径には影響されないが、レイヤー4では視野と同じ水平シフトを追従 */}
      <TelescopeGuideLabelHud
        focus={viewFocus}
        visible={showHud}
        detailMode={detailHudMode}
        regionMode={regionHudMode}
        selectedEmotion={selectedEmotion}
        regionGuideLabel={regionGuideLabel}
        regionGuideColor={regionGuideColor}
        shiftX={eyepieceShiftX}
      />

      {(basicEmotionInfo || dyadEmotionInfo) ? (
        <div
          style={
            emotionInfoMobile
              ? {
                  position: 'absolute',
                  left: 10,
                  right: 10,
                  bottom: 14,
                  zIndex: 3,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  gap: 8,
                  pointerEvents: 'none',
                }
              : {
                  position: 'absolute',
                  top: 'max(64px, 8vh)',
                  left: 0,
                  bottom: 0,
                  zIndex: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 14,
                  pointerEvents: 'none',
                }
          }
        >
          {basicEmotionInfo ? (
            <TelescopeEmotionInfoPanel
              panelKey={`basic-${basicEmotionInfo.id}`}
              label={basicEmotionInfo.label}
              color={basicEmotionInfo.color}
              description={basicEmotionInfo.description}
              sectionLabel={basicEmotionInfo.sectionLabel}
              tickerLabel={basicEmotionInfo.tickerLabel}
              heightRatio={0.42}
              positioned={false}
              writingDirection={emotionInfoMobile ? 'horizontal' : 'vertical'}
            />
          ) : null}
          {dyadEmotionInfo ? (
            <TelescopeEmotionInfoPanel
              panelKey={`dyad-${dyadEmotionInfo.id}`}
              label={dyadEmotionInfo.label}
              color={dyadEmotionInfo.color}
              description={dyadEmotionInfo.description}
              sectionLabel={dyadEmotionInfo.sectionLabel}
              tickerLabel={dyadEmotionInfo.tickerLabel}
              heightRatio={0.42}
              positioned={false}
              writingDirection={emotionInfoMobile ? 'horizontal' : 'vertical'}
            />
          ) : null}
        </div>
      ) : null}

      {/* レイヤー4 セグメント移動矢印 — 最前面。レンズと同じ座標系を再現する */}
      {explorationHudMode ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: telescopeEyepieceDiameter(aperture, eyepieceOverscan),
            height: telescopeEyepieceDiameter(aperture, eyepieceOverscan),
            transform: `translate(calc(-50% + ${eyepieceShiftX}), calc(-50% + ${eyepieceShiftY}))`,
            pointerEvents: 'none',
            zIndex: 10,
            transition: 'transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <style>{`
            @keyframes telescopeArrowHover {
              0%, 100% { transform: translateX(0); }
              50% { transform: translateX(var(--arrow-nudge, 4px)); }
            }
            @keyframes telescopeArrowPress {
              0% { transform: scale(1); }
              35% { transform: scale(1.32); }
              100% { transform: scale(1); }
            }
            @keyframes telescopeArrowPulse {
              from { transform: scale(0.6); opacity: 0.9; }
              to { transform: scale(2); opacity: 0; }
            }
            .telescope-seg-arrow:hover:not(:disabled) .telescope-seg-arrow-icon {
              animation: telescopeArrowHover 900ms ease-in-out infinite;
              filter: drop-shadow(0 0 10px currentColor);
            }
            .telescope-seg-arrow:hover:not(:disabled) {
              opacity: 1 !important;
            }
          `}</style>
          {([
            // 基準角30度（時計回り）から、カメラ回転に合わせて楕円軌道上を動く
            {
              direction: -1 as const,
              label: '前のセグメントへ',
              arrowIndex: 0,
              enabled: canMoveExplorationPrevious,
            },
            {
              direction: 1 as const,
              label: '次のセグメントへ',
              arrowIndex: 1,
              enabled: canMoveExplorationNext,
            },
          ] as const).map(({ direction, label, arrowIndex, enabled }) => (
            <button
              key={direction}
              ref={(el) => {
                explorationArrowRefs.current[arrowIndex] = el;
              }}
              type="button"
              className="telescope-seg-arrow"
              aria-label={label}
              title={label}
              disabled={!enabled || busy}
              onClick={() => {
                handleMoveExplorationSegment(direction);
                setExplorationArrowPulse({ direction, at: Date.now() });
              }}
              onPointerEnter={() => setTelescopePinHidden(true)}
              onPointerLeave={() => setTelescopePinHidden(false)}
              style={{
                position: 'absolute',
                ...explorationArrowBasePosition(arrowIndex),
                width: explorationArrowSize,
                height: explorationArrowSize,
                padding: 0,
                border: 0,
                background: 'transparent',
                color: explorationArrowColor,
                opacity: enabled && !busy ? 0.9 : 0.2,
                filter:
                  enabled && !busy
                    ? `drop-shadow(0 0 8px ${explorationArrowColor})`
                    : 'none',
                transform: 'translate(-50%, -50%)',
                // 矢印上ではカーソルを隠す（選択アニメーションが代わりの手応え）
                cursor: 'none',
                pointerEvents: 'auto',
                transition: 'opacity 180ms ease, filter 180ms ease',
                // ホバー時の左右方向への微動（矢印向きに合わせる）
                ['--arrow-nudge' as string]: direction < 0 ? '-5px' : '5px',
              }}
            >
              {explorationArrowPulse?.direction === direction ? (
                <span
                  key={explorationArrowPulse.at}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    border: `2px solid ${explorationArrowColor}`,
                    opacity: 0,
                    animation: 'telescopeArrowPulse 480ms ease-out',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}
              <svg
                key={
                  explorationArrowPulse?.direction === direction
                    ? explorationArrowPulse.at
                    : 'idle'
                }
                className="telescope-seg-arrow-icon"
                width="100%"
                height="100%"
                viewBox="0 0 58 58"
                aria-hidden
                style={{
                  transformOrigin: '50% 50%',
                  animation:
                    explorationArrowPulse?.direction === direction
                      ? 'telescopeArrowPress 320ms ease'
                      : undefined,
                }}
              >
                <polygon
                  points={
                    direction < 0 ? '38,11 16,29 38,47' : '20,11 42,29 20,47'
                  }
                  fill="currentColor"
                />
              </svg>
            </button>
          ))}
          {/* 矢印の指す感情ラベル — 下半分では上へ、上半分では下へ引き出す */}
          {explorationArrowTargets
            ? ([
                { arrowIndex: 0, enabled: canMoveExplorationPrevious },
                { arrowIndex: 1, enabled: canMoveExplorationNext },
              ] as const).map(({ arrowIndex, enabled }) => (
                <div
                  key={`arrow-label-${arrowIndex}`}
                  ref={(el) => {
                    explorationArrowLabelRefs.current[arrowIndex] = el;
                  }}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    ...explorationArrowBasePosition(arrowIndex),
                    width: 0,
                    height: 0,
                    pointerEvents: 'none',
                    opacity: enabled && !busy ? 0.88 : 0.18,
                    transition: 'opacity 180ms ease',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: -0.75,
                      width: 1.5,
                      height: explorationArrowLabelLine,
                      background: explorationArrowColor,
                      boxShadow: `0 0 5px ${explorationArrowColor}88`,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      whiteSpace: 'nowrap',
                      fontSize: emotionInfoMobile ? 12 : 15,
                      fontWeight: 600,
                      letterSpacing: '0.14em',
                      color: explorationArrowColor,
                      textShadow: '0 0 8px rgba(0, 0, 0, 0.7)',
                    }}
                  >
                    より{explorationArrowTargets[arrowIndex]}
                  </span>
                </div>
              ))
            : null}
        </div>
      ) : null}

      {settled === 'exploration' &&
      zoomPhase !== 'leaving-exploration' &&
      selectedExplorationPlot ? (
        <>
          <ExplorationGuideLine
            hud={explorationHudRef}
            panelRef={explorationPanelRef}
            color={selectedExploration?.color ?? '#f4ecf7'}
          />
          <style>{`
            @keyframes telescopeLandButtonGradient {
              from { background-position: 0% 50%; }
              to { background-position: 100% 50%; }
            }
            ${EXPLORATION_UI_TRANSITION_KEYFRAMES}
          `}</style>
          {emotionInfoMobile ? (
            <div
              style={{
                position: 'absolute',
                left: 10,
                right: 10,
                bottom: 14,
                zIndex: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                pointerEvents: 'none',
              }}
            >
              <div
                key={`land-${selectedExplorationPlot.word_id}-${segmentUiDirection ?? 'n'}`}
                style={{
                  pointerEvents: 'auto',
                  animation: explorationUiSlideAnimation(segmentUiDirection),
                }}
              >
                <Link
                  to={getEmotionWordPath(selectedExplorationPlot)}
                  style={{
                    display: 'inline-block',
                    padding: '10px 22px',
                    border: 'none',
                    borderRadius: 999,
                    color: '#f4ecf7',
                    textDecoration: 'none',
                    fontSize: '0.78rem',
                    letterSpacing: '0.16em',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    backgroundImage: landButtonGradient.image,
                    backgroundSize: '200% 100%',
                    backgroundRepeat: 'no-repeat',
                    animation:
                      'telescopeLandButtonGradient 9.5s linear infinite',
                    boxShadow: `0 10px 28px rgba(0, 0, 0, 0.35), 0 0 22px ${landButtonGradient.glow}55`,
                    textShadow: '0 1px 8px rgba(0, 0, 0, 0.55)',
                  }}
                >
                  この感情に降り立つ
                </Link>
              </div>
              <ExplorationWordInfoPanel
                key={`${selectedExplorationPlot.word_id}-${segmentUiDirection ?? 'n'}`}
                plot={selectedExplorationPlot}
                rightOffset={140}
                panelRef={explorationPanelRef}
                writingDirection="horizontal"
                embedded
                enterDirection={segmentUiDirection}
              />
            </div>
          ) : (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 3,
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'flex-end',
                paddingRight: 'max(140px, 9vw)',
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            >
              <div
                key={`land-${selectedExplorationPlot.word_id}-${segmentUiDirection ?? 'n'}`}
                style={{
                  position: 'absolute',
                  left: `calc(50% + ${eyepieceShiftX})`,
                  bottom: 0,
                  transition:
                    'left 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  pointerEvents: 'auto',
                  animation: explorationUiSlideAnimation(
                    segmentUiDirection,
                    true,
                  ),
                }}
              >
                <Link
                  to={getEmotionWordPath(selectedExplorationPlot)}
                  style={{
                    display: 'inline-block',
                    padding: '12px 26px',
                    border: 'none',
                    borderRadius: 999,
                    color: '#f4ecf7',
                    textDecoration: 'none',
                    fontSize: '0.88rem',
                    letterSpacing: '0.16em',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    backgroundImage: landButtonGradient.image,
                    backgroundSize: '200% 100%',
                    backgroundRepeat: 'no-repeat',
                    animation:
                      'telescopeLandButtonGradient 9.5s linear infinite',
                    boxShadow: `0 10px 28px rgba(0, 0, 0, 0.35), 0 0 22px ${landButtonGradient.glow}55`,
                    textShadow: '0 1px 8px rgba(0, 0, 0, 0.55)',
                  }}
                >
                  この感情に降り立つ
                </Link>
              </div>
              <ExplorationWordInfoPanel
                key={`${selectedExplorationPlot.word_id}-${segmentUiDirection ?? 'n'}`}
                plot={selectedExplorationPlot}
                rightOffset={140}
                panelRef={explorationPanelRef}
                writingDirection="vertical"
                embedded
                enterDirection={segmentUiDirection}
              />
            </div>
          )}
        </>
      ) : null}

      {emotionInfoMobile ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight:
              'calc(max(12px, env(safe-area-inset-top, 0px)) + 40px)',
            paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
            paddingBottom: 8,
            boxSizing: 'border-box',
            background:
              'linear-gradient(to bottom, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.28) 70%, rgba(0, 0, 0, 0) 100%)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <TelescopeZoomLadder
              current={settled}
              busy={busy}
              onRetreatTo={handleRetreatTo}
              orientation="horizontal"
              showEmotionLabels={false}
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: Math.round(210 * infoUiScale),
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: Math.round(58 * infoUiScale),
            boxSizing: 'border-box',
            background:
              'linear-gradient(to left, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.56) 38%, rgba(0, 0, 0, 0) 100%)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              transform: `scale(${infoUiScale})`,
              transformOrigin: 'center right',
              transition: 'transform 180ms ease',
            }}
          >
            <TelescopeZoomLadder
              current={settled}
              busy={busy}
              onRetreatTo={handleRetreatTo}
              selectedEmotion={selectedEmotion}
              selectedDetailEmotion={selectedDyad}
              selectedExplorationEmotion={selectedExploration}
              showEmotionLabels={false}
            />
          </div>
        </div>
      )}

    </div>
  );
}
