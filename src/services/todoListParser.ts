import {
  TodoList,
  TodoListItem,
  MpfDataEntry,
  MpfCategory,
  MPF_CATEGORY_LABELS,
  TextBlock,
  TextAnchor,
  generateId,
} from '../types';

export interface ParseTodoListResult {
  result: Omit<TodoList, 'faction'>;
  warnings: string[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildCategoryMap(): Map<string, MpfCategory> {
  const m = new Map<string, MpfCategory>();
  for (const [cat, label] of Object.entries(MPF_CATEGORY_LABELS) as [MpfCategory, string][]) {
    m.set(normalize(label), cat);
  }
  return m;
}

const TITLE_RE = /^__\*\*(.+?)\*\*__\s*$/;
const CATEGORY_RE = /^__(.+?)__\s*$/;
// Letter prefix: regional indicator (🇦-🇿) OR ASCII A-Z, followed by ・ or -
const ITEM_PREFIX_RE = /^(?:[\u{1F1E6}-\u{1F1FF}]|[A-Za-z])(?:・|-)\s*/u;
const ORDER_COUNT_RE = /\(x(\d+)\)\s*$/i;
const DATE_SUFFIX_RE = /\s+(\d{2}\/\d{2})\s*$/;

/**
 * Parse a Discord-formatted todolist text back into a TodoList structure.
 * Costs are ignored (recomputed from mpfData). Faction is not deduced.
 */
export function parseTodoList(raw: string, mpfData: MpfDataEntry[]): ParseTodoListResult {
  const warnings: string[] = [];
  const lines = raw.split(/\r?\n/);
  const categoryMap = buildCategoryMap();

  // Sort longest names first so prefix matching prefers more specific entries.
  const sortedEntries = [...mpfData].sort(
    (a, b) => b.itemName.length - a.itemName.length
  );

  const tl: Omit<TodoList, 'faction'> = {
    title: 'TODOLIST',
    autoDate: false,
    items: [],
    textBlocks: [],
  };

  let currentCategory: MpfCategory | null = null;
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
    const content = textBuffer.join('\n').replace(/\s+$/, '');
    textBuffer = [];
    if (!content.trim()) return;
    tl.textBlocks.push({
      id: generateId(),
      content,
      anchor: textAnchor,
    });
  };

  const findEntry = (body: string): MpfDataEntry | undefined => {
    const normBody = normalize(body);
    return sortedEntries.find(e => {
      const n = normalize(e.itemName);
      if (normBody === n) return true;
      // Allow trailing separators after the name (space, hyphen, em-dash, parenthesis).
      return (
        normBody.startsWith(n + ' ') ||
        normBody.startsWith(n + '-') ||
        normBody.startsWith(n + '–') ||
        normBody.startsWith(n + '(')
      );
    });
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
    const catMatch = line.match(CATEGORY_RE);
    if (catMatch) {
      flushTextBuffer();
      const cat = categoryMap.get(normalize(catMatch[1]));
      if (cat) {
        currentCategory = cat;
        setAnchorForCurrent();
        continue;
      }
      // Unknown __header__ → treat as free text below.
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

    const entry = findEntry(body);

    if (entry && currentCategory) {
      flushTextBuffer();
      tl.items.push({
        id: generateId(),
        iconFilename: entry.iconFilename,
        itemName: entry.itemName,
        category: entry.itemCategory,
        faction: entry.faction,
        cost: entry.cost,
        maxCrates: entry.maxCrates,
        numberProduced: entry.numberProduced,
        crateBonus: entry.crateBonus,
        subtypeFilename: entry.subtypeFilename,
        orderCount,
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
