import { ref } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import LoginPage from './pages/login-page.vue';
import { requireLogin } from './shell/auth-gate';
export const navigating = ref(false);
export const routes: RouteRecordRaw[] = [
  // 登录页在后台外壳之外（App.vue 单独渲染）；其余页面都要先登录（beforeEach 是全站登录门禁）。
  // 登录页随入口一起加载、不拆分包：登录成功后整页载入目标地址（ADMIN-US-222），那次页面加载不会再取登录页；
  // 协作的离线外壳只缓存本次页面加载取过的资源，离线时缓存授权过期要打得开登录页（C01）
  { path: '/login', component: LoginPage },
  { path: '/', component: () => import('./pages/start-page.vue') },
  { path: '/dashboard', component: () => import('./pages/dashboard-page.vue') },
  {
    path: '/entities',
    component: () => import('./pages/entity-shell.vue'),
    children: [{ path: ':namespace/:name', component: () => import('./pages/entity-list-page.vue') }]
  },
  { path: '/search', component: () => import('./pages/search-page.vue') },
  { path: '/collaboration', component: () => import('./pages/collaboration-page.vue') },
  { path: '/backup', component: () => import('./pages/backup-page.vue') }
];
export const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes });
router.beforeEach(to => {
  navigating.value = true;
  return requireLogin(to);
});
router.afterEach(() => {
  navigating.value = false;
});
router.onError(() => {
  navigating.value = false;
});
