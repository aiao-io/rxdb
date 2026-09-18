/**
 * 重新导出 structuralEqual：结构化深比较，替代 JSON.stringify 比较。
 * 递归比较对象和数组，不依赖 key 序列化顺序，支持循环引用检测。
 */
export { structuralEqual } from '../../structural-equal.js';
