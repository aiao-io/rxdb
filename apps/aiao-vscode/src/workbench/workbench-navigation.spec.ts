import { describe, expect, it } from 'vitest';
import { createWorkbenchNavigation } from './workbench-navigation.js';

const location = (path: string, projectId = 'one') => ({ projectId, path });

describe('工作台文件导航历史', () => {
  it('没有访问记录时无法前进或后退', () => {
    const history = createWorkbenchNavigation();
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);
    expect(history.back()).toBeNull();
    expect(history.forward()).toBeNull();
  });

  it('按照文件访问顺序后退和前进，边界处保留当前位置', () => {
    const history = createWorkbenchNavigation();
    history.record('one', 'src/a.ts');
    history.record('one', 'src/b.ts');
    history.record('one', 'src/c.ts');
    expect(history.canGoBack).toBe(true);
    expect(history.back()).toEqual(location('src/b.ts'));
    expect(history.back()).toEqual(location('src/a.ts'));
    expect(history.back()).toBeNull();
    expect(history.canGoForward).toBe(true);
    expect(history.forward()).toEqual(location('src/b.ts'));
    expect(history.forward()).toEqual(location('src/c.ts'));
    expect(history.forward()).toBeNull();
  });

  it('重复渲染相邻同一路径不会制造历史，也不截断已有前进记录', () => {
    const history = createWorkbenchNavigation();
    history.record('one', 'src/a.ts');
    history.record('one', 'src/a.ts');
    expect(history.canGoBack).toBe(false);
    history.record('one', 'src/b.ts');
    expect(history.back()).toEqual(location('src/a.ts'));
    history.record('one', 'src/a.ts');
    expect(history.forward()).toEqual(location('src/b.ts'));
  });

  it('后退后访问新文件会截断旧的前进分支', () => {
    const history = createWorkbenchNavigation();
    history.record('one', 'src/a.ts');
    history.record('one', 'src/b.ts');
    history.record('one', 'src/c.ts');
    history.back();
    history.record('one', 'src/d.ts');
    expect(history.canGoForward).toBe(false);
    expect(history.back()).toEqual(location('src/b.ts'));
    expect(history.back()).toEqual(location('src/a.ts'));
    expect(history.forward()).toEqual(location('src/b.ts'));
    expect(history.forward()).toEqual(location('src/d.ts'));
  });

  it('非相邻的重复访问仍然保留返回来源', () => {
    const history = createWorkbenchNavigation();
    history.record('one', 'src/a.ts');
    history.record('one', 'src/b.ts');
    history.record('one', 'src/a.ts');
    expect(history.back()).toEqual(location('src/b.ts'));
    expect(history.back()).toEqual(location('src/a.ts'));
  });

  it('切换项目会清空上一项目的导航记录，即使路径相同', () => {
    const history = createWorkbenchNavigation();
    history.record('one', 'src/a.ts');
    history.record('one', 'src/b.ts');
    history.record('two', 'src/b.ts');
    expect(history.canGoBack).toBe(false);
    history.record('two', 'src/c.ts');
    expect(history.back()).toEqual(location('src/b.ts', 'two'));
    expect(history.back()).toBeNull();
    history.record('one', 'src/a.ts');
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);
  });

  it('删除文件后跳过失效的前后记录，并保留前进分支', () => {
    const history = createWorkbenchNavigation();
    for (const path of ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts']) history.record('one', path);
    history.back();
    history.back();
    history.reconcile('one', ['src/a.ts', 'src/c.ts', 'src/e.ts']);
    expect(history.canGoForward).toBe(true);
    expect(history.back()).toEqual(location('src/a.ts'));
    expect(history.forward()).toEqual(location('src/c.ts'));
    expect(history.forward()).toEqual(location('src/e.ts'));
    expect(history.forward()).toBeNull();
  });

  it('清理文件产生的相邻重复记录合并为一个导航位置', () => {
    const history = createWorkbenchNavigation();
    for (const path of ['src/a.ts', 'src/b.ts', 'src/a.ts', 'src/c.ts']) history.record('one', path);
    history.back();
    history.reconcile('one', ['src/a.ts', 'src/c.ts']);
    expect(history.canGoBack).toBe(false);
    expect(history.forward()).toEqual(location('src/c.ts'));
    expect(history.back()).toEqual(location('src/a.ts'));
    expect(history.back()).toBeNull();
  });

  it('文件重命名后新路径可重新记录，旧路径不再成为导航目标', () => {
    const history = createWorkbenchNavigation();
    history.record('one', 'src/a.ts');
    history.record('one', 'src/b.ts');
    history.reconcile('one', ['src/a.ts', 'src/renamed.ts']);
    history.record('one', 'src/renamed.ts');
    expect(history.back()).toEqual(location('src/a.ts'));
    expect(history.forward()).toEqual(location('src/renamed.ts'));
    expect(history.forward()).toBeNull();
  });

  it('清理全部文件后可从新访问重新开始', () => {
    const history = createWorkbenchNavigation();
    history.record('one', 'src/a.ts');
    history.record('one', 'src/b.ts');
    history.reconcile('one', []);
    expect(history.back()).toBeNull();
    expect(history.forward()).toBeNull();
    history.record('one', 'src/c.ts');
    expect(history.canGoBack).toBe(false);
    history.record('one', 'src/d.ts');
    expect(history.back()).toEqual(location('src/c.ts'));
  });

  it('新项目的文件清理和显式 reset 都会清空全部历史', () => {
    const history = createWorkbenchNavigation();
    history.record('one', 'src/a.ts');
    history.record('one', 'src/b.ts');
    history.reconcile('two', ['src/a.ts', 'src/b.ts']);
    expect(history.back()).toBeNull();
    history.record('two', 'src/a.ts');
    history.record('two', 'src/b.ts');
    history.back();
    history.reset();
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);
    expect(history.back()).toBeNull();
    expect(history.forward()).toBeNull();
  });
});
