import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fire, mount, screen, waitFor, within } from './test-utils';

afterEach(() => {
  vi.useRealTimers();
});

const input = () => screen.getByTestId('admin-palette-input') as HTMLInputElement;
const options = () => screen.queryAllByTestId('admin-palette-option');

describe('CommandPalette', () => {
  it('Ctrl+K 打开（原生模态 dialog），输入框获得焦点，空查询显示菜单建议', async () => {
    const { fakeWindow, shell } = await mount();
    await act(() => void fakeWindow.press({ key: 'k', ctrlKey: true }));
    expect(shell.palette.value.open).toBe(true);
    expect((screen.getByTestId('admin-palette') as HTMLDialogElement).open).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(options().map(option => option.textContent)).toContain('资产实体');
  });

  it('输入查询过滤并高亮；方向键移动选中项；回车导航并关闭', async () => {
    const { shell, navigated } = await mount();
    await act(() => shell.palette.open());
    await fire.change(input(), '分类');
    expect(options()).toHaveLength(1);
    expect(options()[0].querySelector('mark')?.textContent).toBe('分类');
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(input().getAttribute('aria-activedescendant')).toBe('admin-palette-option-0');
    await fire.change(input(), '资产');
    expect(options().length).toBeGreaterThan(1);
    await fire.keyDown(input(), { key: 'ArrowDown' });
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    await fire.keyDown(input(), { key: 'ArrowUp' });
    await fire.keyDown(input(), { key: 'ArrowUp' });
    expect(options().at(-1)?.getAttribute('aria-selected')).toBe('true');
    await fire.keyDown(input(), { key: 'Enter' });
    expect(navigated).toHaveLength(1);
    expect(shell.palette.value.open).toBe(false);
  });

  it('鼠标移动选中、点击执行命令', async () => {
    const { shell } = await mount();
    await act(() => shell.palette.open());
    await fire.change(input(), '锁屏');
    await fire.mouseMove(options()[0]);
    await fire.click(options()[0]);
    expect(shell.lock.locked.value).toBe(true);
  });

  it('没有结果显示空态；清空查询回到建议', async () => {
    const { shell } = await mount();
    await act(() => shell.palette.open());
    await fire.change(input(), 'zzzzzz');
    expect(screen.getByText('没有匹配结果')).toBeTruthy();
    await fire.change(input(), '');
    expect(screen.queryByText('没有匹配结果')).toBeNull();
    expect(options().length).toBeGreaterThan(0);
  });

  it('Esc（原生 dialog 关闭）与点击背景关闭', async () => {
    const { shell } = await mount();
    await act(() => shell.palette.open());
    (screen.getByTestId('admin-palette') as HTMLDialogElement).close();
    expect(shell.palette.value.open).toBe(false);
    await act(() => shell.palette.open());
    await fire.click(screen.getByTestId('admin-palette'));
    expect(shell.palette.value.open).toBe(false);
  });

  it('异步来源：加载中提示、结果合并为独立分组、失败提示', async () => {
    vi.useFakeTimers();
    const { shell } = await mount();
    let reject = false;
    await act(() => {
      shell.palette.registerSource({
        id: 'records',
        groupLabelKey: 'palette.group.records',
        search: async query => {
          if (reject) throw new Error('fts down');
          return [{ id: 'r1', label: `${query} A-001`, run: vi.fn() }];
        }
      });
      shell.palette.open();
    });
    await fire.change(input(), '笔记本');
    expect(screen.getByText('搜索中…')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByText('搜索中…')).toBeNull();
    expect(screen.getByRole('group', { name: '数据记录' })).toBeTruthy();
    expect(options().map(option => option.textContent)).toContain('笔记本 A-001');
    reject = true;
    await fire.change(input(), '工作站');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText('部分结果加载失败')).toBeTruthy();
  });

  it('空查询时有最近使用则优先显示', async () => {
    const { shell } = await mount();
    await act(() => shell.palette.open());
    await fire.change(input(), '搜索');
    await fire.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(shell.palette.value.open).toBe(false));
    await act(() => shell.palette.open());
    expect(screen.getByRole('group', { name: '最近使用' })).toBeTruthy();
  });
});

describe('LockScreen', () => {
  it('锁定后弹出模态；Esc 不能关闭；解锁后收起', async () => {
    const { shell } = await mount();
    const dialog = screen.getByTestId('admin-lock') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    await act(() => shell.lock.lock());
    expect(dialog.open).toBe(true);
    expect(screen.getByText('首次使用，请先设置锁屏密码')).toBeTruthy();
    expect(await fire.event(dialog, new Event('cancel', { cancelable: true }))).toBe(false);
    expect(dialog.open).toBe(true);
    await act(() => shell.lock.unlock());
    expect(dialog.open).toBe(false);
  });

  it('首次设置密码后解锁；再次锁定要求输入密码，错误提示、正确解锁', async () => {
    const { shell } = await mount();
    await act(() => shell.lock.lock());
    await fire.change(screen.getByTestId('admin-lock-input'), 'hunter2');
    await fire.click(screen.getByTestId('admin-lock-submit'));
    await waitFor(() => expect(shell.lock.locked.value).toBe(false));
    expect(shell.lock.hasPassword()).toBe(true);
    await act(() => shell.lock.lock());
    expect(screen.getByText('输入密码解锁')).toBeTruthy();
    await fire.change(screen.getByTestId('admin-lock-input'), 'wrong');
    await fire.click(screen.getByTestId('admin-lock-submit'));
    await waitFor(() => expect(screen.getByTestId('admin-lock-error').textContent).toBe('密码不正确'));
    await fire.change(screen.getByTestId('admin-lock-input'), 'hunter2');
    expect(screen.queryByTestId('admin-lock-error')).toBeNull();
    await fire.click(screen.getByTestId('admin-lock-submit'));
    await waitFor(() => expect(shell.lock.locked.value).toBe(false));
  });

  it('空密码不提交；环境不支持密码哈希时提示', async () => {
    const { shell } = await mount({
      lockHasher: {
        hash: async () => {
          throw new Error('Web Crypto is unavailable');
        }
      }
    });
    await act(() => shell.lock.lock());
    await fire.click(screen.getByTestId('admin-lock-submit'));
    expect(shell.lock.locked.value).toBe(true);
    await fire.change(screen.getByTestId('admin-lock-input'), 'x');
    await fire.click(screen.getByTestId('admin-lock-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-lock-error').textContent).toContain('需要 HTTPS 或 localhost')
    );
  });

  it('忘记密码：二次确认后清除密码并解锁', async () => {
    const { shell } = await mount();
    await act(async () => shell.lock.setPassword('hunter2'));
    await act(() => shell.lock.lock());
    await fire.click(screen.getByTestId('admin-lock-forgot'));
    expect(screen.getByText(/数据不受影响/)).toBeTruthy();
    expect(shell.lock.locked.value).toBe(true);
    await fire.click(screen.getByTestId('admin-lock-reset-apply'));
    expect(shell.lock.locked.value).toBe(false);
    expect(shell.lock.hasPassword()).toBe(false);
  });

  it('锁屏上显示按所选时区格式化的时钟', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
    const { shell } = await mount({ defaults: { app: { timezone: 'Asia/Tokyo' } } });
    await act(() => shell.lock.lock());
    const card = screen.getByTestId('admin-lock');
    expect(within(card).getByText(/9:00/)).toBeTruthy();
    await act(() => void vi.advanceTimersByTime(60_000));
    expect(within(card).getByText(/9:01/)).toBeTruthy();
  });
});
