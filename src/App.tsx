import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SpaceCanvas } from './components/SpaceCanvas';
import { EmotionMinimap, MAP_WIDTH } from './components/EmotionMinimap';
import { ExplorationToolsPanel } from './components/ExplorationToolsPanel';
import { SearchGameHud } from './components/SearchGameHud';
import { WordEditor } from './components/WordEditor';
import { usePlotSubmit } from './hooks/usePlotSubmit';
import { fetchEmotionWordsAsPlots } from './services/emotionWords';
import type { UserPlotRow } from './types/userPlot';
import {
  removePlotById,
  replacePlotId,
  updatePlot,
} from './utils/plotHelpers';
import { isExplorationDummyPlot, mergeExplorationDummyPlots } from './utils/explorationDummyPlots';
import { canMoveWithinEmotionSystem, isPureEmotionPlot } from './utils/plotFromUserPlot';
import {
  ensureEmotionSystemLandings,
  findPlotByKey,
  getPlotKey,
} from './utils/plotIdentity';
import { EMOTION_INTENSITY_MAX } from './utils/emotionPlotBridge';
import { type AppBackgroundTheme } from './utils/appBackgroundTheme';
import { FLOW_LABEL_DURATION_MS, type PlotLabelDisplayMode } from './utils/plotLabelStyle';
import { getExplorationInfoUiLayout } from './utils/explorationInfoUiLayout';
import type { MinimapSyncState } from './utils/emotionMinimapLayout';
import { getPrimaryEmotionColor } from './utils/emotionPlotBridge';
import { DEFAULT_EMOTION_UI_ACCENT, getEmotionUiTheme } from './utils/emotionUiTheme';
import { resolvePrimaryEmotionLabel } from './utils/emotionCoordinates';
import { filterPlotsByTags, getPlotKindLabel, type PlotTagId } from './utils/plotTags';
import { mergeWithSeedPlots } from './utils/seedPlots';
import type { BasicEmotionId, EmotionId } from './data/emotions';
import { getBasicEmotion } from './data/emotions';
import {
  SEARCH_GAME_MIN_REFERENCE_HOPS,
  SEARCH_GAME_UNREACHABLE_DISTANCE,
  buildWarpGateAdjacency,
  pickSearchGameTargetId,
  proximityRatio,
  proximityTrend,
  warpJourneyDistance,
} from './utils/searchGame';

const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease, box-shadow 320ms ease';

function pickPreferredPlotId(plots: UserPlotRow[]): string | null {
  const registered = plots.filter((plot) => !isExplorationDummyPlot(plot.word_id));
  const pool = registered.length > 0 ? registered : plots;
  const plot = pool[Math.floor(Math.random() * pool.length)];
  return plot ? getPlotKey(plot) : null;
}

function App() {
  const mainRef = useRef<HTMLElement>(null);
  const [plots, setPlots] = useState<UserPlotRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedScreenPoint, setSelectedScreenPoint] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [hoveredWordId, setHoveredWordId] = useState<string | null>(null);
  const [flowLabelExpiresAt, setFlowLabelExpiresAt] = useState<Record<string, number>>({});
  const [flowLabelNow, setFlowLabelNow] = useState(() => Date.now());
  const [hoveredWarpGateLabel, setHoveredWarpGateLabel] = useState<string | null>(null);
  const [hoveredScreenPoint, setHoveredScreenPoint] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [mainSize, setMainSize] = useState({ width: 0, height: 0 });
  const [infoPanelWordId, setInfoPanelWordId] = useState<string | null>(null);
  const [isInfoPanelVisible, setIsInfoPanelVisible] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const [plotLabelDisplayMode, setPlotLabelDisplayMode] = useState<PlotLabelDisplayMode>('flow');
  const [backgroundTheme, setBackgroundTheme] = useState<AppBackgroundTheme>('dark');
  const [minimapSync, setMinimapSync] = useState<MinimapSyncState | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<PlotTagId>>(() => new Set());
  const [isExplorationMode] = useState(true);
  /** 基本8 → 合成感情の階層ブラウズ（既存探索 UI は残しつつ一旦こちらを正面に） */
  const [hierarchyBrowseMode] = useState(true);
  const [hierarchyFrontBasicId, setHierarchyFrontBasicId] = useState<BasicEmotionId>('fear');
  const [hierarchyConfirmedBasicId, setHierarchyConfirmedBasicId] = useState<BasicEmotionId | null>(null);
  const [spaceOverview, setSpaceOverview] = useState(false);
  const [spaceOverviewFocusId, setSpaceOverviewFocusId] = useState<EmotionId | null>(null);
  const [overviewHoveredEmotionId, setOverviewHoveredEmotionId] = useState<EmotionId | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchGameTargetId, setSearchGameTargetId] = useState<string | null>(null);
  const [searchGamePreviousDistance, setSearchGamePreviousDistance] = useState<number | null>(null);
  const [searchGameReferenceDistance, setSearchGameReferenceDistance] = useState(SEARCH_GAME_MIN_REFERENCE_HOPS);
  const [panelMorph, setPanelMorph] = useState<{
    word: string;
    ruby: string;
    meaning: string;
    usage: string;
    primaryLabel: string;
    secondaryLabel: string;
    intensity: number;
    kindLabel: string;
    left: number;
    top: number;
    width: number;
    height: number;
    phase: 'start' | 'move' | 'expand' | 'details';
  } | null>(null);
  const searchGameLastMeasureRef = useRef<{ wordId: string | null; distance: number | null }>({
    wordId: null,
    distance: null,
  });
  const nextWordPanelRef = useRef<HTMLDivElement>(null);
  const skipInfoPanelFadeRef = useRef(false);
  const { plotStatus } = usePlotSubmit();

  const togglePlotLabelDisplayMode = useCallback(() => {
    setPlotLabelDisplayMode((mode) => (mode === 'flow' ? 'nearby' : 'flow'));
  }, []);

  const toggleBackgroundTheme = useCallback(() => {
    setBackgroundTheme((theme) => (theme === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'l') {
        event.preventDefault();
        togglePlotLabelDisplayMode();
        return;
      }
      if (key === 'b') {
        event.preventDefault();
        toggleBackgroundTheme();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleBackgroundTheme, togglePlotLabelDisplayMode]);

  const loadPlots = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchEmotionWordsAsPlots();
      if (data.length === 0) {
        console.warn('[emotion_words] fetched 0 rows; falling back to local seeds');
      } else {
        console.info(`[emotion_words] loaded ${data.length} words from Supabase`);
      }
      setPlots(mergeWithSeedPlots(data));
      setSelectedId((prev) => {
        if (prev && findPlotByKey(data, prev)) return prev;
        return pickPreferredPlotId(data);
      });
    } catch (error) {
      console.error('Supabase load failed:', error);
      setLoadError(error instanceof Error ? error.message : 'データの読み込みに失敗しました');
      setPlots([]);
      setSelectedId(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlots();
  }, [loadPlots]);

  useEffect(() => {
    const element = mainRef.current;
    if (!element) return;

    const updateSize = () => {
      setMainSize({ width: element.clientWidth, height: element.clientHeight });
    };
    const observer = new ResizeObserver(updateSize);
    updateSize();
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const hasEmotionWords = useMemo(
    () => plots.some((plot) => plot.sourceId != null),
    [plots],
  );

  const displayPlots = useMemo(() => {
    const merged = mergeExplorationDummyPlots(plots, isExplorationMode && !hasEmotionWords);
    return isExplorationMode ? ensureEmotionSystemLandings(merged) : merged;
  }, [plots, isExplorationMode, hasEmotionWords]);

  const visiblePlots = useMemo(
    () => filterPlotsByTags(displayPlots, selectedTagIds),
    [displayPlots, selectedTagIds],
  );

  useEffect(() => {
    if (selectedId) return;
    if (!isExplorationMode && plots[0]) {
      setSelectedId(getPlotKey(plots[0]));
    }
  }, [plots, selectedId, isExplorationMode]);

  useEffect(() => {
    if (!isExplorationMode || isLoading) return;
    if (displayPlots.length === 0) return;

    setSelectedId((prev) => {
      if (prev && findPlotByKey(displayPlots, prev)) {
        return prev;
      }
      return pickPreferredPlotId(displayPlots);
    });
  }, [isExplorationMode, isLoading, displayPlots]);

  const infoPanelPlot = useMemo(
    () => findPlotByKey(displayPlots, infoPanelWordId),
    [displayPlots, infoPanelWordId],
  );

  const selectedPlot = useMemo(
    () => findPlotByKey(displayPlots, selectedId),
    [displayPlots, selectedId],
  );

  const emotionUiTheme = useMemo(() => {
    const overviewAccentId = overviewHoveredEmotionId ?? (spaceOverview ? spaceOverviewFocusId : null);
    const accent = overviewAccentId
      ? getPrimaryEmotionColor(overviewAccentId)
      : selectedPlot
        ? getPrimaryEmotionColor(selectedPlot.primaryId)
        : DEFAULT_EMOTION_UI_ACCENT;
    return getEmotionUiTheme(accent, backgroundTheme);
  }, [
    selectedPlot,
    backgroundTheme,
    spaceOverview,
    spaceOverviewFocusId,
    overviewHoveredEmotionId,
  ]);

  const hoveredPlot = useMemo(
    () =>
      !hoveredWarpGateLabel && hoveredWordId && hoveredWordId !== selectedId
        ? findPlotByKey(displayPlots, hoveredWordId)
        : null,
    [displayPlots, hoveredWarpGateLabel, hoveredWordId, selectedId],
  );
  const nextWordLabel = hoveredWarpGateLabel ?? hoveredPlot?.word_id ?? '';

  useEffect(() => {
    if (!isExplorationMode || !selectedId) {
      setIsInfoPanelVisible(false);
      return;
    }

    if (infoPanelWordId === selectedId) {
      setIsInfoPanelVisible(true);
      return;
    }

    if (!infoPanelWordId) {
      setInfoPanelWordId(selectedId);
      setIsInfoPanelVisible(true);
      return;
    }

    if (skipInfoPanelFadeRef.current) {
      skipInfoPanelFadeRef.current = false;
      setInfoPanelWordId(selectedId);
      setIsInfoPanelVisible(false);
      return;
    }

    setIsInfoPanelVisible(false);
    const timeoutId = window.setTimeout(() => {
      setInfoPanelWordId(selectedId);
      setIsInfoPanelVisible(true);
    }, 130);

    return () => window.clearTimeout(timeoutId);
  }, [infoPanelWordId, isExplorationMode, selectedId]);

  const handlePlotChange = (updated: UserPlotRow, previousId?: string) => {
    if (isExplorationDummyPlot(updated.word_id)) {
      return;
    }
    if (previousId && previousId !== updated.word_id) {
      setPlots((prev) => replacePlotId(prev, previousId, updated));
      setSelectedId(getPlotKey(updated));
      return;
    }

    setPlots((prev) => updatePlot(prev, updated));
  };

  const handlePlotAdd = (plot: UserPlotRow) => {
    setPlots((prev) => [...prev, plot]);
  };

  const handleWordSelect = (id: string, options?: { viaWarp?: boolean; viaSearch?: boolean }) => {
    const next = findPlotByKey(displayPlots, id);
    if (!next) {
      return;
    }

    const bypassMovementRules = Boolean(options?.viaWarp || options?.viaSearch);
    if (isExplorationMode && !bypassMovementRules && selectedId) {
      const current = findPlotByKey(displayPlots, selectedId);
      if (current) {
        // 星系間の移動はワープゲート経由のみ
        if (current.primaryId !== next.primaryId) {
          return;
        }
        // 混合感情からは純感情か同じ副感情へしか歩けない
        if (!canMoveWithinEmotionSystem(current, next)) {
          return;
        }
      }
    }

    const nextKey = getPlotKey(next);
    const isFromNextWord =
      !hoveredWarpGateLabel
      && Boolean(hoveredWordId)
      && (hoveredWordId === id || hoveredWordId === nextKey || next.word_id === nextWordLabel);

    if (isFromNextWord && mainRef.current && nextWordPanelRef.current) {
      const mainRect = mainRef.current.getBoundingClientRect();
      const fromRect = nextWordPanelRef.current.getBoundingClientRect();
      skipInfoPanelFadeRef.current = true;
      setPanelMorph({
        word: next.word_id,
        ruby: next.ruby?.trim() ?? '',
        meaning: next.meaning?.trim()
          || 'この単語の意味データはまだ登録されていません。',
        usage: next.usageExample?.trim() ?? '',
        primaryLabel: resolvePrimaryEmotionLabel(next.primaryId, next.primaryLabel),
        secondaryLabel: resolvePrimaryEmotionLabel(next.secondaryId, next.secondaryLabel),
        intensity: next.intensity,
        kindLabel: getPlotKindLabel(next),
        left: fromRect.left - mainRect.left,
        top: fromRect.top - mainRect.top,
        width: fromRect.width,
        height: fromRect.height,
        phase: 'start',
      });
    }

    setSelectedId(nextKey);
    if (!isExplorationMode && !isExplorationDummyPlot(next.word_id)) {
      setIsEditorOpen(true);
    }
  };

  const handleToggleTag = useCallback((tagId: PlotTagId) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const beginSearchGameRound = useCallback((plotsForGame: UserPlotRow[], excludeId?: string | null) => {
    const targetId = pickSearchGameTargetId(plotsForGame, excludeId);
    if (!targetId) {
      return;
    }

    const current = excludeId
      ? findPlotByKey(plotsForGame, excludeId)
      : null;
    const target = findPlotByKey(plotsForGame, targetId);
    const adjacency = buildWarpGateAdjacency(plotsForGame);
    const initialDistance = current && target
      ? warpJourneyDistance(plotsForGame, current, target, adjacency)
      : SEARCH_GAME_MIN_REFERENCE_HOPS;

    setSearchGameTargetId(targetId);
    setSearchGamePreviousDistance(null);
    setSearchGameReferenceDistance(
      Math.max(
        SEARCH_GAME_MIN_REFERENCE_HOPS,
        initialDistance >= SEARCH_GAME_UNREACHABLE_DISTANCE ? SEARCH_GAME_MIN_REFERENCE_HOPS : initialDistance,
      ),
    );
    searchGameLastMeasureRef.current = { wordId: null, distance: null };
  }, []);

  const handleStartSearchGame = useCallback(() => {
    beginSearchGameRound(visiblePlots, selectedId);
  }, [beginSearchGameRound, selectedId, visiblePlots]);

  const handleQuitSearchGame = useCallback(() => {
    setSearchGameTargetId(null);
    setSearchGamePreviousDistance(null);
    setSearchGameReferenceDistance(SEARCH_GAME_MIN_REFERENCE_HOPS);
    searchGameLastMeasureRef.current = { wordId: null, distance: null };
  }, []);

  const handleNextSearchGameRound = useCallback(() => {
    beginSearchGameRound(visiblePlots, selectedId);
  }, [beginSearchGameRound, selectedId, visiblePlots]);

  const searchGameTargetPlot = useMemo(
    () => (searchGameTargetId
      ? findPlotByKey(visiblePlots, searchGameTargetId)
      : null),
    [searchGameTargetId, visiblePlots],
  );

  const searchGameWarpAdjacency = useMemo(
    () => buildWarpGateAdjacency(visiblePlots),
    [visiblePlots],
  );

  const searchGameDistance = useMemo(() => {
    if (!selectedPlot || !searchGameTargetPlot) {
      return null;
    }
    return warpJourneyDistance(
      visiblePlots,
      selectedPlot,
      searchGameTargetPlot,
      searchGameWarpAdjacency,
    );
  }, [searchGameTargetPlot, searchGameWarpAdjacency, selectedPlot, visiblePlots]);

  const searchGameFound = Boolean(
    searchGameTargetId && selectedId && searchGameTargetId === selectedId,
  );

  useEffect(() => {
    if (searchGameDistance == null || !selectedId || searchGameFound) {
      return;
    }

    if (searchGameLastMeasureRef.current.wordId !== selectedId) {
      setSearchGamePreviousDistance(searchGameLastMeasureRef.current.distance);
      searchGameLastMeasureRef.current = {
        wordId: selectedId,
        distance: searchGameDistance,
      };
    }
  }, [searchGameDistance, searchGameFound, selectedId]);

  // お題がフィルタ等で消えたらゲーム終了
  useEffect(() => {
    if (!searchGameTargetId) {
      return;
    }
    if (!findPlotByKey(visiblePlots, searchGameTargetId)) {
      handleQuitSearchGame();
    }
  }, [handleQuitSearchGame, searchGameTargetId, visiblePlots]);

  const handlePlotDelete = (id: string) => {
    const plot = findPlotByKey(plots, id);
    if (!plot || isExplorationDummyPlot(plot.word_id)) {
      return;
    }
    setPlots((prev) => removePlotById(prev, plot.word_id));
    setSelectedId((prev) => (prev === id || prev === getPlotKey(plot) ? null : prev));
  };

  const handleSelectedScreenPosition = useCallback(
    (point: { x: number; y: number; visible: boolean } | null) => {
      setSelectedScreenPoint(point);
    },
    [],
  );

  const handleHoveredScreenPosition = useCallback(
    (point: { x: number; y: number; visible: boolean } | null) => {
      setHoveredScreenPoint(point);
    },
    [],
  );

  const handleMinimapSync = useCallback((state: MinimapSyncState | null) => {
    setMinimapSync(state);
  }, []);

  const handleToggleSpaceOverview = useCallback(() => {
    setSpaceOverview((prev) => {
      if (prev) {
        setSpaceOverviewFocusId(null);
        setOverviewHoveredEmotionId(null);
        return false;
      }
      setSpaceOverviewFocusId(selectedPlot?.primaryId ?? null);
      setOverviewHoveredEmotionId(null);
      return true;
    });
  }, [selectedPlot?.primaryId]);

  const handleSelectEmotionSystem = useCallback((emotionId: EmotionId) => {
    const landing =
      displayPlots.find((plot) => plot.primaryId === emotionId && isPureEmotionPlot(plot))
      ?? displayPlots.find((plot) => plot.primaryId === emotionId);
    if (landing) {
      handleWordSelect(getPlotKey(landing), { viaSearch: true });
    }
    setSpaceOverviewFocusId(null);
    setOverviewHoveredEmotionId(null);
    setSpaceOverview(false);
  }, [displayPlots]);

  const handleOverviewHoverEmotion = useCallback((emotionId: EmotionId | null) => {
    setOverviewHoveredEmotionId(emotionId);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setFlowLabelNow(Date.now());
    }, 100);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleHoveredWordChange = useCallback((wordId: string | null) => {
    setHoveredWordId(wordId);
    if (wordId) {
      setHoveredWarpGateLabel(null);
      setFlowLabelExpiresAt((prev) => ({
        ...prev,
        [wordId]: Date.now() + FLOW_LABEL_DURATION_MS,
      }));
    }
  }, [FLOW_LABEL_DURATION_MS]);

  const handleHoveredWarpGateChange = useCallback((label: string | null) => {
    setHoveredWarpGateLabel(label);
    if (label) {
      setHoveredWordId(null);
    }
  }, []);

  const showInfoGuideLine =
    isExplorationMode &&
    !hierarchyBrowseMode &&
    !spaceOverview &&
    isInfoPanelVisible &&
    infoPanelPlot &&
    selectedScreenPoint &&
    mainSize.width > 0 &&
    mainSize.height > 0;
  const nextWordLabelLength = Array.from(nextWordLabel).length;
  const infoUi = useMemo(
    () => getExplorationInfoUiLayout(mainSize.width, mainSize.height, nextWordLabelLength),
    [mainSize.width, mainSize.height, nextWordLabelLength],
  );
  const { nextWordPanel, currentWordPanel, uiGroupRightMargin, panelGap } = infoUi;
  const meaningText =
    infoPanelPlot?.meaning?.trim() ||
    'この単語の意味データはまだ登録されていません。';
  const meaningLayout = useMemo(() => {
    const rem = Number.parseFloat(currentWordPanel.bodyFontSize);
    const fontPx = (Number.isFinite(rem) ? rem : 1) * 16;
    const charAdvance = fontPx * 1.9;
    const charsPerColumn = Math.max(
      1,
      Math.floor(currentWordPanel.bodyMaxHeight / charAdvance),
    );
    const columns = Math.max(1, Math.ceil(Array.from(meaningText).length / charsPerColumn));
    return {
      columns,
      width: Math.ceil(columns * fontPx * 1.15),
    };
  }, [meaningText, currentWordPanel.bodyFontSize, currentWordPanel.bodyMaxHeight]);
  const meaningUsageGap =
    meaningLayout.columns <= 1
      ? Math.max(8, Math.round(currentWordPanel.innerGap * 0.65))
      : currentWordPanel.bodyTextGap;

  const currentWordAsideRef = useRef<HTMLElement>(null);
  const [measuredCurrentWordWidth, setMeasuredCurrentWordWidth] = useState(currentWordPanel.width);

  useLayoutEffect(() => {
    const el = currentWordAsideRef.current;
    if (!el) {
      setMeasuredCurrentWordWidth(currentWordPanel.width);
      return;
    }
    const syncWidth = () => {
      setMeasuredCurrentWordWidth(Math.max(currentWordPanel.width, el.offsetWidth));
    };
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    currentWordPanel.width,
    infoPanelPlot,
    meaningText,
    meaningLayout.width,
    isInfoPanelVisible,
  ]);

  const nextWordPanelLeft = Math.max(
    0,
    mainSize.width - uiGroupRightMargin - measuredCurrentWordWidth - panelGap - nextWordPanel.width,
  );
  const currentWordPanelLeft = Math.max(
    0,
    mainSize.width - uiGroupRightMargin - measuredCurrentWordWidth,
  );
  // Next→Current の移動先: 「現在の語」ラベル込みの語カラムぶん（右端基準）
  const morphWordStageWidth = Math.max(
    nextWordPanel.width,
    currentWordPanel.paddingX * 2
      + currentWordPanel.wordColumnWidth
      + currentWordPanel.innerGap
      + Math.round(currentWordPanel.wordColumnWidth * 0.7)
      + currentWordPanel.paddingLeft
      + 4,
  );
  const morphWordStageHeight = Math.max(
    nextWordPanel.expandedHeight,
    currentWordPanel.paddingY * 2
      + currentWordPanel.tickerHeight
      + currentWordPanel.innerGap * 3
      + Math.round(Number.parseFloat(currentWordPanel.wordFontSize) * 16 * 4.2),
  );
  const morphWordStageLeft = Math.max(
    0,
    mainSize.width - uiGroupRightMargin - morphWordStageWidth,
  );

  const finishPanelMorph = useCallback(() => {
    setPanelMorph(null);
    setIsInfoPanelVisible(true);
  }, []);

  useLayoutEffect(() => {
    if (!panelMorph || panelMorph.phase !== 'start') {
      return;
    }

    let frame2 = 0;
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        // 1. 移動しながらフォント拡大。「現在の語」表示込みの位置へ一気に寄せる
        setPanelMorph((prev) =>
          prev
            ? {
                ...prev,
                phase: 'move',
                left: morphWordStageLeft,
                top: currentWordPanel.y,
                width: morphWordStageWidth,
                height: morphWordStageHeight,
              }
            : null,
        );
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [
    panelMorph,
    morphWordStageLeft,
    morphWordStageWidth,
    morphWordStageHeight,
    currentWordPanel.y,
  ]);

  useEffect(() => {
    if (!panelMorph) {
      return;
    }

    if (panelMorph.phase === 'move') {
      const timeoutId = window.setTimeout(() => {
        const toWidth = Math.max(currentWordPanel.width, measuredCurrentWordWidth || currentWordPanel.width);
        setPanelMorph((prev) =>
          prev
            ? {
                ...prev,
                phase: 'expand',
                left: Math.max(0, mainSize.width - uiGroupRightMargin - toWidth),
                width: toWidth,
                height: Math.max(currentWordPanel.height, currentWordPanel.innerMinHeight),
              }
            : null,
        );
      }, 420);
      return () => window.clearTimeout(timeoutId);
    }

    if (panelMorph.phase === 'expand') {
      const timeoutId = window.setTimeout(() => {
        setPanelMorph((prev) => (prev ? { ...prev, phase: 'details' } : null));
      }, 460);
      return () => window.clearTimeout(timeoutId);
    }

    if (panelMorph.phase === 'details') {
      const timeoutId = window.setTimeout(() => {
        finishPanelMorph();
      }, 420);
      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [
    panelMorph,
    currentWordPanel.width,
    currentWordPanel.height,
    currentWordPanel.innerMinHeight,
    measuredCurrentWordWidth,
    mainSize.width,
    uiGroupRightMargin,
    finishPanelMorph,
  ]);

  const showHoverGuide =
    isExplorationMode &&
    !hierarchyBrowseMode &&
    !spaceOverview &&
    isInfoPanelVisible &&
    nextWordLabel &&
    hoveredScreenPoint &&
    mainSize.width > 0 &&
    mainSize.height > 0;

  const morphAtCurrent = Boolean(
    panelMorph
      && (panelMorph.phase === 'move'
        || panelMorph.phase === 'expand'
        || panelMorph.phase === 'details'),
  );
  const showMorphRuby = Boolean(
    panelMorph && (panelMorph.phase === 'expand' || panelMorph.phase === 'details'),
  );
  const showMorphDetails = Boolean(panelMorph && panelMorph.phase === 'details');
  const morphMoveEasing = '400ms cubic-bezier(0.22, 1, 0.36, 1)';
  const morphBoxTransition = panelMorph?.phase === 'move'
    ? `left ${morphMoveEasing}, top ${morphMoveEasing}, width ${morphMoveEasing}, height ${morphMoveEasing}`
    : panelMorph?.phase === 'expand'
      ? 'left 440ms cubic-bezier(0.22, 1, 0.36, 1), width 440ms cubic-bezier(0.22, 1, 0.36, 1), height 440ms cubic-bezier(0.22, 1, 0.36, 1)'
      : 'none';
  const morphFontTransition = panelMorph?.phase === 'move' || panelMorph?.phase === 'expand'
    ? `font-size ${morphMoveEasing}`
    : 'none';


  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', color: emotionUiTheme.uiText, backgroundColor: emotionUiTheme.shell, overflow: 'hidden', transition: UI_COLOR_TRANSITION }}>
      <style>
        {`
          @keyframes nextWordArrowPulse {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(-4px); }
          }
          @keyframes nextWordTicker {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-120%); }
          }
          @keyframes currentWordArrowPulse {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(-4px); }
          }
        `}
      </style>
      <main ref={mainRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loadError && (
          <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 2, padding: '10px 16px', backgroundColor: 'rgba(255,0,85,0.15)', border: '1px solid #ff0055', borderRadius: '8px', fontSize: '0.9rem' }}>
            {loadError}
          </div>
        )}

        <SpaceCanvas
          plots={isExplorationMode ? displayPlots : visiblePlots}
          warpDestinationPlots={displayPlots}
          selectedId={selectedId}
          explorationMode={isExplorationMode}
          spaceOverview={spaceOverview}
          spaceOverviewFocusId={spaceOverviewFocusId}
          hierarchyBrowse={hierarchyBrowseMode}
          hierarchyFrontBasicId={hierarchyFrontBasicId}
          hierarchyConfirmedBasicId={hierarchyConfirmedBasicId}
          onHierarchyFrontBasicChange={(id) => {
            setHierarchyFrontBasicId(id);
            if (hierarchyConfirmedBasicId && hierarchyConfirmedBasicId !== id) {
              setHierarchyConfirmedBasicId(null);
            }
          }}
          flowLabelExpiresAt={flowLabelExpiresAt}
          flowLabelNow={flowLabelNow}
          plotLabelDisplayMode={plotLabelDisplayMode}
          backgroundTheme={backgroundTheme}
          emotionUiTheme={emotionUiTheme}
          onSelectedScreenPosition={handleSelectedScreenPosition}
          onHoveredWordChange={handleHoveredWordChange}
          onHoveredWarpGateChange={handleHoveredWarpGateChange}
          onHoveredScreenPosition={handleHoveredScreenPosition}
          onMinimapSync={handleMinimapSync}
          onWordSelect={handleWordSelect}
          onSelectEmotionSystem={handleSelectEmotionSystem}
          onOverviewHoverEmotion={handleOverviewHoverEmotion}
        />

        {hierarchyBrowseMode && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: '28px',
              transform: 'translateX(-50%)',
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: `1px solid ${emotionUiTheme.accentBorder}`,
                backgroundColor: emotionUiTheme.panelBackground,
                color: emotionUiTheme.textPrimary,
                fontSize: '0.84rem',
                letterSpacing: '0.06em',
                backdropFilter: 'blur(12px)',
                transition: UI_COLOR_TRANSITION,
                textAlign: 'center',
              }}
            >
              {hierarchyConfirmedBasicId
                ? `${getBasicEmotion(hierarchyConfirmedBasicId).label} の合成感情 · 押すと手前へ`
                : `手前: ${getBasicEmotion(hierarchyFrontBasicId).label} · ほかを押すと回転`}
            </div>
            <div style={{ display: 'flex', gap: '10px', pointerEvents: 'auto' }}>
              {hierarchyConfirmedBasicId ? (
                <button
                  type="button"
                  onClick={() => setHierarchyConfirmedBasicId(null)}
                  style={{
                    padding: '12px 22px',
                    borderRadius: '999px',
                    border: `1px solid ${emotionUiTheme.controlBorder}`,
                    backgroundColor: emotionUiTheme.controlBackground,
                    color: emotionUiTheme.controlText,
                    fontSize: '0.9rem',
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                    transition: UI_COLOR_TRANSITION,
                  }}
                >
                  戻る
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setHierarchyConfirmedBasicId(hierarchyFrontBasicId)}
                  style={{
                    padding: '12px 28px',
                    borderRadius: '999px',
                    border: `1px solid ${emotionUiTheme.accentBorderStrong}`,
                    backgroundColor: emotionUiTheme.panelBackground,
                    color: emotionUiTheme.textPrimary,
                    fontSize: '0.95rem',
                    letterSpacing: '0.14em',
                    fontWeight: 700,
                    cursor: 'pointer',
                    backdropFilter: 'blur(10px)',
                    boxShadow: `0 0 0 1px ${emotionUiTheme.accentBorder}, 0 8px 24px rgba(0,0,0,0.35)`,
                    transition: UI_COLOR_TRANSITION,
                  }}
                >
                  決定 · {getBasicEmotion(hierarchyFrontBasicId).label}
                </button>
              )}
            </div>
          </div>
        )}

        {isExplorationMode && !hierarchyBrowseMode && searchGameTargetPlot && searchGameDistance != null && (
          <SearchGameHud
            targetWord={searchGameTargetPlot.word_id}
            distance={searchGameFound ? 0 : searchGameDistance}
            proximity={searchGameFound
              ? 1
              : proximityRatio(searchGameDistance, searchGameReferenceDistance)}
            trend={searchGameFound
              ? 'closer'
              : proximityTrend(searchGamePreviousDistance, searchGameDistance)}
            found={searchGameFound}
            uiTheme={emotionUiTheme}
            onQuit={handleQuitSearchGame}
            onNextRound={handleNextSearchGameRound}
          />
        )}

        {isExplorationMode && !hierarchyBrowseMode && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              width: `${MAP_WIDTH}px`,
            }}
          >
            <EmotionMinimap
              syncState={minimapSync}
              uiTheme={emotionUiTheme}
              active={spaceOverview}
              onClick={handleToggleSpaceOverview}
            />
            {!spaceOverview && (
            <ExplorationToolsPanel
              width={MAP_WIDTH}
              uiTheme={emotionUiTheme}
              plots={displayPlots}
              selectedTagIds={selectedTagIds}
              currentSystemId={selectedPlot?.primaryId ?? null}
              currentPlot={selectedPlot}
              onToggleTag={handleToggleTag}
              onSelectWord={handleWordSelect}
              searchGameActive={Boolean(searchGameTargetId)}
              onStartSearchGame={handleStartSearchGame}
              onQuitSearchGame={handleQuitSearchGame}
            />
            )}
            {spaceOverview && (
              <button
                type="button"
                onClick={handleToggleSpaceOverview}
                style={{
                  padding: '10px 12px',
                  border: `1px solid ${emotionUiTheme.accentBorder}`,
                  borderLeft: `3px solid ${emotionUiTheme.accentBorderStrong}`,
                  borderRadius: '8px',
                  backgroundColor: emotionUiTheme.panelBackground,
                  color: emotionUiTheme.textPrimary,
                  fontSize: '0.82rem',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  backdropFilter: 'blur(12px)',
                  transition: UI_COLOR_TRANSITION,
                }}
              >
                探索に戻る
              </button>
            )}
          </div>
        )}

        {isExplorationMode && !hierarchyBrowseMode && (
          <div
            style={{
              position: 'absolute',
              right: '16px',
              bottom: '16px',
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <button
              type="button"
              onClick={toggleBackgroundTheme}
              style={{
                padding: '8px 12px',
                border: `1px solid ${emotionUiTheme.controlBorder}`,
                borderRadius: '8px',
                backgroundColor: emotionUiTheme.controlBackground,
                color: emotionUiTheme.controlText,
                fontSize: '0.78rem',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                transition: UI_COLOR_TRANSITION,
              }}
            >
              背景: {backgroundTheme === 'dark' ? '黒' : '薄灰'}（B）
            </button>
            <button
              type="button"
              onClick={togglePlotLabelDisplayMode}
              style={{
                padding: '8px 12px',
                border: `1px solid ${emotionUiTheme.controlBorder}`,
                borderRadius: '8px',
                backgroundColor: emotionUiTheme.controlBackground,
                color: emotionUiTheme.controlText,
                fontSize: '0.78rem',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                transition: UI_COLOR_TRANSITION,
              }}
            >
              ラベル: {plotLabelDisplayMode === 'nearby' ? '常時' : 'フロー'}（L）
            </button>
          </div>
        )}

        {(showInfoGuideLine || showHoverGuide) && (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${mainSize.width} ${mainSize.height}`}
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            {showInfoGuideLine && selectedScreenPoint && (
              <line
                x1={selectedScreenPoint.x}
                y1={selectedScreenPoint.y}
                x2={currentWordPanelLeft}
                y2={currentWordPanel.y + currentWordPanel.height / 2}
                stroke={emotionUiTheme.guideLine}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {showHoverGuide && hoveredScreenPoint && (
              <line
                x1={hoveredScreenPoint.x}
                y1={hoveredScreenPoint.y}
                x2={nextWordPanelLeft + nextWordPanel.guideAnchorX}
                y2={nextWordPanel.y + nextWordPanel.guideAnchorY}
                stroke={emotionUiTheme.guideLineHover}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        )}

        {isExplorationMode && !hierarchyBrowseMode && !spaceOverview && infoPanelPlot && (
          <div
            ref={nextWordPanelRef}
            style={{
              position: 'absolute',
              left: `${nextWordPanelLeft}px`,
              top: `${nextWordPanel.y}px`,
              zIndex: 2,
              width: `${nextWordPanel.width}px`,
              height: `${nextWordLabel ? nextWordPanel.expandedHeight : nextWordPanel.collapsedHeight}px`,
              padding: `${nextWordPanel.padding}px`,
              border: `1px solid ${emotionUiTheme.accentBorder}`,
              borderLeft: `3px solid ${emotionUiTheme.accentBorderStrong}`,
              borderRadius: `${nextWordPanel.borderRadius}px`,
              backgroundColor: emotionUiTheme.panelBackground,
              boxShadow: emotionUiTheme.panelShadow,
              backdropFilter: 'blur(12px)',
              color: emotionUiTheme.textPrimary,
              opacity: panelMorph ? 0 : isInfoPanelVisible ? 1 : 0,
              overflow: 'hidden',
              transition: panelMorph
                ? 'opacity 80ms ease'
                : `opacity 150ms ease, height 160ms ease, ${UI_COLOR_TRANSITION}`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: `${nextWordPanel.headerGap}px`, height: `${nextWordPanel.headerHeight}px` }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: `${nextWordPanel.tickerHeight}px`,
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
                    fontSize: nextWordPanel.tickerFontSize,
                    letterSpacing: '0.14em',
                    lineHeight: `${nextWordPanel.tickerHeight}px`,
                    color: emotionUiTheme.accentMuted,
                    whiteSpace: 'nowrap',
                    animation: 'nextWordTicker 3.8s linear infinite',
                  }}
                >
                  NEXT WORD
                </p>
              </div>
              <span
                style={{
                  display: 'block',
                  width: 0,
                  height: 0,
                  borderTop: `${nextWordPanel.arrowBorderY}px solid transparent`,
                  borderBottom: `${nextWordPanel.arrowBorderY}px solid transparent`,
                  borderRight: `${nextWordPanel.arrowBorderX}px solid ${emotionUiTheme.accentMuted}`,
                  opacity: nextWordLabel ? 1 : 0.45,
                  animation: nextWordLabel ? 'nextWordArrowPulse 900ms ease-in-out infinite' : 'none',
                  transition: 'opacity 160ms ease',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `1fr ${nextWordPanel.tickerHeight}px`,
                gap: `${nextWordPanel.contentGap}px`,
                alignItems: 'start',
                justifyItems: 'center',
                marginTop: `${nextWordPanel.contentMarginTop}px`,
                opacity: nextWordLabel ? 1 : 0,
                transform: nextWordLabel ? 'translateY(0)' : 'translateY(-6px)',
                transition: 'opacity 140ms ease, transform 160ms ease',
              }}
            >
              <div
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  fontSize: nextWordPanel.wordFontSize,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  letterSpacing: '0.06em',
                  color: emotionUiTheme.textPrimary,
                  overflow: 'hidden',
                  maxHeight: `${nextWordPanel.contentMaxHeight}px`,
                }}
              >
                {nextWordLabel}
              </div>
              <p
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  margin: 0,
                  fontSize: nextWordPanel.subLabelFontSize,
                  letterSpacing: '0.12em',
                  lineHeight: 1.2,
                  color: emotionUiTheme.accentMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                次の語
              </p>
            </div>
          </div>
        )}

        {isEditorOpen && !isExplorationMode && (
          <WordEditor
            plots={plots}
            selectedId={selectedId}
            plotStatus={plotStatus}
            onSelect={handleWordSelect}
            onChange={handlePlotChange}
            onAdd={handlePlotAdd}
            onDelete={handlePlotDelete}
          />
        )}

        {!isEditorOpen && !isExplorationMode && (
          <button
            type="button"
            onClick={() => setIsEditorOpen(true)}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              padding: '10px 16px',
              border: '1px solid #1f2833',
              borderRadius: '8px',
              backgroundColor: 'rgba(11, 12, 16, 0.92)',
              color: '#45f3ff',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            単語エディタを開く
          </button>
        )}

        {panelMorph && isExplorationMode && !hierarchyBrowseMode && !spaceOverview && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: `${panelMorph.left}px`,
                top: `${panelMorph.top}px`,
                width: `${panelMorph.width}px`,
                height: `${panelMorph.height}px`,
                zIndex: 4,
                padding: `${currentWordPanel.paddingY}px ${currentWordPanel.paddingX}px`,
                border: `1px solid ${emotionUiTheme.accentBorder}`,
                borderLeft: `4px solid ${emotionUiTheme.accentBorderStrong}`,
                borderRadius: `${currentWordPanel.borderRadius}px`,
                backgroundColor: emotionUiTheme.panelBackground,
                boxShadow: emotionUiTheme.panelShadow,
                backdropFilter: 'blur(12px)',
                color: emotionUiTheme.textPrimary,
                boxSizing: 'border-box',
                overflow: 'hidden',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'row-reverse',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                gap: `${currentWordPanel.gap}px`,
                transition: morphBoxTransition,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row-reverse',
                  alignItems: 'flex-start',
                  gap: `${currentWordPanel.innerGap}px`,
                  flex: '0 0 auto',
                  paddingLeft: `${currentWordPanel.paddingLeft}px`,
                  borderLeft: `1px solid ${emotionUiTheme.divider}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: `${currentWordPanel.innerGap}px`,
                    opacity: morphAtCurrent ? 1 : 0,
                    transition: `opacity ${morphMoveEasing}`,
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: 0,
                      height: 0,
                      borderTop: `${currentWordPanel.arrowBorder}px solid transparent`,
                      borderBottom: `${currentWordPanel.arrowBorder}px solid transparent`,
                      borderRight: `${currentWordPanel.arrowBorder + 4}px solid ${emotionUiTheme.accentMuted}`,
                    }}
                  />
                  <p
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      margin: 0,
                      fontSize: currentWordPanel.sectionLabelFontSize,
                      letterSpacing: '0.18em',
                      lineHeight: 1.2,
                      color: emotionUiTheme.accentMuted,
                      whiteSpace: 'nowrap',
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
                    gap: `${currentWordPanel.innerGap}px`,
                    width: `${currentWordPanel.wordColumnWidth}px`,
                    overflow: 'hidden',
                  }}
                >
                  <p
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      margin: 0,
                      fontSize: morphAtCurrent
                        ? currentWordPanel.wordFontSize
                        : nextWordPanel.wordFontSize,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      letterSpacing: '0.08em',
                      transition: morphFontTransition,
                    }}
                  >
                    {panelMorph.word}
                  </p>
                  {panelMorph.ruby && (
                    <p
                      style={{
                        writingMode: 'vertical-rl',
                        textOrientation: 'mixed',
                        margin: 0,
                        fontSize: `calc(${currentWordPanel.wordFontSize} * 0.78)`,
                        lineHeight: 1.35,
                        letterSpacing: '0.1em',
                        color: emotionUiTheme.textMuted,
                        opacity: showMorphRuby ? 1 : 0,
                        maxHeight: showMorphRuby ? '100%' : 0,
                        transform: showMorphRuby ? 'translateY(0)' : 'translateY(-8px)',
                        transition: 'opacity 360ms ease, transform 360ms ease, max-height 360ms ease',
                      }}
                    >
                      {`【${panelMorph.ruby}】`}
                    </p>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row-reverse',
                  alignItems: 'flex-start',
                  gap: `${currentWordPanel.bodyTextGap}px`,
                  flex: '0 0 auto',
                  opacity: showMorphDetails ? 1 : 0,
                  transform: showMorphDetails ? 'translateX(0)' : 'translateX(12px)',
                  transition: 'opacity 360ms ease, transform 360ms ease',
                  pointerEvents: 'none',
                  maxWidth: showMorphDetails ? '100%' : 0,
                  overflow: 'hidden',
                }}
              >
                <p
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    margin: 0,
                    maxHeight: `${currentWordPanel.bodyMaxHeight}px`,
                    fontSize: currentWordPanel.bodyFontSize,
                    lineHeight: 1.9,
                    letterSpacing: '0.06em',
                    color: emotionUiTheme.textSecondary,
                    flex: '0 0 auto',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {panelMorph.meaning}
                </p>
                {panelMorph.usage && (
                  <p
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      margin: 0,
                      maxHeight: `${currentWordPanel.bodyMaxHeight}px`,
                      fontSize: currentWordPanel.usageFontSize,
                      lineHeight: 1.8,
                      letterSpacing: '0.06em',
                      color: emotionUiTheme.textMuted,
                      flex: '0 0 auto',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {`用例：${panelMorph.usage}`}
                  </p>
                )}
                <dl
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    display: 'grid',
                    gridAutoFlow: 'column',
                    gridTemplateRows: 'auto auto',
                    columnGap: `${currentWordPanel.columnGap}px`,
                    rowGap: `${currentWordPanel.rowGap}px`,
                    margin: 0,
                    padding: '2px 0',
                    fontSize: currentWordPanel.dlFontSize,
                    flex: '0 0 auto',
                  }}
                >
                  <dt style={{ color: emotionUiTheme.textMuted }}>主感情</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{panelMorph.primaryLabel}</dd>
                  <dt style={{ color: emotionUiTheme.textMuted }}>副感情</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{panelMorph.secondaryLabel}</dd>
                  <dt style={{ color: emotionUiTheme.textMuted }}>強度</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{panelMorph.intensity}</dd>
                  <dt style={{ color: emotionUiTheme.textMuted }}>種別</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{panelMorph.kindLabel}</dd>
                </dl>
              </div>
            </div>
        )}

        {isExplorationMode && !hierarchyBrowseMode && !spaceOverview && infoPanelPlot && (
          <aside
            ref={currentWordAsideRef}
            style={{
              position: 'absolute',
              top: `${currentWordPanel.y}px`,
              right: `${uiGroupRightMargin}px`,
              left: 'auto',
              width: 'max-content',
              maxWidth: `${Math.max(currentWordPanel.width, mainSize.width - uiGroupRightMargin - 24)}px`,
              height: 'max-content',
              minHeight: `${currentWordPanel.height}px`,
              zIndex: 2,
              padding: `${currentWordPanel.paddingY}px ${currentWordPanel.paddingX}px`,
              border: `1px solid ${emotionUiTheme.accentBorder}`,
              borderLeft: `4px solid ${emotionUiTheme.accentBorderStrong}`,
              borderRadius: `${currentWordPanel.borderRadius}px`,
              backgroundColor: emotionUiTheme.panelBackground,
              boxShadow: emotionUiTheme.panelShadow,
              backdropFilter: 'blur(12px)',
              color: emotionUiTheme.textPrimary,
              pointerEvents: 'none',
              opacity: panelMorph ? 0 : isInfoPanelVisible ? 1 : 0,
              transition: panelMorph
                ? 'opacity 80ms ease'
                : `opacity 150ms ease, ${UI_COLOR_TRANSITION}`,
              overflow: 'visible',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row-reverse',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                gap: `${currentWordPanel.gap}px`,
                minHeight: `${currentWordPanel.innerMinHeight}px`,
                overflow: 'visible',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row-reverse',
                  alignItems: 'flex-start',
                  gap: `${currentWordPanel.innerGap}px`,
                  paddingLeft: `${currentWordPanel.paddingLeft}px`,
                  borderLeft: `1px solid ${emotionUiTheme.divider}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: `${currentWordPanel.innerGap}px`,
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: 0,
                      height: 0,
                      borderTop: `${currentWordPanel.arrowBorder}px solid transparent`,
                      borderBottom: `${currentWordPanel.arrowBorder}px solid transparent`,
                      borderRight: `${currentWordPanel.arrowBorder + 4}px solid ${emotionUiTheme.accentMuted}`,
                      animation: 'currentWordArrowPulse 900ms ease-in-out infinite',
                    }}
                  />
                  <p
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      margin: 0,
                      fontSize: currentWordPanel.sectionLabelFontSize,
                      letterSpacing: '0.18em',
                      color: emotionUiTheme.accentMuted,
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
                    gap: `${currentWordPanel.innerGap}px`,
                    width: `${currentWordPanel.wordColumnWidth}px`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${currentWordPanel.wordColumnWidth}px`,
                      height: `${currentWordPanel.tickerHeight}px`,
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
                        fontSize: currentWordPanel.tickerFontSize,
                        letterSpacing: '0.14em',
                        lineHeight: `${currentWordPanel.tickerHeight}px`,
                        color: emotionUiTheme.accentMuted,
                        whiteSpace: 'nowrap',
                        animation: 'nextWordTicker 4.2s linear infinite',
                      }}
                    >
                      CURRENT WORD
                    </p>
                  </div>
                  <h2
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      margin: 0,
                      fontSize: currentWordPanel.wordFontSize,
                      lineHeight: 1.25,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {infoPanelPlot.word_id}
                  </h2>
                  {infoPanelPlot.ruby?.trim() && (
                    <p
                      style={{
                        writingMode: 'vertical-rl',
                        textOrientation: 'mixed',
                        margin: 0,
                        fontSize: `calc(${currentWordPanel.wordFontSize} * 0.78)`,
                        lineHeight: 1.35,
                        letterSpacing: '0.1em',
                        color: emotionUiTheme.textMuted,
                      }}
                    >
                      {`【${infoPanelPlot.ruby.trim()}】`}
                    </p>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row-reverse',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  gap: `${meaningUsageGap}px`,
                  flex: '0 0 auto',
                  overflow: 'visible',
                }}
              >
                <p
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    margin: 0,
                    height: meaningLayout.columns <= 1
                      ? 'auto'
                      : `${currentWordPanel.bodyMaxHeight}px`,
                    maxHeight: `${currentWordPanel.bodyMaxHeight}px`,
                    width: meaningLayout.columns <= 1
                      ? 'max-content'
                      : `${meaningLayout.width}px`,
                    fontSize: currentWordPanel.bodyFontSize,
                    lineHeight: 1.9,
                    letterSpacing: '0.06em',
                    color: emotionUiTheme.textSecondary,
                    overflow: 'visible',
                    flex: '0 0 auto',
                    boxSizing: 'content-box',
                  }}
                >
                  {meaningText}
                </p>
                {infoPanelPlot.usageExample?.trim() && (
                  <p
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      margin: 0,
                      height: meaningLayout.columns <= 1
                        ? 'auto'
                        : `${currentWordPanel.bodyMaxHeight}px`,
                      maxHeight: `${currentWordPanel.bodyMaxHeight}px`,
                      fontSize: currentWordPanel.usageFontSize,
                      lineHeight: 1.8,
                      letterSpacing: '0.06em',
                      color: emotionUiTheme.textMuted,
                      overflow: 'visible',
                      flex: '0 0 auto',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {`用例：${infoPanelPlot.usageExample.trim()}`}
                  </p>
                )}
              </div>

              <dl
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  display: 'grid',
                  gridAutoFlow: 'column',
                  gridTemplateRows: 'auto auto',
                  columnGap: `${currentWordPanel.columnGap}px`,
                  rowGap: `${currentWordPanel.rowGap}px`,
                  margin: 0,
                  padding: '2px 0',
                  fontSize: currentWordPanel.dlFontSize,
                  flex: '0 0 auto',
                }}
              >
                <dt style={{ color: emotionUiTheme.textMuted }}>主感情</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>
                  {resolvePrimaryEmotionLabel(infoPanelPlot.primaryId, infoPanelPlot.primaryLabel)}
                </dd>
                <dt style={{ color: emotionUiTheme.textMuted }}>副感情</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>
                  {resolvePrimaryEmotionLabel(infoPanelPlot.secondaryId, infoPanelPlot.secondaryLabel)}
                </dd>
                <dt style={{ color: emotionUiTheme.textMuted }}>強度</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{infoPanelPlot.intensity}</dd>
                <dt style={{ color: emotionUiTheme.textMuted }}>種別</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>
                  {getPlotKindLabel(infoPanelPlot)}
                </dd>
              </dl>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: `${currentWordPanel.innerGap}px`,
                  paddingRight: '2px',
                }}
              >
                <p
                  style={{
                    writingMode: 'vertical-rl',
                    margin: 0,
                    fontSize: currentWordPanel.metaFontSize,
                    letterSpacing: '0.14em',
                    color: emotionUiTheme.textMuted,
                  }}
                >
                  強度
                </p>
                <div
                  style={{
                    width: `${currentWordPanel.intensityBarWidth}px`,
                    height: `${currentWordPanel.intensityBarHeight}px`,
                    overflow: 'hidden',
                    borderRadius: '999px',
                    backgroundColor: emotionUiTheme.divider,
                    display: 'flex',
                    alignItems: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${(infoPanelPlot.intensity / EMOTION_INTENSITY_MAX) * 100}%`,
                      borderRadius: '999px',
                      background: `linear-gradient(180deg, ${emotionUiTheme.intensityGradientStart}, ${emotionUiTheme.intensityGradientEnd})`,
                    }}
                  />
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

export default App;
