import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ModelSwitcherComponent } from '../../components/model-switcher/model-switcher.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { ModelDesign } from '../../models/index.js';

const DESIGNS = [
  { id: 'd1', name: 'Blog' },
  { id: 'd2', name: 'Shop' }
] as unknown as ModelDesign[];

function createComponent(designs: ModelDesign[] = DESIGNS, activeId: string | null = 'd1') {
  TestBed.configureTestingModule({
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const fixture = TestBed.createComponent(ModelSwitcherComponent);
  fixture.componentRef.setInput('models', designs);
  fixture.componentRef.setInput('activeId', activeId);
  return { comp: fixture.componentInstance, fixture };
}

function query<T extends Element>(fixture: ComponentFixture<ModelSwitcherComponent>, testId: string): T | null {
  return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
}

function renameInput(fixture: ComponentFixture<ModelSwitcherComponent>): HTMLInputElement | null {
  return query<HTMLInputElement>(fixture, 'model-switcher-rename-input');
}

function newModelInput(fixture: ComponentFixture<ModelSwitcherComponent>): HTMLInputElement | null {
  return query<HTMLInputElement>(fixture, 'model-switcher-new-input');
}

describe('ModelSwitcherComponent', () => {
  it('displays the active model name', () => {
    const { fixture } = createComponent();
    fixture.detectChanges();
    expect(query<HTMLElement>(fixture, 'model-switcher-name')?.textContent?.trim()).toBe('Blog');
  });

  it('shows the untitled fallback when no model is active', () => {
    const { fixture } = createComponent([], null);
    fixture.detectChanges();
    expect(query<HTMLElement>(fixture, 'model-switcher-name')?.textContent?.trim()).toBe(
      DEFAULT_TRANSLATIONS.modelSwitcher.untitled
    );
  });

  it('clicking the name enters rename mode and commits the trimmed name', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    query<HTMLElement>(fixture, 'model-switcher-name')?.click();
    fixture.detectChanges();

    const input = renameInput(fixture);
    expect(input).toBeTruthy();
    expect(input?.value).toBe('Blog');

    const spy = vi.fn();
    comp.modelRenamed.subscribe(spy);

    input!.value = '  NewBlog  ';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('NewBlog');
    expect(renameInput(fixture)).toBeNull();
  });

  it('ignores a blank rename and exits rename mode', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    query<HTMLElement>(fixture, 'model-switcher-name')?.click();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.modelRenamed.subscribe(spy);

    const input = renameInput(fixture);
    input!.value = '   ';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(spy).not.toHaveBeenCalled();
    expect(renameInput(fixture)).toBeNull();
  });

  it('cancels rename with Escape without emitting', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    query<HTMLElement>(fixture, 'model-switcher-name')?.click();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.modelRenamed.subscribe(spy);

    const input = renameInput(fixture);
    input!.value = 'Changed';
    input!.dispatchEvent(new Event('input'));
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(spy).not.toHaveBeenCalled();
    expect(renameInput(fixture)).toBeNull();
    expect(query<HTMLElement>(fixture, 'model-switcher-name')).toBeTruthy();
  });

  it('toggles the menu and closes it via the backdrop', () => {
    const { fixture } = createComponent();
    fixture.detectChanges();

    query<HTMLElement>(fixture, 'model-switcher-toggle')?.click();
    fixture.detectChanges();
    expect(query<HTMLElement>(fixture, 'model-switcher-menu')).toBeTruthy();

    query<HTMLElement>(fixture, 'model-switcher-backdrop')?.click();
    fixture.detectChanges();
    expect(query<HTMLElement>(fixture, 'model-switcher-menu')).toBeNull();
  });

  it('selecting a model from the menu emits its id and closes the menu', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.modelSelected.subscribe(spy);

    query<HTMLElement>(fixture, 'model-switcher-toggle')?.click();
    fixture.detectChanges();

    const menu = query<HTMLElement>(fixture, 'model-switcher-menu');
    const buttons = menu!.querySelectorAll('button');
    (buttons[1] as HTMLElement).click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('d2');
    expect(query<HTMLElement>(fixture, 'model-switcher-menu')).toBeNull();
  });

  it('creates a model with the trimmed name and resets the input', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    query<HTMLElement>(fixture, 'model-switcher-toggle')?.click();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.modelCreated.subscribe(spy);

    const input = newModelInput(fixture);
    input!.value = '  Shop2  ';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('Shop2');
    expect(comp.newName()).toBe('');
    expect(query<HTMLElement>(fixture, 'model-switcher-menu')).toBeNull();
  });

  it('does not create when the name is blank', () => {
    const { comp, fixture } = createComponent();
    fixture.detectChanges();

    query<HTMLElement>(fixture, 'model-switcher-toggle')?.click();
    fixture.detectChanges();

    const spy = vi.fn();
    comp.modelCreated.subscribe(spy);

    const input = newModelInput(fixture);
    input!.value = '   ';
    input!.dispatchEvent(new Event('input'));
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(spy).not.toHaveBeenCalled();
    expect(query<HTMLElement>(fixture, 'model-switcher-menu')).toBeTruthy();
  });
});
