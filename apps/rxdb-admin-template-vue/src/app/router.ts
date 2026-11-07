import { ref } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
export const navigating = ref(false);
export const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('./pages/start-page.vue') },
  {
    path: '/entities',
    component: () => import('./pages/entity-shell.vue'),
    children: [{ path: ':namespace/:name', component: () => import('./pages/entity-list-page.vue') }]
  },
  { path: '/search', component: () => import('./pages/search-page.vue') },
  { path: '/backup', component: () => import('./pages/backup-page.vue') }
];
export const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes });
router.beforeEach(() => {
  navigating.value = true;
});
router.afterEach(() => {
  navigating.value = false;
});
router.onError(() => {
  navigating.value = false;
});
