import {
  TodoList,
  TodoListItem,
  MpfDataEntry,
  TodoCategory,
  TodoProductionEntry,
  TODO_CATEGORY_LABELS,
  TextBlock,
  TextAnchor,
  generateId,
} from '../types';
import { normalizeGameName } from './gameData';

export interface ParseTodoListResult {
  result: Omit<TodoList, 'faction'>;
  warnings: string[];
}

function normalize(s: string): string {
  return normalizeGameName(s).toLowerCase();
}

function buildCategoryMap(): Map<string, TodoCategory> {
  const m = new Map<string, TodoCategory>();
  for (const [cat, label] of Object.entries(TODO_CATEGORY_LABELS) as [TodoCategory, string][]) {
    m.set(normalize(label), cat);
  }
  return m;
}

const TITLE_RE = /^__\*\*(.+?)\*\*__\s*$/;
// Letter prefix: regional indicator (🇦-🇿) OR ASCII A-Z, followed by ・ or -
const ITEM_PREFIX_RE = /^(?:[\u{1F1E6}-\u{1F1FF}]|[A-Za-z])(?:・|-)\s*/u;
const ORDER_COUNT_RE = /\(x(\d+)\)\s*$/i;
const DATE_SUFFIX_RE = /\s+(\d{2}\/\d{2})\s*$/;
const PRODUCTION_RE = /\[(Factory|MPF):\s*(\d+)\s+crates\/order\]/i;

/**
 * Extract category text from various markdown formatting patterns:
 * - __Small Arms__
 * - **Small Arms**
 * - __**Small Arms**__
 * - **__Small Arms__**
 */
function extractCategoryText(line: string): string | null {
  // Test more specific patterns first (mixed markup), then simpler ones
  const patterns = [
    /^__\*\*(.+?)\*\*__\s*$/,   // __**text**__
    /^\*\*__(.+?)__\*\*\s*$/,   // **__text__**
    /^__(.+?)__\s*$/,           // __text__
    /^\*\*(.+?)\*\*\s*$/,       // **text**
  ];
  
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

const EMOJI_NAME_MAP: Record<string, string> = {
  'grey_exclamation': '⚠️',
  'warning': '⚠️',
  'alarm': '⏰',
  'checkmark': '✅',
  'x': '❌',
  'information_source': 'ℹ️',
  'question': '❓',
  'heavy_check_mark': '✔️',
  'white_check_mark': '✅',
  'negative_squared_cross_mark': '❎',
  'exclamation': '❗',
  'bulb': '💡',
};

function convertEmojiNames(text: string): string {
  return text.replace(/:([a-z_]+):/gi, (match, name) => {
    return EMOJI_NAME_MAP[name.toLowerCase()] ?? match;
  });
}

/**
 * Parse a Discord-formatted todolist text back into a TodoList structure.
 * Costs are ignored (recomputed from mpfData). Faction is not deduced.
 */
export function parseTodoList(raw: string, mpfData: MpfDataEntry[], factoryData: TodoProductionEntry[] = []): ParseTodoListResult {
  const warnings: string[] = [];
  const lines = raw.split(/\r?\n/);
  const categoryMap = buildCategoryMap();

  // Sort canonical names and explicit aliases together, longest first.
  const entries: TodoProductionEntry[] = [
    ...mpfData.map(entry => ({ ...entry, category: entry.itemCategory })), ...factoryData,
  ];
  const sortedNames = entries.flatMap(entry =>
    [entry.itemName, ...(entry.aliases ?? [])].map(name => ({ entry, name: normalize(name) })),
  ).sort((a, b) => b.name.length - a.name.length);

  const tl: Omit<TodoList, 'faction'> = {
    title: 'TODOLIST',
    autoDate: false,
    items: [],
    textBlocks: [],
  };

  let currentCategory: TodoCategory | null = null;
  let textBuffer: string[] = [];
  let textAnchor: TextAnchor = { kind: 'top' };
  let titleSeen = false;

  const setAnchorForCurrent = (): void => {
    textAnchor = currentCategory
      ? { kind: 'category', category: currentCategory }
      : { kind: 'top' };
  };

  const flushTextBuffer = (): void => {
    if (textBuffer.length === 0) return;
    const content = convertEmojiNames(textBuffer.join('\n').replace(/\s+$/, ''));
    textBuffer = [];
    if (!content.trim()) return;
    tl.textBlocks.push({
      id: generateId(),
      content,
      anchor: textAnchor,
    });
  };

  const findEntry = (body: string, source: 'mpf' | 'factory'): TodoProductionEntry | undefined => {
    const normBody = normalize(body);
    return sortedNames.find(({ name: n, entry }) => {
      if ((entry.productionSource ?? 'mpf') !== source) return false;
      if (normBody === n) return true;
      // Allow trailing separators after the name (space, hyphen, em-dash, parenthesis).
      return (
        normBody.startsWith(n + ' ') ||
        normBody.startsWith(n + '-') ||
        normBody.startsWith(n + '–') ||
        normBody.startsWith(n + '(')
      );
    })?.entry;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    // Title (only matched until first occurrence)
    if (!titleSeen) {
      const titleMatch = line.match(TITLE_RE);
      if (titleMatch) {
        let title = titleMatch[1].trim();
        const dateMatch = title.match(DATE_SUFFIX_RE);
        if (dateMatch) {
          tl.autoDate = true;
          title = title.replace(DATE_SUFFIX_RE, '').trim();
        }
        tl.title = title || 'TODOLIST';
        titleSeen = true;
        continue;
      }
    }

    // Blank line: flush current text paragraph
    if (line.trim() === '') {
      flushTextBuffer();
      continue;
    }

    // Category header
    const categoryText = extractCategoryText(line);
    if (categoryText) {
      flushTextBuffer();
      const cat = categoryMap.get(normalize(categoryText));
      if (cat) {
        currentCategory = cat;
        setAnchorForCurrent();
        continue;
      }
      // Unknown category → treat as free text below.
    }

    // Strip optional letter prefix
    const prefixMatch = line.match(ITEM_PREFIX_RE);
    let body = line;
    let hadPrefix = false;
    if (prefixMatch) {
      body = line.slice(prefixMatch[0].length);
      hadPrefix = true;
    }

    // Strip trailing (xN)
    let orderCount = 1;
    const orderMatch = body.match(ORDER_COUNT_RE);
    if (orderMatch) {
      orderCount = Math.max(1, parseInt(orderMatch[1], 10) || 1);
      body = body.replace(ORDER_COUNT_RE, '').replace(/\s+$/, '');
    }

    const production = body.match(PRODUCTION_RE);
    const source = production?.[1].toLowerCase() === 'factory' ? 'factory' : 'mpf';
    const crates = production ? Number(production[2]) : undefined;
    const entry = findEntry(body, source);

    if (entry && crates !== undefined && (crates < (source === 'factory' ? 1 : 3) || crates > entry.maxCrates)) {
      warnings.push(`Invalid ${source === 'factory' ? 'Factory' : 'MPF'} crate count: "${body}"`);
      continue;
    }

    if (entry && currentCategory) {
      flushTextBuffer();
      tl.items.push({
        id: generateId(),
        iconFilename: entry.iconFilename,
        itemName: entry.itemName,
        category: entry.category,
        faction: entry.faction,
        cost: entry.cost,
        maxCrates: entry.maxCrates,
        numberProduced: entry.numberProduced,
        crateBonus: entry.crateBonus,
        subtypeFilename: entry.subtypeFilename,
        orderCount,
        ...(production ? { productionSource: source, cratesPerOrder: crates } : {}),
      });
      continue;
    }

    if (hadPrefix && !entry) {
      warnings.push(`Item non reconnu ignoré : "${body}"`);
      continue;
    }

    // Free-form text under current anchor
    textBuffer.push(line);
  }

  flushTextBuffer();

  return { result: tl, warnings };
}

// Re-export for tests / consumers.
export type { TodoListItem };
