import { RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '../../shared/types';

/** inspected window 脚本异步执行结果的协议消息类型。 */
export const INSPECTED_WINDOW_SCRIPT_RESULT = 'INSPECTED_WINDOW_SCRIPT_RESULT' as const;

/**
 * 页面脚本回传结果的统一负载结构
 * 由 {@link serializeFunctionWithResult} 注入的代码经 window.postMessage 发回 DevTools
 */
export interface ScriptResultPayload<T> {
  requestId: string;
  success: boolean;
  result?: T;
  error?: string;
}

/**
 * 生成页面脚本请求 ID
 */
export function createScriptRequestId(prefix = 'script'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 将异步函数序列化为“同步启动 + 异步消息回传结果”的表达式
 */
export function serializeFunctionWithResult(
  fn: (...args: never[]) => unknown,
  requestId: string,
  args: readonly unknown[] = []
): string {
  const fnString = fn.toString();
  const source = JSON.stringify(RXDB_DEVTOOLS_MESSAGE);
  const type = JSON.stringify(INSPECTED_WINDOW_SCRIPT_RESULT);
  const serializedRequestId = JSON.stringify(requestId);
  const serializedArgs = JSON.stringify(args);

  return `(() => {
    const requestId = ${serializedRequestId};
    const postResult = (payload) => {
      window.postMessage({
        source: ${source},
        direction: 'page-to-devtools',
        type: ${type},
        payload: { requestId, ...payload },
        timestamp: Date.now(),
        sequence: 0
      }, '*');
    };

    Promise.resolve()
      .then(() => (${fnString})(...${serializedArgs}))
      .then(result => {
        postResult({ success: true, result });
      })
      .catch(error => {
        postResult({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return { started: true, requestId };
  })()`;
}

interface MessageSubscription {
  subscribe(callback: (message: DevToolsMessage) => void): () => void;
}

interface InspectedWindowEvaluator {
  eval(expression: string, callback: (result: unknown, exceptionInfo?: { value?: string }) => void): void;
}

/**
 * 在 inspected window 启动脚本，并等待匹配 `requestId` 的异步结果消息。
 *
 * @throws 页面拒绝启动、脚本执行失败或等待超时时抛出错误
 */
export function executeInInspectedWindow<T>(
  port: MessageSubscription,
  inspectedWindow: InspectedWindowEvaluator,
  code: string,
  requestId: string,
  timeoutMs = 15_000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timeoutId = 0;
    const unsubscribe = port.subscribe(message => {
      if (message.type !== INSPECTED_WINDOW_SCRIPT_RESULT) return;

      const payload = message.payload as ScriptResultPayload<T>;
      if (payload.requestId !== requestId) return;

      cleanup();
      if (payload.success === false) {
        reject(new Error(payload.error || '页面脚本执行失败'));
        return;
      }
      resolve(payload.result as T);
    });
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('等待页面脚本执行结果超时'));
    }, timeoutMs);

    inspectedWindow.eval(code, (result, exceptionInfo) => {
      if (exceptionInfo) {
        cleanup();
        reject(new Error(exceptionInfo.value || '页面脚本启动失败'));
        return;
      }

      const startup = result as { started?: boolean; requestId?: string } | undefined;
      if (!startup?.started || startup.requestId !== requestId) {
        cleanup();
        reject(new Error('页面脚本未成功启动'));
      }
    });
  });
}
