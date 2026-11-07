import { describe, expect, it } from 'vitest';
import { normalizeRoute, readNavigationAction, readNavigationState } from './routes.js';

describe('DESKTOP-US-305 实例路由边界', () => {
  it('保留实例 path、query 和 hash，旧空路由和锚点可正常化', () => {
    expect(normalizeRoute('/documents/id?view=source&line=2#L2')).toBe('/documents/id?view=source&line=2#L2');
    expect(normalizeRoute('')).toBe('/');
    expect(normalizeRoute('#document')).toBe('/#document');
  });
  it.each(['https://other.test/private', '//other.test/', '/\\other.test/', '/bad\nroute', '/%2e%2e/private'])(
    '拒绝越界或歧义路由 %s',
    route => {
      expect(() => normalizeRoute(route)).toThrow('INVALID');
    }
  );
  it.each(['/files?access_token=secret', '/files?PASSWORD=secret', '/#refresh_token=secret', '/?__aiao_orbit=secret'])(
    '凭据不进入持久路由 %s',
    route => {
      expect(() => normalizeRoute(route)).toThrow('凭据');
    }
  );
  it('协议严格验证动作和导航状态，不接受伪造或缺失字段', () => {
    expect(readNavigationAction({ type: 'push', route: '/files?q=中文#item' })).toMatchObject({ type: 'push' });
    expect(readNavigationAction({ type: 'back' })).toEqual({ type: 'back' });
    expect(readNavigationState({ route: '/', back: false, forward: true })).toEqual({
      route: '/',
      back: false,
      forward: true
    });
    expect(() => readNavigationAction({ type: 'reload' })).toThrow('INVALID');
    expect(() => readNavigationAction({ type: 'push' })).toThrow('INVALID');
    expect(() => readNavigationState({ route: '/', back: 1, forward: false })).toThrow('INVALID');
  });
});
