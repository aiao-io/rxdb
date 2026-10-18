import AxeBuilder from '@axe-core/playwright';

const DEMO = '[data-testid="bom-view-demo"]';
const NODES = '[data-testid="bom-node"]';
const root = page => page.locator(DEMO);
const row = (page, path) => page.locator(`${NODES}[data-path=${JSON.stringify(JSON.stringify(path))}]`);
const quantity = (page, path) => row(page, path).getByTestId('bom-quantity');
const state = page => page.evaluate(() => window.__bomViewDemo?.state ?? null);
const ids = page => page.evaluate(() => window.__bomViewDemo.ids);
const click = (page, label) => root(page).getByRole('button', { name: label, exact: true }).click();

const ready = async (page, expect) => {
  await expect
    .poll(
      async () => {
        const current = await state(page);
        return current?.phase === 'success' && !current.refreshing;
      },
      { timeout: 30_000 }
    )
    .toBe(true);
};

const choose = async (page, expect, target) => {
  await root(page).getByLabel('目标', { exact: true }).selectOption(target);
  await ready(page, expect);
};

const expand = async (page, expect, path) => {
  const target = row(page, path);
  await target.getByRole('button', { name: /^展开 / }).click();
  await expect(target).toHaveAttribute('aria-expanded', 'true');
};

const editor = page => root(page).getByRole('region', { name: 'BOM 行编辑器', exact: true });
const save = async (page, expect, qty) => {
  await editor(page).getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => {
      const current = await state(page);
      return !current?.editor.saving && current?.editor.value?.qty;
    })
    .toBe(qty);
};

const distribution = values => {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    samples: values,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1)
  };
};

/** 三个项目只负责提供自己的 Playwright fixture，所有业务断言在这里定义。 */
export function registerBomViewParity(test, expect) {
  test.describe('BOM 三框架共享验收', () => {
    test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
    test.beforeEach(async ({ page }, testInfo) => {
      await page.addInitScript(() => {
        window.__bomVisibleStatusHistory = [];
        new MutationObserver(() => {
          const status = document.querySelector('[data-testid="bom-demo-status"]');
          const text = status?.textContent?.trim();
          if (text && window.__bomVisibleStatusHistory.at(-1) !== text) window.__bomVisibleStatusHistory.push(text);
          if (document.querySelector('[data-testid="bom-node"]') && window.__bomFirstDataAt === undefined) {
            window.__bomFirstDataAt = performance.now();
          }
        }).observe(document, { subtree: true, childList: true, characterData: true });
      });
      await page.goto(testInfo.title.startsWith('100 节点性能') ? '/bom-view?root=performance' : '/bom-view');
      await expect(page.getByRole('heading', { name: 'BOM 编辑与展开', exact: true })).toBeVisible();
      await expect(page.getByTestId('bom-demo-status')).toHaveText('BOM 数据已就绪', { timeout: 30_000 });
      await ready(page, expect);
    });

    test('AC#1/#5/#10 三重边独立，共享子装配按路径惰性展开和折叠', async ({ page }) => {
      const fixture = await ids(page);
      const first = [fixture.occurrences.shared1];
      const second = [fixture.occurrences.shared2];
      const firstLeaf = [...first, fixture.occurrences.assemblyWire];
      const secondLeaf = [...second, fixture.occurrences.assemblyWire];
      await expect(page.locator(NODES)).toHaveCount(7);
      for (const [index, key] of ['repeat1', 'repeat2', 'repeat3'].entries()) {
        await expect(quantity(page, [fixture.occurrences[key]])).toHaveText(`${index + 1} pcs`);
        await row(page, [fixture.occurrences[key]])
          .getByRole('button', { name: /^编辑 / })
          .click();
        await expect.poll(async () => (await state(page))?.editor.value?.occurrenceId).toBe(fixture.occurrences[key]);
        await expect(editor(page).getByLabel('用量', { exact: true })).toHaveValue(String(index + 1));
      }
      await expect(row(page, firstLeaf)).toHaveCount(0);
      await expect(row(page, secondLeaf)).toHaveCount(0);
      await expand(page, expect, first);
      await expect(quantity(page, firstLeaf)).toHaveText('1 m');
      await expect(row(page, second)).toHaveAttribute('aria-expanded', 'false');
      await expect(row(page, secondLeaf)).toHaveCount(0);
      await expand(page, expect, second);
      await expect(quantity(page, secondLeaf)).toHaveText('2 m');
      await row(page, first)
        .getByRole('button', { name: /^折叠 / })
        .click();
      await expect(row(page, firstLeaf)).toHaveCount(0);
      await expect(row(page, secondLeaf)).toBeVisible();
      const paths = await page
        .locator(NODES)
        .evaluateAll(elements => elements.map(element => element.getAttribute('data-path')));
      expect(new Set(paths).size).toBe(paths.length);
    });

    test('AC#2 改量 ECN 后所有无关路径复用同一个真实 Element', async ({ page }) => {
      const fixture = await ids(page);
      await expand(page, expect, [fixture.occurrences.shared1]);
      await expand(page, expect, [fixture.occurrences.shared2]);
      const count = await page.evaluate(excluded => {
        window.__bomStableElements = new Map(
          [...document.querySelectorAll('[data-testid="bom-node"]')]
            .filter(element => !JSON.parse(element.getAttribute('data-path')).includes(excluded))
            .map(element => [element.getAttribute('data-path'), element])
        );
        return window.__bomStableElements.size;
      }, fixture.occurrences.shared1);
      expect(count).toBeGreaterThan(6);
      await click(page, '改量ECN');
      await expect(quantity(page, [fixture.occurrences.quantityReplacement])).toHaveText('9 pcs');
      await expect(row(page, [fixture.occurrences.shared1])).toHaveCount(0);
      await expand(page, expect, [fixture.occurrences.quantityReplacement]);
      await expect(
        quantity(page, [fixture.occurrences.quantityReplacement, fixture.occurrences.assemblyWire])
      ).toHaveText('9 m');
      const unchanged = await page.evaluate(() => {
        const current = new Map(
          [...document.querySelectorAll('[data-testid="bom-node"]')].map(element => [
            element.getAttribute('data-path'),
            element
          ])
        );
        return [...window.__bomStableElements].every(([path, previous]) => current.get(path) === previous);
      });
      expect(unchanged).toBe(true);
      await expect(row(page, [fixture.occurrences.quantityReplacement])).toHaveAttribute('aria-expanded', 'true');
      await expect(row(page, [fixture.occurrences.shared2])).toHaveAttribute('aria-expanded', 'true');
    });

    test('AC#6/#7 发布原结果未引用的新 ECN 行和推进显式日期均自动更新', async ({ page }) => {
      const fixture = await ids(page);
      await expect(row(page, [fixture.occurrences.pending])).toHaveCount(0);
      await expect(row(page, [fixture.occurrences.future])).toHaveCount(0);
      await click(page, '发布新增ECN');
      await expect(quantity(page, [fixture.occurrences.pending])).toHaveText('5 pcs');
      await root(page).getByLabel('评估日', { exact: true }).fill('2099-01-02T00:00');
      await expect(quantity(page, [fixture.occurrences.future])).toHaveText('7 pcs');
      await expect(quantity(page, [fixture.occurrences.pending])).toHaveText('5 pcs');
      expect(
        new Date(
          (await state(page)).nodes.find(node => node.occurrenceId === fixture.occurrences.future).effectiveFrom
        ).toISOString()
      ).toBe('2099-01-02T00:00:00.000Z');
    });

    test('AC#8/#9 新修订同时改变 imprecise 结构与 phantom，物料换算修改继续自动刷新', async ({ page }) => {
      const fixture = await ids(page);
      const first = [fixture.occurrences.shared1];
      const second = [fixture.occurrences.shared2];
      await expand(page, expect, first);
      await expand(page, expect, second);
      await expect(quantity(page, [...first, fixture.occurrences.assemblyWire])).toHaveText('1 m');
      await click(page, '发布phantom修订');
      await expect
        .poll(async () => {
          const current = await state(page);
          return current?.nodes.find(node => node.occurrenceId === fixture.occurrences.shared1)?.revisionId;
        })
        .not.toBe(fixture.revisions.assembly);
      await expect
        .poll(async () =>
          (await state(page))?.nodes
            .filter(node => node.depth === 2 && node.itemId === fixture.items.wire)
            .map(node => node.quantity?.value)
        )
        .toEqual(['3', '6']);
      await expect(row(page, [...first, fixture.occurrences.assemblyWire])).toHaveCount(0);
      const afterRevision = await state(page);
      const nextPaths = afterRevision.nodes
        .filter(node => node.depth === 2 && node.itemId === fixture.items.wire)
        .map(node => node.path);
      expect(nextPaths).toHaveLength(2);
      expect(nextPaths[0][0]).toBe(fixture.occurrences.shared1);
      expect(nextPaths[1][0]).toBe(fixture.occurrences.shared2);
      await click(page, '修改换算率');
      await expect(quantity(page, nextPaths[0])).toHaveText('1.5 m');
      await expect(quantity(page, nextPaths[1])).toHaveText('3 m');
      await click(page, '计算数量');
      await expect(page.getByTestId('bom-demo-status')).toHaveText('数量已计算');
      await expect(page.getByTestId('bom-demo-error')).toHaveCount(0);
    });

    test('AC#11 草稿独立编辑五字段，显式发布后按真实数量和生效期消费', async ({ page }) => {
      const fixture = await ids(page);
      await expect(row(page, [fixture.occurrences.draft])).toHaveCount(0);
      await click(page, '草稿编辑');
      const form = editor(page);
      await expect(form.getByLabel('用量', { exact: true })).toHaveValue('2');
      await form.getByLabel('用量', { exact: true }).fill('10.0');
      await form.getByLabel('组件损耗', { exact: true }).fill('0.10');
      await form.getByLabel('投料工序', { exact: true }).fill('20');
      await form.getByLabel('生效起点', { exact: true }).fill('2050-01-01T12:30');
      await form.getByLabel('生效终点', { exact: true }).fill('2099-02-01T12:30');
      await save(page, expect, '10');
      const current = (await state(page)).editor.value;
      expect(current).toMatchObject({
        occurrenceId: fixture.occurrences.draft,
        qty: '10',
        componentScrap: '0.1',
        operationSeq: 20,
        editable: true
      });
      expect(new Date(current.effectiveFrom).toISOString()).toBe('2050-01-01T12:30:00.000Z');
      expect(new Date(current.effectiveTo).toISOString()).toBe('2099-02-01T12:30:00.000Z');
      await click(page, '草稿编辑');
      await expect(form.getByLabel('用量', { exact: true })).toHaveValue('10');
      await expect(form.getByLabel('组件损耗', { exact: true })).toHaveValue('0.1');
      await expect(row(page, [fixture.occurrences.draft])).toHaveCount(0);
      await click(page, '发布草稿');
      await choose(page, expect, 'draft');
      await expect(quantity(page, [fixture.occurrences.draft])).toHaveText('11 pcs');
      await root(page).getByLabel('评估日', { exact: true }).fill('2050-01-01T12:29');
      await expect.poll(async () => (await state(page))?.phase).toBe('empty');
      await expect(row(page, [fixture.occurrences.draft])).toHaveCount(0);
      await root(page).getByLabel('评估日', { exact: true }).fill('2050-01-01T12:30');
      await expect(quantity(page, [fixture.occurrences.draft])).toHaveText('11 pcs');
      await root(page).getByLabel('评估日', { exact: true }).fill('2099-02-01T12:30');
      await expect.poll(async () => (await state(page))?.phase).toBe('empty');
      await expect(row(page, [fixture.occurrences.draft])).toHaveCount(0);
    });

    test('AC#11 draft ECN 新发生项可改，显式发布后数量可见，既有发布行只读', async ({ page }) => {
      const fixture = await ids(page);
      await click(page, 'ECN新行编辑');
      await expect(editor(page).getByLabel('用量', { exact: true })).toHaveValue('5');
      await editor(page).getByLabel('用量', { exact: true }).fill('7');
      await editor(page).getByLabel('组件损耗', { exact: true }).fill('0.1');
      await editor(page).getByLabel('投料工序', { exact: true }).fill('20');
      await save(page, expect, '7');
      await expect(row(page, [fixture.occurrences.pending])).toHaveCount(0);
      await click(page, '发布新增ECN');
      await expect(quantity(page, [fixture.occurrences.pending])).toHaveText('8 pcs');
      await click(page, '已发布行编辑');
      await expect(editor(page).getByRole('note')).toContainText('已发布发生项只读');
      await expect(editor(page).getByRole('button', { name: '保存', exact: true })).toBeDisabled();
      for (const label of ['用量', '组件损耗', '投料工序', '生效起点', '生效终点']) {
        await expect(editor(page).getByLabel(label, { exact: true })).toBeDisabled();
      }
      await expect(quantity(page, [fixture.occurrences.repeat1])).toHaveText('1 pcs');
    });

    for (const kind of ['alternative', 'manual', 'unit', 'lot']) {
      test(`AC#12 ${kind} 候选完整保留，数量、成本和导出都拒绝未解析结果`, async ({ page }) => {
        await choose(page, expect, kind);
        const candidates = root(page).getByTestId('bom-candidate');
        await expect(candidates).toHaveCount(1);
        await expect(candidates).toContainText(kind);
        await expect(candidates.locator('li')).toHaveCount(2);
        await expect(page.getByTestId('bom-quantity').first()).toHaveText('未解析');
        expect((await state(page)).unresolved[0].candidates).toHaveLength(2);
        for (const action of ['计算数量', '计算成本', '导出BOM']) {
          await click(page, action);
          await expect(root(page).getByRole('button', { name: action, exact: true })).toBeEnabled();
          await expect(page.getByTestId('bom-demo-error')).toContainText(/未|裁决|候选|manual|多个/);
          await expect(candidates.locator('li')).toHaveCount(2);
        }
      });
    }

    test('AC#4 深度预算截断有可见原因，完整数量与导出明确拒绝', async ({ page }) => {
      await root(page).getByLabel('深度预算', { exact: true }).fill('1');
      await expect(root(page).getByRole('note')).toContainText('depth');
      expect((await state(page)).truncated).toEqual({ reason: 'depth' });
      for (const action of ['计算数量', '导出BOM']) {
        await click(page, action);
        await expect(root(page).getByRole('button', { name: action, exact: true })).toBeEnabled();
        await expect(page.getByTestId('bom-demo-error')).toContainText(/截断|depth/);
      }
      await root(page).getByLabel('深度预算', { exact: true }).fill('');
      await expect(root(page).getByRole('note')).toHaveCount(0);
      await click(page, '计算数量');
      await expect(page.getByTestId('bom-demo-status')).toHaveText('数量已计算');
    });

    test('AC#3 三端原样显示同一个真实成环错误的 message、code 和 payload', async ({ page }, testInfo) => {
      const fixture = await ids(page);
      await click(page, '尝试成环');
      const failure = page.getByTestId('bom-demo-error');
      await expect(failure).toContainText('BOM_CYCLE');
      const [message, code, payloadText] = (await failure.innerText()).split('\n');
      const result = { message, code, payload: JSON.parse(payloadText) };
      expect(result).toEqual({
        message: `[rxdb-plugin-bom] 检测到环：${fixture.items.draft}`,
        code: 'BOM_CYCLE',
        payload: { path: [fixture.items.draft], unionOnly: false }
      });
      await testInfo.attach('bom-cycle-error.json', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json'
      });
      await click(page, '草稿编辑');
      await expect(editor(page).getByLabel('用量', { exact: true })).toHaveValue('2');
      await expect(row(page, [fixture.occurrences.draftCycle])).toHaveCount(0);
    });

    test('卸载释放绑定，重新挂载恢复同库已发布变更，并允许连续输入切换', async ({ page }) => {
      const fixture = await ids(page);
      await click(page, '改量ECN');
      await expect(quantity(page, [fixture.occurrences.quantityReplacement])).toHaveText('9 pcs');
      await click(page, '卸载视图');
      await expect(page.locator(NODES)).toHaveCount(0);
      await expect.poll(() => state(page)).toBeNull();
      await expect(root(page).getByRole('button', { name: '计算数量', exact: true })).toBeDisabled();
      await click(page, '重新挂载');
      await expect(quantity(page, [fixture.occurrences.quantityReplacement])).toHaveText('9 pcs');
      await choose(page, expect, 'formula');
      await expect(quantity(page, [fixture.occurrences.formula])).toHaveText('4 pcs');
      await root(page).getByLabel('计划量', { exact: true }).fill('3');
      await expect(quantity(page, [fixture.occurrences.formula])).toHaveText('12 pcs');
      await choose(page, expect, 'main');
      await expect(quantity(page, [fixture.occurrences.quantityReplacement])).toHaveText('27 pcs');
      expect((await state(page)).nodes[0].itemId).toBe(fixture.items.main);
    });

    test('真实初始加载、空结果、解析失败和修正后的成功均有可访问状态', async ({ page }) => {
      expect(await page.evaluate(() => window.__bomVisibleStatusHistory)).toContain('正在连接 BOM 数据库');
      await root(page).getByLabel('目标', { exact: true }).selectOption('config');
      await expect.poll(async () => (await state(page))?.phase).toBe('empty');
      await expect(page.locator(NODES)).toHaveCount(0);
      await expect(root(page).locator('.bom-tree').getByRole('status')).toHaveText('没有可见 BOM 节点');
      await choose(page, expect, 'main');
      await root(page).getByLabel('评估日', { exact: true }).fill('');
      await expect.poll(async () => (await state(page))?.phase).toBe('error');
      await expect(root(page).locator('.bom-tree').getByRole('alert')).toContainText('asOfDate');
      await expect(root(page).getByRole('button', { name: '重试', exact: true })).toBeVisible();
      await root(page).getByLabel('评估日', { exact: true }).fill('2099-01-01T00:00');
      await ready(page, expect);
      await expect(page.locator(NODES)).toHaveCount(7);
    });

    test('键盘展开、独立编辑、焦点指示和 WCAG 2.1 AA 扫描三端一致', async ({ page }, testInfo) => {
      const fixture = await ids(page);
      const rootRow = row(page, []);
      await rootRow.focus();
      await rootRow.press('End');
      await expect(row(page, [fixture.occurrences.phantom])).toBeFocused();
      await page.keyboard.press('Home');
      await expect(rootRow).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(row(page, [fixture.occurrences.repeat1])).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(editor(page).getByRole('button', { name: '保存', exact: true })).toBeDisabled();
      const shared = row(page, [fixture.occurrences.shared1]);
      await shared.focus();
      await shared.press('ArrowRight');
      await expect(shared).toHaveAttribute('aria-expanded', 'true');
      await shared.press('ArrowRight');
      await expect(row(page, [fixture.occurrences.shared1, fixture.occurrences.assemblyWire])).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(shared).toBeFocused();
      await page.keyboard.press(' ');
      await expect(shared).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('ArrowLeft');
      await expect(rootRow).toBeFocused();
      const focus = await rootRow.evaluate(element => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), shadow: style.boxShadow };
      });
      expect((focus.style !== 'none' && focus.width > 0) || (focus.shadow !== 'none' && focus.shadow !== '')).toBe(
        true
      );
      await click(page, '草稿编辑');
      for (const label of ['用量', '组件损耗', '投料工序', '生效起点', '生效终点']) {
        await expect(editor(page).getByLabel(label, { exact: true })).toBeEnabled();
      }
      const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
      const success = await new AxeBuilder({ page }).include(DEMO).withTags(tags).analyze();
      expect(success.violations).toEqual([]);
      await choose(page, expect, 'manual');
      const unresolved = await new AxeBuilder({ page }).include(DEMO).withTags(tags).analyze();
      expect(unresolved.violations).toEqual([]);
      await testInfo.attach('bom-axe-wcag21aa.json', {
        body: JSON.stringify({ success: success.violations, unresolved: unresolved.violations, focus }, null, 2),
        contentType: 'application/json'
      });
    });

    test('三端组件采用同一关键尺寸、间距和字体，并保存真实布局证据', async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await click(page, '草稿编辑');
      await expect(editor(page).getByLabel('用量', { exact: true })).toHaveValue('2');
      const dimensions = await root(page).evaluate(element => {
        const tree = element.querySelector('.bom-tree');
        const editor = element.querySelector('.bom-line-editor');
        const panels = element.querySelector('.bom-demo-panels');
        const heading = element.querySelector('h1');
        const row = element.querySelector('[role="treeitem"]');
        const style = target => {
          const current = getComputedStyle(target);
          const rectangle = target.getBoundingClientRect();
          return {
            width: rectangle.width,
            height: rectangle.height,
            fontSize: current.fontSize,
            lineHeight: current.lineHeight,
            padding: current.padding,
            radius: current.borderRadius,
            gap: current.gap,
            color: current.color,
            background: current.backgroundColor
          };
        };
        return {
          page: style(element),
          tree: style(tree),
          editor: style(editor),
          panels: style(panels),
          heading: style(heading),
          row: style(row),
          viewport: { width: innerWidth, height: innerHeight },
          firstDataMs: window.__bomFirstDataAt,
          userAgent: navigator.userAgent
        };
      });
      expect(dimensions.page.fontSize).toBe('15px');
      expect(dimensions.page.padding).toBe('24px');
      expect(dimensions.heading.fontSize).toBe('28px');
      expect(dimensions.panels.gap).toBe('16px');
      for (const component of [dimensions.tree, dimensions.editor]) {
        expect(component.fontSize).toBe('15px');
        expect(component.lineHeight).toBe('22.5px');
        expect(component.padding).toBe('16px');
        expect(component.radius).toBe('8px');
        expect(component.color).toBe('rgb(23, 35, 55)');
        expect(component.background).toBe('rgb(255, 255, 255)');
      }
      expect(dimensions.row.height).toBeGreaterThanOrEqual(40);
      expect(Math.abs(dimensions.tree.width + dimensions.editor.width + 16 - dimensions.panels.width)).toBeLessThan(1);
      expect(dimensions.tree.width).toBeGreaterThan(dimensions.editor.width);
      expect(Math.abs(dimensions.tree.height - dimensions.editor.height)).toBeLessThan(1);
      await testInfo.attach('bom-layout.json', {
        body: JSON.stringify(dimensions, null, 2),
        contentType: 'application/json'
      });
      await testInfo.attach('bom-layout.png', {
        body: await root(page).locator('.bom-demo-panels').screenshot(),
        contentType: 'image/png'
      });
    });

    test('100 节点性能：记录首屏、预热后输入至 DOM 更新的原始样本和 p50/p95/max', async ({ page }, testInfo) => {
      await expect(page.locator(NODES)).toHaveCount(100);
      const initial = await state(page);
      const leaf = initial.nodes.find(node => node.depth === 1);
      const path = leaf.path;
      const base = Number(leaf.quantity.value);
      expect(base).toBeGreaterThan(0);
      await page.evaluate(
        ({ key, base }) => {
          window.__bomDomPerformance = { samples: [], pending: null };
          document.addEventListener(
            'input',
            event => {
              if (!(event.target instanceof HTMLInputElement) || event.target.name !== 'bom-planned') return;
              window.__bomDomPerformance.pending = {
                start: performance.now(),
                expected: `${Number(event.target.value) * base} pcs`
              };
            },
            { capture: true }
          );
          new MutationObserver(() => {
            const pending = window.__bomDomPerformance.pending;
            if (pending === null) return;
            const target = [...document.querySelectorAll('[data-testid="bom-node"]')]
              .find(element => element.getAttribute('data-path') === key)
              ?.querySelector('[data-testid="bom-quantity"]');
            if (target?.textContent?.trim() !== pending.expected) return;
            window.__bomDomPerformance.samples.push(performance.now() - pending.start);
            window.__bomDomPerformance.pending = null;
          }).observe(document.querySelector('[data-testid="bom-view-demo"]'), {
            subtree: true,
            childList: true,
            characterData: true
          });
        },
        { key: JSON.stringify(path), base }
      );
      for (let index = 0; index < 22; index += 1) {
        const planned = index % 2 === 0 ? '2' : '1';
        await root(page).getByLabel('计划量', { exact: true }).fill(planned);
        await expect(quantity(page, path)).toHaveText(`${Number(planned) * base} pcs`);
      }
      const records = await page.evaluate(() => ({
        samples: window.__bomDomPerformance.samples,
        firstDataMs: window.__bomFirstDataAt,
        visibleNodes: window.__bomViewDemo.state.nodes.length,
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight }
      }));
      expect(records.samples).toHaveLength(22);
      const measured = distribution(records.samples.slice(2));
      await testInfo.attach('bom-input-to-dom-performance.json', {
        body: JSON.stringify(
          { ...records, warmup: records.samples.slice(0, 2), measured, dataset: '共享 BOM 视图 100 节点 fixture' },
          null,
          2
        ),
        contentType: 'application/json'
      });
      expect(records.visibleNodes).toBe(100);
      // sanity 上限（CI 2vCPU 机器显著慢于本地；阈值只拦「退化到秒级」）
      expect(records.firstDataMs).toBeLessThan(4000);
      expect(measured.p95).toBeLessThan(250);
    });
  });
}
