import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** ジェスチャー検知後、次の入力を無視する時間（=1ステップぶんのアニメ再生時間） */
const GESTURE_LOCK_MS = 750;
const WHEEL_DELTA_THRESHOLD = 10;
const TOUCH_DELTA_THRESHOLD = 32;

export interface UseStepGestureResult {
  activeIndex: number;
  /** ステップ切り替えアニメーション中は true */
  isAnimating: boolean;
  goNext: () => void;
  goPrev: () => void;
  /** 任意のステップへ直接ジャンプする（現在地インジケーターのドットクリックなど向け）。 */
  goTo: (index: number) => void;
}

/**
 * スクロール量に比例させず、ジェスチャー1回につき1ステップだけ進める。
 * ホイール／タッチスワイプ／矢印キーを検知し、アニメ中は次の入力を無視する。
 */
export function useStepGesture(
  stepCount: number,
  containerRef: RefObject<HTMLElement | null>,
  initialIndex = 0,
): UseStepGestureResult {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isAnimating, setIsAnimating] = useState(false);
  const activeIndexRef = useRef(initialIndex);
  const lockedRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);
  const lockTimerRef = useRef<number | null>(null);

  const step = useCallback(
    (direction: 1 | -1) => {
      if (lockedRef.current) {
        return;
      }
      const next = activeIndexRef.current + direction;
      if (next < 0 || next >= stepCount) {
        return;
      }

      lockedRef.current = true;
      activeIndexRef.current = next;
      setActiveIndex(next);
      setIsAnimating(true);

      lockTimerRef.current = window.setTimeout(() => {
        lockedRef.current = false;
        setIsAnimating(false);
      }, GESTURE_LOCK_MS);
    },
    [stepCount],
  );

  const goNext = useCallback(() => step(1), [step]);
  const goPrev = useCallback(() => step(-1), [step]);

  const goTo = useCallback(
    (index: number) => {
      if (lockedRef.current || index < 0 || index >= stepCount || index === activeIndexRef.current) {
        return;
      }
      lockedRef.current = true;
      activeIndexRef.current = index;
      setActiveIndex(index);
      setIsAnimating(true);

      lockTimerRef.current = window.setTimeout(() => {
        lockedRef.current = false;
        setIsAnimating(false);
      }, GESTURE_LOCK_MS);
    },
    [stepCount],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < WHEEL_DELTA_THRESHOLD) {
        return;
      }
      event.preventDefault();
      step(event.deltaY > 0 ? 1 : -1);
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const startY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY == null || currentY == null) {
        return;
      }
      const delta = startY - currentY;
      if (Math.abs(delta) < TOUCH_DELTA_THRESHOLD) {
        return;
      }
      event.preventDefault();
      touchStartYRef.current = null;
      step(delta > 0 ? 1 : -1);
    };

    const handleTouchEnd = () => {
      touchStartYRef.current = null;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        step(1);
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        step(-1);
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, step]);

  useEffect(
    () => () => {
      if (lockTimerRef.current != null) {
        window.clearTimeout(lockTimerRef.current);
      }
    },
    [],
  );

  return { activeIndex, isAnimating, goNext, goPrev, goTo };
}
