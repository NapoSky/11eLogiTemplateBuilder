import { parseWikiSnapshot } from './wikiCatalog.ts';
import type { WikiRow, WikiSnapshot } from './wikiCatalog';

const entityFields = ['_pageID', '_pageName', 'name', 'codename', 'image', 'imageOverride', 'faction', 'status', 'crate_amount'];
export const WIKI_FIELDS = {
  itemdata: [...entityFields, 'unit'], vehicles: entityFields, structures: entityFields,
  Production: ['_pageID', '_pageName', 'Output', 'OutputType', 'OutputAmount', 'Source', 'ProductionCategory',
    'RecipeRank', 'IsMPFable', 'CrateCapacity', 'IsCrateOutput',
    ...Array.from({ length: 6 }, (_, i) => [`InputItem${i + 1}`, `InputItem${i + 1}Amount`, `InputItem${i + 1}Unit`]).flat(),
    'InputVehicle', 'InputCrate', 'InputCrateCapacity', 'InputPower', 'OutputUnit', 'OutputAmountHigh',
    'ExtraPart1', 'ExtraPart1Amount', 'ExtraPart2', 'ExtraPart2Amount',
    'SecondaryOutput', 'SecondaryOutputAmount', 'SecondaryOutputUnit',
    'TertiaryOutput', 'TertiaryOutputAmount', 'TertiaryOutputUnit', 'ProductionType', 'Faction', 'SpecialStatus'],
} as const;

type Table = keyof typeof WIKI_FIELDS;
type FetchResponse = Pick<Response, 'ok' | 'status' | 'headers' | 'json'>;
type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<FetchResponse>;

/** Normalize selected fields and ordering; collection dates and Cargo row IDs are not semantic changes. */
export function semanticWikiSnapshot(input: unknown): string {
  const snapshot = parseWikiSnapshot(input);
  return JSON.stringify(Object.fromEntries((Object.keys(WIKI_FIELDS) as Table[]).sort().map(table => {
    const rows = snapshot.tables[table].map(row => Object.fromEntries(WIKI_FIELDS[table].flatMap(field => {
      const value = row[field] ?? row[field.replaceAll('_', ' ')];
      if (field === 'IsMPFable' || field === 'IsCrateOutput') {
        return [[field, value === true || value === 1 || value === '1' ? '1' : '0']];
      }
      if (value !== '' && value != null && ['_pageID', 'OutputAmount', 'RecipeRank', 'CrateCapacity', 'crate_amount',
        'InputCrateCapacity', 'InputPower', 'OutputAmountHigh', 'ExtraPart1Amount', 'ExtraPart2Amount',
        'SecondaryOutputAmount', 'TertiaryOutputAmount',
        ...Array.from({ length: 6 }, (_, i) => `InputItem${i + 1}Amount`)].includes(field)) {
        return [[field, String(Number(value))]];
      }
      return value === '' || value == null ? [] : [[field, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)]];
    })));
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
    return [table, rows];
  })));
}

/** Public, read-only Cargo API. All collection happens before an accepted snapshot is replaced. */
export async function collectWikiSnapshot(options: {
  fetch?: Fetcher;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  pageSize?: number;
} = {}): Promise<WikiSnapshot> {
  const fetcher: Fetcher = options.fetch ?? fetch;
  const wait = options.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const now = options.now ?? (() => new Date());
  const pageSize = options.pageSize ?? 500;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('Invalid Cargo page size');
  let requests = 0;

  const request = async (params: Record<string, string>): Promise<Record<string, unknown>> => {
    const url = new URL('https://foxhole.wiki.gg/api.php');
    url.search = new URLSearchParams({ ...params, format: 'json' }).toString();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (requests++) await wait(1500);
      let response: FetchResponse;
      try {
        response = await fetcher(url.toString(), {
          headers: { 'User-Agent': '11eTemplateBuilder-DataSync/1.0 (https://github.com/NapoSky/11eLogiTemplateBuilder)', Accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        if (attempt === 2) throw error;
        await wait(2_000 * 2 ** attempt);
        continue;
      }
      const contentType = response.headers.get('content-type') ?? '';
      let body: Record<string, unknown> | null = null;
      if (contentType.includes('application/json')) {
        try {
          const value: unknown = await response.json();
          if (value && typeof value === 'object' && !Array.isArray(value)) body = value as Record<string, unknown>;
        } catch (error) {
          if (response.status !== 429 && response.status < 500) throw error;
        }
      }
      const apiError = body?.error as { code?: string; info?: string } | undefined;
      const retry = response.status === 429 || response.status >= 500 || apiError?.code === 'ratelimited';
      if (retry && attempt < 2) {
        const header = response.headers.get('retry-after');
        const retryAfter = header === null ? NaN : Number(header);
        const dateDelay = header ? Date.parse(header) - now().getTime() : NaN;
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : Number.isFinite(dateDelay) ? dateDelay : 2_000 * 2 ** attempt;
        if (delay > 60_000) throw new Error('Cargo requires a later retry; keep the accepted snapshot and retry the sync later.');
        await wait(Math.max(1500, delay));
        continue;
      }
      if (!response.ok || !body || apiError) throw new Error(`Cargo request failed: HTTP ${response.status} ${apiError?.code ?? 'invalid response'} ${apiError?.info ?? ''}`);
      return body;
    }
    throw new Error('Cargo retry limit reached');
  };
  const query = async (params: Record<string, string>): Promise<WikiRow[]> => {
    const data = await request({ action: 'cargoquery', ...params });
    if (!Array.isArray(data.cargoquery)) throw new Error('Missing cargoquery result');
    return data.cargoquery.map(value => {
      if (!value || typeof value !== 'object' || !value.title || typeof value.title !== 'object' || Array.isArray(value.title)) throw new Error('Invalid Cargo row');
      return value.title as WikiRow;
    });
  };
  const count = async (table: Table): Promise<number> => {
    const rows = await query({ tables: table, fields: 'COUNT(*)=count', limit: '1' });
    const value = Number(rows[0]?.count);
    if (rows.length !== 1 || !Number.isSafeInteger(value) || value < 1 || value > 20_000) throw new Error(`Invalid count for ${table}`);
    return value;
  };
  const tables = {} as WikiSnapshot['tables'];
  const manifest = {} as WikiSnapshot['manifest'];
  for (const table of Object.keys(WIKI_FIELDS) as Table[]) {
    const schema = await request({ action: 'cargofields', table });
    const fields = schema.cargofields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error(`Missing schema for ${table}`);
    for (const field of WIKI_FIELDS[table]) {
      if (!field.startsWith('_') && !(field in fields)) throw new Error(`Missing field ${table}.${field}`);
    }
    const expected = await count(table);
    const seen = new Set<string>();
    const rows: WikiRow[] = [];
    let offset = 0;
    while (offset < expected) {
      const page = await query({ tables: table, fields: ['_ID', ...WIKI_FIELDS[table]].join(','),
        order_by: '_ID', limit: `${pageSize}`, offset: `${offset}` });
      if (page.length === 0 || page.length > pageSize || page.length + offset > expected) throw new Error(`Incomplete or changing table ${table}`);
      for (const row of page) {
        const id = String(row._ID ?? '');
        if (!id || seen.has(id)) throw new Error(`Missing or repeated row ID in ${table}`);
        seen.add(id);
        rows.push(Object.fromEntries(WIKI_FIELDS[table].flatMap(field => {
          const value = row[field] ?? row[field.replaceAll('_', ' ')];
          return value === '' || value == null ? [] : [[field, value]];
        })));
      }
      offset += page.length;
    }
    if (await count(table) !== expected) throw new Error(`Table changed during collection: ${table}`);
    tables[table] = rows;
    manifest[table] = { rowCount: expected, fields: WIKI_FIELDS[table], orderBy: '_ID', pageSize };
  }
  return parseWikiSnapshot({ schemaVersion: 1, source: 'https://foxhole.wiki.gg', capturedOn: now().toISOString().slice(0, 10),
    license: 'CC BY-NC-SA 4.0', manifest, tables });
}
