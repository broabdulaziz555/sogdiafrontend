/** Helpers for the server-rendered PNGs (trade cards, certificates). */

export async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!res.ok) throw new Error(`Image request failed (HTTP ${res.status}).`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('The server did not return an image.');
  return blob;
}

/**
 * Saves the PNG to the device. If the browser blocks the cross-origin read (missing CORS headers on the
 * image route) it falls back to opening the image in a new tab, where it can be saved by long-press / right-click.
 */
export async function saveOrOpen(url: string, filename: string): Promise<'saved' | 'opened'> {
  try {
    const blob = await fetchImageBlob(url);
    const obj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 4000);
    return 'saved';
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
    return 'opened';
  }
}

export const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Native share sheet with the image attached when possible, otherwise the link. */
export async function shareImage(url: string, filename: string, title: string): Promise<void> {
  try {
    const blob = await fetchImageBlob(url);
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  } catch { /* fall through to the link share */ }
  await navigator.share({ title, url });
}
