import type { BasicEmotionId, EmotionId } from '../../data/emotions';
import { BASIC_EMOTIONS, DYAD_EMOTIONS } from '../../data/emotions';
import {
  RING_RADIUS as MAP_EMOTION_RING_RADIUS,
  getEmotionCenter,
} from '../../utils/emotionSpaceLayout';

/**
 * 銀河は原点（z=0）。回転中心は視点（カメラ）より後ろ（さらに +Z）。
 * カメラは「支点 → 視点 → 銀河」の順に並び、支点まわりで首振りするように見回す。
 */
export const TELESCOPE_PIVOT: [number, number, number] = [0, 0, 28];

/**
 * 後ろのピボットからカメラまでの距離。
 * 大きくするとカメラが銀河側へ進み、拡大する。
 */
export const TELESCOPE_CAMERA_DISTANCE_FAR = 6.2;
/** 1回目の接近 — より銀河に寄せて拡大率を上げる */
export const TELESCOPE_CAMERA_DISTANCE_WIDE = 21.6;
/**
 * 3段階目のフォールバック距離（主調整は focusCameraView の TELESCOPE_FOCUS_VIEW）。
 */
export const TELESCOPE_CAMERA_DISTANCE_ZOOM = 24.4;
export const TELESCOPE_CAMERA_FOV = 42;
/** Layer1→2: 引き画角（広げて描画範囲を拡大） */
export const TELESCOPE_LAYER2_PULLBACK_FOV = 48;
/** Layer1→2: クリック時アングル維持のまま後退する距離倍率 */
export const TELESCOPE_LAYER2_PULLBACK_DISTANCE_MUL = 1.28;
export const TELESCOPE_LAYER2_PULLBACK_MS = 600;
/** Layer1→2: 後退後に選択感情へ向けて回転する時間 */
export const TELESCOPE_LAYER2_ROTATE_MS = 900;
export const TELESCOPE_ZOOM_MS = 1400;

/** 円形ビューポートの最大直径 */
export const TELESCOPE_EYEPIECE_MAX_PX = 960;
export const TELESCOPE_EYEPIECE_VH = 90;

/** ドラッグ判定：これ以上動いたら見回し、未満ならクリック扱い */
export const TELESCOPE_CLICK_DRAG_THRESHOLD_PX = 6;

/**
 * 見回し感度（ターゲット角への入力）。
 * 実カメラはダンパで遅れて追従する。
 */
export const TELESCOPE_ORBIT_SENSITIVITY = 0.00055;
/** 正面からの仰角中心 */
export const TELESCOPE_ORBIT_PHI_CENTER = Math.PI / 2 - 0.03;
/**
 * のぞき穴に合わせた円形の回転制限（rad）。
 * 中心からの角変位 √(Δθ²+Δφ²) がこの半径を超えない。
 */
export const TELESCOPE_ORBIT_RADIUS_MAX = 0.14;
/** 追従ダンパ：誤差がこの距離のときを「始点〜終点」のスケールにする */
export const TELESCOPE_ORBIT_FOLLOW_RANGE = 0.085;
/** 追従のピーク角速度（rad/s）— 中間で最大、始点・終点付近は減速 */
export const TELESCOPE_ORBIT_FOLLOW_SPEED = 1.35;
/** 始点でも完全停止しないための最低速度倍率 */
export const TELESCOPE_ORBIT_FOLLOW_MIN_MUL = 0.14;

/** 一段階目（wide）で合成感情をうっすら見せる不透明度 */
export const TELESCOPE_WIDE_DYAD_OPACITY = 0.48;

/** 8感情の環の半径 — カメラ軸上から見て同じ距離に並ぶ */
export const TELESCOPE_GALAXY_RADIUS = 2.85;
export const TELESCOPE_BASIC_SPHERE_RADIUS = 0.22;
export const TELESCOPE_DYAD_SPHERE_RADIUS = 0.11;

/**
 * far → wide → detail → region → exploration の5階層。
 * approaching / zooming-* / entering-* / leaving-* は演出中。
 */
export type TelescopeZoomPhase =
  | 'far'
  | 'approaching'
  | 'wide'
  | 'zooming-in'
  | 'detail'
  | 'entering-region'
  | 'region'
  | 'leaving-region'
  | 'entering-exploration'
  | 'exploration'
  | 'leaving-exploration'
  | 'zooming-out'
  | 'retreating';

export type TelescopeSettledPhase =
  | 'far'
  | 'wide'
  | 'detail'
  | 'region'
  | 'exploration';

export interface TelescopeNodePosition {
  id: string;
  label: string;
  color: string;
  position: [number, number, number];
  kind: 'basic' | 'dyad';
  basicId?: BasicEmotionId;
  distance?: 1 | 2 | 3;
}

/**
 * `/map` の感情配置を上下層から平面へ戻し、望遠鏡の XY 平面へ変換する。
 * map の joy=+X を telescope の joy=+Y に合わせる。
 * 合成感情は構成する2基本感情を結ぶ線分の中点に置く。
 */
export function getTelescopeEmotionPosition(
  id: EmotionId,
): [number, number, number] {
  const dyad = DYAD_EMOTIONS.find((entry) => entry.id === id);
  if (dyad) {
    const [aId, bId] = dyad.components;
    const a = getTelescopeEmotionPosition(aId);
    const b = getTelescopeEmotionPosition(bId);
    return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, 0];
  }

  const mapCenter = getEmotionCenter(id);
  const scale = TELESCOPE_GALAXY_RADIUS / MAP_EMOTION_RING_RADIUS;
  return [mapCenter.z * scale, mapCenter.x * scale, 0];
}

export function distanceForPhase(phase: TelescopeSettledPhase): number {
  switch (phase) {
    case 'far':
      return TELESCOPE_CAMERA_DISTANCE_FAR;
    case 'wide':
      return TELESCOPE_CAMERA_DISTANCE_WIDE;
    case 'detail':
    case 'region':
    case 'exploration':
      return TELESCOPE_CAMERA_DISTANCE_ZOOM;
  }
}

export function buildTelescopeGalaxyNodes(): TelescopeNodePosition[] {
  return BASIC_EMOTIONS.map((emotion) => {
    return {
      id: emotion.id,
      label: emotion.label,
      color: emotion.color,
      position: getTelescopeEmotionPosition(emotion.id),
      kind: 'basic' as const,
      basicId: emotion.id,
    };
  });
}

/**
 * 24合成感情 — 構成する2基本感情を結ぶ線分の中点に置く。
 * 8基本と合わせて32感情の固定配置。
 */
export function buildTelescopeDetailNodes(): TelescopeNodePosition[] {
  return DYAD_EMOTIONS.map((dyad) => {
    const [aId] = dyad.components;
    return {
      id: dyad.id,
      label: dyad.label,
      color: BASIC_EMOTIONS.find((e) => e.id === aId)!.color,
      position: getTelescopeEmotionPosition(dyad.id),
      kind: 'dyad' as const,
      distance: dyad.distance,
    };
  });
}

export const TELESCOPE_GALAXY_NODES = buildTelescopeGalaxyNodes();
export const TELESCOPE_DETAIL_NODES = buildTelescopeDetailNodes();
