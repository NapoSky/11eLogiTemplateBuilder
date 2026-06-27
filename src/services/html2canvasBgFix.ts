/**
 * Workaround for an html2canvas-pro v2.x regression where a CSS
 * `background-image` silently fails to render on every render after the first
 * one that uses the same URL.
 *
 * Root cause: the library memoizes CSS value parsing in a module-level
 * `parseCache`. Parsing a `background-image` has the side effect of registering
 * the image in the *per-render* image cache (`context.cache.addImage()`). On a
 * cache hit (same raw CSS value seen before), the memoized parse result is
 * returned WITHOUT re-running the parser, so `addImage()` is never called on the
 * new render's image cache and the background is silently dropped.
 *
 * This is distinct from issue #210 (baseURI / `about:blank`), which is fixed in
 * v2.x. See: https://github.com/yorickshan/html2canvas-pro
 *
 * Fix: append a unique `#fragment` to every `background-image` URL on the
 * throwaway export clone, just before calling html2canvas. The fragment makes
 * the raw CSS value string unique per render (parseCache miss → `addImage()`
 * runs again) but is ignored when fetching the resource, so there is no network
 * reload and `data:` URLs keep working.
 */
let counter = 0;

const URL_IN_BACKGROUND = /url\((['"]?)([^'")]+)\1\)/g;

const appendCacheBustToken = (el: HTMLElement, token: string): void => {
  const bg = el.style.backgroundImage;
  if (!bg || !bg.includes('url(')) return;
  el.style.backgroundImage = bg.replace(URL_IN_BACKGROUND, (_match, quote, url) => {
    const separator = url.includes('#') ? '&' : '#';
    return `url(${quote}${url}${separator}${token}${quote})`;
  });
};

/**
 * Make every inline `background-image` URL on `root` (and its descendants)
 * unique so html2canvas-pro re-registers them for this render.
 *
 * Call this on the detached export/preview clone right before html2canvas.
 */
export function bustBackgroundImageCache(root: HTMLElement): void {
  const token = `h2cbust=${Date.now()}-${counter++}`;
  appendCacheBustToken(root, token);
  root
    .querySelectorAll<HTMLElement>('[style*="background-image"]')
    .forEach((el) => appendCacheBustToken(el, token));
}

const isDataUrl = (url: string): boolean => /^data:/i.test(url);

const isCrossOrigin = (url: string): boolean => {
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
};

// Cache fetched data URLs by source URL so the frequent (debounced) preview
// render does not re-download the background on every update.
const dataUrlCache = new Map<string, string>();

const fetchAsDataUrl = async (url: string): Promise<string> => {
  const cached = dataUrlCache.get(url);
  if (cached) return cached;
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  dataUrlCache.set(url, dataUrl);
  return dataUrl;
};

const replaceBackgroundUrls = async (
  bg: string,
  map: (url: string) => Promise<string>,
): Promise<string> => {
  const urls: string[] = [];
  bg.replace(URL_IN_BACKGROUND, (_m, _q, url) => {
    urls.push(url);
    return _m;
  });
  let result = bg;
  for (const url of urls) {
    const next = await map(url);
    if (next === url) continue;
    // Function replacement avoids `$` being interpreted in the data URL.
    result = result.replace(url, () => next);
  }
  return result;
};

/**
 * Inline every cross-origin `background-image` URL on the export/preview clone
 * into a `data:` URL.
 *
 * A cross-origin background loaded by html2canvas taints the output canvas, so
 * `canvas.toDataURL()` throws `SecurityError: Tainted canvases may not be
 * exported`. Converting the image to a same-origin `data:` URL (via a CORS
 * `fetch`) keeps the canvas clean. Same-origin and existing `data:` backgrounds
 * are left untouched (they never taint).
 *
 * @returns `true` if every background is now taint-safe, `false` if at least one
 * cross-origin background could not be inlined (the export will likely taint).
 */
export async function inlineCrossOriginBackgrounds(root: HTMLElement): Promise<boolean> {
  const elements = [
    root,
    ...root.querySelectorAll<HTMLElement>('[style*="background-image"]'),
  ];
  let allSafe = true;
  for (const el of elements) {
    const bg = el.style.backgroundImage;
    if (!bg || !bg.includes('url(')) continue;
    const replaced = await replaceBackgroundUrls(bg, async (url) => {
      if (isDataUrl(url) || !isCrossOrigin(url)) return url;
      try {
        return await fetchAsDataUrl(url);
      } catch {
        allSafe = false;
        return url;
      }
    });
    el.style.backgroundImage = replaced;
  }
  return allSafe;
}

/**
 * Neutralize CSS `filter: drop-shadow()` on the export/preview clone.
 *
 * html2canvas-pro renders `drop-shadow` filters through an inline SVG `<filter>`
 * that is drawn back onto the canvas, which **taints** the output canvas even
 * when every image is same-origin. A tainted canvas makes `toDataURL()` throw
 * `SecurityError: Tainted canvases may not be exported`.
 *
 * The drop-shadow is purely decorative, so we drop it on the throwaway clone to
 * keep the export taint-free. The on-screen canvas is untouched.
 */
export function neutralizeTaintingFilters(root: HTMLElement): void {
  const elements = [root, ...root.querySelectorAll<HTMLElement>('*')];
  for (const el of elements) {
    const filter = el.style.filter || window.getComputedStyle(el).filter;
    if (filter && filter !== 'none' && filter.includes('drop-shadow')) {
      el.style.filter = 'none';
    }
  }
}
