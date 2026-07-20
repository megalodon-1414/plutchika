/**
 * 惑星の頂点（＝人物の足元）が来る、画面上端からの距離の割合（0〜1）。
 * home-intro.css の `--intro-horizon` と必ず同じ値にする。
 */
export const HOME_INTRO_HORIZON_RATIO = 0.9;

/**
 * スマホ時の地平線。少し下げて惑星・人物などを下めに見せる。
 * home-intro.css の `@media (max-width: 640px) { --intro-horizon }` と揃える。
 */
export const HOME_INTRO_HORIZON_RATIO_MOBILE = 0.94;

/** ナビ非表示と同じ幅基準。地平線・パネル文字サイズの切替に使う。 */
export const HOME_INTRO_MOBILE_MAX_WIDTH_PX = 640;

/** 画面幅に応じた地平線比率（惑星・人物・ロケットの足元位置）。 */
export function homeIntroHorizonRatio(widthPx: number): number {
  return widthPx <= HOME_INTRO_MOBILE_MAX_WIDTH_PX
    ? HOME_INTRO_HORIZON_RATIO_MOBILE
    : HOME_INTRO_HORIZON_RATIO;
}
