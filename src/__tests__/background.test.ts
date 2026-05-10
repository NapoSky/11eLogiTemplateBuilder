import { store } from '../store';
import { DEFAULT_BACKGROUND, isValidBackground, TemplateBackground } from '../types';

function resetStore() {
  while (store.sections.length > 0) {
    store.deleteSection(store.sections[0].id);
  }
  store.setBackground(DEFAULT_BACKGROUND);
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
  localStorage.clear();
});

describe('Store - Background', () => {
  describe('isValidBackground', () => {
    test('valid color', () => {
      expect(isValidBackground({ kind: 'color', color: '#fff' })).toBe(true);
    });
    test('valid preset', () => {
      expect(isValidBackground({ kind: 'preset', path: '/assets/x.png' })).toBe(true);
    });
    test('valid upload (data URL)', () => {
      expect(isValidBackground({ kind: 'upload', dataUrl: 'data:image/png;base64,AAA' })).toBe(true);
    });
    test('valid url (https)', () => {
      expect(isValidBackground({ kind: 'url', url: 'https://example.com/x.png' })).toBe(true);
    });
    test('rejects unknown kind', () => {
      expect(isValidBackground({ kind: 'gradient' })).toBe(false);
    });
    test('rejects missing fields', () => {
      expect(isValidBackground({ kind: 'preset' })).toBe(false);
      expect(isValidBackground({ kind: 'upload', dataUrl: 'not-a-data-url' })).toBe(false);
      expect(isValidBackground({ kind: 'url', url: 'ftp://nope' })).toBe(false);
    });
    test('rejects null/non-object', () => {
      expect(isValidBackground(null)).toBe(false);
      expect(isValidBackground('string')).toBe(false);
      expect(isValidBackground(undefined)).toBe(false);
    });
  });

  describe('setBackground + persistence', () => {
    test('default background is the blue color', () => {
      expect(store.background).toEqual(DEFAULT_BACKGROUND);
      expect(store.background.kind).toBe('color');
    });

    test('setBackground updates state and persists to localStorage', () => {
      const bg: TemplateBackground = { kind: 'color', color: '#abcdef' };
      store.setBackground(bg);
      expect(store.background).toEqual(bg);
      expect(JSON.parse(localStorage.getItem('templateBackground')!)).toEqual(bg);
    });

    test('setBackground rejects invalid value', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const before = store.background;
      // @ts-expect-error invalid on purpose
      store.setBackground({ kind: 'bogus' });
      expect(store.background).toEqual(before);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    test('load() restores persisted background', () => {
      const bg: TemplateBackground = { kind: 'preset', path: '/assets/backgrounds/foo.png' };
      localStorage.setItem('templateBackground', JSON.stringify(bg));
      store.background = DEFAULT_BACKGROUND;
      store.load();
      expect(store.background).toEqual(bg);
    });

    test('load() falls back to default on invalid persisted background', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('templateBackground', JSON.stringify({ kind: 'bogus' }));
      store.background = DEFAULT_BACKGROUND;
      store.load();
      expect(store.background).toEqual(DEFAULT_BACKGROUND);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('exportJSON / importJSON', () => {
    test('exportJSON includes background', () => {
      const bg: TemplateBackground = { kind: 'upload', dataUrl: 'data:image/png;base64,XYZ', name: 'a.png' };
      store.setBackground(bg);
      const json = JSON.parse(store.exportJSON());
      expect(json.background).toEqual(bg);
    });

    test.each<[string, TemplateBackground]>([
      ['color', { kind: 'color', color: '#123456' }],
      ['preset', { kind: 'preset', path: '/assets/backgrounds/x.png' }],
      ['upload', { kind: 'upload', dataUrl: 'data:image/png;base64,ZZZ' }],
      ['url', { kind: 'url', url: 'https://cdn.example.com/x.png' }],
    ])('round-trips %s background through export/import', (_label, bg) => {
      store.setBackground(bg);
      const json = store.exportJSON();
      store.setBackground(DEFAULT_BACKGROUND);
      store.importJSON(json);
      expect(store.background).toEqual(bg);
    });

    test('importJSON without background field falls back to default (legacy template)', () => {
      const legacyJson = JSON.stringify({ sections: [] });
      store.setBackground({ kind: 'color', color: '#ff0000' });
      store.importJSON(legacyJson);
      expect(store.background).toEqual(DEFAULT_BACKGROUND);
    });

    test('importJSON with malformed background falls back to default and still loads sections', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const json = JSON.stringify({
        sections: [
          { id: 's1', title: 'X', color: '#fff', x: 0, y: 0, width: 100, height: 100, icons: [] },
        ],
        background: { kind: 'gradient', stops: ['red', 'blue'] },
      });
      store.importJSON(json);
      expect(store.background).toEqual(DEFAULT_BACKGROUND);
      expect(store.sections).toHaveLength(1);
      expect(store.sections[0].id).toBe('s1');
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
