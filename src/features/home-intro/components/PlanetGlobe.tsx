import { Html, Text } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { PlutchikPetalWheel } from '../../../components/landing/PlutchikPetalWheel';
import { HOME_INTRO_HORIZON_RATIO } from '../sceneLayout';
import { HOME_INTRO_STEPS } from '../steps';
import type { HomeIntroPanelContent, SplitGraphicPanelContent, WelcomePanelContent } from '../steps';

/** 角度を [-π, π] に正規化する */
function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let result = angle % twoPi;
  if (result > Math.PI) {
    result -= twoPi;
  } else if (result < -Math.PI) {
    result += twoPi;
  }
  return result;
}

/** 球に取り付けるテキストパネルの枚数。回転軸に沿った円周上に等間隔で配置する。 */
const PANEL_COUNT = 4;
const PANEL_ANGLE_STEP = (Math.PI * 2) / PANEL_COUNT;

/**
 * 各パネルスロットに表示するコンテンツを、HOME_INTRO_STEPS の実際のコピーから自動で対応付ける。
 *
 * stepIndex が1進むごとに共有回転角が PANEL_ANGLE_STEP ぶん増えるため、
 * あるステップが「読める位置」に運ぶパネルの番号は (stepIndex + 1) % PANEL_COUNT で決まる
 * （BASE_TILT_X と PANEL_ANGLE_STEP が等しいため。three.js の行列で数値検証済み）。
 * 対応する本番ステップがまだ無いスロットは null のまま
 * （現状のステップ数ではその角度に到達しないため、実際には表示されない）。
 */
const PANEL_CONTENTS: (HomeIntroPanelContent | null)[] = (() => {
  const slots: (HomeIntroPanelContent | null)[] = Array.from({ length: PANEL_COUNT }, () => null);
  HOME_INTRO_STEPS.forEach((step, stepIndex) => {
    if (step.kind === 'walk' && step.content) {
      const panelIndex = (stepIndex + 1) % PANEL_COUNT;
      slots[panelIndex] = step.content;
    }
  });
  return slots;
})();

/**
 * 1ステップぶんの自転角（ラジアン）。歩幅の実感を作る担当。
 * ワールドX軸（水平・pitch）まわりに正方向へ回すと、奥側の面が手前（カメラ側）へ流れ、
 * そのまま下側（裏＝見えない側）へ回り込む「前方へ転がる」動きになる（three.jsの行列で数値検証済み）。
 * これにより、人物は静止したまま「画面の奥（遠く）へ歩いているように見える」錯覚を作る。
 *
 * パネルの間隔（PANEL_ANGLE_STEP）とちょうど一致させ、1ステップ＝次のパネルが1枚分だけ回ってくるようにする。
 */
export const ROTATION_PER_STEP = PANEL_ANGLE_STEP;
const ROTATION_LERP_SPEED = 4;

/**
 * 画面に見えている頂点（人物の足元）は、SphereGeometryの既定UVでは「極」にあたり、経線が1点に収束して歪む。
 * 固定のX軸90度オフセットで、開始姿勢の見える頂点を歪みの少ない「赤道」付近にずらす。
 * ただし歩行の回転も同じX軸まわりなので、ステップを重ねるとやがて緯度が変わり極に近づく（③④⑤追加時に要調整）。
 */
const BASE_TILT_X = Math.PI / 2;

const PLANET_BASE_COLOR = '#c3cbef';
const CRATER_COLOR = 'rgba(64, 68, 116, 0.4)';
const CRATER_COUNT = 46;

/** クレーターは凹凸をモデリングせず、平らなテクスチャ画像として貼る。 */
function createPlanetTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = PLANET_BASE_COLOR;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = CRATER_COLOR;
  for (let i = 0; i < CRATER_COUNT; i += 1) {
    const x = (i * 97 + 31) % width;
    const y = 30 + ((i * 53 + 17) % (height - 60));
    const radius = 8 + ((i * 31) % 22);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface TextPanelProps {
  radius: number;
  angle: number;
  content: HomeIntroPanelContent | null;
  /** 「空」（頂点から画面上端まで）の幅・高さ。テキストはこの範囲内にだけ収める。 */
  skyWidth: number;
  skyHeight: number;
  /** 球と回転を共有する親グループへの参照。位置・向きはここから一切動かさず、表示の濃さだけをこの回転から導出する。 */
  rotatingGroupRef: RefObject<THREE.Group | null>;
}

/** この角度差を超えたら完全に不可視（cos(diff) がこの値未満） */
const PANEL_FADE_COS_MIN = 0.05;
/** この角度差以内なら完全に不透明（cos(diff) がこの値以上） */
const PANEL_FADE_COS_MAX = 0.7;

interface PanelLayoutProps {
  skyWidth: number;
  skyHeight: number;
  opacity: number;
}

/** ①ようこそパネル用。フック・見出し・サブコピーは左揃え、本文は右揃え。 */
function WelcomePanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
}: PanelLayoutProps & { content: WelcomePanelContent }) {
  const leftX = -skyWidth * 0.42;
  const leftWidth = skyWidth * 0.5;
  const rightX = skyWidth * 0.42;
  const rightWidth = skyWidth * 0.48;
  return (
    <>
      <Text
        position={[leftX, skyHeight * 0.92, 0]}
        fontSize={skyHeight * 0.032}
        color="#9f8aaa"
        anchorX="left"
        anchorY="top"
        maxWidth={leftWidth}
        textAlign="left"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.hook}
      </Text>
      <Text
        position={[leftX, skyHeight * 0.82, 0]}
        fontSize={skyHeight * 0.065}
        lineHeight={1.3}
        color="#f4ecf7"
        anchorX="left"
        anchorY="top"
        maxWidth={leftWidth}
        textAlign="left"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.heading}
      </Text>
      <Text
        position={[leftX, skyHeight * 0.58, 0]}
        fontSize={skyHeight * 0.026}
        color="#c39bd3"
        anchorX="left"
        anchorY="top"
        letterSpacing={0.08}
        maxWidth={leftWidth}
        textAlign="left"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.subcopy}
      </Text>
      <Text
        position={[rightX, skyHeight * 0.42, 0]}
        fontSize={skyHeight * 0.024}
        lineHeight={1.6}
        color="#d8cfe0"
        anchorX="right"
        anchorY="top"
        maxWidth={rightWidth}
        textAlign="right"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.body}
      </Text>
    </>
  );
}

const PETAL_WHEEL_HTML_SIZE = 360;

/** ③プルチック環パネル用。テキストを左、花びらグラフィックを右に配置する左右分割レイアウト。 */
function SplitGraphicPanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
}: PanelLayoutProps & { content: SplitGraphicPanelContent }) {
  const leftX = -skyWidth * 0.46;
  const leftWidth = skyWidth * 0.42;
  return (
    <>
      <Text
        position={[leftX, skyHeight * 0.92, 0]}
        fontSize={skyHeight * 0.032}
        color="#9f8aaa"
        anchorX="left"
        anchorY="top"
        maxWidth={leftWidth}
        textAlign="left"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.hook}
      </Text>
      <Text
        position={[leftX, skyHeight * 0.82, 0]}
        fontSize={skyHeight * 0.06}
        lineHeight={1.3}
        color="#f4ecf7"
        anchorX="left"
        anchorY="top"
        maxWidth={leftWidth}
        textAlign="left"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.heading}
      </Text>
      <Text
        position={[leftX, skyHeight * 0.6, 0]}
        fontSize={skyHeight * 0.026}
        lineHeight={1.6}
        color="#d8cfe0"
        anchorX="left"
        anchorY="top"
        maxWidth={leftWidth}
        textAlign="left"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.body}
      </Text>
      {/*
        花びらグラフィック：右半分。インタラクション（クリックで感情名表示）は未実装の静止画として配置。
        Html の transform モードは、このシーンのオルソグラフィックカメラ・大きな world 単位（≒px換算）の
        組み合わせでは自動計算されるCSSスケールが極端に小さくなってしまう（実測で0.025倍＝9pxほどに縮小）ため、
        通常のスクリーン投影モード（screen-space billboard）を使う。表示・非表示はテキストと同じ opacity で揃える。
      */}
      <Html center position={[skyWidth * 0.24, skyHeight * 0.52, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ opacity, transition: 'opacity 0.2s linear' }}>
          {/*
            PlutchikPetalWheel は既定で maxWidth:100% を付ける。Html のラッパーdivは
            transformのみで明示的な width を持たないため、100%の基準が定まらず幅が0に
            つぶれてしまう。ここでは固定pxで表示したいので maxWidth を打ち消す。
          */}
          <PlutchikPetalWheel size={PETAL_WHEEL_HTML_SIZE} style={{ maxWidth: 'none' }} />
        </div>
      </Html>
    </>
  );
}

/**
 * 球の表面（回転軸に沿った円周上）に貼り付ける平らな板。
 * ローカル位置 (0, R cosβ, -R sinβ) ・ローカル回転 -β で固定しておくと、
 * 親グループの共有回転が θ=β になった瞬間だけワールド位置が頂点 (0,R,0) に、
 * 法線がカメラ方向 (0,0,1) にそろう（three.js の行列で数値検証済み）。
 *
 * 板自身のローカル回転（-β）も、共有回転（θ）も、どちらもX軸まわりだけの回転（同一軸の合成）。
 * X軸回転だけをどれだけ組み合わせても、板の「上方向」がその軸のまわりでねじれる（ロールする）ことは
 * 原理上起こらない。実際 θ=β の瞬間、板の up ベクトルは常に (0,1,0)＝画面の真上に一致する
 * （three.js の行列で数値検証済み）。つまり左上・右上の角は必ず水平にそろう。
 *
 * 板の位置・向きはここから一切動かさない。表示の濃さ（opacity）だけを
 * 「現在の共有回転角と、この板固有の角度との差」から毎フレーム導出し、
 * 頂点付近だけなめらかに読める状態になるようにする（板自体を個別にアニメーションさせるものではない）。
 */
function TextPanel({ radius, angle, content, skyWidth, skyHeight, rotatingGroupRef }: TextPanelProps) {
  const [opacity, setOpacity] = useState(0);
  const position: [number, number, number] = [
    0,
    radius * 1.02 * Math.cos(angle),
    -radius * 1.02 * Math.sin(angle),
  ];

  useFrame(() => {
    const group = rotatingGroupRef.current;
    if (!group) {
      return;
    }
    const diff = normalizeAngle(group.rotation.x - angle);
    const cosDiff = Math.cos(diff);
    const next = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(cosDiff, PANEL_FADE_COS_MIN, PANEL_FADE_COS_MAX, 0, 1),
      0,
      1,
    );
    setOpacity((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
  });

  if (opacity <= 0.01 || !content) {
    return null;
  }

  // 背景は完全に透明。板という物体を見せるのではなく、球の回転で景色が変わることで
  // その位置にテキストだけが浮かび上がって見えるようにする。
  //
  // 取り付け点（この group の原点、dy=0）は頂点＝地面との境界にあたる。
  // ここから「上方向にだけ」コンテンツを配置し、地面側（dy<0）には絶対にはみ出させない
  // （dy<0 側は球の中心からの距離が半径を下回り、不透明な球面の裏に隠れてしまうため）。
  // 逆に上方向（dy>0）は skyHeight（＝画面上端）を超えないよう、各要素をそこへ収める。
  return (
    <group position={position} rotation={[-angle, 0, 0]}>
      <group position={[0, 0, 1]}>
        {content.layout === 'welcome' && (
          <WelcomePanelLayout content={content} skyWidth={skyWidth} skyHeight={skyHeight} opacity={opacity} />
        )}
        {content.layout === 'split-graphic' && (
          <SplitGraphicPanelLayout content={content} skyWidth={skyWidth} skyHeight={skyHeight} opacity={opacity} />
        )}
      </group>
    </group>
  );
}

interface PlanetMeshProps {
  stepIndex: number;
  /** 球の現在の回転角（ラジアン）を毎フレーム通知する。奥の星空レイヤーなど、この回転と同じ「進み具合」を共有したい2D要素向け。 */
  onRotationChange?: (rotationX: number) => void;
}

function PlanetMesh({ stepIndex, onRotationChange }: PlanetMeshProps) {
  const rotatingRef = useRef<THREE.Group>(null);
  const targetRotationX = useRef(BASE_TILT_X + stepIndex * ROTATION_PER_STEP);
  const { size } = useThree();
  const texture = useMemo(() => createPlanetTexture(), []);

  const radius = Math.min(size.width * 0.62, 900);
  const apexY = size.height / 2 - HOME_INTRO_HORIZON_RATIO * size.height;
  const centerY = apexY - radius;
  // 「空」＝頂点（地面との境界）から画面上端までの範囲。テキストはここに収める。
  const skyWidth = size.width;
  const skyHeight = HOME_INTRO_HORIZON_RATIO * size.height;

  // マウント直後は「歪みのない赤道位置」に即座にスナップし、そこから現在ステップぶんだけアニメーションさせる。
  // （rotation.x=0=極からアニメすると歪みが一瞬見えるが、赤道からなら歪まず、かつ初回表示でも回転が目に見える）
  useLayoutEffect(() => {
    if (rotatingRef.current) {
      rotatingRef.current.rotation.x = BASE_TILT_X;
    }
  }, []);

  useEffect(() => {
    targetRotationX.current = BASE_TILT_X + stepIndex * ROTATION_PER_STEP;
  }, [stepIndex]);

  useFrame((_, delta) => {
    const group = rotatingRef.current;
    if (!group) {
      return;
    }
    const t = 1 - Math.exp(-ROTATION_LERP_SPEED * delta);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetRotationX.current, t);
    onRotationChange?.(group.rotation.x);
  });

  return (
    <group position={[0, centerY, 0]}>
      {/* 球本体とテキストパネルを同じ group にぶら下げ、同じ回転を共有させる（＝板は球にくっついたまま運ばれる） */}
      <group ref={rotatingRef}>
        <mesh>
          <sphereGeometry args={[radius, 48, 48]} />
          <meshToonMaterial map={texture} />
        </mesh>
        {PANEL_CONTENTS.map((content, index) => (
          <TextPanel
            key={index}
            radius={radius}
            angle={index * PANEL_ANGLE_STEP}
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            rotatingGroupRef={rotatingRef}
          />
        ))}
      </group>
    </group>
  );
}

interface PlanetGlobeProps {
  stepIndex: number;
  /** 球の現在の回転角（ラジアン）を毎フレーム通知する。奥の星空レイヤーなど、この回転と同じ「進み具合」を共有したい2D要素向け。 */
  onRotationChange?: (rotationX: number) => void;
}

/** 惑星部分のみ Three.js の SphereGeometry で実装した本物の3D球体。凹凸はテクスチャで表現し、フラットなイラスト調のトゥーンマテリアルで陰影を抑える。 */
export function PlanetGlobe({ stepIndex, onRotationChange }: PlanetGlobeProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 2000], near: 1, far: 10000, zoom: 1 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[0.4, 1, 1]} intensity={1} />
      <PlanetMesh stepIndex={stepIndex} onRotationChange={onRotationChange} />
    </Canvas>
  );
}
