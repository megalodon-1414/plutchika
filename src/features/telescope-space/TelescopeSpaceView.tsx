import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import { getBasicEmotion, getEmotionById } from '../../data/emotions';
import { EmotionMinimap } from '../../components/EmotionMinimap';
import { ExplorationWordInfoPanel } from '../../components/ExplorationWordInfoPanel';
import { ROUTES } from '../../routes/paths';
import { fetchEmotionWordsAsPlots } from '../../services/emotionWords';
import type { UserPlotRow } from '../../types/userPlot';
import { getPrimaryEmotionColor } from '../../utils/emotionPlotBridge';
import {
  DEFAULT_EMOTION_UI_ACCENT,
  getEmotionUiTheme,
} from '../../utils/emotionUiTheme';
import type { MinimapSyncState } from '../../utils/emotionMinimapLayout';
import { mergeWithSeedPlots } from '../../utils/seedPlots';
import type { TelescopeSettledPhase, TelescopeZoomPhase } from './constants';
import { TelescopeEyepiece } from './TelescopeEyepiece';
import {
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
  groupPlotsByLayer3Segment,
  getLayer3SegmentIndexForPlot,
  LAYER3_SEGMENT_COUNT,
  pickRandomPlotIdInSegment,
} from './layer3Segments';
import { getTelescopeRegionDefinition } from './layer3Region';
import { createTelescopeExplorationHudState } from './layer4Exploration';
import { plotColorFromRow } from '../../utils/plotFromUserPlot';
import { TelescopeSpaceCanvas } from './TelescopeSpaceCanvas';
import { TelescopeZoomLadder, zoomLevelIndex } from './TelescopeZoomLadder';

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

function layerLabel(settled: TelescopeSettledPhase): string {
  switch (settled) {
    case 'far':
      return 'LAYER 00 · 遠景';
    case 'wide':
      return 'LAYER 01 · 銀河 8+24';
    case 'detail':
      return 'LAYER 02 · 感情語プロット';
    case 'region':
      return 'LAYER 03 · 感情領域';
    case 'exploration':
      return 'LAYER 04 · 感情点探索';
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
const EXPLORATION_ARROW_RX = 38;
/** 検知楕円と同じ扁平率（0.57）をかけた縦半径 */
const EXPLORATION_ARROW_RY = EXPLORATION_ARROW_RX * 0.57;
const EXPLORATION_ARROW_SIZE = 78;

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
  const [zoomPhase, setZoomPhase] = useState<TelescopeZoomPhase>('far');
  const [viewFocus, setViewFocus] = useState<TelescopeViewFocus>(EMPTY_FOCUS);
  const [focusBasicId, setFocusBasicId] = useState<BasicEmotionId | null>(null);
  const [selectedDyadId, setSelectedDyadId] = useState<EmotionId | null>(null);
  const [explorationPlotId, setExplorationPlotId] = useState<string | null>(
    null,
  );
  const [explorationSegmentIndex, setExplorationSegmentIndex] = useState<
    number | null
  >(null);
  const [explorationArrowPulse, setExplorationArrowPulse] = useState<{
    direction: -1 | 1;
    at: number;
  } | null>(null);
  const [minimapSync, setMinimapSync] = useState<MinimapSyncState | null>(null);
  const [wordPlots, setWordPlots] = useState<UserPlotRow[]>([]);
  const [infoUiScale, setInfoUiScale] = useState(getInfoUiScale);
  const [layer2HudActive, setLayer2HudActive] = useState(false);
  const retreatTargetRef = useRef<TelescopeSettledPhase | null>(null);
  const regionIndicatorRef = useRef(createTelescopeRegionIndicatorState());
  const segmentFocusRef = useRef(createTelescopeSegmentFocusState());
  const explorationHudRef = useRef(createTelescopeExplorationHudState());
  const explorationArrowRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  const busy = isBusyPhase(zoomPhase);
  const settled = settledFromPhase(zoomPhase);
  const layer = layerLabel(settled);
  const aperture = useMemo(() => apertureForPhase(zoomPhase), [zoomPhase]);
  const eyepieceOverscan = useMemo(
    () => eyepieceOverscanForPhase(zoomPhase),
    [zoomPhase],
  );
  const showHud = true;
  const showRimGlow = settled !== 'far';

  const minimapAccentId = (focusBasicId ?? viewFocus.nearest?.id ?? null) as EmotionId | null;
  const minimapUiTheme = useMemo(() => {
    const accent = minimapAccentId
      ? getPrimaryEmotionColor(minimapAccentId)
      : DEFAULT_EMOTION_UI_ACCENT;
    return getEmotionUiTheme(accent, 'dark');
  }, [minimapAccentId]);

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

  const handleMinimapSync = useCallback((state: MinimapSyncState | null) => {
    setMinimapSync(state);
  }, []);

  const detailHudMode = settled === 'detail' && layer2HudActive;
  const regionHudMode = settled === 'region';
  const explorationHudMode = settled === 'exploration';

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
        el.style.left = `${50 + EXPLORATION_ARROW_RX * Math.cos(theta)}%`;
        el.style.top = `${50 + EXPLORATION_ARROW_RY * Math.sin(theta)}%`;
        // 画面中心から矢印位置への見かけの方位をまっすぐ指す。
        // index 0（前へ）は三角形が左向きなので半回転補正する。
        const apparent = Math.atan2(
          EXPLORATION_ARROW_RY * Math.sin(theta),
          EXPLORATION_ARROW_RX * Math.cos(theta),
        );
        const pointing = index === 0 ? apparent + Math.PI : apparent;
        el.style.transform = `translate(-50%, -50%) rotate(${pointing}rad)`;
      }
      frame = requestAnimationFrame(sync);
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [explorationHudMode]);
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
  const explorationPlotsBySegment = useMemo(() => {
    if (!selectedDyadId) {
      return new Map<number, string[]>();
    }
    const region = getTelescopeRegionDefinition(selectedDyadId, focusBasicId);
    if (!region) {
      return new Map<number, string[]>();
    }
    const allowedPrimary = new Set<string>([
      selectedDyadId,
      region.start.id,
      region.end.id,
    ]);
    return groupPlotsByLayer3Segment(
      region,
      wordPlots.filter((plot) => allowedPrimary.has(plot.primaryId)),
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
        rimGlowColor={selectedEmotion?.color}
        innerOverlay={
          <>
            <TelescopeInnerTrackLabel
              focus={viewFocus}
              visible={showHud}
              detailMode={detailHudMode}
              regionMode={regionHudMode || explorationHudMode}
              selectedEmotion={selectedEmotion}
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
            {explorationHudMode ? (
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
            ) : null}
            {explorationHudMode ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                }}
              >
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
                    style={{
                      position: 'absolute',
                      ...explorationArrowBasePosition(arrowIndex),
                      width: EXPLORATION_ARROW_SIZE,
                      height: EXPLORATION_ARROW_SIZE,
                      padding: 0,
                      border: 0,
                      background: 'transparent',
                      color: selectedDyad?.color ?? '#f4ecf7',
                      opacity: enabled && !busy ? 0.9 : 0.2,
                      filter:
                        enabled && !busy
                          ? `drop-shadow(0 0 8px ${selectedDyad?.color ?? '#ffffff'})`
                          : 'none',
                      transform: 'translate(-50%, -50%)',
                      // 矢印上ではカーソルを隠す（選択アニメーションが代わりの手応え）
                      cursor: 'none',
                      pointerEvents: 'auto',
                      transition: 'opacity 180ms ease, filter 180ms ease',
                      // ホバー時の左右方向への微動（矢印向きに合わせる）
                      ['--arrow-nudge' as string]:
                        direction < 0 ? '-5px' : '5px',
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
                          border: `2px solid ${selectedDyad?.color ?? '#f4ecf7'}`,
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
                          direction < 0
                            ? '38,11 16,29 38,47'
                            : '20,11 42,29 20,47'
                        }
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                ))}
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
          viewFocus={viewFocus}
          onZoomComplete={handleZoomComplete}
          onCanvasClickZoom={handleCanvasClickZoom}
          onLayer2RotationComplete={() => setLayer2HudActive(true)}
          onViewFocus={handleViewFocus}
          onMinimapSync={handleMinimapSync}
          regionIndicator={regionIndicatorRef}
          segmentFocus={segmentFocusRef}
          explorationPlotId={explorationPlotId}
          explorationSegmentIndex={explorationSegmentIndex}
          explorationHud={explorationHudRef}
          onSelectExplorationPlot={handleSelectExplorationPlot}
        />
      </TelescopeEyepiece>

      {zoomPhase === 'exploration' && selectedExplorationPlot ? (
        <ExplorationWordInfoPanel
          key={selectedExplorationPlot.word_id}
          plot={selectedExplorationPlot}
          rightOffset={210}
        />
      ) : null}

      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: Math.round(180 * infoUiScale),
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: Math.round(28 * infoUiScale),
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
          />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: Math.round(20 * infoUiScale),
          left: Math.round(20 * infoUiScale),
          zIndex: 2,
          pointerEvents: 'none',
          transform: `scale(${infoUiScale})`,
          transformOrigin: 'top left',
          transition: 'transform 180ms ease',
        }}
      >
        <EmotionMinimap syncState={minimapSync} uiTheme={minimapUiTheme} layout="galaxy-ring" />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 2,
          display: 'flex',
          gap: 10,
          pointerEvents: 'auto',
        }}
      >
          <Link
            to={ROUTES.home}
            style={{
              padding: '8px 12px',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 8,
              color: '#f4ecf7',
              textDecoration: 'none',
              fontSize: '0.78rem',
              letterSpacing: '0.06em',
              background: 'rgba(8,10,18,0.45)',
              backdropFilter: 'blur(8px)',
            }}
          >
            ホーム
          </Link>
          <Link
            to={ROUTES.emotionMap}
            style={{
              padding: '8px 12px',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 8,
              color: '#f4ecf7',
              textDecoration: 'none',
              fontSize: '0.78rem',
              letterSpacing: '0.06em',
              background: 'rgba(8,10,18,0.45)',
              backdropFilter: 'blur(8px)',
            }}
          >
            既存MAP
          </Link>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 28,
          transform: 'translateX(-50%)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.72rem',
            letterSpacing: '0.12em',
            opacity: 0.5,
            textAlign: 'center',
          }}
        >
          {busy ? '調整中…' : layer}
          {!busy && (settled === 'far' || settled === 'wide')
            ? '  ·  円内クリックで近づく / 右の点で戻る'
            : null}
          {!busy && settled === 'detail' ? '  ·  右の点で戻る / ドラッグで見回す' : null}
          {!busy && settled === 'region'
            ? '  ·  ハイライト区画をクリックで探索へ / ドラッグで移動 / 右の点で戻る'
            : null}
          {!busy && settled === 'exploration'
            ? '  ·  近い感情点をクリックして移動 / 右の点で戻る'
            : null}
        </p>
      </div>
    </div>
  );
}
