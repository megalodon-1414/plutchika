import { useCallback, useRef, useState } from 'react';
import { syncUserPlots } from '../services/userPlots';
import type { UserPlotRow } from '../types/userPlot';

export type PlotStatus = 'idle' | 'saving' | 'saved' | 'error';

export function usePlotSubmit() {
  const [plotStatus, setPlotStatus] = useState<PlotStatus>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submitPlots = useCallback(async (plots: UserPlotRow[]) => {
    setPlotStatus('saving');
    try {
      await syncUserPlots(plots);
      setPlotStatus('saved');
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setPlotStatus('idle'), 2000);
    } catch (error) {
      console.error('Supabase plot sync failed:', error);
      setPlotStatus('error');
    }
  }, []);

  return { plotStatus, submitPlots };
}
