import { describe, expect, it } from 'vitest';
import LoginPage from './pages/login-page.vue';
import { routes } from './router';

describe('登录页随入口一起加载（ADMIN-US-222，协作契约 C01）', () => {
  it('不拆懒加载分包：离线外壳只缓存本次页面加载取过的资源，登录成功后整页载入不会再取登录页，离线时缓存授权过期要打得开它', () => {
    const login = routes.find(route => route.path === '/login');
    expect(login?.component).toBe(LoginPage);
  });
});
