import { describe, expect, it, vi } from 'vitest';
import { AgentGatewayError, HttpAgentGateway } from './agent-gateway';

function gateway(reply: (url: string, init?: RequestInit) => Response) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => reply(url, init));
  return { fetcher, target: new HttpAgentGateway(fetcher as unknown as typeof fetch) };
}

describe('HttpAgentGateway', () => {
  it('读取 Worker 的智能体配置', async () => {
    const { fetcher, target } = gateway(() =>
      Response.json({ enabled: true, apiUrl: 'https://trigger.example.com', task: 'model-designer' })
    );
    expect(await target.config()).toEqual({
      enabled: true,
      apiUrl: 'https://trigger.example.com',
      task: 'model-designer'
    });
    expect(fetcher).toHaveBeenCalledWith('/api/agent/config', { credentials: 'include' });
  });

  it('读取当前用户，未登录时为 null', async () => {
    expect(await gateway(() => Response.json({ user: { id: 'user-1' } })).target.currentUserId()).toBe('user-1');
    expect(await gateway(() => Response.json({ user: null })).target.currentUserId()).toBeNull();
  });

  it('为会话签发令牌', async () => {
    const { fetcher, target } = gateway(() => Response.json({ publicAccessToken: 'pat' }));
    expect(await target.session('md-user-1-s1')).toEqual({ publicAccessToken: 'pat' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/agent/session');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ chatId: 'md-user-1-s1' })
    });
  });

  it('签发失败时带上状态码与 Worker 的说明', async () => {
    const { target } = gateway(() => Response.json({ message: 'Chat belongs to another user' }, { status: 403 }));
    const error = await target.session('md-x-s1').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AgentGatewayError);
    expect(error).toMatchObject({ status: 403, message: 'Chat belongs to another user' });
  });

  it.each([
    ['配置接口失败', (target: HttpAgentGateway) => target.config()],
    ['会话接口失败', (target: HttpAgentGateway) => target.currentUserId()]
  ])('%s时抛出网关错误', async (_name, call) => {
    const { target } = gateway(() => new Response('down', { status: 502 }));
    await expect(call(target)).rejects.toMatchObject({ status: 502 });
  });

  it('签发响应没有令牌时视为失败', async () => {
    const { target } = gateway(() => Response.json({}));
    await expect(target.session('md-user-1-s1')).rejects.toMatchObject({ status: 502 });
  });
});
