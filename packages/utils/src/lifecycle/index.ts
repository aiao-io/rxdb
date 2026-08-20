/**
 * @fileoverview 生命周期作用域模块
 *
 * @module lifecycle
 */

/**
 * 生命周期作用域的公开类型与错误
 * - ScopeDisposer: 撤销一次登记的句柄
 * - AcquireResult: acquire() 的 setup 返回值
 * - ScopeEntry: getEntries() 的快照节点
 * - LifecycleScopeDisposedError: 在非 active 作用域上登记时抛出
 */
export * from './lifecycle-scope.interface.js';

/**
 * 生命周期作用域
 * 成对登记「取得所有权 + 如何放弃」，到期逆序、串行撤销
 */
export * from './lifecycle-scope.js';
