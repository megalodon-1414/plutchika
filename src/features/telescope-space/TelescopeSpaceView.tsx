import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import { getBasicEmotion, getEmotionById } from '../../data/emotions';
import { EmotionMinimap } from '../../components/EmotionMinimap';
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
import { pickRandomPlotIdInSegment } from './layer3Segments';
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
  const [minimapSync, setMinimapSync] = useState<MinimapSyncState | null>(null);
  const [wordPlots, setWordPlots] = useState<UserPlotRow[]>([]);
  const [infoUiScale, setInfoUiScale] = useState(getInfoUiScale);
  const [layer2HudActive, setLayer2HudActive] = useState(false);
  const retreatTargetRef = useRef<TelescopeSettledPhase | null>(null);
  const regionIndicatorRef = useRef(createTelescopeRegionIndicatorState());
  const segmentFocusRef = useRef(createTelescopeSegmentFocusState());

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
        setLayer2HudActive(true);
      }
      if (phase === 'region') {
        setExplorationPlotId(null);
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

  const handleSelectExplorationPlot = useCallback((id: string) => {
    setExplorationPlotId(id);
  }, []);

  const handleViewFocus = useCallback((focus: TelescopeViewFocus) => {
    setViewFocus(focus);
  }, []);

  const handleMinimapSync = useCallback((state: MinimapSyncState | null) => {
    setMinimapSync(state);
  }, []);

  const detailHudMode = settled === 'detail' && layer2HudActive;
  const regionHudMode = settled === 'region';
  const explorationHudMode = settled === 'exploration';
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
  const selectedExploration = useMemo(() => {
    if (!explorationPlotId) {
      return null;
    }
    const plot = wordPlots.find((row) => row.word_id === explorationPlotId);
    if (!plot) {
      return null;
    }
    return { label: plot.word_id, color: plotColorFromRow(plot) };
  }, [explorationPlotId, wordPlots]);

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
          onSelectExplorationPlot={handleSelectExplorationPlot}
        />
      </TelescopeEyepiece>

      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 360,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 28,
          boxSizing: 'border-box',
          background:
            'linear-gradient(to left, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.56) 38%, rgba(0, 0, 0, 0) 100%)',
          pointerEvents: 'none',
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
