import { loadBackgroundPresets } from '../services/backgroundLoader';

describe('loadBackgroundPresets', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('returns presets from a valid manifest', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        presets: [
          { name: 'A', path: '/assets/backgrounds/a.png' },
          { name: 'B', path: '/assets/backgrounds/b.png' },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await loadBackgroundPresets();
    expect(result).toEqual([
      { name: 'A', path: '/assets/backgrounds/a.png' },
      { name: 'B', path: '/assets/backgrounds/b.png' },
    ]);
  });

  test('filters out malformed preset entries', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        presets: [
          { name: 'OK', path: '/x.png' },
          { name: 'NoPath' },
          { path: '/no-name.png' },
          'string',
          null,
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await loadBackgroundPresets();
    expect(result).toEqual([{ name: 'OK', path: '/x.png' }]);
  });

  test('returns [] and warns on HTTP error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    const result = await loadBackgroundPresets();
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  test('returns [] and warns on malformed JSON (presets not array)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ presets: 'not-an-array' }),
    }) as unknown as typeof fetch;
    const result = await loadBackgroundPresets();
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  test('returns [] and warns on fetch throw', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    const result = await loadBackgroundPresets();
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});
