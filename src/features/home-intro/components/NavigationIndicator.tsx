export interface NavigationIndicatorStage {
  label: string;
}

interface NavigationIndicatorProps {
  /** 上から順に並べる階層。各要素のラベルがドットの左に表示される。 */
  stages: NavigationIndicatorStage[];
  /** 現在地に対応する stages のインデックス。 */
  currentIndex: number;
  /** ドットクリック時、そのインデックスへ遷移させる。 */
  onSelect: (index: number) => void;
}

const PREVIOUS_TEXT = 'PREVIOUS';
/**
 * PREVIOUSの文字が沿うパスの半径（px）。インジケーター全体の1.3倍スケールに合わせてある。
 * ドット・縦線から少し離れた位置にある「ようこそ」等のラベルへ重ならないよう、
 * ラベル手前の余白（ドットトラック半径13px＋gap16px＝29px）より内側に収める。
 */
const PREVIOUS_TEXT_RADIUS = 19.5;
/** 円（ガイドライン）の半径。文字のベースラインより一回り小さくして、文字の後ろ側にぴったり重なるようにする。 */
const PREVIOUS_RING_RADIUS = 16.9;
/** SVG描画領域の余白（文字の昇り／下がり分の描画スペース）。 */
const PREVIOUS_SVG_PADDING = 13;
/** 文字を配置する弧の角度範囲・中心角（0deg=右方向、時計回りが正）。円の上側に弧を置く。 */
const PREVIOUS_ARC_DEGREES = 140;
const PREVIOUS_ARC_CENTER_DEGREES = 270;
const PREVIOUS_PATH_ID = 'nav-indicator-previous-path';

function stageTopPercent(index: number, stageCount: number): number {
  return stageCount > 1 ? (index / (stageCount - 1)) * 100 : 50;
}

/**
 * 現在地の「一つ前」の階層ドットを中心にした円弧上に "PREVIOUS" を配置し、
 * 円弧の中心を軸に反時計回りへ回転させ続ける（上＝前の階層に戻れることを示す装飾）。
 * 対象ドットの位置（top%）は階層切り替えのたびに再計算される。
 *
 * 文字は SVG の <textPath> で円弧パスに沿わせる。1文字ずつ個別に回転させる方式だと
 * 実際のフォント幅を無視した均等角度配置になり、文字同士の間隔が不自然に見えることがあるため、
 * ブラウザのテキストレイアウトに任せられる textPath を採用した。
 */
function PreviousOrbitLabel({ topPercent }: { topPercent: number }) {
  const startAngle = ((PREVIOUS_ARC_CENTER_DEGREES - PREVIOUS_ARC_DEGREES / 2) * Math.PI) / 180;
  const endAngle = ((PREVIOUS_ARC_CENTER_DEGREES + PREVIOUS_ARC_DEGREES / 2) * Math.PI) / 180;
  const x1 = PREVIOUS_TEXT_RADIUS * Math.cos(startAngle);
  const y1 = PREVIOUS_TEXT_RADIUS * Math.sin(startAngle);
  const x2 = PREVIOUS_TEXT_RADIUS * Math.cos(endAngle);
  const y2 = PREVIOUS_TEXT_RADIUS * Math.sin(endAngle);
  const size = (PREVIOUS_TEXT_RADIUS + PREVIOUS_SVG_PADDING) * 2;
  const half = size / 2;

  return (
    <div
      className="nav-indicator__previous-orbit"
      style={{ top: `${topPercent}%`, width: size, height: size }}
      aria-hidden
    >
      <svg viewBox={`${-half} ${-half} ${size} ${size}`} width={size} height={size}>
        <circle className="nav-indicator__previous-ring" r={PREVIOUS_RING_RADIUS} cx={0} cy={0} />
        <g className="nav-indicator__previous-spin">
          <path id={PREVIOUS_PATH_ID} d={`M ${x1} ${y1} A ${PREVIOUS_TEXT_RADIUS} ${PREVIOUS_TEXT_RADIUS} 0 0 1 ${x2} ${y2}`} fill="none" />
          <text className="nav-indicator__previous-text">
            <textPath href={`#${PREVIOUS_PATH_ID}`} startOffset="50%" textAnchor="middle">
              {PREVIOUS_TEXT}
            </textPath>
          </text>
        </g>
      </svg>
    </div>
  );
}

/**
 * 画面右端に固定表示する縦方向の「現在地インジケーター」。
 * telescope（感情MAP）側の階層インジケーターの見た目を参考にしつつ、
 * home-intro は分岐のない一直線の進行なので、上から下へ順にステージを並べ、
 * 現在地のドットだけを大きく・白く光らせて示す。
 */
export function NavigationIndicator({ stages, currentIndex, onSelect }: NavigationIndicatorProps) {
  if (stages.length === 0) {
    return null;
  }

  const previousIndex = currentIndex - 1;

  return (
    <nav className="nav-indicator" aria-label="現在地インジケーター">
      <div className="nav-indicator__line" />
      {previousIndex >= 0 && (
        <PreviousOrbitLabel topPercent={stageTopPercent(previousIndex, stages.length)} />
      )}
      {stages.map((stage, index) => {
        const isCurrent = index === currentIndex;
        return (
          <button
            key={stage.label + index}
            type="button"
            className={`nav-indicator__stage${isCurrent ? ' nav-indicator__stage--current' : ''}`}
            style={{ top: `${stageTopPercent(index, stages.length)}%` }}
            onClick={() => onSelect(index)}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className="nav-indicator__label">{stage.label}</span>
            <span className="nav-indicator__dot-track">
              <span className="nav-indicator__dot" />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
