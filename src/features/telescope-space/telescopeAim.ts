import * as THREE from 'three';

/**
 * 検知・中央選択の照準モード。
 * - `center`: 従来どおり画面中央で判定
 * - `cursor`: カーソル付近で判定
 *
 * 内部切替用。実行中に書き換えても次フレームから反映される。
 */
export type TelescopeAimMode = 'center' | 'cursor';

export const TELESCOPE_AIM = {
  /** 検知・選択の照準。`'center'` に戻すと画面中央判定になる */
  mode: 'cursor' as TelescopeAimMode,
};

/** 照準モードを切り替える。cursor→center 時はポインタ状態もクリアする */
export function setTelescopeAimMode(mode: TelescopeAimMode): void {
  TELESCOPE_AIM.mode = mode;
  if (mode === 'center') {
    clearTelescopePointer();
  }
}

const pointerNdc = { x: 0, y: 0, valid: false };

let pinHidden = false;

/** 照準ピンの一時非表示（矢印ホバー中など、別UIが操作を受けている間） */
export function setTelescopePinHidden(hidden: boolean): void {
  pinHidden = hidden;
}

export function isTelescopePinHidden(): boolean {
  return pinHidden;
}

/** 現在の照準 NDC（center モード時は常に (0,0)） */
export function getTelescopeAimNdc(): { x: number; y: number } {
  if (TELESCOPE_AIM.mode === 'center' || !pointerNdc.valid) {
    return { x: 0, y: 0 };
  }
  return { x: pointerNdc.x, y: pointerNdc.y };
}

/** カーソル照準が有効か（mode=cursor かつポインタ取得済み） */
export function isTelescopeCursorAimActive(): boolean {
  return TELESCOPE_AIM.mode === 'cursor' && pointerNdc.valid;
}

/** ポインタ位置を NDC に反映。Canvas の pointermove / pointerenter から呼ぶ */
export function updateTelescopePointerFromClient(
  clientX: number,
  clientY: number,
  rect: DOMRectReadOnly,
): void {
  if (TELESCOPE_AIM.mode === 'center') {
    return;
  }
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  pointerNdc.valid = true;
}

export function clearTelescopePointer(): void {
  pointerNdc.valid = false;
  pointerNdc.x = 0;
  pointerNdc.y = 0;
}

/** 投影点 (nx, ny) から照準までの距離 */
export function ndcDistanceToAim(nx: number, ny: number): number {
  const aim = getTelescopeAimNdc();
  return Math.hypot(nx - aim.x, ny - aim.y);
}

/** 投影点から照準までの距離の二乗 */
export function ndcDistanceSqToAim(nx: number, ny: number): number {
  const aim = getTelescopeAimNdc();
  const dx = nx - aim.x;
  const dy = ny - aim.y;
  return dx * dx + dy * dy;
}

/** 照準から見た投影点の方位角（rad、Y-up） */
export function ndcAngleFromAim(nx: number, ny: number): number {
  const aim = getTelescopeAimNdc();
  return Math.atan2(ny - aim.y, nx - aim.x);
}

/**
 * 線分（投影済み）上で照準に最も近い点までの距離。
 * t は線分パラメータ 0..1。
 */
export function ndcDistanceToSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { distance: number; t: number } {
  const aim = getTelescopeAimNdc();
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq > 1e-8
      ? THREE.MathUtils.clamp(
          ((aim.x - ax) * dx + (aim.y - ay) * dy) / lengthSq,
          0,
          1,
        )
      : 0;
  return {
    distance: Math.hypot(ax + dx * t - aim.x, ay + dy * t - aim.y),
    t,
  };
}

const _aimNdc = new THREE.Vector3();

/**
 * 照準を通るワールド空間のレイを書く。
 * Layer3 インジケータなど、平面との交点計算に使う。
 */
export function getTelescopeAimRay(
  camera: THREE.Camera,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): void {
  const aim = getTelescopeAimNdc();
  _aimNdc.set(aim.x, aim.y, 0.5);
  _aimNdc.unproject(camera);
  origin.copy(camera.position);
  direction.copy(_aimNdc).sub(camera.position).normalize();
}

/**
 * レンズ（キャンバス）内のカーソル表示。
 * cursor 照準では検知円がカーソル代わりになるため OS カーソルを消す。
 */
export function getTelescopeCanvasCursor(fallback: string): string {
  return TELESCOPE_AIM.mode === 'cursor' ? 'none' : fallback;
}

/** HUD 用: 照準の画面上位置（0..1、左上原点の CSS 割合） */
export function getTelescopeAimCssFraction(): { x: number; y: number } {
  const aim = getTelescopeAimNdc();
  return {
    x: aim.x * 0.5 + 0.5,
    y: 0.5 - aim.y * 0.5,
  };
}
