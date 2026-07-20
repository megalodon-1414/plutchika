/**
 * 望遠鏡モチーフの感情語探索空間（実験）。
 * 既存の感情MAP（`/map` / App.tsx）とは分離。
 */
export { TelescopeSpaceView } from './TelescopeSpaceView';
export {
  TELESCOPE_GALAXY_NODES,
  TELESCOPE_DETAIL_NODES,
} from './constants';
export type { TelescopeZoomPhase, TelescopeSettledPhase } from './constants';
/** 検知照準モード（`TELESCOPE_AIM.mode = 'center' | 'cursor'`） */
export { TELESCOPE_AIM, setTelescopeAimMode } from './telescopeAim';
export type { TelescopeAimMode } from './telescopeAim';
