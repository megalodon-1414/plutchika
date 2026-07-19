/**
 * 2層パララックス背景（最奥：星空／手前：惑星）。
 * 星空は2D（CSS）、惑星本体は PlanetGlobe（Three.js の3Dスフィア）が担当する。
 *
 * 星は「画面中心（奥・消失点）」から生まれ、球・パネルの回転を駆動しているのと同じ
 * 「進み具合」（ライブな回転角）に応じて中心から外側へ流れ、近づくほど大きくなる
 * （＝人物が奥へ進むのに対応した遠近感）。画面端付近まで来た星は、そのタイミングだけ
 * 中心・新しいランダム角度・最小サイズへ個別にリセットし、同じ動きをループする。
 *
 * 各星は「角度（移動方向）」と「位相（ループ内のどの時点から始まるか）」を個別に持つため、
 * 全ての星が同時に中心に集まったり端に達したりすることはなく、常に空全体へ散らばって見える。
 *
 * CSSトランジションではなく毎フレームの直接反映（refへの直書き）にすることで、
 * 球・パネルのイージングと完全に同期させる。
 */
import { useRef } from 'react';
import type { PlanetPanelContent } from '../panelContent';
import { getRotationPerStep } from '../planetRotation';
import { PlanetGlobe } from './PlanetGlobe';

const STAR_COUNT = 60;

/**
 * 1ステップ（球が1パネルぶん回転する量）につき、星が中心→端の全行程のうち
 * どれだけ進むか（0.03 = 3%。1周＝約33ステップぶんかけてゆっくり通り過ぎる）。
 * 「控えめ」を保つため小さい値にしてある。
 */
const STAR_PROGRESS_PER_STEP = 0.03;

/** 中心からの最大距離（vmax）。画面端・角より十分外まで伸ばし、ループの継ぎ目を画面外に隠す。 */
const STAR_MAX_DISTANCE_VMAX = 85;
const STAR_SIZE_MIN = 2.4;
const STAR_SIZE_MAX = 12.8;

interface Star {
  /** 移動方向（ラジアン）。個々に固定。 */
  angle: number;
  /** ループ内の開始位置（0〜1）。個々にずらすことで生成タイミングをバラけさせる。 */
  phaseOffset: number;
  opacity: number;
}

/**
 * 決定的（毎回同じ結果になる）疑似乱数。0〜1を返す。
 * Math.random() は使わず、シード値から一意な小数部を取り出すだけの簡易ハッシュ。
 */
function seededRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

const STARS: Star[] = Array.from({ length: STAR_COUNT }, (_, i) => ({
  // angle と phaseOffset は「別々の」シードで生成する。同じ数列（例:黄金角）から
  // 両方を作ると、角度と距離がインデックスに対して相関してしまい、
  // ひまわりの種のような渦巻き状の配置に見えてしまうため。
  angle: seededRandom(i * 3.17 + 1) * Math.PI * 2,
  phaseOffset: seededRandom(i * 7.91 + 5),
  opacity: 0.35 + ((i * 7) % 5) * 0.12,
}));

interface WalkSceneProps {
  stepIndex: number;
  panelContents: (PlanetPanelContent | null)[];
  /** 直接リンクでの初期表示時、現在の stepIndex の位置へ即スナップしたい場合に true にする。 */
  snapToInitialStep?: boolean;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
}

export function WalkScene({ stepIndex, panelContents, snapToInitialStep, onNavigate }: WalkSceneProps) {
  const starRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rotationPerStep = getRotationPerStep(panelContents.length);
  const starProgressPerRadian = STAR_PROGRESS_PER_STEP / rotationPerStep;

  const handleRotationChange = (rotationX: number) => {
    const globalProgress = rotationX * starProgressPerRadian;
    STARS.forEach((star, index) => {
      const dot = starRefs.current[index];
      if (!dot) {
        return;
      }
      // 0〜1でループ。星ごとの phaseOffset により、同時に中心へ集まったり端に達したりしない。
      const progress = (globalProgress + star.phaseOffset) % 1;
      const distance = progress * STAR_MAX_DISTANCE_VMAX;
      const x = distance * Math.cos(star.angle);
      const y = distance * Math.sin(star.angle);
      const size = STAR_SIZE_MIN + progress * (STAR_SIZE_MAX - STAR_SIZE_MIN);

      dot.style.left = `calc(50% + ${x}vmax)`;
      dot.style.top = `calc(50% + ${y}vmax)`;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
    });
  };

  return (
    <div className="home-intro-walkscene">
      <div className="home-intro-stars">
        <div className="home-intro-stars__layer">
          {STARS.map((star, index) => (
            <span
              key={index}
              ref={(el) => {
                starRefs.current[index] = el;
              }}
              className="home-intro-stars__dot"
              style={{ opacity: star.opacity }}
            />
          ))}
        </div>
      </div>

      <PlanetGlobe
        stepIndex={stepIndex}
        panelContents={panelContents}
        snapToInitialStep={snapToInitialStep}
        onRotationChange={handleRotationChange}
        onNavigate={onNavigate}
      />
    </div>
  );
}
