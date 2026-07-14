import { useEffect, useRef } from 'react';
import type { PlotStatus } from '../hooks/usePlotSubmit';
import type { UserPlotRow } from '../types/userPlot';
import { EmotionPlotEditor } from './EmotionPlotEditor';
import { createDefaultPlot } from '../utils/plotHelpers';

interface WordEditorProps {
  plots: UserPlotRow[];
  selectedId: string | null;
  plotStatus: PlotStatus;
  onSelect: (id: string) => void;
  onChange: (plot: UserPlotRow, previousId?: string) => void;
  onAdd: (plot: UserPlotRow) => void;
  onDelete: (id: string) => void;
}

function plotStatusLabel(status: PlotStatus): string | null {
  switch (status) {
    case 'saving':
      return 'プロット中…';
    case 'saved':
      return 'Supabaseに反映しました';
    case 'error':
      return 'プロットに失敗しました';
    default:
      return null;
  }
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <span style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#c5c6c7' }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          borderRadius: '4px',
          border: '1px solid #1f2833',
          backgroundColor: '#0b0c10',
          color: '#fff',
          fontSize: '0.95rem',
        }}
      />
    </label>
  );
}

export function WordEditor({
  plots,
  selectedId,
  plotStatus,
  onSelect,
  onChange,
  onAdd,
  onDelete,
}: WordEditorProps) {
  const selectedPlot = plots.find((plot) => plot.word_id === selectedId) ?? null;
  const listItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const statusLabel = plotStatusLabel(plotStatus);
  const accentColor = '#4ea8de';

  useEffect(() => {
    if (!selectedId) return;
    listItemRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const handleAdd = () => {
    const newPlot = createDefaultPlot();
    onAdd(newPlot);
    onSelect(newPlot.word_id);
  };

  return (
    <aside
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        width: '320px',
        maxHeight: 'calc(100% - 32px)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'rgba(11, 12, 16, 0.92)',
        border: '1px solid #1f2833',
        borderRadius: '8px',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f2833' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', color: accentColor }}>単語エディタ</h2>
        <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>
          主感情・副感情・強度（編集後はプロットで反映）
        </p>
        {statusLabel && (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '0.75rem',
              color: plotStatus === 'error' ? '#ff0055' : '#45f3ff',
            }}
          >
            {statusLabel}
          </p>
        )}
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2833' }}>
        <button
          type="button"
          onClick={handleAdd}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: accentColor,
            color: '#0b0c10',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + 単語を追加
        </button>
      </div>

      <div style={{ maxHeight: '140px', overflowY: 'auto', padding: '8px', flexShrink: 0 }}>
        {plots.length === 0 && (
          <p style={{ margin: '8px 4px', fontSize: '0.85rem', color: '#9ca3af' }}>
            データがありません。追加するか Supabase にデータを登録してください。
          </p>
        )}
        {plots.map((plot) => {
          const isSelected = plot.word_id === selectedId;

          return (
            <button
              key={plot.word_id}
              type="button"
              ref={(element) => {
                if (element) {
                  listItemRefs.current.set(plot.word_id, element);
                } else {
                  listItemRefs.current.delete(plot.word_id);
                }
              }}
              onClick={() => onSelect(plot.word_id)}
              style={{
                width: '100%',
                display: 'block',
                marginBottom: '6px',
                padding: '10px 12px',
                textAlign: 'left',
                border: isSelected ? `1px solid ${accentColor}` : '1px solid #1f2833',
                borderRadius: '4px',
                backgroundColor: isSelected ? 'rgba(69, 243, 255, 0.08)' : '#0b0c10',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              {plot.word_id}
            </button>
          );
        })}
      </div>

      {selectedPlot && (
        <div style={{ padding: '16px', borderTop: '1px solid #1f2833', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#fff' }}>パラメータ編集</h3>

          <TextField
            label="単語ID"
            value={selectedPlot.word_id}
            onChange={(word_id) =>
              onChange({ ...selectedPlot, word_id }, selectedPlot.word_id)
            }
          />

          <EmotionPlotEditor
            plot={selectedPlot}
            onChange={(updated) => onChange(updated)}
          />

          <button
            type="button"
            onClick={() => onDelete(selectedPlot.word_id)}
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '8px 12px',
              border: '1px solid #ff0055',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: '#ff0055',
              cursor: 'pointer',
            }}
          >
            この単語を削除
          </button>
        </div>
      )}
    </aside>
  );
}
