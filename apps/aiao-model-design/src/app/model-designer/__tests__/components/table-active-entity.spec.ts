import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { resolveActiveEntity } from '../../components/table/table-view.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignEntity } from '../../models/index.js';
import TableShellPage from '../../pages/table-shell.page';
import { DesignerStateService } from '../../services/designer-state.service';

describe('resolveActiveEntity', () => {
  const entities = [{ id: 'e1', name: 'User' }] as unknown as DesignEntity[];

  it('MUST resolve an existing route entity', () => {
    expect(resolveActiveEntity(entities, 'e1')).toBe(entities[0]);
  });

  it('MUST NOT fall back to the first entity for a missing route id', () => {
    expect(resolveActiveEntity(entities, 'missing')).toBeNull();
    expect(resolveActiveEntity(entities, null)).toBeNull();
  });
});

describe('TableShellPage route input', () => {
  it('allows the route input to arrive after the first signal evaluation', async () => {
    const fakeState = {
      entities: signal<DesignEntity[]>([]),
      propertiesMap: signal(new Map()),
      relationsMap: signal(new Map()),
      indexesMap: signal(new Map()),
      onEntitySelected: vi.fn(() => true)
    };

    await TestBed.configureTestingModule({
      imports: [TableShellPage],
      providers: [
        provideRouter([]),
        { provide: DesignerStateService, useValue: fakeState },
        { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }
      ]
    })
      .overrideComponent(TableShellPage, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(TableShellPage);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.componentInstance.activeEntity()).toBeNull();
  });
});
