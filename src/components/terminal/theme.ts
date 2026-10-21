/** Resolve a design-token CSS variable ("230 236 244") into a canvas-friendly colour string. */
export function cssRgb(name: string, alpha = 1): string {
  if (typeof window === 'undefined') return `rgba(128,128,128,${alpha})`;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().replace(/\s+/g, ' ');
  if (!v) return `rgba(128,128,128,${alpha})`;
  const [r, g, b] = v.split(' ');
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
