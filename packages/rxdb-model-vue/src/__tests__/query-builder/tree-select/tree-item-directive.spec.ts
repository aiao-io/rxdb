import { describe, expect, it } from 'vitest';
import { TreeItemDirective } from '../../..';

/**
 * TreeItemDirective —— 树节点高亮协议的对称占位（Angular 侧 CDK `Highlightable`
 * `TreeItemDirective` / React 侧同名类的 Vue 等价物）。
 *
 * Vue 树形选择的激活态由组件内部索引管理，本类保留公开 API 面的对称性；
 * 自定义主题需要按 `Highlightable` 约定与树节点交互时使用。
 */
describe('TreeItemDirective（公开导出）', () => {
  it('默认不激活', () => {
    const item = new TreeItemDirective();
    expect(item.isActive).toBe(false);
  });

  it('setActiveStyles 激活节点', () => {
    const item = new TreeItemDirective();
    item.setActiveStyles();
    expect(item.isActive).toBe(true);
  });

  it('setInactiveStyles 取消激活', () => {
    const item = new TreeItemDirective();
    item.setActiveStyles();
    item.setInactiveStyles();
    expect(item.isActive).toBe(false);
  });

  it('实例间激活状态互不影响', () => {
    const first = new TreeItemDirective();
    const second = new TreeItemDirective();
    first.setActiveStyles();
    expect(first.isActive).toBe(true);
    expect(second.isActive).toBe(false);
  });
});
