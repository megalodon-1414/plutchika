import { Html, Text } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { PlutchikPetalWheel } from '../../../components/landing/PlutchikPetalWheel';
import type {
  BodyTextSegment,
  PlanetPanelContent,
  SimplePanelContent,
  SplitGraphicPanelContent,
  WelcomePanelContent,
} from '../panelContent';
import { getRotationPerStep } from '../planetRotation';
import { HOME_INTRO_HORIZON_RATIO } from '../sceneLayout';

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

const ROTATION_LERP_SPEED = 4;

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
  content: PlanetPanelContent | null;
  /** 「空」（頂点から画面上端まで）の幅・高さ。テキストはこの範囲内にだけ収める。 */
  skyWidth: number;
  skyHeight: number;
  /** 球と回転を共有する親グループへの参照。位置・向きはここから一切動かさず、表示の濃さだけをこの回転から導出する。 */
  rotatingGroupRef: RefObject<THREE.Group | null>;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
}

/** この角度差を超えたら完全に不可視（cos(diff) がこの値未満） */
const PANEL_FADE_COS_MIN = 0.05;
/** この角度差以内なら完全に不透明（cos(diff) がこの値以上） */
const PANEL_FADE_COS_MAX = 0.7;

interface PanelLayoutProps {
  skyWidth: number;
  skyHeight: number;
  opacity: number;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
}

/**
 * CJK主体のテキストを前提に、maxWidth（px相当）とfontSizeから折り返し行数を概算する。
 * troika-three-textは実際の折り返し位置を同期的に取得できないため、あくまで目安。
 * 「仮」コピー段階の縦位置合わせとしては十分な精度で、最終コピー確定時に見た目を調整する前提。
 */
function estimateSegmentLines(text: string, maxWidth: number, fontSize: number): number {
  const charsPerLine = Math.max(1, Math.floor(maxWidth / fontSize));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

interface LinkedBodyTextProps {
  segments: BodyTextSegment[];
  x: number;
  startY: number;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  color: string;
  linkColor: string;
  anchorX: 'left' | 'right' | 'center';
  textAlign: 'left' | 'right' | 'center';
  opacity: number;
  onNavigate?: (path: string) => void;
}

/**
 * 本文の断片配列を、上から順に行として積み上げて描画する。
 * 3Dテキスト（troika-three-text）は1メッシュ＝1スタイルで、HTMLの<a>のように文中の
 * 一部だけを別スタイル＋クリック可能にする機能がないため、linkTo を持つ断片は
 * 「その断片だけの行」として分割し、別の色・クリックハンドラを与える。
 */
function LinkedBodyText({
  segments,
  x,
  startY,
  maxWidth,
  fontSize,
  lineHeight,
  color,
  linkColor,
  anchorX,
  textAlign,
  opacity,
  onNavigate,
}: LinkedBodyTextProps) {
  const segmentYs: number[] = [];
  segments.reduce((cursorY, segment) => {
    segmentYs.push(cursorY);
    return cursorY - estimateSegmentLines(segment.text, maxWidth, fontSize) * fontSize * lineHeight;
  }, startY);

  return (
    <>
      {segments.map((segment, index) => {
        const y = segmentYs[index];
        const isLink = Boolean(segment.linkTo);
        return (
          <Text
            key={index}
            position={[x, y, 0]}
            fontSize={fontSize}
            lineHeight={lineHeight}
            color={isLink ? linkColor : color}
            anchorX={anchorX}
            anchorY="top"
            maxWidth={maxWidth}
            textAlign={textAlign}
            overflowWrap="break-word"
            fillOpacity={opacity}
            sdfGlyphSize={256}
            onClick={
              isLink
                ? (event) => {
                    event.stopPropagation();
                    onNavigate?.(segment.linkTo as string);
                  }
                : undefined
            }
            onPointerOver={
              isLink
                ? (event) => {
                    event.stopPropagation();
                    document.body.style.cursor = 'pointer';
                  }
                : undefined
            }
            onPointerOut={
              isLink
                ? () => {
                    document.body.style.cursor = 'auto';
                  }
                : undefined
            }
          >
            {segment.text}
          </Text>
        );
      })}
    </>
  );
}

/** ようこそパネル用。フック・見出し・サブコピーは左揃え、本文は右揃え。 */
function WelcomePanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
  onNavigate,
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
      <LinkedBodyText
        segments={content.body}
        x={rightX}
        startY={skyHeight * 0.42}
        maxWidth={rightWidth}
        fontSize={skyHeight * 0.024}
        lineHeight={1.6}
        color="#d8cfe0"
        linkColor="#c39bd3"
        anchorX="right"
        textAlign="right"
        opacity={opacity}
        onNavigate={onNavigate}
      />
    </>
  );
}

const PETAL_WHEEL_HTML_SIZE = 360;

/** プルチック環パネル用。テキストを左、花びらグラフィックを右に配置する左右分割レイアウト。 */
function SplitGraphicPanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
  onNavigate,
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
      <LinkedBodyText
        segments={content.body}
        x={leftX}
        startY={skyHeight * 0.6}
        maxWidth={leftWidth}
        fontSize={skyHeight * 0.026}
        lineHeight={1.6}
        color="#d8cfe0"
        linkColor="#c39bd3"
        anchorX="left"
        textAlign="left"
        opacity={opacity}
        onNavigate={onNavigate}
      />
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

/** 深掘りルート用。見出し＋本文のシンプルな構成（中央揃え）。 */
function SimplePanelLayout({
  content,
  skyWidth,
  skyHeight,
  opacity,
}: PanelLayoutProps & { content: SimplePanelContent }) {
  const textWidth = skyWidth * 0.62;
  return (
    <>
      <Text
        position={[0, skyHeight * 0.86, 0]}
        fontSize={skyHeight * 0.06}
        lineHeight={1.3}
        color="#f4ecf7"
        anchorX="center"
        anchorY="top"
        maxWidth={textWidth}
        textAlign="center"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.heading}
      </Text>
      <Text
        position={[0, skyHeight * 0.62, 0]}
        fontSize={skyHeight * 0.028}
        lineHeight={1.6}
        color="#d8cfe0"
        anchorX="center"
        anchorY="top"
        maxWidth={textWidth}
        textAlign="center"
        overflowWrap="break-word"
        fillOpacity={opacity}
        sdfGlyphSize={256}
      >
        {content.body}
      </Text>
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
function TextPanel({ radius, angle, content, skyWidth, skyHeight, rotatingGroupRef, onNavigate }: TextPanelProps) {
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
          <WelcomePanelLayout
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            opacity={opacity}
            onNavigate={onNavigate}
          />
        )}
        {content.layout === 'split-graphic' && (
          <SplitGraphicPanelLayout
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            opacity={opacity}
            onNavigate={onNavigate}
          />
        )}
        {content.layout === 'simple' && (
          <SimplePanelLayout content={content} skyWidth={skyWidth} skyHeight={skyHeight} opacity={opacity} />
        )}
      </group>
    </group>
  );
}

interface PlanetMeshProps {
  stepIndex: number;
  panelContents: (PlanetPanelContent | null)[];
  /**
   * true の場合、マウント時に「現在の stepIndex の位置」へ直接スナップする（アニメーションさせない）。
   * 深掘りページのような直接リンクでの初期表示（＝いきなり特定パネルへ着地したい場合）向け。
   * 省略時は false（従来通り、赤道位置からアニメーションして見せる。1枚目のパネルに入る瞬間の
   * 「回転が実際に見える」体験を保つため、home-introのデフォルト挙動はこちら）。
   */
  snapToInitialStep?: boolean;
  /** 球の現在の回転角（ラジアン）を毎フレーム通知する。奥の星空レイヤーなど、この回転と同じ「進み具合」を共有したい2D要素向け。 */
  onRotationChange?: (rotationX: number) => void;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
}

function PlanetMesh({
  stepIndex,
  panelContents,
  snapToInitialStep = false,
  onRotationChange,
  onNavigate,
}: PlanetMeshProps) {
  const rotatingRef = useRef<THREE.Group>(null);
  const panelCount = panelContents.length;
  const panelAngleStep = getRotationPerStep(panelCount);
  /**
   * 画面に見えている頂点（人物の足元）は、SphereGeometryの既定UVでは「極」にあたり、経線が1点に収束して歪む。
   * 固定のX軸オフセット（＝ちょうどパネル1枚ぶんの角度）で、開始姿勢の見える頂点を歪みの少ない
   * 「赤道」付近にずらす。パネル間隔と揃えることで、あるステップが読める位置に運ぶパネル番号が
   * 常に (stepIndex + 1) % panelCount になる（three.js の行列で数値検証済み、panelCountによらず成立）。
   */
  const baseTilt = panelAngleStep;
  const targetRotationX = useRef(baseTilt + stepIndex * panelAngleStep);
  const { size } = useThree();
  const texture = useMemo(() => createPlanetTexture(), []);

  const radius = Math.min(size.width * 0.62, 900);
  const apexY = size.height / 2 - HOME_INTRO_HORIZON_RATIO * size.height;
  const centerY = apexY - radius;
  // 「空」＝頂点（地面との境界）から画面上端までの範囲。テキストはここに収める。
  const skyWidth = size.width;
  const skyHeight = HOME_INTRO_HORIZON_RATIO * size.height;

  // マウント直後の初期姿勢。既定は「歪みのない赤道位置」に即座にスナップし、そこから現在ステップ
  // ぶんだけアニメーションさせる（rotation.x=0=極からアニメすると歪みが一瞬見えるが、赤道からなら
  // 歪まず、かつ初回表示でも回転が目に見える）。snapToInitialStep が true のときは、直接リンクでの
  // 着地を想定し、現在の stepIndex の位置へそのままスナップする（アニメーションさせない）。
  useLayoutEffect(() => {
    if (rotatingRef.current) {
      rotatingRef.current.rotation.x = snapToInitialStep ? targetRotationX.current : baseTilt;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時の初期姿勢決定のみに使う
  }, []);

  useEffect(() => {
    targetRotationX.current = baseTilt + stepIndex * panelAngleStep;
  }, [stepIndex, baseTilt, panelAngleStep]);

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
        {panelContents.map((content, index) => (
          <TextPanel
            key={index}
            radius={radius}
            angle={index * panelAngleStep}
            content={content}
            skyWidth={skyWidth}
            skyHeight={skyHeight}
            rotatingGroupRef={rotatingRef}
            onNavigate={onNavigate}
          />
        ))}
      </group>
    </group>
  );
}

interface PlanetGlobeProps {
  stepIndex: number;
  panelContents: (PlanetPanelContent | null)[];
  snapToInitialStep?: boolean;
  /** 球の現在の回転角（ラジアン）を毎フレーム通知する。奥の星空レイヤーなど、この回転と同じ「進み具合」を共有したい2D要素向け。 */
  onRotationChange?: (rotationX: number) => void;
  /** リンク断片がクリックされたときに呼ばれる。渡された path へ遷移させる。 */
  onNavigate?: (path: string) => void;
}

/** 惑星部分のみ Three.js の SphereGeometry で実装した本物の3D球体。凹凸はテクスチャで表現し、フラットなイラスト調のトゥーンマテリアルで陰影を抑える。 */
export function PlanetGlobe({
  stepIndex,
  panelContents,
  snapToInitialStep,
  onRotationChange,
  onNavigate,
}: PlanetGlobeProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 2000], near: 1, far: 10000, zoom: 1 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[0.4, 1, 1]} intensity={1} />
      <PlanetMesh
        stepIndex={stepIndex}
        panelContents={panelContents}
        snapToInitialStep={snapToInitialStep}
        onRotationChange={onRotationChange}
        onNavigate={onNavigate}
      />
    </Canvas>
  );
}
