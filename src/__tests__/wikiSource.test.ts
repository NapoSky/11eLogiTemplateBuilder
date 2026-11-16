import { readFileSync } from 'node:fs';
import { collectWikiSnapshot, semanticWikiSnapshot, WIKI_FIELDS } from '../services/wikiSource';
import type { WikiSnapshot } from '../services/wikiCatalog';

const original: WikiSnapshot = JSON.parse(readFileSync('src/__tests__/fixtures/wiki-core.snapshot.json', 'utf8'));
const response = (data: unknown, status = 200, contentType = 'application/json') => ({
  ok: status === 200, status,
  headers: { get: (name: string) => name === 'content-type' ? contentType : name === 'retry-after' ? '2' : null } as Headers,
  json: async () => data,
});

function fakeSource() {
  const tables = Object.fromEntries(Object.entries(original.tables).map(([table, rows]) => [table, rows.slice(0, 3)]));
  const fetcher = jest.fn(async (url: string) => {
    const query = new URL(url).searchParams;
    const table = (query.get('table') ?? query.get('tables')) as keyof typeof WIKI_FIELDS;
    if (query.get('action') === 'cargofields') {
      return response({ cargofields: Object.fromEntries(WIKI_FIELDS[table].map(field => [field, { type: 'String' }])) });
    }
    if (query.get('fields') === 'COUNT(*)=count') return response({ cargoquery: [{ title: { count: `${tables[table].length}` } }] });
    const offset = Number(query.get('offset'));
    const limit = Number(query.get('limit'));
    return response({ cargoquery: tables[table].slice(offset, offset + limit).map((row, i) => ({ title: { ...row, _ID: `${offset + i + 1}` } })) });
  });
  return fetcher;
}

describe('read-only Cargo collection', () => {
  test('discovers schema, paginates and validates stable counts before accepting a snapshot', async () => {
    const fetcher = fakeSource();
    const wait = jest.fn().mockResolvedValue(undefined);
    const result = await collectWikiSnapshot({ fetch: fetcher, wait, pageSize: 2, now: () => new Date('2026-11-16T12:00:00Z') });
    expect(result.capturedOn).toBe('2026-11-16');
    expect(result.tables.Production).toHaveLength(3);
    expect(result.manifest.Production.rowCount).toBe(3);
    expect(result.tables.Production[0]).not.toHaveProperty('_ID');
    expect(fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get('offset') === '2')).toBe(true);
    expect(wait).toHaveBeenCalledWith(1500);
  });

  test('backs off on HTTP 429 and API rate-limit errors instead of accepting them as data', async () => {
    const normal = fakeSource();
    const fetcher = jest.fn().mockResolvedValueOnce(response({}, 429, 'text/html'))
      .mockResolvedValueOnce(response({ error: { code: 'ratelimited' } })).mockImplementation(normal);
    const wait = jest.fn().mockResolvedValue(undefined);
    const result = await collectWikiSnapshot({ fetch: fetcher, wait });
    expect(result.tables.vehicles.length).toBeGreaterThan(0);
    expect(wait).toHaveBeenCalledWith(2000);
  });

  test('stops after bounded retry attempts', async () => {
    const fetcher = jest.fn().mockResolvedValue(response({ error: { code: 'ratelimited' } }, 429));
    await expect(collectWikiSnapshot({ fetch: fetcher, wait: async () => {} })).rejects.toThrow('ratelimited');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  test('does not retry earlier than a long Retry-After allows', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ...response({}, 429), headers: {
      get: (name: string) => name === 'retry-after' ? '120' : 'text/html',
    } });
    await expect(collectWikiSnapshot({ fetch: fetcher, wait: async () => {} })).rejects.toThrow('requires a later retry');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('rejects a successful HTTP response containing HTML instead of JSON', async () => {
    await expect(collectWikiSnapshot({ fetch: async () => response({}, 200, 'text/html'), wait: async () => {} }))
      .rejects.toThrow('invalid response');
  });

  test('refuses a schema missing a required field', async () => {
    await expect(collectWikiSnapshot({ fetch: async () => response({ cargofields: {} }), wait: async () => {} }))
      .rejects.toThrow('Missing field');
  });

  test('refuses a table whose count changes during collection', async () => {
    const normal = fakeSource();
    let counts = 0;
    const fetcher = jest.fn(async (url: string) => {
      const query = new URL(url).searchParams;
      if (query.get('fields') === 'COUNT(*)=count' && ++counts === 2) {
        return response({ cargoquery: [{ title: { count: '4' } }] });
      }
      return normal(url);
    });
    await expect(collectWikiSnapshot({ fetch: fetcher, wait: async () => {} })).rejects.toThrow('Table changed during collection');
  });

  test('refuses duplicate IDs across pages', async () => {
    const normal = fakeSource();
    const fetcher = jest.fn(async (url: string) => {
      const query = new URL(url).searchParams;
      if (query.get('offset') === '2') return response({ cargoquery: [{ title: { _ID: '1', name: 'duplicate' } }] });
      return normal(url);
    });
    await expect(collectWikiSnapshot({ fetch: fetcher, wait: async () => {}, pageSize: 2 })).rejects.toThrow('repeated row ID');
  });

  test('refuses empty pages before the announced count has been reached', async () => {
    const normal = fakeSource();
    const fetcher = jest.fn(async (url: string) => new URL(url).searchParams.has('offset')
      ? response({ cargoquery: [] }) : normal(url));
    await expect(collectWikiSnapshot({ fetch: fetcher, wait: async () => {} })).rejects.toThrow('Incomplete');
  });
});

describe('semantic change detection', () => {
  test('ignores collection dates, wire key spelling, row ordering and Cargo row IDs', () => {
    const copy = JSON.parse(JSON.stringify(original)) as WikiSnapshot;
    copy.capturedOn = '2030-01-01';
    for (const rows of Object.values(copy.tables)) {
      rows.reverse();
      rows.forEach((row, i) => { row._ID = `${i + 999}`; });
    }
    const row = copy.tables.itemdata.find(item => item['crate amount'] !== undefined)!;
    row.crate_amount = row['crate amount']; delete row['crate amount'];
    expect(semanticWikiSnapshot(copy)).toBe(semanticWikiSnapshot(original));
  });

  test('detects a genuine production quantity change', () => {
    const copy = JSON.parse(JSON.stringify(original)) as WikiSnapshot;
    copy.tables.Production[0].InputItem1Amount = '999';
    expect(semanticWikiSnapshot(copy)).not.toBe(semanticWikiSnapshot(original));
  });

  test('tracks vehicles, extra parts and liquid units without serialization-only diffs', () => {
    const source: WikiSnapshot = JSON.parse(readFileSync('src/__tests__/fixtures/production-hover.snapshot.json', 'utf8'));
    const copy = JSON.parse(JSON.stringify(source)) as WikiSnapshot;
    const row = copy.tables.Production.find(row => row.InputVehicle)!;
    row.InputVehicle = 'Different base vehicle';
    expect(semanticWikiSnapshot(copy)).not.toBe(semanticWikiSnapshot(source));
    const parts = JSON.parse(JSON.stringify(source)) as WikiSnapshot;
    parts.tables.Production.find(row => row.ExtraPart2)!.ExtraPart2Amount = '99';
    expect(semanticWikiSnapshot(parts)).not.toBe(semanticWikiSnapshot(source));
    const same = JSON.parse(JSON.stringify(source)) as WikiSnapshot;
    const liquid = same.tables.Production.find(row => row.InputItem1Unit === 'L')!;
    liquid.InputItem1Amount = Number(liquid.InputItem1Amount);
    expect(semanticWikiSnapshot(same)).toBe(semanticWikiSnapshot(source));
    liquid.InputItem1Unit = 'crate';
    expect(semanticWikiSnapshot(same)).not.toBe(semanticWikiSnapshot(source));
  });
});
