// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, type TestServer } from '../fixtures/test-server';

/**
 * 覆盖 apps/api 非网关核心路由（root / OpenAPI）。
 *
 * 原先还覆盖 `/api/auth/login`、`/api/me/change-password`、`/api/users/:id` 三个
 * 返回字符串字面量的脚手架占位路由。2026-07-29 第八道防线（`--endpoints`）报出它们
 * 零产品消费者后已连同路由文件删除：真实登录/改密走 BFF，占位路由只是把假端点写进
 * OpenAPI 文档误导调用方。
 */
describe('API core routes', () => {
  let ts: TestServer;

  beforeAll(async () => {
    ts = await bootTestServer();
  });

  it('GET / 返回 Hello World', async () => {
    const res = await ts.app.handle(new Request('http://localhost/'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hello World');
  });

  it('已删除的脚手架占位路由与任意未注册路径同款响应', async () => {
    const control = await ts.app.handle(new Request('http://localhost/api/definitely-not-a-route'));

    for (const path of ['/api/auth/login', '/api/me/change-password', '/api/users/user-1']) {
      const res = await ts.app.handle(new Request(`http://localhost${path}`));
      expect(res.status).toBe(control.status);
    }
  });

  /**
   * known-defects #18：全局 `onError` 把 elysia 的 `NOT_FOUND` 一起喂给 `classifyError`，
   * 后者认不出就归内部错误 → 任意拼错的路径都返回 500，排障时看起来像「服务器炸了」。
   *
   * 错误体形状按入口风格保持不变（三套契约一行未改），只有 status 与 code 被纠正。
   */
  describe('未注册路径返回 404（known-defects #18）', () => {
    it('项目兼容路径给出 project-compat 错误体', async () => {
      const res = await ts.app.handle(new Request('http://localhost/api/definitely-not-a-route'));

      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        status: 404,
        message: expect.stringContaining('/api/definitely-not-a-route')
      });
    });

    it('OpenAI 入口给出 openai-v1 错误体', async () => {
      const res = await ts.app.handle(new Request('http://localhost/v1/definitely-not-a-route'));

      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        error: { type: 'invalid_request_error', code: 'route_not_found' }
      });
    });

    it('Anthropic 入口给出 anthropic-v1 错误体', async () => {
      const res = await ts.app.handle(new Request('http://localhost/v1/messages/definitely-not-a-route'));

      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ type: 'error', error: { type: 'invalid_request_error' } });
    });

    it('已注册路径上的错误方法同样是 404，且不写成 500', async () => {
      const res = await ts.app.handle(new Request('http://localhost/', { method: 'DELETE' }));

      expect(res.status).toBe(404);
    });
  });

  /**
   * known-defects #19：#18 的同根同株。`NOT_FOUND` 只是 elysia 自身错误码里最显眼的一个，
   * `VALIDATION` / `PARSE` 走的是同一条「喂给 classifyError → 兜底 server → 500」的路。
   *
   * 请求体校验失败原先返回 500，且 message 是整份 TypeBox 报告的 JSON——把 schema 结构
   * 与调用方提交的原值一起回显出去。
   */
  describe('框架自身的错误码不落到 500（known-defects #19）', () => {
    const diffRequest = (body: BodyInit) =>
      ts.app.handle(
        new Request('http://localhost/api/model-designer/sql/diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        })
      );

    it('请求体缺必填字段 → 422，而不是 500', async () => {
      const res = await diffRequest(JSON.stringify({}));

      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ status: 422, type: 'validation' });
    });

    it('422 的 message 是可读摘要，不回显 schema 与提交的原值', async () => {
      const res = await diffRequest(JSON.stringify({ desired: { secret: 'do-not-echo' } }));
      const body = (await res.json()) as { message: string };

      expect(body.message).toContain('desired');
      expect(body.message).not.toContain('do-not-echo');
      expect(body.message).not.toContain('"schema"');
    });

    it('请求体不是合法 JSON → 400，而不是 500', async () => {
      const res = await diffRequest('{ not json');

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ status: 400 });
    });
  });

  /**
   * 全局 `onError` 里 `classifyError` 那一段此前的覆盖率**全部来自 404**——
   * 未注册路径被误分类成内部错误，顺路把这几行走了一遍。#18 修好后它归零，
   * 说明真正的「handler 抛异常」路径从来没有被任何用例执行过。
   *
   * 这里不改产品代码来制造可测性：`createApp()` 返回的就是生产实例，
   * 在它上面挂一条会抛的路由，`onError` 是实例级 hook，照样接管。
   */
  describe('未捕获异常仍走内核分类（#18 修复后暴露的零覆盖）', () => {
    // 路由须在首次 handle 之前挂上：Elysia 在第一次 handle 时编译路由表，之后追加不生效
    let thrower: TestServer;

    beforeAll(async () => {
      thrower = await bootTestServer();
      thrower.app.get('/__throws', () => {
        throw new Error('kaboom');
      });
    });

    it('handler 抛普通 Error → 500 + project-compat 错误体 + x-trace-id', async () => {
      const res = await thrower.app.handle(new Request('http://localhost/__throws'));

      expect(res.status).toBe(500);
      expect(res.headers.get('x-trace-id')).toBeTruthy();
      expect(await res.json()).toMatchObject({ type: 'server', message: 'kaboom', status: 500 });
    });
  });

  it('OpenAPI 文档端点可访问', async () => {
    const res = await ts.app.handle(new Request('http://localhost/openapi/json'));
    // @elysiajs/openapi 可能挂在 /openapi/json 或 /swagger/json，两者其一即可
    if (res.status === 404) {
      const alt = await ts.app.handle(new Request('http://localhost/swagger/json'));
      expect([200, 404]).toContain(alt.status);
      if (alt.status === 200) {
        const body = await alt.json();
        expect(body).toHaveProperty('openapi');
      }
      return;
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('openapi');
  });
});
