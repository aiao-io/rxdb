// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, type TestServer } from '../fixtures/test-server';

let ts: TestServer;
let spec: OpenAPIDoc;

interface OpenAPIDoc {
  openapi?: string;
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        description?: string;
        tags?: string[];
        requestBody?: { content?: Record<string, unknown> };
        responses?: Record<string, unknown>;
      }
    >
  >;
}

beforeAll(async () => {
  ts = await bootTestServer();
  const res = await ts.app.handle(new Request('http://localhost/openapi/json', { method: 'GET' }));
  if (res.status !== 200) {
    throw new Error(`GET /openapi/json returned ${res.status}`);
  }
  spec = (await res.json()) as OpenAPIDoc;
});

/**
 * FR-041：OpenAPI 文档完整性 + T102 自动化
 *
 * 验证所有网关路径都暴露在 OpenAPI 文档里，且每个路径含 summary / tags / requestBody / responses
 * （TTS / ASR 部分 endpoint 不要求 requestBody.content 因为 multipart 不是 JSON）。
 */
describe('OpenAPI completeness (FR-041 / T102)', () => {
  const EXPECTED_PATHS: Array<{
    path: string;
    method: 'get' | 'post';
    requireRequestBody: boolean;
  }> = [
    { path: '/v1/chat/completions', method: 'post', requireRequestBody: true },
    { path: '/v1/messages', method: 'post', requireRequestBody: true },
    { path: '/v1/audio/transcriptions', method: 'post', requireRequestBody: false },
    { path: '/v1/audio/speech', method: 'post', requireRequestBody: false },
    { path: '/v1/models', method: 'get', requireRequestBody: false },
    { path: '/api/ai/model/chat', method: 'post', requireRequestBody: true },
    { path: '/api/ai/model/generate', method: 'post', requireRequestBody: true }
  ];

  it('paths object exists', () => {
    expect(spec.paths).toBeDefined();
  });

  it.each(EXPECTED_PATHS)('$path $method is documented', ({ path, method }) => {
    const op = spec.paths?.[path]?.[method];
    expect(op, `${method.toUpperCase()} ${path} missing in OpenAPI spec`).toBeDefined();
  });

  it.each(EXPECTED_PATHS)('$path has summary + tags', ({ path, method }) => {
    const op = spec.paths?.[path]?.[method];
    expect(op?.summary, `${path} missing summary`).toBeTruthy();
    expect(Array.isArray(op?.tags) && op!.tags!.length > 0, `${path} missing tags`).toBe(true);
  });

  it.each(EXPECTED_PATHS.filter(p => p.requireRequestBody))('$path has requestBody', ({ path, method }) => {
    const op = spec.paths?.[path]?.[method];
    expect(op?.requestBody?.content, `${path} missing requestBody.content`).toBeDefined();
  });
});
