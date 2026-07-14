function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function toPlotFrequency(frequency: number): number {
  return Math.abs(frequency - 100);
}

export function spreadAngle(angle: number, id: string): number {
  const hash = hashId(id);
  const jitter = (hash % 17) - 8 + ((hash >> 4) % 11) - 5;
  return ((angle + jitter) % 360 + 360) % 360;
}
