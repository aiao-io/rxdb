import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpfsContextMenuComponent } from './opfs-context-menu.component';
import { OpfsDialogsComponent } from './opfs-dialogs.component';
import { OpfsToolbarComponent } from './opfs-toolbar.component';

function createEvent<T extends Event>(values: Partial<T>): T {
  return values as T;
}

describe('OPFS interaction components', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OpfsToolbarComponent, OpfsDialogsComponent, OpfsContextMenuComponent]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('emits selected files and clears the toolbar input', () => {
    const toolbar = TestBed.inject(OpfsToolbarComponent);
    const uploads = vi.fn();
    toolbar.uploadRequested.subscribe(uploads);
    toolbar.onFileInput(createEvent<Event>({ currentTarget: document.body }));

    const file = new File(['content'], 'readme.md');
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    toolbar.onFileInput(createEvent<Event>({ currentTarget: input }));

    expect(uploads).toHaveBeenCalledWith([file]);
    expect(input.value).toBe('');
  });

  it('closes dialogs only when the backdrop itself is clicked', () => {
    const dialogs = TestBed.inject(OpfsDialogsComponent);
    const closeNewFolder = vi.fn();
    const closeDelete = vi.fn();
    dialogs.closeNewFolder.subscribe(closeNewFolder);
    dialogs.closeDelete.subscribe(closeDelete);
    const backdrop = {} as EventTarget;

    dialogs.closeNewFolderFromBackdrop(createEvent<MouseEvent>({ currentTarget: backdrop, target: document.body }));
    dialogs.closeNewFolderFromBackdrop(createEvent<MouseEvent>({ currentTarget: backdrop, target: backdrop }));
    dialogs.closeDeleteFromBackdrop(createEvent<MouseEvent>({ currentTarget: backdrop, target: backdrop }));

    expect(closeNewFolder).toHaveBeenCalledOnce();
    expect(closeDelete).toHaveBeenCalledOnce();
  });

  it('emits dialog input and context-menu close events', () => {
    const dialogs = TestBed.inject(OpfsDialogsComponent);
    const contextMenu = TestBed.inject(OpfsContextMenuComponent);
    const nameChange = vi.fn();
    const closed = vi.fn();
    dialogs.newFolderNameChange.subscribe(nameChange);
    contextMenu.closed.subscribe(closed);

    const input = document.createElement('input');
    input.value = 'docs';
    dialogs.onFolderNameInput(createEvent<Event>({ currentTarget: input }));
    dialogs.onFolderNameInput(createEvent<Event>({ currentTarget: document.body }));
    contextMenu.onDocumentClick();

    expect(nameChange).toHaveBeenCalledWith('docs');
    expect(closed).toHaveBeenCalledOnce();
  });
});
