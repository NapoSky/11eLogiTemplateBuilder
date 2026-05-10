import { TodoList, TodoListItem, MPF_CATEGORIES, MPF_CATEGORY_LABELS, MpfCategory, TextBlock } from '../types';
import { displayedCost } from './mpfCalculator';

/**
 * Letter allocator: returns 🇦, 🇧, 🇨, ... regional indicator emoji (Discord renders flags).
 * Each category gets its own counter (per the example file).
 */
function regionalIndicator(index: number): string {
  // 0x1F1E6 = 🇦 (REGIONAL INDICATOR SYMBOL LETTER A)
  if (index < 0 || index > 25) return '•';
  return String.fromCodePoint(0x1F1E6 + index);
}

function formatMatPart(parts: string[]): string {
  return parts.join(' – ');
}

function formatItemLine(item: TodoListItem, letter: string): string {
  const cost = displayedCost(item);
  const matsParts: string[] = [];
  if (cost.bmat > 0) matsParts.push(`${cost.bmat} Bmats`);
  if (cost.rmat > 0) matsParts.push(`${cost.rmat} Rmats`);
  if (cost.emat > 0) matsParts.push(`${cost.emat} Emats`);
  if (cost.hemat > 0) matsParts.push(`${cost.hemat} HEmats`);

  const matsStr = matsParts.length > 0 ? ` – ${formatMatPart(matsParts)}` : '';
  const orderSuffix = item.orderCount > 1 ? ` (x${item.orderCount})` : '';
  return `${letter}・${item.itemName}${matsStr}${orderSuffix}`;
}

function formatDateDDMM(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/**
 * Render the TodoList as a Discord-formatted string matching the example file.
 */
export function renderTodoList(todolist: TodoList, now: Date = new Date()): string {
  const lines: string[] = [];

  // Header
  const titleParts: string[] = [todolist.title || 'TODOLIST'];
  if (todolist.autoDate) titleParts.push(formatDateDDMM(now));
  lines.push(`__**${titleParts.join(' ')}**__`);
  lines.push('');

  // Text blocks (defensive: legacy persisted todolists may not have textBlocks)
  const textBlocks: TextBlock[] = todolist.textBlocks ?? [];
  const topBlocks = textBlocks.filter(b => b.anchor.kind === 'top');
  const footerBlocks = textBlocks.filter(b => b.anchor.kind === 'footer');
  const blocksByCat: Record<MpfCategory, TextBlock[]> = {
    small_arms: [], heavy_arms: [], heavy_ammunition: [],
    vehicles: [], shipables: [], uniforms: [], supplies: [],
  };
  for (const b of textBlocks) {
    if (b.anchor.kind === 'category') blocksByCat[b.anchor.category].push(b);
  }

  const pushBlock = (b: TextBlock): void => {
    lines.push(b.content);
    lines.push('');
  };

  for (const b of topBlocks) pushBlock(b);

  // Group items by category
  const grouped: Record<MpfCategory, TodoListItem[]> = {
    small_arms: [], heavy_arms: [], heavy_ammunition: [],
    vehicles: [], shipables: [], uniforms: [], supplies: [],
  };
  for (const item of todolist.items) {
    grouped[item.category]?.push(item);
  }

  for (const cat of MPF_CATEGORIES) {
    const items = grouped[cat];
    const catBlocks = blocksByCat[cat];
    if ((!items || items.length === 0) && catBlocks.length === 0) continue;
    lines.push(`__${MPF_CATEGORY_LABELS[cat]}__`);
    for (const b of catBlocks) pushBlock(b);
    if (items && items.length > 0) {
      items.forEach((item, idx) => {
        lines.push(formatItemLine(item, regionalIndicator(idx)));
      });
    }
    lines.push('');
  }

  for (const b of footerBlocks) pushBlock(b);

  return lines.join('\n').trimEnd() + '\n';
}
