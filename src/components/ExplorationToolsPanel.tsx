import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EmotionId } from '../data/emotions';
import type { UserPlotRow } from '../types/userPlot';
import type { EmotionUiTheme } from '../utils/emotionUiTheme';
import { getPlotKey, isWarpLandingPlot } from '../utils/plotIdentity';
import { isExplorationDummyPlot } from '../utils/explorationDummyPlots';
import {
  PLOT_TAGS,
  searchPlotsByQuery,
  type PlotTagId,
} from '../utils/plotTags';

const UI_COLOR_TRANSITION =
  'border-color 320ms ease, background-color 320ms ease, color 320ms ease, box-shadow 320ms ease, border-radius 200ms ease';

const TAB_GAP = 6;
const TAB_HEIGHT = 36;
const TAB_RADIUS = 8;
const PANEL_RADIUS = 9;
const BRIDGE_GAP = 6;
const ICON_SIZE = 24;

type ToolsTab = 'search' | 'tags' | 'game';

interface ExplorationToolsPanelProps {
  width: number;
  uiTheme: EmotionUiTheme;
  plots: UserPlotRow[];
  selectedTagIds: ReadonlySet<PlotTagId>;
  /** 探索中は同一星系内の単語検索に限定する（未使用・互換用） */
  currentSystemId?: EmotionId | null;
  currentPlot?: UserPlotRow | null;
  onToggleTag: (tagId: PlotTagId) => void;
  onSelectWord: (wordId: string, options?: { viaSearch?: boolean }) => void;
  searchGameActive?: boolean;
  onStartSearchGame?: () => void;
  onQuitSearchGame?: () => void;
}

function SearchIcon({ color }: { color: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth="1.8" />
      <path d="M15.5 15.5L20 20" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon({ color }: { color: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 12.5V5.8c0-.7.6-1.3 1.3-1.3H12l7.2 7.2c.5.5.5 1.3 0 1.8l-5.9 5.9c-.5.5-1.3.5-1.8 0L3.5 12.5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="8.2" cy="8.2" r="1.2" fill={color} />
    </svg>
  );
}

function GamepadIcon({ color }: { color: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="7.5" width="19" height="11" rx="4" stroke={color} strokeWidth="1.8" />
      <path d="M8 11v4M6 13h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="15.2" cy="12.2" r="1.1" fill={color} />
      <circle cx="17.8" cy="14.2" r="1.1" fill={color} />
    </svg>
  );
}

export function ExplorationToolsPanel({
  width,
  uiTheme,
  plots,
  selectedTagIds,
  currentSystemId: _currentSystemId = null,
  currentPlot: _currentPlot = null,
  onToggleTag,
  onSelectWord,
  searchGameActive = false,
  onStartSearchGame,
  onQuitSearchGame,
}: ExplorationToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<ToolsTab | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const searchablePlots = useMemo(
    () => plots.filter((plot) => {
      if (isWarpLandingPlot(plot) || isExplorationDummyPlot(plot.word_id)) {
        return false;
      }
      return true;
    }),
    [plots],
  );

  const suggestions = useMemo(
    () => searchPlotsByQuery(searchablePlots, searchQuery),
    [searchablePlots, searchQuery],
  );

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      if (event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      setActiveTab(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [activeTab]);

  const panelSurface = `linear-gradient(145deg, ${uiTheme.holoPanel}, rgba(0,0,0,0.08))`;

  const tabs: { id: ToolsTab; label: string; icon: (color: string) => ReactNode }[] = [
    { id: 'search', label: '検索', icon: (c) => <SearchIcon color={c} /> },
    { id: 'tags', label: 'タグ', icon: (c) => <TagIcon color={c} /> },
    { id: 'game', label: 'ゲーム', icon: (c) => <GamepadIcon color={c} /> },
  ];

  const handleTabClick = (tabId: ToolsTab) => {
    setActiveTab((prev) => (prev === tabId ? null : tabId));
  };

  const activeTabIndex = activeTab ? tabs.findIndex((tab) => tab.id === activeTab) : -1;
  const tabColumnWidth = (width - TAB_GAP * 2) / 3;
  const openingStart =
    activeTabIndex >= 0 ? activeTabIndex * (tabColumnWidth + TAB_GAP) : 0;
  const openingEnd =
    activeTabIndex >= 0 ? openingStart + tabColumnWidth : 0;
  const outlineColor = uiTheme.accentBorderStrong;

  const panelBorderRadius =
    activeTab === 'search'
      ? `0 ${PANEL_RADIUS}px ${PANEL_RADIUS}px ${PANEL_RADIUS}px`
      : activeTab === 'game'
        ? `${PANEL_RADIUS}px 0 ${PANEL_RADIUS}px ${PANEL_RADIUS}px`
        : `${PANEL_RADIUS}px`;

  return (
    <div
      ref={rootRef}
      aria-label="探索ツール"
      style={{
        width: `${width}px`,
        pointerEvents: 'auto',
        transition: UI_COLOR_TRANSITION,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: `${TAB_GAP}px`,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const iconColor = isActive ? uiTheme.accentMuted : uiTheme.textMuted;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-expanded={isActive}
              aria-pressed={isActive}
              onClick={() => handleTabClick(tab.id)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: `${TAB_HEIGHT}px`,
                padding: 0,
                borderRadius: isActive
                  ? `${TAB_RADIUS}px ${TAB_RADIUS}px 0 0`
                  : `${TAB_RADIUS}px`,
                border: `1px solid ${isActive ? outlineColor : uiTheme.accentBorder}`,
                borderBottom: isActive ? 'none' : `1px solid ${uiTheme.accentBorder}`,
                background: isActive ? panelSurface : uiTheme.holoPanel,
                boxShadow: isActive ? `0 0 10px ${uiTheme.accentGlow}` : 'none',
                backdropFilter: isActive ? 'blur(14px) saturate(1.4)' : undefined,
                cursor: 'pointer',
                transition: UI_COLOR_TRANSITION,
              }}
            >
              {tab.icon(iconColor)}
              {isActive && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: '-1px',
                    right: '-1px',
                    top: '100%',
                    height: `${BRIDGE_GAP}px`,
                    background: panelSurface,
                    borderLeft: `1px solid ${outlineColor}`,
                    borderRight: `1px solid ${outlineColor}`,
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {activeTab && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            marginTop: `${BRIDGE_GAP}px`,
            minHeight: '132px',
            padding: '12px',
            borderRadius: panelBorderRadius,
            background: panelSurface,
            border: 'none',
            boxShadow: `0 0 18px ${uiTheme.holoGlow}, inset 0 0 20px ${uiTheme.panelInset}`,
            backdropFilter: 'blur(14px) saturate(1.4)',
            transition: UI_COLOR_TRANSITION,
          }}
        >
          {/* 上辺は選択タブ位置で途切れる線として描画 */}
          {openingStart > 0 && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${openingStart}px`,
                height: '1px',
                backgroundColor: outlineColor,
                pointerEvents: 'none',
              }}
            />
          )}
          {openingEnd < width && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                left: `${openingEnd}px`,
                right: 0,
                height: '1px',
                backgroundColor: outlineColor,
                pointerEvents: 'none',
              }}
            />
          )}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '1px',
              backgroundColor: outlineColor,
              pointerEvents: 'none',
            }}
          />
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: '1px',
              backgroundColor: outlineColor,
              pointerEvents: 'none',
            }}
          />
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '1px',
              backgroundColor: outlineColor,
              pointerEvents: 'none',
            }}
          />

          {activeTab === 'search' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'block', position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    pointerEvents: 'none',
                  }}
                >
                  <SearchIcon color={uiTheme.textMuted} />
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="単語を検索"
                  autoFocus
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: '34px',
                    padding: '0 10px 0 34px',
                    borderRadius: '7px',
                    border: `1px solid ${uiTheme.controlBorder}`,
                    backgroundColor: uiTheme.controlBackground,
                    color: uiTheme.textPrimary,
                    fontSize: '0.82rem',
                    outline: 'none',
                    transition: UI_COLOR_TRANSITION,
                  }}
                />
              </label>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  maxHeight: '148px',
                  overflowY: 'auto',
                }}
              >
                {searchQuery.trim() && suggestions.length === 0 && (
                  <p
                    style={{
                      margin: '6px 2px',
                      fontSize: '0.72rem',
                      color: uiTheme.textMuted,
                    }}
                  >
                    一致する単語がありません
                  </p>
                )}
                {suggestions.map((plot) => (
                  <button
                    key={getPlotKey(plot)}
                    type="button"
                    onClick={() => onSelectWord(getPlotKey(plot), { viaSearch: true })}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 9px',
                      borderRadius: '6px',
                      border: `1px solid ${uiTheme.divider}`,
                      background: 'transparent',
                      color: uiTheme.textPrimary,
                      fontSize: '0.8rem',
                      letterSpacing: '0.02em',
                      cursor: 'pointer',
                      transition: UI_COLOR_TRANSITION,
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.borderColor = uiTheme.accentBorderStrong;
                      event.currentTarget.style.backgroundColor = uiTheme.controlBackground;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.borderColor = uiTheme.divider;
                      event.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {plot.word_id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tags' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  color: uiTheme.textMuted,
                }}
              >
                種別で絞り込み
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {PLOT_TAGS.map((tag) => {
                  const selected = selectedTagIds.has(tag.id);
                  const disabled = !tag.available;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => onToggleTag(tag.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '7px',
                        border: `1px solid ${selected ? uiTheme.accentBorderStrong : uiTheme.accentBorder}`,
                        background: selected ? uiTheme.controlBackground : 'transparent',
                        color: disabled ? uiTheme.textMuted : uiTheme.textPrimary,
                        opacity: disabled ? 0.45 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem',
                        transition: UI_COLOR_TRANSITION,
                      }}
                    >
                      <span>{tag.label}</span>
                      {!tag.available && (
                        <span style={{ fontSize: '0.62rem', letterSpacing: '0.06em' }}>準備中</span>
                      )}
                      {tag.available && selected && (
                        <span style={{ color: uiTheme.accentMuted, fontSize: '0.7rem' }}>ON</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'game' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                minHeight: '108px',
                padding: '8px 0',
              }}
            >
              <GamepadIcon color={uiTheme.accentMuted} />
              <p
                style={{
                  margin: 0,
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: uiTheme.holoText,
                  textShadow: `0 0 8px ${uiTheme.holoGlow}`,
                }}
              >
                サーチゲーム
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.72rem',
                  lineHeight: 1.5,
                  color: uiTheme.holoSubtext,
                  textAlign: 'center',
                  maxWidth: '200px',
                }}
              >
                {searchGameActive
                  ? 'お題の単語をマップ上で探そう'
                  : 'お題の単語をマップを渡り歩いて探す'}
              </p>
              {searchGameActive ? (
                <button
                  type="button"
                  onClick={onQuitSearchGame}
                  style={{
                    minWidth: '112px',
                    height: '34px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: `1px solid ${uiTheme.controlBorder}`,
                    background: 'transparent',
                    color: uiTheme.textSecondary,
                    fontSize: '0.82rem',
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                    transition: UI_COLOR_TRANSITION,
                  }}
                >
                  終了する
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStartSearchGame}
                  style={{
                    minWidth: '112px',
                    height: '34px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: `1px solid ${uiTheme.accentBorderStrong}`,
                    background: uiTheme.controlBackground,
                    color: uiTheme.controlText,
                    fontSize: '0.82rem',
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                    boxShadow: `0 0 12px ${uiTheme.accentGlow}`,
                    transition: UI_COLOR_TRANSITION,
                  }}
                >
                  スタート
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
