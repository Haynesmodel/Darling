export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function subscribeToReducedMotion(listener: (reduced: boolean) => void): () => void {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = (event: MediaQueryListEvent) => listener(event.matches);
  query.addEventListener('change', onChange);
  listener(query.matches);
  return () => query.removeEventListener('change', onChange);
}

export function motionAwareScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
