import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BasicEmotionId } from '../../data/emotions';
import { ROUTES } from '../../routes/paths';
import type { TelescopeSettledPhase, TelescopeZoomPhase } from './constants';
import { TelescopeEyepiece } from './TelescopeEyepiece';
import {
  TelescopeInnerTrackLabel,
  TelescopeRimColorGlow,
} from './TelescopeEyepieceHud';
import {
  resolveFocusBasicId,
  type TelescopeViewFocus,
} from './TelescopeGalaxyLayer';
import { TelescopeSpaceCanvas } from './TelescopeSpaceCanvas';
import { TelescopeZoomLadder, zoomLevelIndex } from './TelescopeZoomLadder';

function isBusyPhase(phase: TelescopeZoomPhase): boolean {
  return (
    phase === 'approaching' ||
    phase === 'zooming-in' ||
    phase === 'zooming-out' ||
    phase === 'retreating'
  );
}

function settledFromPhase(phase: TelescopeZoomPhase): TelescopeSettledPhase {
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
      return 0.85;
    case 'detail':
      return 1;
    case 'retreating':
      return 0.25;
  }
}

function layerCopy(settled: TelescopeSettledPhase): { body: string; layer: string } {
  switch (settled) {
    case 'far':
      return {
        body: '遠景 — 接眼レンズ越しに感情の銀河が一点に見えます。円内をクリックで近づき、ドラッグで鏡筒を振れます。',
        layer: 'LAYER 00 · 遠景',
      };
    case 'wide':
      return {
        body: '銀河レイヤー — 8つの基本感情のあいだに、24の合成感情がうっすら見えます。検知中の感情でクリックすると、関連感情が見渡せる視点へ移ります。',
        layer: 'LAYER 01 · 銀河 8+24',
      };
    case 'detail':
      return {
        body: '関連見渡し — 環の中心と選択感情の延長線上へ移り、選択球を回転中心に、平面に対して縦の上下で立体的に見ます。',
        layer: 'LAYER 02 · 延長視点',
      };
  }
}

const EMPTY_FOCUS: TelescopeViewFocus = { nearest: null, nearby: [] };

/**
 * 望遠鏡モチーフの感情語探索空間（実験用）。
 * 既存 `/map` とは独立。円形接眼の中だけで階層ズームする。
 */
export function TelescopeSpaceView() {
  const [zoomPhase, setZoomPhase] = useState<TelescopeZoomPhase>('far');
  const [viewFocus, setViewFocus] = useState<TelescopeViewFocus>(EMPTY_FOCUS);
  const [focusBasicId, setFocusBasicId] = useState<BasicEmotionId | null>(null);
  const retreatTargetRef = useRef<TelescopeSettledPhase | null>(null);

  const busy = isBusyPhase(zoomPhase);
  const settled = settledFromPhase(zoomPhase);
  const copy = layerCopy(settled);
  const aperture = useMemo(() => apertureForPhase(zoomPhase), [zoomPhase]);
  const showHud = true;
  const showRimGlow = settled !== 'far';

  const startZoomOutStep = useCallback((from: TelescopeSettledPhase) => {
    if (from === 'detail') {
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
        setFocusBasicId(locked);
        return 'zooming-in';
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
      startZoomOutStep(current);
    },
    [busy, zoomPhase, startZoomOutStep],
  );

  const handleZoomComplete = useCallback(
    (phase: TelescopeSettledPhase) => {
      setZoomPhase(phase);
      if (phase === 'wide' || phase === 'far') {
        setFocusBasicId(null);
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

  const handleViewFocus = useCallback((focus: TelescopeViewFocus) => {
    setViewFocus(focus);
  }, []);

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
        innerOverlay={
          <TelescopeInnerTrackLabel focus={viewFocus} visible={showHud} />
        }
        rimOverlay={
          <TelescopeRimColorGlow focus={viewFocus} visible={showRimGlow} />
        }
        rightRail={
          <TelescopeZoomLadder
            current={settled}
            busy={busy}
            onRetreatTo={handleRetreatTo}
          />
        }
      >
        <TelescopeSpaceCanvas
          zoomPhase={zoomPhase}
          focusBasicId={focusBasicId}
          onZoomComplete={handleZoomComplete}
          onCanvasClickZoom={handleCanvasClickZoom}
          onViewFocus={handleViewFocus}
        />
      </TelescopeEyepiece>

      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          right: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <div style={{ maxWidth: 400, pointerEvents: 'none' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.72rem',
              letterSpacing: '0.18em',
              opacity: 0.55,
            }}
          >
            TELESCOPE SPACE · 実験
          </p>
          <h1
            style={{
              margin: '8px 0 0',
              fontSize: 'clamp(1.25rem, 3vw, 1.7rem)',
              fontWeight: 600,
              letterSpacing: '0.08em',
            }}
          >
            感情の銀河をのぞく
          </h1>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: '0.88rem',
              lineHeight: 1.65,
              opacity: 0.72,
            }}
          >
            {copy.body}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, pointerEvents: 'auto' }}>
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
          {busy ? '調整中…' : copy.layer}
          {!busy && settled !== 'detail' ? '  ·  円内クリックで近づく / 右の点で戻る' : null}
          {!busy && settled === 'detail' ? '  ·  右の点で戻る / ドラッグで見回す' : null}
        </p>
      </div>
    </div>
  );
}
