import { isRelayTaskToken, relayTaskTokenHeader } from '@aiao-media/api-contracts';
import { platformImageInput } from './platform-models.ts';
import { endpoint, member, originAllowed, reject, uuid } from './product-http.ts';
import { missingRelayTask, relayTaskLimits } from './relay-task.ts';
import type { WorkerEnv } from './worker-env.ts';

type ForwardOperation = { path: string; method: string; write?: boolean; body?: string };
const route = /^\/api\/relay\/tasks\/([^/]+)(\/result|\/abandon|\/confirm|\/discard)?$/;
const seconds = (url: URL) =>
  Math.min(Math.max(Math.trunc(Number(url.searchParams.get('wait'))) || 0, 0), relayTaskLimits.waitMs / 1000);
const operations: Record<string, (url: URL, taskId: string) => ForwardOperation> = {
  'GET ': url => ({ path: `/?wait=${seconds(url)}`, method: 'GET' }),
  'GET /result': () => ({ path: '/result', method: 'GET' }),
  'POST /abandon': (_url, taskId) => ({
    path: '/abandon',
    method: 'POST',
    write: true,
    body: JSON.stringify({ taskId })
  }),
  'POST /confirm': () => ({ path: '/confirm', method: 'POST', write: true }),
  'POST /discard': () => ({ path: '/discard', method: 'POST', write: true }),
  'DELETE ': () => ({ path: '/', method: 'DELETE', write: true })
};

/** 创建需要真实平台账号；续接和结清继续使用本机任务令牌。 */
export function handleRelayTask(request: Request, env: WorkerEnv) {
  return endpoint(async () => {
    const url = new URL(request.url),
      [, taskId, action = ''] = route.exec(url.pathname) ?? [];
    if (!uuid(taskId)) reject(404, '任务不存在。');
    const operation = `${request.method} ${action}`;
    if (operation !== 'PUT ' && !operations[operation]) reject(405, '任务操作无效。');
    if (!env.RELAY_TASKS || !env.RELAY_RESULTS) reject(503, '平台任务服务尚未启用。');
    const token = request.headers.get(relayTaskTokenHeader) ?? '';
    if (!isRelayTaskToken(token)) return operation === 'PUT ' ? reject(400, '缺少任务令牌。') : missingRelayTask();
    const task = env.RELAY_TASKS.get(env.RELAY_TASKS.idFromName(`relay-task:${taskId}`));
    if (operation === 'PUT ') {
      const { userId } = await member(request, env);
      const input = await platformImageInput(request, env);
      return task.fetch('https://relay-task.internal/', {
        method: 'PUT',
        headers: {
          authorization: input.authorization,
          [relayTaskTokenHeader]: token,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ taskId, ownerId: userId, cost: input.cost, url: input.url, body: input.body })
      });
    }
    const forward = operations[operation](url, taskId);
    if (forward.write && !originAllowed(request, env)) reject(403, '仅允许同源操作。');
    return task.fetch(`https://relay-task.internal${forward.path}`, {
      method: forward.method,
      headers: { [relayTaskTokenHeader]: token, ...(forward.body ? { 'content-type': 'application/json' } : {}) },
      ...(forward.body ? { body: forward.body } : {})
    });
  });
}
