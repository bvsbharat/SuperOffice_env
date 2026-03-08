/**
 * Easing Functions
 *
 * Smooth animation curves for professional motion
 */

export const ease = {
  /**
   * Linear interpolation (no easing)
   */
  linear: (t: number): number => t,

  /**
   * Quadratic ease-in-out (smooth acceleration/deceleration)
   */
  easeInOutQuad: (t: number): number =>
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  /**
   * Cubic ease-in-out (smoother than quad)
   */
  easeInOutCubic: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * (t - 2)) * (2 * (t - 2)) + 1,

  /**
   * Sine ease-in-out (very smooth, natural feel)
   */
  easeInOutSine: (t: number): number =>
    -(Math.cos(Math.PI * t) - 1) / 2,

  /**
   * Elastic ease-out (bouncy effect)
   */
  easeOutElastic: (t: number): number => {
    const c5 = (2 * Math.PI) / 4.5
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c5) + 1
  },

  /**
   * Back ease-out (slight overshoot then settle)
   */
  easeOutBack: (t: number): number => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return c3 * t * t * t - c1 * t * t
  },

  /**
   * Bounce ease-out (playful bounce)
   */
  easeOutBounce: (t: number): number => {
    const n1 = 7.5625
    const d1 = 2.75

    if (t < 1 / d1) {
      return n1 * t * t
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
  },
}

/**
 * Lerp with easing
 *
 * @param start Starting value
 * @param end Ending value
 * @param t Progress (0-1)
 * @param easingFn Easing function
 */
export function lerp(start: number, end: number, t: number, easingFn = ease.linear): number {
  const eased = easingFn(Math.max(0, Math.min(1, t)))
  return start + (end - start) * eased
}

/**
 * Vector lerp with easing
 */
export function lerpVector(
  start: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
  easingFn = ease.linear
): { x: number; y: number } {
  return {
    x: lerp(start.x, end.x, t, easingFn),
    y: lerp(start.y, end.y, t, easingFn),
  }
}
