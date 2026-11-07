/**
 * 通用 SSE 帧拼装工具
 *
 * - OpenAI 入口用 `writeData` + `writeRaw('data: [DONE]\n\n')` 终止
 * - Anthropic 入口用 `writeEvent('message_start', ...)` 等命名事件
 * - project-compat 路径用 AI SDK data stream，不走此模块
 */

const encoder = new TextEncoder();

type SseController = ReadableStreamDefaultController<Uint8Array>;

/** 写入一条 `data: <json>\n\n` 帧 */
export function writeData(controller: SseController, obj: unknown): void {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  controller.enqueue(encoder.encode(line));
}

/** 写入一条带 event 名的 SSE 帧：`event: <name>\ndata: <json>\n\n` */
export function writeEvent(controller: SseController, eventName: string, obj: unknown): void {
  const line = `event: ${eventName}\ndata: ${JSON.stringify(obj)}\n\n`;
  controller.enqueue(encoder.encode(line));
}

/** 写入原始字符串（OpenAI `data: [DONE]\n\n` 终止用） */
export function writeRaw(controller: SseController, text: string): void {
  controller.enqueue(encoder.encode(text));
}

/** 关闭 SSE 流（重复关闭安全） */
export function closeStream(controller: SseController): void {
  try {
    controller.close();
  } catch {
    // controller 已关闭则忽略
  }
}
