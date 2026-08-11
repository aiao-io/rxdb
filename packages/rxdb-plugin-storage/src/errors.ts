/**
 * @fileoverview Storage 插件错误类型
 *
 * @module rxdb-plugin-storage/errors
 */

/**
 * 远程资源不可达时抛出。
 *
 * 触发条件：
 * - `navigator.onLine === false`
 * - `fetch()` 抛出 `TypeError`（多数浏览器在 DNS/网络/CORS/Mixed-Content 失败时使用此类型）
 *
 * 调用方可据此回退到占位资源或排队稍后重试。
 */
export class StorageOfflineError extends Error {
  /** OPFS 内目标缓存路径（已规范化）。 */
  readonly opfsPath: string;
  /** 触发本次错误的远程 URL。 */
  readonly url: string;

  /** 创建离线错误，可选覆盖默认消息。 */
  constructor(opfsPath: string, url: string, message?: string) {
    super(message ?? `Storage offline: cannot fetch ${url} for ${opfsPath}`);
    this.name = 'StorageOfflineError';
    this.opfsPath = opfsPath;
    this.url = url;
  }
}

/**
 * 远程请求成功送达但返回非 2xx 时抛出。
 *
 * 与 {@link StorageOfflineError} 区分网络层失败与应用层失败：
 * 收到 4xx/5xx 不会写入 OPFS，且 `contentVersion` 不变。
 */
export class StorageFetchError extends Error {
  /** OPFS 内目标缓存路径（已规范化）。 */
  readonly opfsPath: string;
  /** 触发本次错误的远程 URL。 */
  readonly url: string;
  /** 服务端返回的 HTTP 状态码。 */
  readonly status: number;

  /** 创建包含目标路径、URL 和 HTTP 状态码的请求错误。 */
  constructor(opfsPath: string, url: string, status: number, message?: string) {
    super(message ?? `Storage fetch failed for ${url} (HTTP ${status})`);
    this.name = 'StorageFetchError';
    this.opfsPath = opfsPath;
    this.url = url;
    this.status = status;
  }
}

/**
 * HTTP 响应成功但既未传 `options.mimeType` 也无 `Content-Type` 响应头时抛出。
 *
 * 与 {@link StorageFetchError} 分离：那是网络/HTTP 层失败（4xx/5xx），
 * 这是 200 OK 但缺少类型元数据的应用层失败 — 不会写入 OPFS。
 */
export class StorageMimeTypeMissingError extends Error {
  /** OPFS 内目标缓存路径（已规范化）。 */
  readonly opfsPath: string;
  /** 触发本次错误的远程 URL。 */
  readonly url: string;

  /** 创建缺少 MIME 类型错误，可选覆盖默认消息。 */
  constructor(opfsPath: string, url: string, message?: string) {
    super(message ?? `Storage fetch missing MIME type for ${url}; pass options.mimeType or set Content-Type`);
    this.name = 'StorageMimeTypeMissingError';
    this.opfsPath = opfsPath;
    this.url = url;
  }
}

/** 路径含非法分段、分隔符或空白时抛出。 */
export class StorageInvalidPathError extends Error {
  /** 导致校验失败的原始路径。 */
  readonly path: string;

  /** 创建路径校验错误。 */
  constructor(path: string, message = `Invalid storage path: ${path}`) {
    super(message);
    this.name = 'StorageInvalidPathError';
    this.path = path;
  }
}

/** 写操作命中已存在目标且未允许 overwrite 时抛出。 */
export class StorageConflictError extends Error {
  /** 冲突目标的规范化 OPFS 相对路径。 */
  readonly opfsPath: string;

  /** 创建目标冲突错误。 */
  constructor(opfsPath: string) {
    super(`File already exists at path: ${opfsPath}`);
    this.name = 'StorageConflictError';
    this.opfsPath = opfsPath;
  }
}

/**
 * 同一 `opfsPath` 上已有一个**指向别的 URL** 的 fetch 正在进行。
 *
 * @remarks
 * STOR-003：in-flight 去重的 key 早先只有 `opfsPath`，于是后到的调用会静默拿到
 * 前一个 URL 的字节 —— 相当于无声的缓存投毒。现在显式拒绝，让调用方自己决定是
 * 换路径还是等前一个完成。
 *
 * 注意这只覆盖**并发窗口**；路径上已有缓存时「不发请求直接返回缓存」是
 * {@link RxdbFileStorage.fetch} 既定的永久缓存语义，与本错误无关。
 */
export class StorageFetchUrlConflictError extends Error {
  /** 发生冲突的规范化 OPFS 相对路径。 */
  readonly opfsPath: string;
  /** 正在进行中的那次 fetch 使用的 URL。 */
  readonly inFlightUrl: string;
  /** 本次调用请求的 URL。 */
  readonly requestedUrl: string;

  /** 创建并发 URL 冲突错误。 */
  constructor(opfsPath: string, inFlightUrl: string, requestedUrl: string) {
    super(
      `A different url is already being fetched into ${opfsPath}: in-flight=${inFlightUrl}, requested=${requestedUrl}`
    );
    this.name = 'StorageFetchUrlConflictError';
    this.opfsPath = opfsPath;
    this.inFlightUrl = inFlightUrl;
    this.requestedUrl = requestedUrl;
  }
}

/** 当前环境或 RxDB 配置无法提供 storage 依赖时抛出。 */
export class StorageUnavailableError extends Error {
  /** 创建 storage 不可用错误。 */
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

/** 文件超过预览字节上限时抛出。 */
export class StoragePreviewLimitError extends Error {
  /** 当前配置的最大预览字节数。 */
  readonly limitBytes: number;

  /** 创建预览上限错误。 */
  constructor(limitBytes: number) {
    super(`Preview file exceeds limit of ${limitBytes} bytes`);
    this.name = 'StoragePreviewLimitError';
    this.limitBytes = limitBytes;
  }
}

/** 在 storage service 已进入销毁流程后调用公开 API 时抛出。 */
export class StorageDestroyedError extends Error {
  /** 创建生命周期终止错误。 */
  constructor() {
    super('Storage service has been destroyed');
    this.name = 'StorageDestroyedError';
  }
}
