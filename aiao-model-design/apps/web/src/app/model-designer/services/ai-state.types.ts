/**
 * AI 操作状态
 *
 * - `idle`: 无 AI 操作进行中
 * - `generating`: AI 正在流式生成
 * - `interrupted`: 生成中断，保留已完整解析的实体
 * - `previewing`: 生成完成，用户在 AI 子分支上预览结果
 */
export type AiOperationState = 'idle' | 'generating' | 'interrupted' | 'previewing';

/**
 * AI 验证状态
 *
 * - `idle`: 无验证操作
 * - `validating`: AI 正在验证模型
 * - `reviewing`: 验证完成，用户正在逐条审阅建议
 */
export type ValidationState = 'idle' | 'validating' | 'reviewing';
