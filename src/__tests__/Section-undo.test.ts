/**
 * Tests pour la confirmation de suppression via toast + Undo dans Section.ts.
 *
 * Utilise des imports statiques (pas de jest.resetModules) afin de garantir
 * que le store manipulé dans les assertions est bien la même instance que
 * celle utilisée en interne par SectionComponent.
 */

import { SectionComponent } from '../components/Section';
import { store } from '../store';

describe('SectionComponent – suppression avec Undo', () => {
  beforeEach(() => {
    store.sections.forEach(s => store.deleteSection(s.id));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    store.sections.forEach(s => store.deleteSection(s.id));
  });

  test('btn-delete affiche un toast avec un bouton Undo qui restaure la section', () => {
    store.addSection({
      id: 'undo-test',
      title: 'Undo Test',
      color: '#3b82f6',
      x: 0, y: 0, width: 200, height: 150,
      icons: [],
    });

    const section = new SectionComponent(
      store.sections[0],
      (id) => store.deleteSection(id),
      () => {},
    );
    document.body.appendChild(section.getElement());

    const deleteBtn = section.getElement().querySelector('.btn-delete') as HTMLElement;
    deleteBtn.click();

    expect(store.sections.find(s => s.id === 'undo-test')).toBeUndefined();

    const toast = document.querySelector('.fixed.bottom-6') as HTMLElement;
    expect(toast).toBeTruthy();
    expect(toast.textContent).toContain('Undo Test');
    const undoBtn = toast.querySelector('button') as HTMLButtonElement;
    expect(undoBtn.textContent).toBe('Undo');

    undoBtn.click();
    expect(store.sections.find(s => s.id === 'undo-test')).toBeTruthy();
  });
});
