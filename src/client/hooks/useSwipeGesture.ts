import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

// --- Constants ---
const COMMIT_DISTANCE = 100;   // px to commit swipe
const COMMIT_VELOCITY = 0.5;   // px/ms for flick commit
const TAP_THRESHOLD = 5;       // total displacement under this = tap
const ROTATION_FACTOR = 0.1;   // degrees per pixel of horizontal offset

// --- Spring config ---
const SPRING_STIFFNESS = 300;
const SPRING_DAMPING = 25;
const SPRING_MASS = 1;

// --- Spring physics ---
function springStep(
  x: number,
  v: number,
  stiffness: number,
  damping: number,
  mass: number,
  dt: number
): { x: number; v: number } {
  const springForce = -stiffness * x;   // target is 0
  const dampingForce = -damping * v;
  const acceleration = (springForce + dampingForce) / mass;
  const newV = v + acceleration * dt;
  const newX = x + newV * dt;
  return { x: newX, v: newV };
}

export interface SwipeGestureState {
  offsetX: number;
  offsetY: number;
  rotation: number;
  isDragging: boolean;
  stampOpacity: number;  // -1 (full nope) to 1 (full like)
}

const DEFAULT_STATE: SwipeGestureState = {
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  isDragging: false,
  stampOpacity: 0,
};

export function useSwipeGesture(
  cardRef: RefObject<HTMLElement>,
  callbacks: {
    onSwipeCommit: (direction: 'left' | 'right') => void;
    onTap: () => void;
  }
) {
  const state = signal<SwipeGestureState>({ ...DEFAULT_STATE });

  // Mutable tracking refs (not reactive, just internal tracking)
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const lastX = useRef(0);
  const rafId = useRef<number>(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Cancel any running spring animation
  function cancelSpring(): void {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }
  }

  // Spring-back animation via rAF loop
  function springBack(): void {
    let posX = state.value.offsetX;
    let posY = state.value.offsetY;
    let velX = 0;
    let velY = 0;
    let lastFrame = performance.now();

    function animate(now: number): void {
      const dt = Math.min((now - lastFrame) / 1000, 0.032); // cap at ~30fps min
      lastFrame = now;

      const stepX = springStep(posX, velX, SPRING_STIFFNESS, SPRING_DAMPING, SPRING_MASS, dt);
      const stepY = springStep(posY, velY, SPRING_STIFFNESS, SPRING_DAMPING, SPRING_MASS, dt);
      posX = stepX.x;
      velX = stepX.v;
      posY = stepY.x;
      velY = stepY.v;

      // Settlement: stop when velocity and position are negligible
      if (Math.abs(velX) < 0.5 && Math.abs(posX) < 0.5 &&
          Math.abs(velY) < 0.5 && Math.abs(posY) < 0.5) {
        state.value = { ...DEFAULT_STATE };
        rafId.current = 0;
        return;
      }

      state.value = {
        offsetX: posX,
        offsetY: posY,
        rotation: posX * ROTATION_FACTOR,
        isDragging: false,
        stampOpacity: clamp(posX / COMMIT_DISTANCE, -1, 1),
      };

      rafId.current = requestAnimationFrame(animate);
    }

    rafId.current = requestAnimationFrame(animate);
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();

    const el = cardRef.current;
    if (el) {
      el.setPointerCapture(e.pointerId);
    }

    cancelSpring();
    dragging.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startTime.current = Date.now();
    lastX.current = e.clientX;

    state.value = { ...state.value, isDragging: true };
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging.current) return;

    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    lastX.current = e.clientX;

    state.value = {
      offsetX: dx,
      offsetY: dy,
      rotation: dx * ROTATION_FACTOR,
      isDragging: true,
      stampOpacity: clamp(dx / COMMIT_DISTANCE, -1, 1),
    };
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging.current) return;
    dragging.current = false;

    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    const totalMovement = Math.sqrt(dx * dx + dy * dy);

    // Tap detection
    if (totalMovement < TAP_THRESHOLD) {
      state.value = { ...DEFAULT_STATE };
      callbacksRef.current.onTap();
      return;
    }

    // Swipe commit detection
    const elapsed = Date.now() - startTime.current;
    const velocity = elapsed > 0 ? dx / elapsed : 0;   // px/ms
    const committed = Math.abs(dx) > COMMIT_DISTANCE || Math.abs(velocity) > COMMIT_VELOCITY;

    if (committed) {
      const direction: 'left' | 'right' = dx < 0 ? 'left' : 'right';
      state.value = { ...state.value, isDragging: false };
      callbacksRef.current.onSwipeCommit(direction);
    } else {
      // Spring back to center
      state.value = { ...state.value, isDragging: false };
      springBack();
    }
  }

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => cancelSpring();
  }, []);

  return {
    state,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
