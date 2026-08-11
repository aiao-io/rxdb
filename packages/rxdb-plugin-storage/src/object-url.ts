/**
 * @fileoverview 对象 URL 管理模块
 * 管理 Blob 到 Object URL 的转换，支持预览功能
 *
 * @module rxdb-plugin-storage/object-url
 */

/** 可显式释放的文件预览结果。 */
export interface StoragePreviewResult {
  /** 浏览器对象 URL。 */
  url: string;
  /** 调用方渲染预览时应使用的 MIME 类型。 */
  type: string;
  /** 释放对象 URL；重复调用是空操作。 */
  dispose: () => void;
}

/**
 * 统一管理对象 URL 的创建与回收。
 *
 * 注册表持有自己创建的 URL；调用方可逐个 revoke，或在宿主销毁时一次 clear。
 */
export class ObjectUrlRegistry {
  readonly #activeUrls = new Set<string>();

  /** 尚未回收的对象 URL 数量。 */
  get size(): number {
    return this.#activeUrls.size;
  }

  /**
   * 创建注册表。
   *
   * @param createImpl - 对象 URL 创建函数，默认使用 `URL.createObjectURL`。
   * @param revokeImpl - 对象 URL 回收函数，默认使用 `URL.revokeObjectURL`。
   */
  constructor(
    private readonly createImpl: (blob: Blob) => string = blob => URL.createObjectURL(blob),
    private readonly revokeImpl: (url: string) => void = url => URL.revokeObjectURL(url)
  ) {}

  /** 创建并登记一个对象 URL。 */
  create(blob: Blob): string {
    const url = this.createImpl(blob);
    this.#activeUrls.add(url);
    return url;
  }

  /** 创建带一次性 dispose 回调的预览结果。 */
  createPreview(blob: Blob, type = blob.type || 'application/octet-stream'): StoragePreviewResult {
    const url = this.create(blob);

    return {
      url,
      type,
      dispose: () => this.revoke(url)
    };
  }

  /** 回收已登记的 URL；未知或已回收的 URL 是空操作。 */
  revoke(url: string): void {
    if (!this.#activeUrls.delete(url)) return;
    this.revokeImpl(url);
  }

  /** 回收注册表仍持有的全部对象 URL。 */
  clear(): void {
    Array.from(this.#activeUrls).forEach(url => this.revoke(url));
  }
}
