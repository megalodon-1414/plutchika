import type { BasicEmotionId } from '../../data/emotions';
import { BASIC_EMOTIONS, DYAD_EMOTIONS } from '../../data/emotions';

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
export const TELESCOPE_WIDE_DYAD_OPACITY = 0.3;

/** 8感情の環の半径 — カメラ軸上から見て同じ距離に並ぶ */
export const TELESCOPE_GALAXY_RADIUS = 2.85;
export const TELESCOPE_BASIC_SPHERE_RADIUS = 0.22;
export const TELESCOPE_DYAD_SPHERE_RADIUS = 0.11;

/**
 * far → wide → detail の3階層。
 * approaching / zooming-* は演出中。
 */
export type TelescopeZoomPhase =
  | 'far'
  | 'approaching'
  | 'wide'
  | 'zooming-in'
  | 'detail'
  | 'zooming-out'
  | 'retreating';

export type TelescopeSettledPhase = 'far' | 'wide' | 'detail';

export interface TelescopeNodePosition {
  id: string;
  label: string;
  color: string;
  position: [number, number, number];
  kind: 'basic' | 'dyad';
  basicId?: BasicEmotionId;
  distance?: 1 | 2 | 3;
}

function angleToXy(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  // 0° = +Y（喜びを上）になるよう、数学座標から 90° ずらす
  return [Math.sin(rad) * radius, Math.cos(rad) * radius];
}

export function distanceForPhase(phase: TelescopeSettledPhase): number {
  switch (phase) {
    case 'far':
      return TELESCOPE_CAMERA_DISTANCE_FAR;
    case 'wide':
      return TELESCOPE_CAMERA_DISTANCE_WIDE;
    case 'detail':
      return TELESCOPE_CAMERA_DISTANCE_ZOOM;
  }
}

export function buildTelescopeGalaxyNodes(): TelescopeNodePosition[] {
  return BASIC_EMOTIONS.map((emotion) => {
    const [x, y] = angleToXy(emotion.angle, TELESCOPE_GALAXY_RADIUS);
    return {
      id: emotion.id,
      label: emotion.label,
      color: emotion.color,
      position: [x, y, 0],
      kind: 'basic' as const,
      basicId: emotion.id,
    };
  });
}

/**
 * 24合成感情 — 構成する2基本感情を結ぶ線分上（中点）に置く。
 * 8基本と合わせて32感情の固定配置。
 */
export function buildTelescopeDetailNodes(): TelescopeNodePosition[] {
  const basicPos = new Map(
    buildTelescopeGalaxyNodes().map((n) => [n.id, n.position] as const),
  );

  return DYAD_EMOTIONS.map((dyad) => {
    const [aId, bId] = dyad.components;
    const a = basicPos.get(aId)!;
    const b = basicPos.get(bId)!;
    // 2基本感情を結ぶ線分の中点（平面上＝線上）
    const x = (a[0] + b[0]) * 0.5;
    const y = (a[1] + b[1]) * 0.5;
    const z = (a[2] + b[2]) * 0.5;

    return {
      id: dyad.id,
      label: dyad.label,
      color: BASIC_EMOTIONS.find((e) => e.id === aId)!.color,
      position: [x, y, z] as [number, number, number],
      kind: 'dyad' as const,
      distance: dyad.distance,
    };
  });
}

export const TELESCOPE_GALAXY_NODES = buildTelescopeGalaxyNodes();
export const TELESCOPE_DETAIL_NODES = buildTelescopeDetailNodes();
