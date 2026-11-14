/**
 * Безопасная загрузка изображения для рисования на HTMLCanvasElement:
 * проставляет crossOrigin для внешних URL (чтобы не "заразить" canvas при toDataURL/toBlob)
 * и ограничивает ожидание таймаутом.
 */
export function loadCanvasImage(url: string, timeoutMs = 1800): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      finish(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}
