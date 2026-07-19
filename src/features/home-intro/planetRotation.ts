/**
 * パネル1枚ぶん（＝1ステップぶん）の回転角（ラジアン）。パネルの枚数（panelContents.length）
 * がそのまま「球に取り付けるテキストパネルの枚数」になり、回転軸に沿った円周上に等間隔で配置される。
 * home-intro（4枚）・deep-dive（5枚）など、呼び出し側でパネル枚数が異なっても同じ式で成立する。
 */
export function getRotationPerStep(panelCount: number): number {
  return (Math.PI * 2) / panelCount;
}
