import { Dialog } from '@angular/cdk/dialog';
import { PLATFORM_ID, signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SqlExecutionDialogComponent } from '../components/sql-execution/sql-execution-dialog.component';
import { VersionManagerDialogComponent } from '../components/version-manager/version-manager-dialog.component';
import DesignerComponent from '../designer.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../i18n/translations';
import type { GeneratedFile } from '../interfaces/designer.interface';
import { AiGenerateOrchestratorService } from '../services/ai-generate-orchestrator.service';
import { ConfirmDialogService } from '../services/confirm-dialog.service';
import { DesignerStateService } from '../services/designer-state.service';

interface DesignerExecutionView {
  readonly executeDisabled: Signal<boolean>;
}

function createDesigner(generatedFiles: readonly GeneratedFile[], executeAvailable = true) {
  const files = signal([...generatedFiles]);
  const open = vi.fn(() => ({ closed: of(undefined) }));
  const state = {
    generatedFiles: files,
    canCompareSql: signal(true),
    canExecuteSql: signal(executeAvailable),
    modelDesign: {
      activeDesign: signal({ id: 'design-1' }),
      designs: signal([]),
      load: vi.fn()
    }
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: Dialog, useValue: { open } },
      {
        provide: Router,
        useValue: {
          events: EMPTY,
          url: '/designer/canvas',
          routerState: { root: {} },
          navigate: vi.fn()
        }
      },
      { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } },
      { provide: DesignerStateService, useValue: state },
      {
        provide: AiGenerateOrchestratorService,
        useValue: { operationState: signal('idle'), discard: vi.fn() }
      },
      { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }
    ]
  });

  const component = TestBed.runInInjectionContext(() => new DesignerComponent());
  return { component, open, view: component as unknown as DesignerExecutionView };
}

describe('DesignerComponent SQL execution', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('opens an accessible dialog that remains mounted during navigation', () => {
    const sql = 'ALTER TABLE users ADD COLUMN name text;';
    const { component, open } = createDesigner([{ path: 'schema.sql', content: sql }]);

    component.onExecuteSql();

    expect(open).toHaveBeenCalledWith(
      SqlExecutionDialogComponent,
      expect.objectContaining({
        ariaLabel: DEFAULT_TRANSLATIONS.sqlExecution.title,
        closeOnNavigation: false,
        data: { sql }
      })
    );
  });

  it.each([
    ['empty', ' \n\t '],
    ['line-comment only', '-- generated schema has no changes\n -- still empty'],
    ['block-comment only', '/* generated schema\n   has no changes */'],
    ['nested block-comment only', '/* outer /* nested */ still outer */']
  ])('disables execution for %s SQL', (_case, content) => {
    const { component, open, view } = createDesigner([{ path: 'schema.sql', content }]);

    expect(view.executeDisabled()).toBe(true);
    component.onExecuteSql();
    expect(open).not.toHaveBeenCalled();
  });

  it('does not open SQL execution when the host adapter is unavailable', () => {
    const files = [{ path: 'schema.sql', content: 'ALTER TABLE users ADD COLUMN name text;' }];
    const { component, open } = createDesigner(files, false);

    component.onExecuteSql();

    expect(open).not.toHaveBeenCalled();
  });
});

describe('DesignerComponent version manager', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('opens an accessible version manager dialog', () => {
    const { component, open } = createDesigner([]);

    component.onOpenVersionManager();

    expect(open).toHaveBeenCalledWith(
      VersionManagerDialogComponent,
      expect.objectContaining({ ariaLabel: DEFAULT_TRANSLATIONS.versionManager.title })
    );
  });
});
