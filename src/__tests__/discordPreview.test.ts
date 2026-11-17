import { regionalIndicator, renderDiscordPreviewHtml } from '../services/discordPreview';

test('shares MPF A–Z point markers without changing their existing fallback', () => {
  expect(regionalIndicator(0)).toBe('🇦'); expect(regionalIndicator(25)).toBe('🇿');
  expect(regionalIndicator(26)).toBe('•'); expect(regionalIndicator(-1)).toBe('•');
});

test('renders title, section and emoji formatting while keeping injected HTML inert', () => {
  const container = document.createElement('div');
  container.innerHTML = renderDiscordPreviewHtml('__**Task force**__\n__Stage 1__\n🇦・Produce <img src=x onerror=alert(1)>\n:checkmark: **Done**');
  expect(container.querySelector('u strong')!.textContent).toBe('Task force');
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(container.textContent).toContain('✅ Done');
});
