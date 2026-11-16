/** Match the dark tooltip used by the transport planner, without native browser bubbles. */
export function createStockpileTooltip(container: HTMLElement): { hide(): void; destroy(): void } {
  const tooltip = document.createElement('div');
  tooltip.id = 'stockpile-quantity-tooltip';
  tooltip.role = 'tooltip';
  tooltip.className = 'pointer-events-none fixed z-[70] hidden rounded border border-gray-600 bg-gray-950 px-3 py-2 text-xs leading-snug text-gray-100 shadow-2xl';
  tooltip.style.maxWidth = 'min(20rem, calc(100vw - 1rem))';
  document.body.appendChild(tooltip);
  let active: HTMLElement | null = null;

  const hide = (): void => {
    active?.removeAttribute('aria-describedby');
    active = null;
    tooltip.classList.add('hidden');
  };
  const show = (target: HTMLElement): void => {
    const text = target.dataset.quantityTooltip ?? target.dataset.productionTooltip;
    if (!text) return;
    hide();
    active = target;
    tooltip.replaceChildren();
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      paragraph.className = index === 0 ? 'font-medium text-gray-100' : 'mt-1 text-gray-400';
      if (target.dataset.productionTooltip) {
        if (!line) paragraph.className = 'my-2 border-t border-gray-700';
        else if (index === 1 || (index > 1 && !lines[index - 1])) paragraph.className = 'mt-1 font-medium text-blue-300';
      }
      if (/\b(?:unit|crate)s? missing\b/.test(line)) paragraph.className = 'mt-2 border-t border-gray-700 pt-2 font-medium text-red-400';
      if (/\b(?:unit|crate)s? above target$/.test(line)) paragraph.className = 'mt-2 border-t border-gray-700 pt-2 font-medium text-blue-400';
      if (line === 'Target reached') paragraph.className = 'mt-2 border-t border-gray-700 pt-2 font-medium text-green-400';
      tooltip.appendChild(paragraph);
    });
    target.setAttribute('aria-describedby', tooltip.id);
    tooltip.classList.remove('hidden');
    const anchor = target.getBoundingClientRect();
    const rect = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - rect.width / 2, window.innerWidth - rect.width - 8));
    const preferredTop = anchor.top - rect.height - 8;
    const top = Math.max(8, Math.min(preferredTop < 8 ? anchor.bottom + 8 : preferredTop, window.innerHeight - rect.height - 8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const getTarget = (event: Event): HTMLElement | null => event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-quantity-tooltip], [data-production-tooltip]') : null;
  const enter = (event: Event): void => {
    const target = getTarget(event);
    if (target && target !== active) show(target);
  };
  const leave = (event: Event): void => {
    const target = getTarget(event);
    const related = (event as MouseEvent | FocusEvent).relatedTarget;
    if (target === active && !(related instanceof Node && target?.contains(related))) hide();
  };
  const keydown = (event: KeyboardEvent): void => { if (event.key === 'Escape') hide(); };
  container.addEventListener('mouseover', enter);
  container.addEventListener('mouseout', leave);
  container.addEventListener('focusin', enter);
  container.addEventListener('focusout', leave);
  container.addEventListener('keydown', keydown);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  return { hide, destroy(): void {
    hide();
    tooltip.remove();
    container.removeEventListener('mouseover', enter);
    container.removeEventListener('mouseout', leave);
    container.removeEventListener('focusin', enter);
    container.removeEventListener('focusout', leave);
    container.removeEventListener('keydown', keydown);
    window.removeEventListener('scroll', hide, true);
    window.removeEventListener('resize', hide);
  } };
}
