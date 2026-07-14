import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DevWordQuizCard } from '../components/dev/DevWordQuizCard';
import { fetchEmotionWordsAsPlots } from '../services/emotionWords';
import {
  deleteEmotionWord,
  fetchEmotionLookup,
  updateEmotionWord,
  type EmotionLookup,
} from '../services/emotionWordsMutations';
import type { UserPlotRow } from '../types/userPlot';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function shuffleIds(ids: number[]): number[] {
  const queue = [...ids];
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }
  return queue;
}

function plotsBySourceId(plots: UserPlotRow[]): Map<number, UserPlotRow> {
  const map = new Map<number, UserPlotRow>();
  for (const plot of plots) {
    if (plot.sourceId != null) {
      map.set(plot.sourceId, plot);
    }
  }
  return map;
}

export function DevWordsEditorPage() {
  const [plots, setPlots] = useState<UserPlotRow[]>([]);
  const [lookup, setLookup] = useState<EmotionLookup | null>(null);
  const [queue, setQueue] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const plotsRef = useRef(plots);
  const lookupRef = useRef(lookup);
  const isDirtyRef = useRef(isDirty);
  const saveStatusRef = useRef(saveStatus);

  plotsRef.current = plots;
  lookupRef.current = lookup;
  isDirtyRef.current = isDirty;
  saveStatusRef.current = saveStatus;

  const plotMap = useMemo(() => plotsBySourceId(plots), [plots]);
  const currentSourceId = queue[currentIndex] ?? null;
  const currentPlot = currentSourceId != null ? plotMap.get(currentSourceId) ?? null : null;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [emotionLookup, wordPlots] = await Promise.all([
        fetchEmotionLookup(),
        fetchEmotionWordsAsPlots(),
      ]);

      const ids = wordPlots
        .map((plot) => plot.sourceId)
        .filter((id): id is number => id != null);

      setLookup(emotionLookup);
      setPlots(wordPlots);
      setQueue(shuffleIds(ids));
      setCurrentIndex(0);
      setIsDirty(false);
      setSaveStatus('idle');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'データの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const persistCurrent = useCallback(async (): Promise<boolean> => {
    const sourceId = queue[currentIndex];
    const plot = sourceId != null ? plotsRef.current.find((item) => item.sourceId === sourceId) : null;
    const emotionLookup = lookupRef.current;

    if (!plot || !emotionLookup || sourceId == null) {
      return true;
    }

    if (!isDirtyRef.current && saveStatusRef.current === 'saved') {
      return true;
    }

    setSaveStatus('saving');

    try {
      await updateEmotionWord(sourceId, plot, emotionLookup.supabaseIdByEmotionId);
      setSaveStatus('saved');
      setIsDirty(false);
      return true;
    } catch (error) {
      console.error('emotion_words update failed:', error);
      setSaveStatus('error');
      return false;
    }
  }, [currentIndex, queue]);

  const updateCurrentPlot = useCallback(
    (updated: UserPlotRow) => {
      if (updated.sourceId == null) {
        return;
      }

      setPlots((current) =>
        current.map((plot) => (plot.sourceId === updated.sourceId ? updated : plot)),
      );
      setIsDirty(true);
      if (saveStatusRef.current === 'saved') {
        setSaveStatus('idle');
      }
    },
    [],
  );

  const goNext = useCallback(async () => {
    const saved = await persistCurrent();
    if (!saved) {
      return;
    }

    setCurrentIndex((index) => {
      if (queue.length === 0) {
        return 0;
      }
      if (index + 1 >= queue.length) {
        setQueue(shuffleIds(queue));
        return 0;
      }
      return index + 1;
    });
    setSaveStatus('idle');
    setIsDirty(false);
  }, [persistCurrent, queue]);

  const goSkip = useCallback(() => {
    setCurrentIndex((index) => {
      if (queue.length === 0) {
        return 0;
      }
      if (index + 1 >= queue.length) {
        setQueue(shuffleIds(queue));
        return 0;
      }
      return index + 1;
    });
    setSaveStatus('idle');
    setIsDirty(false);
  }, [queue]);

  const goPrevious = useCallback(() => {
    setCurrentIndex((index) => Math.max(0, index - 1));
    setSaveStatus('idle');
    setIsDirty(false);
  }, []);

  const reshuffle = useCallback(() => {
    setQueue((current) => shuffleIds(current));
    setCurrentIndex(0);
    setSaveStatus('idle');
    setIsDirty(false);
  }, []);

  const deleteCurrent = useCallback(async () => {
    const sourceId = queue[currentIndex];
    const plot = sourceId != null ? plotMap.get(sourceId) : null;

    if (sourceId == null || !plot) {
      return;
    }

    const confirmed = window.confirm(
      `「${plot.word_id}」を emotion_words テーブルから削除しますか？\nこの操作は取り消せません。`,
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setLoadError(null);

    try {
      await deleteEmotionWord(sourceId);

      setPlots((current) => current.filter((item) => item.sourceId !== sourceId));
      setQueue((current) => {
        const nextQueue = current.filter((id) => id !== sourceId);
        setCurrentIndex((index) => {
          if (nextQueue.length === 0) {
            return 0;
          }
          return Math.min(index, nextQueue.length - 1);
        });
        return nextQueue;
      });
      setSaveStatus('idle');
      setIsDirty(false);
    } catch (error) {
      console.error('emotion_words delete failed:', error);
      setLoadError(error instanceof Error ? error.message : '削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  }, [currentIndex, plotMap, queue]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          event.target.tagName === 'INPUT' ||
          event.target.tagName === 'TEXTAREA' ||
          event.target.tagName === 'SELECT')
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'enter') {
        event.preventDefault();
        void goNext();
      } else if (key === 's') {
        event.preventDefault();
        goSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goSkip]);

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '24px 20px 56px',
        boxSizing: 'border-box',
        backgroundColor: '#0b0c10',
        color: '#f4ecf7',
      }}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
            marginBottom: '24px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p
              style={{
                margin: '0 0 6px',
                fontSize: '0.75rem',
                letterSpacing: '0.14em',
                color: '#45f3ff',
              }}
            >
              DEV TOOL
            </p>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 600 }}>
              単語エディタ（一問一答）
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #1f2833',
                backgroundColor: '#111318',
                color: '#45f3ff',
                cursor: isLoading ? 'wait' : 'pointer',
                fontSize: '0.85rem',
              }}
            >
              再読み込み
            </button>
            <button
              type="button"
              onClick={reshuffle}
              disabled={isLoading || queue.length === 0}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #1f2833',
                backgroundColor: '#111318',
                color: '#c39bd3',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              順番をシャッフル
            </button>
          </div>
        </header>

        {loadError && (
          <p
            style={{
              margin: '0 0 16px',
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 0, 85, 0.12)',
              color: '#ff8fab',
            }}
          >
            {loadError}
          </p>
        )}

        {isLoading ? (
          <p style={{ color: '#9ca3af' }}>読み込み中…</p>
        ) : currentPlot && queue.length > 0 ? (
          <DevWordQuizCard
            plot={currentPlot}
            index={currentIndex}
            total={queue.length}
            saveStatus={saveStatus}
            onChange={updateCurrentPlot}
            onNext={() => void goNext()}
            onSkip={goSkip}
            onPrevious={goPrevious}
            onDelete={() => void deleteCurrent()}
            canGoPrevious={currentIndex > 0}
            isDeleting={isDeleting}
          />
        ) : (
          <p style={{ color: '#9ca3af' }}>編集できる単語がありません。</p>
        )}
      </div>
    </div>
  );
}
