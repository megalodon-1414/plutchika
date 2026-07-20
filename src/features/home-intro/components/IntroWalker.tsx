interface IntroWalkerProps {
  /** true の間だけ脚のパタパタ＋頭のバウンスを再生する */
  stepping: boolean;
  /**
   * true にすると、ロケットの着陸位置（--rocket-offset-x）まで歩いて行き、
   * 乗り込むように縮みながら消える一回きりのアニメーションを再生する（④搭乗ステップ専用）。
   * アニメ終了後も forwards で消えたままになる。
   */
  boarding?: boolean;
  /** false の間は非表示（opacity:0）。true になった瞬間からfade inする（ロゴの次のページが完全に表示され終えてから登場させる用）。 */
  revealed: boolean;
}

/** 後ろ姿の人物。惑星の頂点（画面中央）に固定し、位置は動かさず足踏みのみで歩行感を出す。 */
export function IntroWalker({ stepping, boarding = false, revealed }: IntroWalkerProps) {
  const modifier = boarding
    ? 'home-intro-walker--board'
    : stepping
      ? 'home-intro-walker--step'
      : 'home-intro-walker--idle';
  const rootClassName = `home-intro-walker ${modifier}${revealed ? '' : ' home-intro-walker--hidden'}`;

  return (
    <div className={rootClassName}>
      <div className="home-intro-walker__head" />
      <div className="home-intro-walker__body" />
      <div className="home-intro-walker__leg home-intro-walker__leg--left" />
      <div className="home-intro-walker__leg home-intro-walker__leg--right" />
    </div>
  );
}
