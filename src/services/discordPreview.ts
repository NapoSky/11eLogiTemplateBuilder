import { getBaseUrl } from '../config';

/** The same A–Z points used by the MPF Todolist, reset within each section. */
export function regionalIndicator(index: number): string {
  if (index < 0 || index > 25) return '•';
  return String.fromCodePoint(0x1F1E6 + index);
}

const EMOJI_MAP: Record<string, string> = {
  grey_exclamation: '⚠️', warning: '⚠️', checkmark: '✅', x: '❌',
  information_source: 'ℹ️', question: '❓', heavy_check_mark: '✔️',
  white_check_mark: '✅', negative_squared_cross_mark: '❎', exclamation: '❗', bulb: '💡',
};

/** Render the limited Discord formatting used by our previews, escaping HTML first. */
export function renderDiscordPreviewHtml(raw: string): string {
  let text = raw.replace(/:([a-z_]+):/gi, (match, name) => EMOJI_MAP[name.toLowerCase()] ?? match);
  text = text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
  text = text.replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/__(.+?)__/gs, '<u>$1</u>')
    .replace(/\*([^*]+?)\*/gs, '<em>$1</em>');
  return text.replaceAll('&lt;a:alarm:1308239734618984508&gt;',
    `<img src="${getBaseUrl()}assets/emojis/alarm_icon.gif" alt="<a:alarm:1308239734618984508>" title="alarm" class="inline w-5 h-5 align-middle" onerror="this.outerHTML='\u23F0'" />`);
}
