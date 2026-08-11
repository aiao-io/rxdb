/**
 * T033 [US1] —— 防抖流工厂。
 *
 * 将查询输入流包装为防抖流：
 *  - 默认 300 ms（spec FR-007、research.md §4）
 *  - `0` 关闭防抖（直通）
 *  - 自定义 ms 生效
 *
 * 数据源变更触发的静默重查 MUST 绕过此防抖（contracts/plugin-search-api.md
 * "响应式更新语义"）—— 实现侧由 search handle 决定何时使用本流。
 */
import { type Observable, debounceTime } from 'rxjs';

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * 为查询输入流套上 `debounceTime`。
 *
 * @param input$ 原始输入流
 * @param ms 防抖窗口；默认 300，传 0 关闭
 */
export const createDebouncedQueryStream = (
  input$: Observable<string>,
  ms: number = DEFAULT_DEBOUNCE_MS
): Observable<string> => (ms > 0 ? input$.pipe(debounceTime(ms)) : input$);
