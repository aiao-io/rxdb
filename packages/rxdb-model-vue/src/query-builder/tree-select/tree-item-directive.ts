/**
 * 树节点高亮指令（Angular 侧 CDK `TreeItemDirective` / React 侧同名类的 Vue 等价物）。
 *
 * @remarks
 * Vue 树形选择的激活态由组件内部索引管理（{@link TreeKeyManager} 由
 * `ActiveDescendantKeyManager` 替代而来），本类保留公开 API 面的对称性；
 * 自定义主题需要按 `Highlightable` 约定与树节点交互时使用。
 */
export class TreeItemDirective {
  #active = false;

  /** 当前节点是否处于激活（高亮）状态。 */
  get isActive(): boolean {
    return this.#active;
  }

  /** 设置激活样式（键盘导航命中时）。 */
  setActiveStyles(): void {
    this.#active = true;
  }

  /** 清除激活样式。 */
  setInactiveStyles(): void {
    this.#active = false;
  }
}
