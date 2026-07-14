export type WordType = 'emotion' | 'state';

export interface BaseWord {
  id: string;
  text: string;      // 単語（例：「ヤバい」「美しい」）
  type: WordType;    // 感情か状態か
  frequency: number; // 単語の出現頻度（共通の縦軸：0〜100）
}

// 感情：円環（角度）と強度
export interface EmotionWord extends BaseWord {
  type: 'emotion';
  angle: number;     // 0〜360度
  intensity: number; // 0〜100
}

// 状態：感知方法と善し悪し
export interface StateWord extends BaseWord {
  type: 'state';
  perception: number; // -10（論理） 〜 0（遠隔五感） 〜 +10（身体五感）
  quality: number;    // -10（悪い） 〜 +10（良い）
}

export type WordData = EmotionWord | StateWord;