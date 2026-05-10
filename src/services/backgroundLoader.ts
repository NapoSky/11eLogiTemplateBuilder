import { BackgroundPreset } from '../types';
import { getBaseUrl } from '../config';

const BASE_URL = getBaseUrl();

interface ManifestShape {
  presets?: unknown;
}

function isValidPreset(p: unknown): p is BackgroundPreset {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  return typeof obj.name === 'string' && typeof obj.path === 'string';
}

/**
 * Load background presets from `${BASE_URL}assets/backgrounds/manifest.json`.
 * Returns an empty list (and warns) on any failure: missing file, invalid JSON,
 * malformed entries. Never throws.
 */
export async function loadBackgroundPresets(): Promise<BackgroundPreset[]> {
  const url = `${BASE_URL}assets/backgrounds/manifest.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`loadBackgroundPresets: HTTP ${res.status} for ${url}`);
      return [];
    }
    const data = (await res.json()) as ManifestShape;
    if (!Array.isArray(data.presets)) {
      console.warn('loadBackgroundPresets: malformed manifest (presets is not an array)');
      return [];
    }
    return data.presets.filter(isValidPreset);
  } catch (e) {
    console.warn('loadBackgroundPresets: failed to load manifest', e);
    return [];
  }
}
