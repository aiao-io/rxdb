import { expect, type Locator, type Page, test } from '@playwright/test';

import { dragRowTo } from './drag-utils.js';
import { addRootFolder, addRootMenu, getFileRow, getMenuRow, openPage, requireAttribute } from './e2e-utils.js';

/**
 * US-031 阶段 B：树页面的拖放全部交给 `Repository.reorder()`。
 *
 * 用真实鼠标拖拽（`dragRowTo`），操作后刷新页面，从 DOM 读回顺序与 `data-parent-id`。
 * 行的身份用 `data-menu-id` / `data-file-id` 记录：标题会重复出现在别的行文本里，id 不会。
 * 拖放失败路径（`staleTarget` 等）没有确定性的触发点，由单测覆盖，不进 e2e。
 */

type RowKind = 'menu' | 'file';

const ROW_ATTRS: Record<RowKind, { testId: string; idAttribute: string; prefix: string }> = {
  menu: { testId: 'menu-row', idAttribute: 'data-menu-id', prefix: 'menu' },
  file: { testId: 'file-row', idAttribute: 'data-file-id', prefix: 'file' }
};

interface LaidOutRow {
  label: string;
  /** 父节点的标签；根节点为空串。 */
  parent: string;
}

/** 按标签记住每一行的 id，页面刷新后仍能按标签找回这一行、读回顺序与父子关系。 */
class RowTracker {
  readonly #labels = new Map<string, string>();
  readonly #ids = new Map<string, string>();

  constructor(
    private readonly page: Page,
    private readonly kind: RowKind
  ) {}

  /** 记住 `row` 的 id，标签为 `label`；返回按 id 定位的行（跨刷新、跨重排都稳定）。 */
  async track(label: string, row: Locator): Promise<Locator> {
    const { idAttribute } = ROW_ATTRS[this.kind];
    const id = await requireAttribute(row, idAttribute, `${label} 行`);
    this.#labels.set(id, label);
    this.#ids.set(label, id);
    return this.row(label);
  }

  /** 按标签定位一行。 */
  row(label: string): Locator {
    const { testId, idAttribute } = ROW_ATTRS[this.kind];
    const id = this.#ids.get(label);
    if (id === undefined) throw new Error(`没有记录过标签 ${label} 的行`);
    return this.page.getByTestId(testId).and(this.page.locator(`[${idAttribute}=${JSON.stringify(id)}]`));
  }

  /** 页面上当前渲染的行，按 DOM 顺序，带标签与父节点标签。 */
  async layout(): Promise<LaidOutRow[]> {
    const { testId, idAttribute } = ROW_ATTRS[this.kind];
    const rows = await this.page.getByTestId(testId).evaluateAll(
      (elements, attr) =>
        elements.map(element => ({
          id: element.getAttribute(attr) ?? '',
          parentId: element.getAttribute('data-parent-id') ?? ''
        })),
      idAttribute
    );
    const labelOf = (id: string): string => this.#labels.get(id) ?? `未记录:${id}`;
    return rows.map(row => ({ label: labelOf(row.id), parent: row.parentId === '' ? '' : labelOf(row.parentId) }));
  }

  /** 某个父节点下的行标签，按 DOM 顺序；根组用空串。 */
  async childrenOf(parent: string): Promise<string[]> {
    return (await this.layout()).filter(row => row.parent === parent).map(row => row.label);
  }

  /** 全部渲染行的标签，按 DOM 顺序。 */
  async order(): Promise<string[]> {
    return (await this.layout()).map(row => row.label);
  }

  /** 撤销计数徽标上的数字；没有可撤销项时徽标不渲染，计为 0。 */
  async undoCount(): Promise<number> {
    const badge = this.page.getByTestId(`${ROW_ATTRS[this.kind].prefix}-undo-count`);
    if ((await badge.count()) === 0) return 0;
    return Number(await badge.innerText());
  }

  /** 等撤销计数稳定（历史项是异步入账的）后读出。 */
  async settledUndoCount(): Promise<number> {
    let previous = -1;
    await expect
      .poll(
        async () => {
          const current = await this.undoCount();
          const stable = current === previous;
          previous = current;
          return stable;
        },
        { intervals: [200] }
      )
      .toBe(true);
    return previous;
  }
}

/** 在 `parent` 下新建一个子菜单：悬停出现行内按钮 -> 选中父节点 -> 提交。 */
async function addMenuChild(page: Page, parent: Locator, title: string): Promise<Locator> {
  await parent.hover();
  await parent.getByTestId('menu-add-child').click();
  await page.getByTestId('menu-title-input').fill(title);
  await page.getByTestId('menu-submit-child').click();
  return getMenuRow(page, title);
}

/** 切换文件管理器的新建模式（按钮上显示的是当前模式）。 */
async function selectAddMode(page: Page, mode: '文件' | '文件夹'): Promise<void> {
  const toggle = page.getByTestId('file-mode-toggle');
  if ((await toggle.innerText()).trim() !== mode) await toggle.click();
  await expect(toggle).toHaveText(mode);
}

/** 在根目录（未选父文件夹时）新建一个 .txt 文件，返回它的行。 */
async function addRootFile(page: Page, name: string): Promise<Locator> {
  await selectAddMode(page, '文件');
  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  const row = await getFileRow(page, `${name}.txt`);
  await expect(input).toHaveValue('');
  return row;
}

/** 在根目录新建一个文件夹。 */
async function addRootFolderInMode(page: Page, name: string): Promise<Locator> {
  await selectAddMode(page, '文件夹');
  return addRootFolder(page, name);
}

/** 选中 `folder` 为父文件夹，在它下面新建一个 .txt 文件；选择会保留，后续新建要先 `clearSelectedFolder`。 */
async function addFileChild(page: Page, folder: Locator, name: string): Promise<Locator> {
  await folder.hover();
  await folder.getByTestId('file-select-parent').click();
  await selectAddMode(page, '文件');
  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  const row = await getFileRow(page, `${name}.txt`);
  await expect(input).toHaveValue('');
  return row;
}

/** 取消「将添加到: <文件夹>」的选择，回到向根目录新建。 */
async function clearSelectedFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: '取消选择' }).click();
}

/** 往根目录依次新建菜单，返回按标签追踪的行。 */
async function createRootMenus(page: Page, tracker: RowTracker, titles: string[]): Promise<void> {
  for (const title of titles) {
    await tracker.track(title, await addRootMenu(page, title));
  }
}

/** 刷新页面并等标题重新出现，之后从 DOM 读回的是库里已提交的状态。 */
async function reloadPage(page: Page, title: string | RegExp): Promise<void> {
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test.describe('树页面拖放（US-031 阶段 B）', () => {
  // 串行：用例都要刷新页面、做真实鼠标拖拽，分散到多个 worker 并发时会抢占本机 CPU，拖慢别的用例
  test.describe.configure({ mode: 'serial' });

  test('同父拖到两邻之间', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
    const tree = new RowTracker(page, 'menu');
    await createRootMenus(page, tree, ['节点A', '节点B', '节点C', '节点D']);

    // 把 D 放到 B 的上沿：落在 A 与 B 之间
    await dragRowTo(page, tree.row('节点D'), tree.row('节点B'), 'before');
    await expect.poll(() => tree.order()).toEqual(['节点A', '节点D', '节点B', '节点C']);

    await reloadPage(page, 'Tree Menu - Simple');
    await expect.poll(() => tree.order()).toEqual(['节点A', '节点D', '节点B', '节点C']);
  });

  test('拖到组首与组尾', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
    const tree = new RowTracker(page, 'menu');
    await createRootMenus(page, tree, ['节点A', '节点B', '节点C', '节点D']);

    // C 拖到组首（A 的上沿）
    await dragRowTo(page, tree.row('节点C'), tree.row('节点A'), 'before');
    await expect.poll(() => tree.order()).toEqual(['节点C', '节点A', '节点B', '节点D']);

    // A 拖到组尾（D 的下沿）
    await dragRowTo(page, tree.row('节点A'), tree.row('节点D'), 'after');
    await expect.poll(() => tree.order()).toEqual(['节点C', '节点B', '节点D', '节点A']);

    await reloadPage(page, 'Tree Menu - Simple');
    await expect.poll(() => tree.order()).toEqual(['节点C', '节点B', '节点D', '节点A']);
  });

  test('跨父拖到两个子节点之间', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
    const tree = new RowTracker(page, 'menu');
    const first = await tree.track('父甲', await addRootMenu(page, '父甲'));
    const second = await tree.track('父乙', await addRootMenu(page, '父乙'));
    await tree.track('甲一', await addMenuChild(page, first, '甲一'));
    await tree.track('甲二', await addMenuChild(page, first, '甲二'));
    await tree.track('乙一', await addMenuChild(page, second, '乙一'));
    await tree.track('乙二', await addMenuChild(page, second, '乙二'));
    expect(await tree.childrenOf('父甲')).toEqual(['甲一', '甲二']);
    expect(await tree.childrenOf('父乙')).toEqual(['乙一', '乙二']);

    // 甲一 拖到乙一的下沿：改挂到父乙，落在乙一与乙二之间
    await dragRowTo(page, tree.row('甲一'), tree.row('乙一'), 'after');
    await expect.poll(() => tree.childrenOf('父乙')).toEqual(['乙一', '甲一', '乙二']);
    expect(await tree.childrenOf('父甲')).toEqual(['甲二']);

    await reloadPage(page, 'Tree Menu - Simple');
    await expect.poll(() => tree.childrenOf('父乙')).toEqual(['乙一', '甲一', '乙二']);
    expect(await tree.childrenOf('父甲')).toEqual(['甲二']);
  });

  test('菜单懒加载：拖进折叠节点，展开后排在末尾', async ({ page }) => {
    await openPage(page, '/menu-lazy', 'Tree Menu - Lazy Load');
    const tree = new RowTracker(page, 'menu');
    const parent = await tree.track('懒父', await addRootMenu(page, '懒父'));
    await tree.track('子一', await addMenuChild(page, parent, '子一'));
    await tree.track('子二', await addMenuChild(page, parent, '子二'));
    await tree.track('拖入X', await addRootMenu(page, '拖入X'));

    // 折叠：子节点从页面上卸载，页面不再持有它们（缺陷三：此时拖进去不能与既有子节点撞键）
    await parent.getByTestId('menu-node-toggle').click();
    await expect.poll(() => tree.childrenOf('懒父')).toEqual([]);

    await dragRowTo(page, tree.row('拖入X'), parent, 'into');

    // 拖进后页面展开目标，既有子节点之后是被拖入的节点
    await expect.poll(() => tree.childrenOf('懒父')).toEqual(['子一', '子二', '拖入X']);

    // 刷新后重新展开，顺序仍是库里提交的顺序
    await reloadPage(page, 'Tree Menu - Lazy Load');
    const toggle = tree.row('懒父').getByTestId('menu-node-toggle');
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect.poll(() => tree.childrenOf('懒父')).toEqual(['子一', '子二', '拖入X']);
  });

  test('拖到后代上被拒、零写', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
    const tree = new RowTracker(page, 'menu');
    const first = await tree.track('父甲', await addRootMenu(page, '父甲'));
    await tree.track('父乙', await addRootMenu(page, '父乙'));
    const child = await tree.track('甲一', await addMenuChild(page, first, '甲一'));
    await tree.track('甲一一', await addMenuChild(page, child, '甲一一'));
    const before = await tree.layout();
    const baseCount = await tree.settledUndoCount();

    // 父甲 拖到自己的子孙与自己身上：前、后、内三种落点都被拒（无效高亮），零写
    for (const [descendant, position] of [
      ['甲一', 'into'],
      ['甲一', 'before'],
      ['甲一一', 'after'],
      ['父甲', 'into']
    ] as const) {
      await dragRowTo(page, tree.row('父甲'), tree.row(descendant), position, {
        beforeDrop: async () => {
          await expect(tree.row(descendant)).toHaveAttribute('data-drop-valid', 'false');
        }
      });
    }

    // 同步点：一次合法拖放生效时，前面被拒的拖放若写过库，撤销计数会多出来
    await dragRowTo(page, tree.row('父乙'), tree.row('父甲'), 'before');
    await expect.poll(() => tree.childrenOf('')).toEqual(['父乙', '父甲']);
    expect(await tree.settledUndoCount()).toBe(baseCount + 1);

    // 子树的父子关系与顺序都没变
    const after = await tree.layout();
    expect(after.filter(row => row.label !== '父乙' && row.label !== '父甲')).toEqual(
      before.filter(row => row.label !== '父乙' && row.label !== '父甲')
    );
    await reloadPage(page, 'Tree Menu - Simple');
    await expect.poll(() => tree.childrenOf('甲一')).toEqual(['甲一一']);
    expect(await tree.childrenOf('父甲')).toEqual(['甲一']);
  });

  test('原位放下与拖进当前父节点（已是末尾）都零写', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
    const tree = new RowTracker(page, 'menu');
    await createRootMenus(page, tree, ['节点A', '节点B', '节点C']);
    const parent = await tree.track('父丙', await addRootMenu(page, '父丙'));
    await tree.track('丙一', await addMenuChild(page, parent, '丙一'));
    await tree.track('丙二', await addMenuChild(page, parent, '丙二'));
    const baseCount = await tree.settledUndoCount();

    // 原位：B 放回 A 的下沿（本就在那里）、放回 C 的上沿
    await dragRowTo(page, tree.row('节点B'), tree.row('节点A'), 'after');
    await dragRowTo(page, tree.row('节点B'), tree.row('节点C'), 'before');
    // 拖进当前父节点且已是它的最后一个子节点：引擎零写
    await dragRowTo(page, tree.row('丙二'), parent, 'into');

    // 同步点：一次合法拖放生效，前面三次若写过库，撤销计数会多出来
    await dragRowTo(page, tree.row('节点C'), tree.row('节点A'), 'before');
    await expect.poll(() => tree.childrenOf('')).toEqual(['节点C', '节点A', '节点B', '父丙']);
    expect(await tree.settledUndoCount()).toBe(baseCount + 1);
    expect(await tree.childrenOf('父丙')).toEqual(['丙一', '丙二']);
  });

  test('拖放后撤销一次恢复', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
    const tree = new RowTracker(page, 'menu');
    const first = await tree.track('父甲', await addRootMenu(page, '父甲'));
    const second = await tree.track('父乙', await addRootMenu(page, '父乙'));
    await tree.track('甲一', await addMenuChild(page, first, '甲一'));
    await tree.track('甲二', await addMenuChild(page, first, '甲二'));
    await tree.track('乙一', await addMenuChild(page, second, '乙一'));
    await tree.track('乙二', await addMenuChild(page, second, '乙二'));
    const before = await tree.layout();
    const baseCount = await tree.settledUndoCount();

    await dragRowTo(page, tree.row('甲一'), tree.row('乙一'), 'after');
    await expect.poll(() => tree.childrenOf('父乙')).toEqual(['乙一', '甲一', '乙二']);
    expect(await tree.settledUndoCount()).toBe(baseCount + 1);

    // 撤销一次：父节点与顺序都回到拖放前
    await page.getByTestId('menu-undo').click();
    await expect.poll(() => tree.layout()).toEqual(before);
    expect(await tree.settledUndoCount()).toBe(baseCount);
  });

  test('虚拟滚动页同父重排', async ({ page }) => {
    await openPage(page, '/menu-virtual', /Tree Menu - Virtual/u);
    const tree = new RowTracker(page, 'menu');
    await createRootMenus(page, tree, ['节点A', '节点B', '节点C', '节点D']);

    await dragRowTo(page, tree.row('节点D'), tree.row('节点B'), 'before');
    await expect.poll(() => tree.order()).toEqual(['节点A', '节点D', '节点B', '节点C']);

    await reloadPage(page, /Tree Menu - Virtual/u);
    await expect.poll(() => tree.order()).toEqual(['节点A', '节点D', '节点B', '节点C']);
  });

  test('文件管理器手动模式：文件夹之间重排、拖进文件夹', async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');
    const files = new RowTracker(page, 'file');
    await files.track('夹甲', await addRootFolderInMode(page, '夹甲'));
    await files.track('夹乙', await addRootFolderInMode(page, '夹乙'));
    await files.track('夹丙', await addRootFolderInMode(page, '夹丙'));
    await files.track('文件X', await addRootFile(page, '文件X'));
    // 手动模式显示的就是库里的顺序，不再文件夹优先
    expect(await files.order()).toEqual(['夹甲', '夹乙', '夹丙', '文件X']);

    // 文件夹之间重排：夹丙 放到 夹乙 的上沿
    await dragRowTo(page, files.row('夹丙'), files.row('夹乙'), 'before');
    await expect.poll(() => files.order()).toEqual(['夹甲', '夹丙', '夹乙', '文件X']);

    // 拖进文件夹：文件X 成为 夹甲 的子节点
    await dragRowTo(page, files.row('文件X'), files.row('夹甲'), 'into');
    await expect.poll(() => files.childrenOf('夹甲')).toEqual(['文件X']);

    await page.reload();
    await expect.poll(() => files.childrenOf('')).toEqual(['夹甲', '夹丙', '夹乙']);
    await files.row('夹甲').getByTestId('file-node-toggle').click();
    await expect.poll(() => files.childrenOf('夹甲')).toEqual(['文件X']);
  });

  test('文件管理器懒加载：拖进折叠文件夹，展开后排在末尾', async ({ page }) => {
    await openPage(page, '/file-manager-lazy', 'File Manager - Lazy Load');
    const files = new RowTracker(page, 'file');
    const folder = await files.track('懒夹', await addRootFolderInMode(page, '懒夹'));
    await files.track('子一', await addFileChild(page, folder, '子一'));
    await files.track('子二', await addFileChild(page, folder, '子二'));
    await clearSelectedFolder(page);
    await files.track('拖入X', await addRootFile(page, '拖入X'));

    // 折叠：子节点从页面上卸载（缺陷三：此时拖进去不能与既有子节点撞键）
    const toggle = folder.getByTestId('file-node-toggle');
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect.poll(() => files.childrenOf('懒夹')).toEqual([]);

    await dragRowTo(page, files.row('拖入X'), folder, 'into');
    await expect.poll(() => files.childrenOf('懒夹')).toEqual(['子一', '子二', '拖入X']);

    // 刷新后重新展开，顺序仍是库里提交的顺序
    await page.reload();
    const reloadedToggle = files.row('懒夹').getByTestId('file-node-toggle');
    await expect(reloadedToggle).toBeEnabled();
    await reloadedToggle.click();
    await expect.poll(() => files.childrenOf('懒夹')).toEqual(['子一', '子二', '拖入X']);
  });

  test('文件管理器非手动模式：子级拖到根级节点下方移到根组末尾', async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');
    const files = new RowTracker(page, 'file');
    const first = await files.track('夹甲', await addRootFolderInMode(page, '夹甲'));
    await files.track('夹乙', await addRootFolderInMode(page, '夹乙'));
    await files.track('根文件', await addRootFile(page, '根文件'));
    await files.track('子文件', await addFileChild(page, first, '子文件'));
    expect(await files.childrenOf('夹甲')).toEqual(['子文件']);

    // 切到按名称排序：页面显示的不再是手动顺序
    const sortSelect = page.getByTestId('file-sort-select');
    await sortSelect.selectOption('name-asc');

    // 子文件 拖到根级节点 夹乙 的下沿：移到根级，追加到手动顺序的根组末尾
    await dragRowTo(page, files.row('子文件'), files.row('夹乙'), 'after', {
      beforeDrop: async () => {
        await expect(files.row('夹乙')).toHaveAttribute('data-drop-valid', 'true');
      }
    });
    await expect.poll(async () => (await files.layout()).find(row => row.label === '子文件')?.parent).toBe('');

    // 切回手动排序：根组末尾是它（在原有的根节点之后）
    await sortSelect.selectOption('manual');
    await expect.poll(() => files.childrenOf('')).toEqual(['夹甲', '夹乙', '根文件', '子文件']);

    await page.reload();
    await expect.poll(() => files.childrenOf('')).toEqual(['夹甲', '夹乙', '根文件', '子文件']);
  });

  test('文件管理器非手动模式：同级前后放置被拒', async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');
    const files = new RowTracker(page, 'file');
    await files.track('夹甲', await addRootFolderInMode(page, '夹甲'));
    await files.track('夹乙', await addRootFolderInMode(page, '夹乙'));
    await files.track('夹丙', await addRootFolderInMode(page, '夹丙'));
    const baseCount = await files.settledUndoCount();

    const sortSelect = page.getByTestId('file-sort-select');
    await sortSelect.selectOption('name-asc');
    await expect(sortSelect).toHaveValue('name-asc');

    // 根级节点之间的上方 / 下方放置：无效高亮，放下后零写
    for (const position of ['before', 'after'] as const) {
      await dragRowTo(page, files.row('夹丙'), files.row('夹乙'), position, {
        beforeDrop: async () => {
          await expect(files.row('夹乙')).toHaveAttribute('data-drop-valid', 'false');
        }
      });
    }

    // 同步点：一次合法拖放（拖进文件夹）生效，前面被拒的拖放若写过库，撤销计数会多出来
    await dragRowTo(page, files.row('夹丙'), files.row('夹乙'), 'into');
    await expect.poll(() => files.childrenOf('夹乙')).toEqual(['夹丙']);
    expect(await files.settledUndoCount()).toBe(baseCount + 1);

    // 切回手动顺序：夹甲、夹乙 的相对顺序没被改动
    await sortSelect.selectOption('manual');
    await expect.poll(() => files.childrenOf('')).toEqual(['夹甲', '夹乙']);
  });
});
