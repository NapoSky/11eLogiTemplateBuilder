/**
 * Tests du service mpfDataLoader
 * Vérifie : chargement nominal, erreur HTTP, erreur réseau.
 */

import { loadMpfData } from '../services/mpfDataLoader';
import { MpfDataEntry } from '../types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

// ============================================================
// Chargement nominal
// ============================================================

describe('loadMpfData – chargement nominal', () => {
  const entries: MpfDataEntry[] = [
    {
      iconFilename: 'UI/ItemIcons/RifleCItemIcon.png',
      itemName: 'Argenti r.II Rifle',
      itemCategory: 'small_arms',
      faction: ['neutral', 'colonial'],
      cost: { bmat: 100 },
      numberProduced: 20,
      maxCrates: 9,
    },
    {
      iconFilename: 'UI/ItemIcons/MortarItemIcon.png',
      itemName: 'Cremari Mortar',
      itemCategory: 'heavy_arms',
      faction: ['neutral', 'colonial', 'warden'],
      cost: { bmat: 100, rmat: 25 },
      numberProduced: 5,
      maxCrates: 9,
    },
  ];

  test('retourne le tableau d\'entrées parsé depuis la réponse JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => entries,
    }) as unknown as typeof fetch;

    const result = await loadMpfData();
    expect(result).toEqual(entries);
    expect(result).toHaveLength(2);
  });

  test('appelle fetch avec l\'URL mpfData.json', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await loadMpfData();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = (fetchMock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toMatch(/mpfData\.json$/);
  });

  test('retourne un tableau vide si la réponse JSON est un tableau vide', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;

    const result = await loadMpfData();
    expect(result).toEqual([]);
  });
});

// ============================================================
// Erreur HTTP
// ============================================================

describe('loadMpfData – erreur HTTP', () => {
  test('retourne [] et logge un warn si status !== ok (404)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    const result = await loadMpfData();
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  test('retourne [] et logge un warn si status !== ok (500)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    const result = await loadMpfData();
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

// ============================================================
// Erreur réseau
// ============================================================

describe('loadMpfData – erreur réseau', () => {
  test('retourne [] et logge une error si fetch jette', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure')) as unknown as typeof fetch;

    const result = await loadMpfData();
    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  test('ne propage pas l\'exception (ne throw pas)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    await expect(loadMpfData()).resolves.toEqual([]);
  });
});
