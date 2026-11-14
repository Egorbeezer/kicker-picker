const imageCache = new Map<string, HTMLImageElement | null>();

/**
 * Безопасная загрузка изображения для рисования на HTMLCanvasElement:
 * кэширует результат, проставляет crossOrigin для внешних URL
 * и ограничивает ожидание коротким таймаутом (чтобы не тормозить генерацию скриншота).
 */
export function loadCanvasImage(url: string, timeoutMs = 450): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  if (imageCache.has(url)) {
    return Promise.resolve(imageCache.get(url) ?? null);
  }
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
      if (result) {
        imageCache.set(url, result);
      }
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      finish(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    };
    img.onerror = () => {
      imageCache.set(url, null);
      finish(null);
    };
    img.src = url;
  });
}

/**
 * Кодирует canvas в PNG за один проход для предпросмотра
 * и готовит компактный JPEG payload (в 5-8x меньше) для быстрой отправки в Telegram.
 */
export function canvasToPngResult(canvas: HTMLCanvasElement): {
  dataUrl: string;
  base64: string;
  shareBase64: string;
  blob: Blob;
} {
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] || '';

  let shareBase64 = base64;
  try {
    const jpegUrl = canvas.toDataURL('image/jpeg', 0.9);
    const jpegPart = jpegUrl.split(',')[1] || '';
    if (jpegPart && jpegPart.length < base64.length) {
      shareBase64 = jpegPart;
    }
  } catch {
    // fallback к PNG base64
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'image/png' });
  return { dataUrl, base64, shareBase64, blob };
}
