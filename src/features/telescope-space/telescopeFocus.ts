export interface TelescopeNearestEmotion {
  id: string;
  label: string;
  color: string;
  /** のぞき穴中心から見た画面角（rad）。0 = 右、反時計回り、Y-up */
  angle: number;
  nx: number;
  ny: number;
}

/** ふちに出す穴の外の感情色サンプル。angle はその方位 */
export interface TelescopeNearbyEmotionGlow {
  id: string;
  color: string;
  angle: number;
  /** 対象のNDC座標。移動後の検知円中心から正確な方向を求めるために使う */
  nx: number;
  ny: number;
  weight: number;
  /** 球がキャンバス内（穴の外でも画面上）にあると true → 光を大きく */
  onScreen: boolean;
}

export interface TelescopeViewFocus {
  nearest: TelescopeNearestEmotion | null;
  nearby: TelescopeNearbyEmotionGlow[];
}
