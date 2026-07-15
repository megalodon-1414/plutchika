import * as THREE from 'three';

/** 選択中プロットを置く画面位置（0〜1、原点は左下） */
export const SELECTION_SCREEN_ANCHOR = { x: 0.28, y: 0.72 };

/**
 * 注視点はプロット点のまま、投影中心だけずらして画面内の見え方を移動する。
 * progress: 0 = オフセットなし, 1 = 完全に適用
 */
export function applySelectionViewOffset(
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
  progress: number,
  anchor = SELECTION_SCREEN_ANCHOR,
): void {
  const clamped = Math.min(1, Math.max(0, progress));

  if (clamped <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    clearSelectionViewOffset(camera);
    return;
  }

  const offsetX = (0.5 - anchor.x) * viewportWidth * clamped;
  const offsetY = (anchor.y - 0.5) * viewportHeight * clamped;

  camera.setViewOffset(
    viewportWidth,
    viewportHeight,
    offsetX,
    offsetY,
    viewportWidth,
    viewportHeight,
  );
  camera.updateProjectionMatrix();
}

export function clearSelectionViewOffset(camera: THREE.PerspectiveCamera): void {
  if (camera.view?.enabled) {
    camera.clearViewOffset();
  }
}
