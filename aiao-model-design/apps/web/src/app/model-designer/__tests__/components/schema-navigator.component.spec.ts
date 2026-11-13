import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { SchemaNavigatorComponent } from '../../components/navigator/schema-navigator.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignEntity } from '../../models/index.js';

const ENTITIES = [
  { id: 'e1', name: 'Post', entityNamespace: 'public' },
  { id: 'e2', name: 'Tag', entityNamespace: 'shop' }
] as unknown as DesignEntity[];

function createComponent(entities: DesignEntity[] = ENTITIES) {
  TestBed.configureTestingModule({
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const fixture = TestBed.createComponent(SchemaNavigatorComponent);
  fixture.componentRef.setInput('entities', entities);
  fixture.componentRef.setInput('models', []);
  fixture.componentRef.setInput('activeModelId', null);
  return { comp: fixture.componentInstance, fixture };
}

function query<T extends Element>(fixture: ComponentFixture<SchemaNavigatorComponent>, testId: string): T | null {
  return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
}

function queryAll<T extends Element>(fixture: ComponentFixture<SchemaNavigatorComponent>, testId: string): T[] {
  return Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));
}

function dragEvent(overrides: Partial<DragEvent> = {}): DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn()
    },
    ...overrides
  } as unknown as DragEvent;
}

describe('SchemaNavigatorComponent 拖拽与 hover 操作', () => {
  it('renders namespace groups with their entities', () => {
    const { fixture } = createComponent();
    fixture.detectChanges();

    const summaries = queryAll<HTMLElement>(fixture, 'navigator-ns-summary');
    expect(summaries.map(s => s.getAttribute('data-namespace'))).toEqual(['public', 'shop']);
    expect(queryAll<HTMLElement>(fixture, 'navigator-entity-row').map(r => r.textContent?.trim())).toEqual([
      'Post',
      'Tag'
    ]);
  });

  it('clicking the rename icon enters inline edit and commits the new name', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.entityRenamed.subscribe(spy);

    query<HTMLElement>(fixture, 'navigator-entity-rename')?.click();
    fixture.detectChanges();

    const input = query<HTMLInputElement>(fixture, 'navigator-entity-rename-input');
    expect(input?.value).toBe('Post');

    input!.value = '  Article  ';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith({ id: 'e1', name: 'Article' });
    expect(query<HTMLInputElement>(fixture, 'navigator-entity-rename-input')).toBeNull();
  });

  it('cancels entity rename with Escape without emitting', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.entityRenamed.subscribe(spy);

    query<HTMLElement>(fixture, 'navigator-entity-rename')?.click();
    fixture.detectChanges();
    const input = query<HTMLInputElement>(fixture, 'navigator-entity-rename-input');
    input!.value = 'Changed';
    input!.dispatchEvent(new Event('input'));
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(spy).not.toHaveBeenCalled();
    expect(query<HTMLInputElement>(fixture, 'navigator-entity-rename-input')).toBeNull();
  });

  it('ignores a blank entity rename', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.entityRenamed.subscribe(spy);

    query<HTMLElement>(fixture, 'navigator-entity-rename')?.click();
    fixture.detectChanges();
    const input = query<HTMLInputElement>(fixture, 'navigator-entity-rename-input');
    input!.value = '   ';
    input!.dispatchEvent(new Event('input'));
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(spy).not.toHaveBeenCalled();
  });

  it('clicking the delete icon emits the entity id', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.entityDeleted.subscribe(spy);

    const rows = queryAll<HTMLElement>(fixture, 'navigator-entity-delete');
    rows[1].click();
    expect(spy).toHaveBeenCalledWith('e2');
  });

  it('clicking the namespace plus button emits the namespace and keeps the group open', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.entityCreatedInNamespace.subscribe(spy);

    const summaries = queryAll<HTMLElement>(fixture, 'navigator-ns-summary');
    const shopSummary = summaries.find(s => s.getAttribute('data-namespace') === 'shop')!;
    const details = shopSummary.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);

    (shopSummary.querySelector('[data-testid="navigator-ns-add"]') as HTMLElement).click();
    expect(spy).toHaveBeenCalledWith('shop');
    expect(details.open).toBe(true);
  });

  it('dragging an entity onto a namespace folder emits a move', () => {
    const { comp } = createComponent();

    const spy = vi.fn();
    comp.entityMoved.subscribe(spy);

    const startEvent = dragEvent();
    comp.onDragStart(startEvent, 'e1');
    expect(startEvent.dataTransfer?.setData).toHaveBeenCalledWith('text/plain', 'e1');

    const dropEvent = dragEvent();
    comp.onFolderDrop(dropEvent, 'shop');

    expect(dropEvent.preventDefault).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ id: 'e1', namespace: 'shop' });
  });

  it('clears drag state on drag end', () => {
    const { comp } = createComponent();
    comp.onDragStart(dragEvent(), 'e1');
    comp.onDragEnd();
    expect(comp.draggedEntityId()).toBeNull();
    expect(comp.dragOverNamespace()).toBeNull();
  });
});
