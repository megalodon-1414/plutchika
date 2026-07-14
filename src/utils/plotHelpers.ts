import type { UserPlotRow } from '../types/userPlot';
import { createDefaultPlotRow } from './emotionPlotBridge';

export function createDefaultPlot(): UserPlotRow {
  return createDefaultPlotRow();
}

export function updatePlot(plots: UserPlotRow[], updated: UserPlotRow): UserPlotRow[] {
  return plots.map((plot) => (plot.word_id === updated.word_id ? updated : plot));
}

export function replacePlotId(
  plots: UserPlotRow[],
  previousId: string,
  updated: UserPlotRow,
): UserPlotRow[] {
  return plots.map((plot) => (plot.word_id === previousId ? updated : plot));
}

export function removePlotById(plots: UserPlotRow[], wordId: string): UserPlotRow[] {
  return plots.filter((plot) => plot.word_id !== wordId);
}
