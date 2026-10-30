export interface PlatformSubmissionRequest {
  requestId: string;
  model: string;
  prompt: string;
  size: string;
  billing: 'free' | 'credits';
}

/** 接单回执未确认时，刷新和再次提交均保留原标识与原参数。 */
export class PlatformSubmission {
  private readonly key: string;
  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    owner: string,
    scope: string
  ) {
    this.key = `aiao-media-platform-pending-v1:${encodeURIComponent(owner)}:${encodeURIComponent(scope)}`;
  }
  pending(): PlatformSubmissionRequest | null {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as PlatformSubmissionRequest;
      if (
        !/^[0-9a-f-]{36}$/.test(value.requestId) ||
        typeof value.model !== 'string' ||
        !value.model ||
        typeof value.prompt !== 'string' ||
        !value.prompt.trim() ||
        value.prompt.length > 2000 ||
        !['1024x1024', '1536x1024', '1024x1536'].includes(value.size) ||
        !['free', 'credits'].includes(value.billing)
      )
        throw new Error();
      return value;
    } catch {
      throw new Error('原平台请求尚未确认，接单记录不可读。请先在平台核对，不能创建新的请求标识。');
    }
  }
  prepare(params: Omit<PlatformSubmissionRequest, 'requestId'>): PlatformSubmissionRequest {
    const pending = this.pending();
    if (pending) return pending;
    const value = { requestId: crypto.randomUUID(), ...params };
    this.storage.setItem(this.key, JSON.stringify(value));
    return value;
  }
  confirm(requestId: string): void {
    if (this.pending()?.requestId === requestId) this.storage.removeItem(this.key);
  }
}
