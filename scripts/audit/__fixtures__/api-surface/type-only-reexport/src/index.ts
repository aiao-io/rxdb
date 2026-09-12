// 语句级 type-only：类的**值**不进运行时导出表，用户只能拿它具名，不能 new / extends。
export type { Widget, WidgetOptions } from './models.js';
// 逐 specifier 的 type-only，与上面一句是不同的 AST 形状，必须分别识别。
export { VERSION, type Gadget } from './models.js';
// 对照组：值形式转出，种类应仍是 both —— 修复不能把所有类都误判成 type。
export { Sprocket } from './models.js';
