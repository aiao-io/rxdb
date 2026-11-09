import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from './queries.js';
import { cleanup, mount } from './test-utils.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const input = () => screen.getByTestId('admin-palette-input') as HTMLInputElement;
const options = () => screen.queryAllByTestId('admin-palette-option');

describe('CommandPalette', () => {
  it('Ctrl+K 打开（原生模态 dialog），输入框获得焦点，空查询显示菜单建议', async () => {
    const { fakeWindow, shell } = mount();
    await act(() => void fakeWindow.press({ key: 'k', ctrlKey: true }));
    expect(shell.palette.value.open).toBe(true);
    expect((screen.getByTestId('admin-palette') as HTMLDialogElement).open).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(options().map(option => option.textContent)).toContain('资产实体');
  });

  it('输入查询过滤并高亮；方向键移动选中项；回车导航并关闭', async () => {
    const { shell, navigated } = mount();
    await act(() => shell.palette.open());
    await fireEvent.change(input(), { target: { value: '分类' } });
    expect(options()).toHaveLength(1);
    expect(options()[0].querySelector('mark')?.textContent).toBe('分类');
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(input().getAttribute('aria-activedescendant')).toBe('admin-palette-option-0');
    await fireEvent.change(input(), { target: { value: '资产' } });
    expect(options().length).toBeGreaterThan(1);
    await fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(input(), { key: 'ArrowUp' });
    await fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(options().at(-1)?.getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(input(), { key: 'Enter' });
    expect(navigated).toHaveLength(1);
    expect(shell.palette.value.open).toBe(false);
  });

  it('输入法组合中的回车与方向键交给输入法：不执行、不移动选中项、不阻止默认行为；组合结束后回车照常执行', async () => {
    const { shell, navigated } = mount();
    await act(() => shell.palette.open());
    await fireEvent.change(input(), { target: { value: '资产' } });
    expect(options().length).toBeGreaterThan(1);
    expect(await fireEvent.keyDown(input(), { key: 'ArrowDown', isComposing: true })).toBe(true);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(await fireEvent.keyDown(input(), { key: 'Enter', isComposing: true })).toBe(true);
    // Safari 确认候选的回车在 compositionend 之后到达，isComposing 为 false、keyCode 为 229
    expect(await fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 })).toBe(true);
    expect(navigated).toEqual([]);
    expect(shell.palette.value.open).toBe(true);
    await fireEvent.keyDown(input(), { key: 'Enter' });
    expect(navigated).toHaveLength(1);
    expect(shell.palette.value.open).toBe(false);
  });

  it('鼠标移动选中、点击执行命令', async () => {
    const { shell } = mount();
    await act(() => shell.palette.open());
    await fireEvent.change(input(), { target: { value: '锁屏' } });
    await fireEvent.mouseMove(options()[0]);
    await fireEvent.click(options()[0]);
    expect(shell.lock.locked.value).toBe(true);
  });

  it('没有结果显示空态；清空查询回到建议', async () => {
    const { shell } = mount();
    await act(() => shell.palette.open());
    await fireEvent.change(input(), { target: { value: 'zzzzzz' } });
    expect(screen.getByText('没有匹配结果')).toBeTruthy();
    await fireEvent.change(input(), { target: { value: '' } });
    expect(screen.queryByText('没有匹配结果')).toBeNull();
    expect(options().length).toBeGreaterThan(0);
  });

  it('Esc（原生 dialog 关闭）与点击背景关闭', async () => {
    const { shell } = mount();
    await act(() => shell.palette.open());
    (screen.getByTestId('admin-palette') as HTMLDialogElement).close();
    expect(shell.palette.value.open).toBe(false);
    await act(() => shell.palette.open());
    await fireEvent.click(screen.getByTestId('admin-palette'));
    expect(shell.palette.value.open).toBe(false);
  });

  it('Esc 之后同一轮立刻按 Mod+K（两者之间没有渲染）：面板重新打开，晚到的 close 事件不会再把它关掉', async () => {
    const { shell, fakeWindow } = mount();
    await act(() => shell.palette.open());
    const dialog = screen.getByTestId('admin-palette') as HTMLDialogElement;
    // 浏览器的 Esc 顺序：同步 cancel → 原生关闭对话框 → 同一轮里再次请求打开 → close 事件晚到
    await act(() => {
      dialog.dispatchEvent(new Event('cancel'));
      dialog.removeAttribute('open');
      fakeWindow.press({ key: 'k', ctrlKey: true });
      dialog.dispatchEvent(new Event('close'));
    });
    expect(shell.palette.value.open).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it('同一轮里 cancel 关闭再重开，随后的原生 close 事件只是 cancel 的尾声：模型与原生状态都保持打开', async () => {
    const { shell } = mount();
    await act(() => shell.palette.open());
    const dialog = screen.getByTestId('admin-palette') as HTMLDialogElement;
    await act(() => {
      dialog.dispatchEvent(new Event('cancel'));
      dialog.removeAttribute('open');
      shell.palette.open();
    });
    expect(dialog.open).toBe(true);
    await act(() => void dialog.dispatchEvent(new Event('close')));
    expect(shell.palette.value.open).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it('异步来源：加载中提示、结果合并为独立分组、失败提示', async () => {
    vi.useFakeTimers();
    const { shell } = mount();
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
    await fireEvent.change(input(), { target: { value: '笔记本' } });
    expect(screen.getByText('搜索中…')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByText('搜索中…')).toBeNull();
    expect(screen.getByRole('group', { name: '数据记录' })).toBeTruthy();
    expect(options().map(option => option.textContent)).toContain('笔记本 A-001');
    reject = true;
    await fireEvent.change(input(), { target: { value: '工作站' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText('部分结果加载失败')).toBeTruthy();
  });

  it('空查询时有最近使用则优先显示', async () => {
    const { shell } = mount();
    await act(() => shell.palette.open());
    await fireEvent.change(input(), { target: { value: '搜索' } });
    await fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(shell.palette.value.open).toBe(false));
    await act(() => shell.palette.open());
    expect(screen.getByRole('group', { name: '最近使用' })).toBeTruthy();
  });
});

describe('LockScreen', () => {
  it('锁定后弹出模态；Esc 不能关闭；解锁后收起', async () => {
    const { shell } = mount();
    const dialog = screen.getByTestId('admin-lock') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    await act(() => shell.lock.lock());
    expect(dialog.open).toBe(true);
    expect(screen.getByText('首次使用，请先设置锁屏密码')).toBeTruthy();
    expect(await fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(false);
    expect(dialog.open).toBe(true);
    await act(() => shell.lock.unlock());
    expect(dialog.open).toBe(false);
  });

  it('首次设置密码后解锁；再次锁定要求输入密码，错误提示、正确解锁', async () => {
    const { shell } = mount();
    await act(() => shell.lock.lock());
    await fireEvent.change(screen.getByTestId('admin-lock-input'), { target: { value: 'hunter2' } });
    await fireEvent.click(screen.getByTestId('admin-lock-submit'));
    await waitFor(() => expect(shell.lock.locked.value).toBe(false));
    expect(shell.lock.hasPassword()).toBe(true);
    await act(() => shell.lock.lock());
    expect(screen.getByText('输入密码解锁')).toBeTruthy();
    await fireEvent.change(screen.getByTestId('admin-lock-input'), { target: { value: 'wrong' } });
    await fireEvent.click(screen.getByTestId('admin-lock-submit'));
    await waitFor(() => expect(screen.getByTestId('admin-lock-error').textContent).toBe('密码不正确'));
    await fireEvent.change(screen.getByTestId('admin-lock-input'), { target: { value: 'hunter2' } });
    expect(screen.queryByTestId('admin-lock-error')).toBeNull();
    await fireEvent.click(screen.getByTestId('admin-lock-submit'));
    await waitFor(() => expect(shell.lock.locked.value).toBe(false));
  });

  it('空密码不提交；环境不支持密码哈希时提示', async () => {
    const { shell } = mount({
      lockHasher: {
        hash: async () => {
          throw new Error('Web Crypto is unavailable');
        }
      }
    });
    await act(() => shell.lock.lock());
    await fireEvent.click(screen.getByTestId('admin-lock-submit'));
    expect(shell.lock.locked.value).toBe(true);
    await fireEvent.change(screen.getByTestId('admin-lock-input'), { target: { value: 'x' } });
    await fireEvent.click(screen.getByTestId('admin-lock-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-lock-error').textContent).toContain('需要 HTTPS 或 localhost')
    );
  });

  it('忘记密码：二次确认后清除密码并解锁', async () => {
    const { shell } = mount();
    await act(async () => shell.lock.setPassword('hunter2'));
    await act(() => shell.lock.lock());
    await fireEvent.click(screen.getByTestId('admin-lock-forgot'));
    expect(screen.getByText(/数据不受影响/)).toBeTruthy();
    expect(shell.lock.locked.value).toBe(true);
    await fireEvent.click(screen.getByTestId('admin-lock-reset-apply'));
    expect(shell.lock.locked.value).toBe(false);
    expect(shell.lock.hasPassword()).toBe(false);
  });

  it('锁屏上显示按所选时区格式化的时钟', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
    const { shell } = mount({ defaults: { app: { timezone: 'Asia/Tokyo' } } });
    await act(() => shell.lock.lock());
    const card = screen.getByTestId('admin-lock');
    expect(within(card).getByText(/9:00/)).toBeTruthy();
    await act(() => void vi.advanceTimersByTime(60_000));
    expect(within(card).getByText(/9:01/)).toBeTruthy();
  });
});
