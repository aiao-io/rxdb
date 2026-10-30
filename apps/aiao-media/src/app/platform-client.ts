import type { ImageMetadata } from '../contracts/image-format';
import { apiEndpoint } from '../platform/local-backend';
import type { ProductClient } from './product-client';
import { readSupabaseAuthConfig } from './supabase-auth-config';

export interface PlatformJob {
  id: string;
  requestId: string;
  status: 'queued' | 'generating' | 'completed' | 'failed' | 'cancelled' | 'needs_review';
  prompt: string;
  model: string;
  size: string;
  billing: 'free' | 'credits';
  credits: number;
  createdAt: string;
  result: (ImageMetadata & { bytes: number; sha256: string }) | null;
  message: string;
}
export interface PlatformCatalog {
  enabled: boolean;
  freeDaily: number;
  models: { id: string; name: string; credits: number; sizes: string[] }[];
  pack: { credits: number; amount: number; currency: string } | null;
  fairness: string;
}
export interface PlatformAccount {
  credits: number;
  freeRemaining: number;
  freeReset: string;
  ledger: { reference: string; action: string; amount: number; created_at: number }[];
}

export class PlatformRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** 平台生成和用户自有供应商请求使用独立入口，不转发供应商 Key。 */
export class PlatformClient {
  constructor(
    private readonly product: ProductClient,
    private readonly owner?: string
  ) {}
  async request<T>(path: string, payload?: unknown): Promise<T> {
    const access = await this.authorization();
    const response = await fetch(apiEndpoint(`/api/platform/${path}`), {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${access.session.access_token}`, 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const data: unknown = await response.json();
      const message = data && typeof data === 'object' && 'error' in data ? String(data.error) : '平台操作未确认。';
      throw new PlatformRequestError(message, response.status);
    }
    return response.json() as Promise<T>;
  }
  async result(job: PlatformJob): Promise<Blob> {
    const access = await this.authorization();
    const response = await fetch(apiEndpoint(`/api/platform/jobs/${encodeURIComponent(job.id)}/result`), {
      headers: { authorization: `Bearer ${access.session.access_token}` },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error('平台原图暂时无法读取，请重试下载；不会重新生图。');
    const blob = await response.blob();
    if (!job.result || blob.size !== job.result.bytes || blob.size > 16 * 1024 * 1024)
      throw new Error('平台原图大小不匹配。');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('');
    if (hash !== job.result.sha256) throw new Error('平台原图摘要不匹配。');
    return blob;
  }
  private async authorization() {
    const access = await this.product.authorization();
    if (access.config.url !== readSupabaseAuthConfig()?.url || (this.owner && access.userId !== this.owner))
      throw new Error('平台账号已变化，原请求未发送；自有项目会话不会发送给平台。');
    return access;
  }
}
