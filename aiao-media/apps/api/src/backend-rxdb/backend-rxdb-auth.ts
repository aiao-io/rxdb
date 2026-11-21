export interface BackendRxdbAuth {
  accessToken: string;
  userId: string;
  expiresAt: number;
}

export type BackendRxdbAuthRefresh = () => Promise<BackendRxdbAuth>;

function decodeTokenRole(accessToken: string): string | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function assertBackendRxdbAuthShape(auth: BackendRxdbAuth): void {
  if (!auth.accessToken) throw new Error('backend RxDB access token is required');
  if (!auth.userId) throw new Error('backend RxDB user ID is required');
  if (decodeTokenRole(auth.accessToken) === 'service_role')
    throw new Error('service role cannot be used as a backend RxDB sync identity');
}

export function assertBackendRxdbAuth(auth: BackendRxdbAuth): void {
  assertBackendRxdbAuthShape(auth);
  if (!Number.isFinite(auth.expiresAt) || auth.expiresAt <= Date.now()) throw new Error('backend RxDB JWT is expired');
}

export class BackendRxdbAuthProvider {
  #current: BackendRxdbAuth;
  #refresh?: BackendRxdbAuthRefresh;

  constructor(initial: BackendRxdbAuth, refresh?: BackendRxdbAuthRefresh) {
    assertBackendRxdbAuthShape(initial);
    this.#current = structuredClone(initial);
    this.#refresh = refresh;
  }

  current(): BackendRxdbAuth {
    assertBackendRxdbAuth(this.#current);
    return structuredClone(this.#current);
  }

  set(auth: BackendRxdbAuth): void {
    assertBackendRxdbAuthShape(auth);
    this.#current = structuredClone(auth);
  }

  async valid(): Promise<BackendRxdbAuth> {
    if (this.#current.expiresAt > Date.now()) return this.current();
    if (!this.#refresh) throw new Error('backend RxDB JWT is expired');
    const refreshed = await this.#refresh();
    this.set(refreshed);
    return this.current();
  }
}
