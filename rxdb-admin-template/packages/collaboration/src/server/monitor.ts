/**
 * 错误监控（ADMIN-US-217 AC#7）：命令入口里的未处理错误（请求处理中抛出的非业务错误、连接池里空闲连接的错误）交给可插拔的上报器。
 * 报告先脱敏再交出：不含 access / refresh token、API key、连接串口令、验证码、邀请令牌摘要与邮箱（含受邀邮箱）；
 * 只带排障需要的错误名、消息、SQLSTATE、详情、堆栈与请求的方法和路径，不带查询串、请求头、请求体、SQL 文本与绑定参数。
 * 两种上报器：控制台（每条一行 `ADMIN_ERROR <JSON>`，由平台或容器的日志汇收集）与 HTTP 收集器（`ADMIN_ERROR_REPORT_URL`）。
 * 只用 fetch 与标准库，Node 入口与 Edge Function（Deno）跑同一份代码。
 */

/** 上报时附带的请求信息：只有方法与路径（查询串在生成报告时去掉）。 */
export interface RequestContext {
  method: string;
  path: string;
}
/** 错误发生的位置：请求处理中，或连接池里的空闲连接。 */
export type ErrorSource = 'request' | 'pool';
/** 一条已脱敏的错误报告：每个字段都经过 {@link redact}，可以原样写日志或发给收集器。 */
export interface ErrorReport {
  /** 发生时刻（ISO 串）。 */
  at: string;
  /** 入口：`node` 或 `edge`。 */
  entry: string;
  /** 发布标识（`ADMIN_RELEASE`），没有配置时为 null。 */
  release: string | null;
  source: ErrorSource;
  request: RequestContext | null;
  error: {
    name: string;
    message: string;
    /** SQLSTATE 或系统错误码（如 `ECONNREFUSED`），不合规时为 null。 */
    code: string | null;
    /** 数据库错误的 DETAIL（常带键值，必须脱敏）。 */
    detail: string | null;
    stack: string | null;
  };
}
/** 可插拔的上报器：`report` 不抛错，投递失败由上报器自己记录。 */
export interface ErrorReporter {
  report(report: ErrorReport): Promise<void>;
}

/** 脱敏规则：按顺序替换。先处理整段的令牌与连接串，再处理邮箱、长摘要与数字验证码。 */
const rules: readonly [pattern: RegExp, replacement: string][] = [
  // JWT（access token、anon / service role key）：三段 base64url，头部以 `{"` 编码成的 eyJ 开头
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]'],
  // Authorization 头里的不透明令牌与 Basic 凭据
  [/\b(Bearer|Basic)\s+[^\s"',;]+/gi, '$1 [token]'],
  // Supabase 新格式的 API key
  [/\bsb_(?:secret|publishable)_[\w-]+/g, '[api-key]'],
  // URL 里的口令：scheme://用户:口令@主机
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]*@/gi, '$1:[password]@'],
  // 键值形式的敏感字段（JSON、查询串、日志里的 key=value）
  [
    /\b(access_token|refresh_token|token_hash|tokenHash|token|password|secret|apikey|api_key|otp)(["']?\s*[:=]\s*["']?)[^"'\s,;&}]+/gi,
    '$1$2[redacted]'
  ],
  // 邮箱（含受邀邮箱）
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '[email]'],
  // 32 位以上的十六进制串：令牌摘要、密钥（UUID 带连字符，不受影响）
  [/\b[a-f0-9]{32,}\b/gi, '[hex]'],
  // 6～10 位的数字：验证码；紧跟冒号的保留（压缩产物里的堆栈行列号）
  [/(?<!:)\b\d{6,10}\b/g, '[digits]']
];
/** 文本上限：消息与详情 1000 个字符，堆栈 4000 个字符，超出截断。 */
const limits = { message: 1000, detail: 1000, stack: 4000 } as const;

/** 按 {@link rules} 去掉文本里的令牌、密钥、口令、邮箱、长摘要与数字验证码，保留其余内容（标识、SQLSTATE、堆栈位置）。 */
export function redact(text: string): string {
  return rules.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}
const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);
const clean = (value: unknown, limit: number) => (typeof value === 'string' ? clip(redact(value), limit) : null);
/** 错误名与错误码只接受标识形状，其余（可能夹带用户数据）不原样带出。 */
const safeName = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(value) ? value : 'Error';
const safeCode = (value: unknown) =>
  typeof value === 'string' && /^(?:[0-9A-Z]{5}|[A-Z][A-Z0-9_]{1,40})$/.test(value) ? value : null;

/** 生成报告时的上下文：入口、发布标识、发生位置与请求（可选），`now` 供测试注入。 */
export interface ReportContext {
  entry: string;
  release: string | null;
  source: ErrorSource;
  request?: RequestContext | null;
  now?: Date;
}

/** 把任意抛出的值转成一条已脱敏的报告：Error 取名称、消息、SQLSTATE、详情与堆栈，其余值按文本处理。 */
export function errorReport(error: unknown, context: ReportContext): ErrorReport {
  const request =
    context.request ?
      { method: safeName(context.request.method), path: redact(context.request.path.split('?')[0]) }
    : null;
  const base = {
    at: (context.now ?? new Date()).toISOString(),
    entry: context.entry,
    release: context.release,
    source: context.source,
    request
  };
  if (!(error instanceof Error))
    return {
      ...base,
      error: {
        name: 'NonError',
        message: clip(redact(String(error)), limits.message),
        code: null,
        detail: null,
        stack: null
      }
    };
  const fields = error as Error & { code?: unknown; detail?: unknown };
  return {
    ...base,
    error: {
      name: safeName(error.name),
      message: clip(redact(error.message), limits.message),
      code: safeCode(fields.code),
      detail: clean(fields.detail, limits.detail),
      stack: clean(error.stack, limits.stack)
    }
  };
}

/** 控制台上报器：每条报告一行 `ADMIN_ERROR <JSON>`，由平台或容器的日志汇按行收集。 */
export function consoleReporter(write: (line: string) => void = line => console.error(line)): ErrorReporter {
  return {
    report: async report => {
      write(`ADMIN_ERROR ${JSON.stringify(report)}`);
    }
  };
}

/** HTTP 收集器的设置：地址（可能带收集器自己的密钥，因此从不写进日志）、fetch（测试注入）、超时与投递失败的记录方式。 */
export interface HttpReporterOptions {
  url: string;
  fetch?: typeof globalThis.fetch;
  /** 等收集器应答的上限，默认 2000 毫秒：报告在返回 500 之前发出，不能拖住请求太久。 */
  timeoutMs?: number;
  onFailure?: (line: string) => void;
}
/** HTTP 上报器：把报告以 JSON POST 给收集器。投递失败（非 2xx、网络错误、超时）只记一行原因，不抛错，也不带收集器地址。 */
export function httpReporter(options: HttpReporterOptions): ErrorReporter {
  const request = options.fetch ?? fetch;
  const fail = options.onFailure ?? (line => console.error(line));
  return {
    report: async report => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException('error report timed out', 'TimeoutError')),
        options.timeoutMs ?? 2000
      );
      try {
        const response = await request(options.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(report),
          signal: controller.signal
        });
        if (!response.ok) fail(`ADMIN_ERROR_DELIVERY_FAILED status ${response.status}`);
      } catch (error) {
        fail(`ADMIN_ERROR_DELIVERY_FAILED ${safeName(error instanceof Error ? error.name : undefined)}`);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

/** 组合上报器：依次交给每一个（每个都不抛错）。 */
export function combineReporters(reporters: readonly ErrorReporter[]): ErrorReporter {
  return {
    report: async report => {
      for (const reporter of reporters) await reporter.report(report);
    }
  };
}

/**
 * 按部署环境建上报器：总是写控制台（日志汇），配置了 `ADMIN_ERROR_REPORT_URL` 时另发给 HTTP 收集器。
 * 收集器地址是服务端设置，只在命令入口的环境里，前端产物不得出现。
 */
export function reporterFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  fetcher?: typeof globalThis.fetch
): ErrorReporter {
  const url = env['ADMIN_ERROR_REPORT_URL'];
  const reporters = [consoleReporter()];
  if (url) reporters.push(httpReporter({ url, fetch: fetcher }));
  return combineReporters(reporters);
}
