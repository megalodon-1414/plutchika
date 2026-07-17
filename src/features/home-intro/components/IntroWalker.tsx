interface IntroWalkerProps {
  /** true の間だけ脚のパタパタ＋頭のバウンスを再生する */
  stepping: boolean;
}

/** 後ろ姿の人物。惑星の頂点（画面中央）に固定し、位置は動かさず足踏みのみで歩行感を出す。 */
export function IntroWalker({ stepping }: IntroWalkerProps) {
  const rootClassName = `home-intro-walker ${
    stepping ? 'home-intro-walker--step' : 'home-intro-walker--idle'
  }`;

  return (
    <div className={rootClassName}>
      <div className="home-intro-walker__head" />
      <div className="home-intro-walker__body" />
      <div className="home-intro-walker__leg home-intro-walker__leg--left" />
      <div className="home-intro-walker__leg home-intro-walker__leg--right" />
    </div>
  );
}
