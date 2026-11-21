import { ref } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { requireLogin } from './shell/auth-gate';
export const navigating = ref(false);
export const routes: RouteRecordRaw[] = [
  // 登录页在后台外壳之外（App.vue 单独渲染）；其余页面都要先登录（beforeEach 是全站登录门禁）
  { path: '/login', component: () => import('./pages/login-page.vue') },
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
