'use client';

/**
 * rxdb-plugin-bom-react - React 集成层
 *
 * 提供 `useBomView()` hook 与 `BomTree` / `BomLineEditor` 组件，把 `@aiao/rxdb-plugin-bom` 的共享 BOM
 * 控制器适配为 React 状态。命名、命令与输入跟踪语义与 Angular / Vue 绑定层一致。
 *
 * @packageDocumentation
 */

// 绑定签名里出现的共享类型随入口转出（三端清单一致），消费方不必再从核心包导入
export type { BomViewCommands, BomViewInput, BomViewState } from '@aiao/rxdb-plugin-bom';
export { BomLineEditor } from './bom-line-editor.js';
export { BomTree } from './bom-tree.js';
export { useBomView, type BomViewBinding } from './use-bom-view.js';
