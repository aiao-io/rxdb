import { timingSafeEqual } from 'node:crypto';

const ENV_KEY = 'MODEL_DESIGNER_BACKEND_TOKEN';
const DEV_FALLBACK = 'model-designer-dev-token';
const BEARER_PREFIX = /^Bearer\s+/i;

function expectedToken(): string | null {
  const configured = process.env[ENV_KEY]?.trim();
  if (configured) return configured;
  return process.env['NODE_ENV'] === 'production' ? null : DEV_FALLBACK;
}

function bearerToken(authorization: string | undefined): string {
  if (!authorization || !BEARER_PREFIX.test(authorization)) return '';
  return authorization.replace(BEARER_PREFIX, '').trim();
}

function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue, 'utf8');
  const right = Buffer.from(rightValue, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

interface GuardContext {
  headers: Record<string, string | undefined>;
  set: { status?: number | string };
}

/** Protects model-designer schema reads and DDL execution with an internal bearer. */
export function modelDesignerSqlAuthGuard({ headers, set }: GuardContext) {
  const expected = expectedToken();
  if (!expected) {
    set.status = 503;
    return { code: 'config-error' as const, message: `${ENV_KEY} is required in production` };
  }

  if (!safeEqual(bearerToken(headers['authorization']), expected)) {
    set.status = 401;
    return { code: 'unauthorized' as const, message: 'Bearer token is invalid' };
  }

  return undefined;
}
