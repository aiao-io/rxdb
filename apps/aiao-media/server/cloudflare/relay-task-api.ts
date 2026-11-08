import type { WorkerEnv } from './worker-env.ts';

type ForwardOperation = { path: string; method: string; write?: boolean; body?: string };

import { isMiniMaxImageProvider } from '../../src/contracts/image-provider-protocol.ts';
import { isRelayTaskToken, relayTaskTokenHeader } from '../../src/contracts/relay-task.ts';
import { originAllowed, uuid } from './product-http.ts';
import { json, relayInput } from './relay-input.ts';
import { missingRelayTask, relayTaskLimits } from './relay-task.ts';

const route = /^\/api\/relay\/tasks\/([^/]+)(\/result|\/abandon)?$/;
const seconds = (url: URL) =>
  Math.min(Math.max(Math.trunc(Number(url.searchParams.get('wait'))) || 0, 0), relayTaskLimits.waitMs / 1000);
// Reads need only the task token; writes also require the same-origin or enabled desktop browser.
const operations: Record<string, (url: URL, taskId: string) => ForwardOperation> = {
  'GET ': url => ({ path: `/?wait=${seconds(url)}`, method: 'GET' }),
  'GET /result': () => ({ path: '/result', method: 'GET' }),
  'POST /abandon': (_url, taskId) => ({
    path: '/abandon',
    method: 'POST',
    write: true,
    body: JSON.stringify({ taskId })
  }),
  'DELETE ': () => ({ path: '/', method: 'DELETE', write: true })
};

async function create(request: Request, env: WorkerEnv, task: DurableObjectStub, taskId: string, token: string) {
  if (!isRelayTaskToken(token)) return json(400, 'Task token required');
  let input;
  try {
    input = await relayInput(request, env);
  } catch {
    return json(400, 'Request body interrupted');
  }
  if (input instanceof Response) return input;
  const { upstream, imageRequest, authorization, policy } = input;
  // MiniMax answers with a short-lived URL by default; a stored task keeps the image bytes instead.
  const body =
    isMiniMaxImageProvider(upstream) ? { ...imageRequest.body, response_format: 'base64' } : imageRequest.body;
  const response = await task.fetch('https://relay-task.internal/', {
    method: 'PUT',
    headers: { authorization, [relayTaskTokenHeader]: token, 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, url: imageRequest.url, body })
  });
  const headers = new Headers(response.headers);
  headers.set('x-aiao-policy-version', String(policy?.revision ?? 'deployment'));
  return new Response(response.body, { status: response.status, headers });
}

/** 代理任务的 Worker 入口：校验后交给按任务标识寻址的 Durable Object。 */
export async function handleRelayTask(request: Request, env: WorkerEnv) {
  const url = new URL(request.url);
  const [, taskId, action = ''] = route.exec(url.pathname) ?? [];
  if (!uuid(taskId)) return json(404, 'Unknown API');
  const operation = `${request.method} ${action}`;
  if (operation !== 'PUT ' && !operations[operation]) return json(405, 'Method not allowed');
  if (!env.RELAY_TASKS || !env.RELAY_RESULTS) return json(503, 'Relay tasks are not available');
  const token = request.headers.get(relayTaskTokenHeader) ?? '';
  const task = env.RELAY_TASKS.get(env.RELAY_TASKS.idFromName(`relay-task:${taskId}`));
  if (operation === 'PUT ') return create(request, env, task, taskId, token);
  const forward = operations[operation](url, taskId);
  if (forward.write && !originAllowed(request, env)) return json(403, 'Same-origin browser request required');
  if (!isRelayTaskToken(token)) return missingRelayTask();
  return task.fetch(`https://relay-task.internal${forward.path}`, {
    method: forward.method,
    headers: { [relayTaskTokenHeader]: token, ...(forward.body ? { 'content-type': 'application/json' } : {}) },
    ...(forward.body ? { body: forward.body } : {})
  });
}
