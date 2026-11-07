import type { Modality } from '../../config';

/**
 * 任意模态 provider 的公共能力契约（FR-002）
 *
 * - 启动期由 ProviderRegistry 实例化一次，运行期只读
 * - id / modelIds / capabilities 由配置文件决定，运行期不可变
 */
export interface BaseProvider {
  readonly id: string;
  readonly modality: Modality;
  readonly modelIds: readonly string[];
  readonly capabilities: readonly string[];

  /**
   * 启动期同步健康探活（FR-004）
   *
   * - 实现必须在 ≤ 1s 内决出 resolve 或 reject；ProviderRegistry 会用外部 AbortSignal 兜底
   * - resolve → 标记 `enabled`；reject → 标记 `skipped` 并将 error.message 写入启动日志
   */
  healthCheck(signal: AbortSignal): Promise<void>;
}

export type FinishReason = 'stop' | 'length' | 'content_filter';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  modelId: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  stream: boolean;
  /** OpenAI stream_options.include_usage 透传 */
  includeUsage?: boolean;
}

export type ChatStreamEvent =
  | { kind: 'text-delta'; delta: string }
  | { kind: 'usage'; promptTokens: number; completionTokens: number }
  | { kind: 'finish'; reason: FinishReason };

export interface ChatComplete {
  text: string;
  finishReason: FinishReason;
  usage?: { promptTokens: number; completionTokens: number };
}

/**
 * Chat 模态 provider 契约
 *
 * - `complete()` 用于非流式调用
 * - `stream()` 用于流式调用，返回 AsyncIterable<ChatStreamEvent>
 * - 上游异常 / abort 由 provider 抛出，内核 error-classifier 统一分类
 */
export interface ChatProvider extends BaseProvider {
  readonly modality: 'chat';
  complete(req: ChatRequest, signal: AbortSignal): Promise<ChatComplete>;
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatStreamEvent>;
}

export interface AsrRequest {
  modelId: string;
  /**
   * 音频负载来源
   *
   * MVP 阶段 provider 收到的总是已落盘文件路径
   * （由 RetentionStore 落盘到 /tmp/aiao-gateway/<traceId>.<ext>），
   * provider 自行决定流式上传或一次性读。
   */
  audio: { path: string; mimeType: string; sizeBytes: number };
  language?: string;
  prompt?: string;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;
}

export interface AsrSegment {
  start: number;
  end: number;
  text: string;
}

export interface AsrResult {
  text: string;
  segments?: AsrSegment[];
  language?: string;
  duration?: number;
}

/**
 * ASR 模态 provider 契约
 */
export interface AsrProvider extends BaseProvider {
  readonly modality: 'asr';
  transcribe(req: AsrRequest, signal: AbortSignal): Promise<AsrResult>;
}

export type TtsAudioFormat = 'mp3' | 'wav' | 'opus' | 'flac';
export type TtsContentType = 'audio/mpeg' | 'audio/wav' | 'audio/opus' | 'audio/flac';

export interface TtsRequest {
  modelId: string;
  input: string;
  voice: string;
  responseFormat: TtsAudioFormat;
  speed?: number;
  /** 可选 reference voice 文件路径（multipart 模式落盘后传入） */
  voiceReference?: { path: string; mimeType: string };
}

export interface TtsResult {
  audio: ReadableStream<Uint8Array>;
  contentType: TtsContentType;
}

/**
 * TTS 模态 provider 契约
 *
 * - 返回的 ReadableStream MUST 受 signal 控制；abort 时立刻 cancel
 * - provider 不支持某能力（如 reference voice）MUST 抛 ValidationError（FR-031）
 */
export interface TtsProvider extends BaseProvider {
  readonly modality: 'tts';
  synthesize(req: TtsRequest, signal: AbortSignal): Promise<TtsResult>;
}

/** 任意模态 provider 的 union（registry 内部存储用） */
export type AnyProvider = ChatProvider | AsrProvider | TtsProvider;
