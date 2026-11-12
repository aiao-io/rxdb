import { describe, expect, it } from 'vitest';
import { DesktopOwnership } from './ownership.js';

describe('DESKTOP-US-504 Web Lock 单一拥有者与可取消接管', () => {
  it('同时启动只有一个拥有者；拒绝接管保留旧拥有者，批准才移交', async () => {
    const name = `ownership-${crypto.randomUUID()}`;
    let approve = false;
    const first = new DesktopOwnership(name, async () => approve);
    const second = new DesktopOwnership(name, async () => true);
    expect(await first.acquire()).toBe(true);
    expect(await second.acquire()).toBe(false);
    expect(await second.takeover()).toBe(false);
    expect(first.owned).toBe(true);
    approve = true;
    expect(await second.takeover()).toBe(true);
    expect(first.owned).toBe(false);
    expect(second.owned).toBe(true);
    await first.dispose();
    await second.dispose();
  });
});
