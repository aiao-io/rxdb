import { RxDB } from '@aiao/rxdb';
import { SortableFileNode, SortableMenuSimple } from '@aiao/rxdb-test/entities';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useAction 与真实实现同形（`execute` 原样冒泡错误），页面的批量入口走 `action.execute`
vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: vi.fn(() => ({ value: () => [] })),
  useAction: vi.fn((action: (...args: never[]) => unknown) => ({ execute: action, isPending: () => false }))
}));

import FileManagerSimplePage from './file-manager/file-manager-simple/file-manager-simple.page';
import { FileDragDropService } from './file-manager/services/file-drag-drop.service';
import { FilePathValidatorService } from './file-manager/services/file-path-validator.service';
import { MenuDragDropService } from './menu/services/menu-drag-drop.service';
import { MenuSearchService } from './menu/services/menu-search.service';
import MenuTreeSimplePage from './menu/tree-menu-simple/tree-menu-simple.page';

const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Event;
const boom = new Error('boom');

const configure = () =>
  TestBed.configureTestingModule({
    providers: [
      {
        provide: RxDB,
        useValue: {
          versionManager: { history: vi.fn(() => ({ undo: vi.fn(), redo: vi.fn() })) },
          entityManager: { saveMany: vi.fn(), removeMany: vi.fn() }
        }
      },
      { provide: PLATFORM_ID, useValue: 'browser' },
      MenuSearchService,
      MenuDragDropService,
      FileDragDropService,
      FilePathValidatorService
    ]
  });

/** 六种写入失败都进页内提示：不弹 window.alert、不只打 console、不留未处理的拒绝。 */
describe('菜单页：写入失败进页内提示', () => {
  let alertSpy: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  const menu = { id: 'm1', parentId: null, title: '菜单' } as unknown as SortableMenuSimple;

  beforeEach(() => {
    // happy-dom 没有 alert；桩上去，页面代码若还调用就会被记录
    alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    configure();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  const makePage = () => TestBed.runInInjectionContext(() => new MenuTreeSimplePage());

  const expectInPageError = (page: MenuTreeSimplePage, text: string) => {
    expect(page.writeError()).toBe(text);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  };

  it('初始没有错误，clearWriteError 清空', () => {
    const page = makePage();
    expect(page.writeError()).toBeNull();

    page.writeError.set('删除失败：x');
    page.clearWriteError();

    expect(page.writeError()).toBeNull();
  });

  it('新建根菜单失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'addRootMenu').mockRejectedValue(boom);
    page.$new_menu_title.set('根');

    await page.addRootMenu(event);

    expectInPageError(page, '新建失败：boom');
    expect(page.$new_menu_title()).toBe('根');
  });

  it('新建子菜单失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'addChildMenu').mockRejectedValue(boom);
    page.$new_menu_title.set('子');

    await page.addChildMenu(event);

    expectInPageError(page, '新建失败：boom');
    expect(page.$new_menu_title()).toBe('子');
  });

  it('新建根菜单因同级重名未写入：保留输入，不出写入失败提示', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'addRootMenu').mockResolvedValue(false);
    page.$new_menu_title.set('重名');

    await page.addRootMenu(event);

    expect(page.writeError()).toBeNull();
    expect(page.$new_menu_title()).toBe('重名');
  });

  it('重名警告不被保留下来的输入立刻清掉，改了输入才清', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'addRootMenu').mockImplementation(async () => {
      page.store.pathConflictWarning.set({ hasConflict: true, conflictPath: '/重名' });
      return false;
    });
    page.$new_menu_title.set('重名');
    TestBed.tick();

    await page.addRootMenu(event);
    TestBed.tick();
    expect(page.store.pathConflictWarning()).toEqual({ hasConflict: true, conflictPath: '/重名' });

    page.$new_menu_title.set('不重名');
    TestBed.tick();
    expect(page.store.pathConflictWarning()).toBeNull();
  });

  it('重命名失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'saveEdit').mockRejectedValue(boom);
    page.$edit_menu_title.set('新名');

    await page.saveEdit(event);

    expectInPageError(page, '重命名失败：boom');
  });

  it('删除失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'deleteMenu').mockRejectedValue(boom);

    await page.deleteMenu(event, menu);

    expectInPageError(page, '删除失败：boom');
  });

  it('级联删除失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'executeCascadeDelete').mockRejectedValue(boom);

    await page.executeCascadeDelete();

    expectInPageError(page, '级联删除失败：boom');
  });

  it('删除并提升子节点失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'executePromoteChildrenDelete').mockRejectedValue(boom);

    await page.executePromoteChildrenDelete();

    expectInPageError(page, '删除并提升子节点失败：boom');
  });

  it('批量添加失败不再向外抛出（无未处理拒绝）', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'add_many_menu').mockRejectedValue(boom);

    await expect(Promise.resolve(page.batchAddOptions[1].action.execute(1000))).resolves.toBeUndefined();

    expectInPageError(page, '批量添加失败：boom');
  });

  it('非 Error 的拒绝值用 String(error)', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'executeCascadeDelete').mockRejectedValue('磁盘已满');

    await page.executeCascadeDelete();

    expectInPageError(page, '级联删除失败：磁盘已满');
  });

  it('下一次写入开始时清掉上一次的错误，失败后页面可继续操作', async () => {
    const page = makePage();
    const addRootMenu = vi.spyOn(page.store, 'addRootMenu').mockRejectedValueOnce(boom).mockResolvedValue(true);
    page.$new_menu_title.set('根');

    await page.addRootMenu(event);
    expect(page.writeError()).toBe('新建失败：boom');

    await page.addRootMenu(event);

    expect(addRootMenu).toHaveBeenCalledTimes(2);
    expect(page.writeError()).toBeNull();
    expect(page.$new_menu_title()).toBe('');
  });
});

describe('文件管理器页：写入失败进页内提示', () => {
  let alertSpy: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  const file = { id: 'f1', parentId: null, name: '文件', type: 'file' } as unknown as SortableFileNode;

  beforeEach(() => {
    localStorage.clear();
    // happy-dom 没有 alert；桩上去，页面代码若还调用就会被记录
    alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    configure();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  const makePage = () => TestBed.runInInjectionContext(() => new FileManagerSimplePage());

  const expectInPageError = (page: FileManagerSimplePage, text: string) => {
    expect(page.writeError()).toBe(text);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  };

  it('初始没有错误，clearWriteError 清空', () => {
    const page = makePage();
    expect(page.writeError()).toBeNull();

    page.writeError.set('删除失败：x');
    page.clearWriteError();

    expect(page.writeError()).toBeNull();
  });

  it('新建根文件夹失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'createRootFolder').mockRejectedValue(boom);
    page.$new_file_name.set('文件夹');

    await page.addRootFolder(event);

    expectInPageError(page, '新建失败：boom');
    expect(page.$new_file_name()).toBe('文件夹');
  });

  it('新建根文件夹因同级重名未写入：保留输入，不出写入失败提示', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'createRootFolder').mockResolvedValue(false);
    page.$new_file_name.set('重名');

    await page.addRootFolder(event);

    expect(page.writeError()).toBeNull();
    expect(page.$new_file_name()).toBe('重名');
  });

  it('重名警告不被保留下来的输入立刻清掉，改了输入才清', async () => {
    const page = makePage();
    const conflict = { conflictPath: '/重名', conflictNode: file, attemptedName: '重名' };
    vi.spyOn(page.store, 'createRootFolder').mockImplementation(async () => {
      page.store.pathConflictWarning.set(conflict);
      return false;
    });
    page.$new_file_name.set('重名');
    TestBed.tick();

    await page.addRootFolder(event);
    TestBed.tick();
    expect(page.store.pathConflictWarning()).toBe(conflict);

    page.$new_file_name.set('不重名');
    TestBed.tick();
    expect(page.store.pathConflictWarning()).toBeNull();
  });

  it('新建子文件夹失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'createSubFolder').mockRejectedValue(boom);
    page.$new_file_name.set('子');

    await page.addSubFolder(event);

    expectInPageError(page, '新建失败：boom');
    expect(page.$new_file_name()).toBe('子');
  });

  it('新建文件失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'createFile').mockRejectedValue(boom);
    page.$new_file_name.set('说明');
    page.$new_file_extension.set('.md');

    await page.addFile(event);

    expectInPageError(page, '新建失败：boom');
    expect(page.$new_file_name()).toBe('说明');
  });

  it('重命名失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'saveEdit').mockRejectedValue(boom);
    page.$edit_file_name.set('新名');

    await page.saveEdit(event);

    expectInPageError(page, '重命名失败：boom');
  });

  it('删除失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'deleteFile').mockRejectedValue(boom);

    await page.deleteFile(event, file);

    expectInPageError(page, '删除失败：boom');
  });

  it('级联删除失败', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'executeCascadeDelete').mockRejectedValue(boom);

    await page.executeCascadeDelete();

    expectInPageError(page, '级联删除失败：boom');
  });

  it('批量添加失败不再向外抛出（无未处理拒绝）', async () => {
    const page = makePage();
    vi.spyOn(page.store, 'addBatch').mockRejectedValue(boom);

    await expect(Promise.resolve(page.add_many.execute(100))).resolves.toBeUndefined();

    expectInPageError(page, '批量添加失败：boom');
  });
});
