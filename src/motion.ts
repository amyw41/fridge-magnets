/** True when the user has asked their OS for less motion: animations should just fade or jump. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
