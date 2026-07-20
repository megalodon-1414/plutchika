import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';

const LINE_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

const menuItemStyle: CSSProperties = {
  display: 'block',
  padding: '6px 2px',
  color: 'rgba(244, 236, 247, 0.88)',
  textDecoration: 'none',
  fontSize: '0.72rem',
  letterSpacing: '0.1em',
  fontWeight: 550,
  whiteSpace: 'nowrap',
  textShadow: '0 1px 8px rgba(0,0,0,0.7)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  textAlign: 'right',
};

export interface AppCornerMenuExtraItem {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface AppCornerMenuExtrasContextValue {
  setExtraItems: (ownerId: string, items: AppCornerMenuExtraItem[]) => void;
  clearExtraItems: (ownerId: string) => void;
  extraItems: AppCornerMenuExtraItem[];
}

const AppCornerMenuExtrasContext = createContext<AppCornerMenuExtrasContextValue | null>(null);

/** フルスクリーン画面で右上メニューの追加項目を共有する */
export function AppCornerMenuProvider({ children }: { children: ReactNode }) {
  const [byOwner, setByOwner] = useState<Record<string, AppCornerMenuExtraItem[]>>({});

  const setExtraItems = useCallback((ownerId: string, items: AppCornerMenuExtraItem[]) => {
    setByOwner((current) => ({ ...current, [ownerId]: items }));
  }, []);

  const clearExtraItems = useCallback((ownerId: string) => {
    setByOwner((current) => {
      if (!(ownerId in current)) return current;
      const next = { ...current };
      delete next[ownerId];
      return next;
    });
  }, []);

  const extraItems = useMemo(
    () => Object.values(byOwner).flat(),
    [byOwner],
  );

  const value = useMemo(
    () => ({ setExtraItems, clearExtraItems, extraItems }),
    [setExtraItems, clearExtraItems, extraItems],
  );

  return (
    <AppCornerMenuExtrasContext.Provider value={value}>
      {children}
    </AppCornerMenuExtrasContext.Provider>
  );
}

/** 単語着陸などから「Mapに戻る」などの追加メニューを登録する */
export function useAppCornerMenuExtras(
  ownerId: string,
  items: AppCornerMenuExtraItem[],
) {
  const ctx = useContext(AppCornerMenuExtrasContext);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const signature = items
    .map((item) => `${item.id}\0${item.label}\0${item.disabled ? 1 : 0}`)
    .join('\n');

  useEffect(() => {
    if (!ctx) return;
    const wrapped = itemsRef.current.map((item) => ({
      ...item,
      onClick: () => {
        itemsRef.current.find((entry) => entry.id === item.id)?.onClick();
      },
    }));
    ctx.setExtraItems(ownerId, wrapped);
    return () => ctx.clearExtraItems(ownerId);
  }, [ctx, ownerId, signature]);
}

/**
 * 右上ハンバーガーメニュー（Home など）。
 * 望遠鏡・感情MAP・ホームなどフルスクリーン画面で共通利用する。
 */
export function AppCornerMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const extrasCtx = useContext(AppCornerMenuExtrasContext);
  const extraItems = extrasCtx?.extraItems ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) {
        return;
      }
      if (!root.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        top: 'max(12px, env(safe-area-inset-top, 0px))',
        right: 14,
        zIndex: 80,
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes appCornerMenuItemIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
            filter: blur(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
      `}</style>

      <button
        type="button"
        aria-label="メニュー"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          position: 'relative',
          width: 40,
          height: 40,
          padding: 0,
          border: 'none',
          borderRadius: 8,
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 18,
            height: 12,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: 1.5,
              borderRadius: 999,
              background: 'rgba(244, 236, 247, 0.92)',
              boxShadow: '0 0 6px rgba(0,0,0,0.45)',
              transformOrigin: 'center',
              transform: open
                ? 'translateY(5.25px) rotate(45deg)'
                : 'translateY(0) rotate(0deg)',
              transition: `transform 420ms ${LINE_EASING}`,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              width: '100%',
              height: 1.5,
              marginTop: -0.75,
              borderRadius: 999,
              background: 'rgba(244, 236, 247, 0.92)',
              boxShadow: '0 0 6px rgba(0,0,0,0.45)',
              transformOrigin: 'center',
              transform: open ? 'scaleX(0)' : 'scaleX(1)',
              opacity: open ? 0 : 1,
              transition: `transform 280ms ${LINE_EASING}, opacity 220ms ease`,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '100%',
              height: 1.5,
              borderRadius: 999,
              background: 'rgba(244, 236, 247, 0.92)',
              boxShadow: '0 0 6px rgba(0,0,0,0.45)',
              transformOrigin: 'center',
              transform: open
                ? 'translateY(-5.25px) rotate(-45deg)'
                : 'translateY(0) rotate(0deg)',
              transition: `transform 420ms ${LINE_EASING}`,
              transitionDelay: open ? '40ms' : '0ms',
            }}
          />
        </span>
      </button>

      <div
        role="menu"
        aria-hidden={!open}
        style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
          pointerEvents: open ? 'auto' : 'none',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          transition: 'opacity 180ms ease, visibility 180ms ease',
        }}
      >
        <Link
          role="menuitem"
          to={ROUTES.home}
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          style={{
            ...menuItemStyle,
            animation: open
              ? `appCornerMenuItemIn 360ms ${LINE_EASING} both`
              : 'none',
          }}
        >
          Home
        </Link>
        {extraItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            tabIndex={open && !item.disabled ? 0 : -1}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              setOpen(false);
              item.onClick();
            }}
            style={{
              ...menuItemStyle,
              opacity: item.disabled ? 0.45 : 1,
              cursor: item.disabled ? 'default' : 'pointer',
              animation: open
                ? `appCornerMenuItemIn 360ms ${LINE_EASING} ${(index + 1) * 40}ms both`
                : 'none',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
