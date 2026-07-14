export interface FaceParams {
  mouthCurve: number;
  mouthOpen: number;
  eyeHeight: number;
  eyeWidth: number;
  browAngle: number;
  browInnerTilt: number; // 正=眉頭下（怒り）、負=眉頭上（哀・恐れ）
  pupilY: number; // 正=下向き（嫌悪・哀）、負=上向き（信頼・恐れ）
}

export const PLUTCHIK_EMOTIONS = [
  { angle: 0, label: '喜' },
  { angle: 45, label: '信頼' },
  { angle: 90, label: '恐れ' },
  { angle: 135, label: '驚き' },
  { angle: 180, label: '哀' },
  { angle: 225, label: '嫌悪' },
  { angle: 270, label: '怒り' },
  { angle: 315, label: '期待' },
] as const;

const EMOTION_FACES: Array<FaceParams & { label: string }> = [
  { label: '喜', mouthCurve: 0.85, mouthOpen: 0.15, eyeHeight: 0.35, eyeWidth: 1, browAngle: -0.35, browInnerTilt: 0, pupilY: 0 },
  { label: '信頼', mouthCurve: 0.45, mouthOpen: 0.08, eyeHeight: 0.42, eyeWidth: 0.95, browAngle: -0.15, browInnerTilt: 0, pupilY: -2.5 },
  { label: '恐れ', mouthCurve: -0.15, mouthOpen: 0.45, eyeHeight: 0.72, eyeWidth: 1.05, browAngle: 0.55, browInnerTilt: -0.75, pupilY: -3 },
  { label: '驚き', mouthCurve: 0, mouthOpen: 0.75, eyeHeight: 0.88, eyeWidth: 1.15, browAngle: 0.7, browInnerTilt: 0, pupilY: 0 },
  { label: '哀', mouthCurve: -0.75, mouthOpen: 0.1, eyeHeight: 0.28, eyeWidth: 0.9, browAngle: 0.1, browInnerTilt: -0.9, pupilY: 1 },
  { label: '嫌悪', mouthCurve: -0.35, mouthOpen: 0.2, eyeHeight: 0.22, eyeWidth: 0.85, browAngle: 0.45, browInnerTilt: 0.35, pupilY: 3 },
  { label: '怒り', mouthCurve: -0.55, mouthOpen: 0.12, eyeHeight: 0.24, eyeWidth: 0.88, browAngle: 0, browInnerTilt: 1, pupilY: 0 },
  { label: '期待', mouthCurve: 0.35, mouthOpen: 0.18, eyeHeight: 0.5, eyeWidth: 1, browAngle: -0.25, browInnerTilt: 0, pupilY: -0.5 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpFace(from: FaceParams, to: FaceParams, t: number): FaceParams {
  return {
    mouthCurve: lerp(from.mouthCurve, to.mouthCurve, t),
    mouthOpen: lerp(from.mouthOpen, to.mouthOpen, t),
    eyeHeight: lerp(from.eyeHeight, to.eyeHeight, t),
    eyeWidth: lerp(from.eyeWidth, to.eyeWidth, t),
    browAngle: lerp(from.browAngle, to.browAngle, t),
    browInnerTilt: lerp(from.browInnerTilt, to.browInnerTilt, t),
    pupilY: lerp(from.pupilY, to.pupilY, t),
  };
}

export function getEmotionFaceAtAngle(angle: number): FaceParams & { label: string; nextLabel: string } {
  const normalized = ((angle % 360) + 360) % 360;
  const sectorIndex = Math.floor(normalized / 45) % 8;
  const nextIndex = (sectorIndex + 1) % 8;
  const t = (normalized % 45) / 45;

  const from = EMOTION_FACES[sectorIndex];
  const to = EMOTION_FACES[nextIndex];

  return {
    ...lerpFace(from, to, t),
    label: from.label,
    nextLabel: to.label,
  };
}
