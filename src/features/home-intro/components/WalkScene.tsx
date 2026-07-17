/**
 * 3層パララックス背景（最奥：星空／中間：丘のシルエット／手前：惑星）。
 * 星空・丘は2D（CSS）、惑星本体は PlanetGlobe（Three.js の3Dスフィア）が担当する。
 * オフセット・自転は stepIndex にのみ依存し、スクロール量には比例しない。
 */
import { PlanetGlobe } from './PlanetGlobe';

const STAR_COUNT = 60;
const HILL_COUNT = 8;

/** 1ステップぶんの移動量（vw）。奥ほど小さく、手前ほど大きい。 */
const STAR_SPEED_VW = 3;
const HILL_SPEED_VW = 12;

interface Star {
  topPercent: number;
  leftVw: number;
  size: number;
  opacity: number;
}

interface Hill {
  leftVw: number;
  width: number;
  height: number;
}

const STARS: Star[] = Array.from({ length: STAR_COUNT }, (_, i) => ({
  topPercent: (i * 13) % 70,
  leftVw: -100 + ((i * 37) % 300),
  size: 1 + (i % 3),
  opacity: 0.35 + ((i * 7) % 5) * 0.12,
}));

const HILLS: Hill[] = Array.from({ length: HILL_COUNT }, (_, i) => ({
  leftVw: -80 + i * 55 + (i % 2) * 20,
  width: 140 + (i % 3) * 40,
  height: 40 + (i % 4) * 14,
}));

interface WalkSceneProps {
  stepIndex: number;
}

export function WalkScene({ stepIndex }: WalkSceneProps) {
  return (
    <div className="home-intro-walkscene">
      {/* 外側：ビューポートに固定されたクリップ枠。内側の layer だけを動かす。 */}
      <div className="home-intro-stars">
        <div
          className="home-intro-stars__layer"
          style={{ transform: `translateX(${-stepIndex * STAR_SPEED_VW}vw)` }}
        >
          {STARS.map((star, index) => (
            <span
              key={index}
              className="home-intro-stars__dot"
              style={{
                top: `${star.topPercent}%`,
                left: `${star.leftVw}vw`,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
              }}
            />
          ))}
        </div>
      </div>

      <div className="home-intro-hills">
        <div
          className="home-intro-hills__layer"
          style={{ transform: `translateX(${-stepIndex * HILL_SPEED_VW}vw)` }}
        >
          {HILLS.map((hill, index) => (
            <span
              key={index}
              className="home-intro-hills__mound"
              style={{ left: `${hill.leftVw}vw`, width: hill.width, height: hill.height }}
            />
          ))}
        </div>
      </div>

      <PlanetGlobe stepIndex={stepIndex} />
    </div>
  );
}
