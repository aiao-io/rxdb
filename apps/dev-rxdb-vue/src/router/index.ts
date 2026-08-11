import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/home',
      name: 'home',
      component: () => import('../pages/HomePage.vue')
    },
    {
      path: '/todo',
      name: 'todo',
      component: () => import('../pages/TodoPage.vue')
    },
    {
      path: '/todo-cursor',
      name: 'todo-cursor',
      component: () => import('../pages/TodoCursorPage.vue')
    },
    {
      path: '/workspace',
      name: 'workspace',
      component: () => import('../pages/WorkspacePage.vue')
    },
    {
      path: '/menu-simple',
      name: 'menu-simple',
      component: () => import('../pages/menu/TreeMenuSimplePage.vue')
    },
    {
      path: '/menu-virtual',
      name: 'menu-virtual',
      component: () => import('../pages/menu/TreeMenuVirtualPage.vue')
    },
    {
      path: '/menu-lazy',
      name: 'menu-lazy',
      component: () => import('../pages/menu/TreeMenuLazyPage.vue')
    },
    {
      path: '/file-manager-simple',
      name: 'file-manager-simple',
      component: () => import('../pages/file-manager/FileManagerSimplePage.vue')
    },
    {
      path: '/file-manager-virtual',
      name: 'file-manager-virtual',
      component: () => import('../pages/file-manager/FileManagerVirtualPage.vue')
    },
    {
      path: '/file-manager-lazy',
      name: 'file-manager-lazy',
      component: () => import('../pages/file-manager/FileManagerLazyPage.vue')
    },
    {
      path: '/file-manager',
      redirect: '/file-manager-simple'
    },
    {
      path: '/branch-manager',
      name: 'branch-manager',
      component: () => import('../pages/BranchManagerPage.vue')
    },
    {
      path: '/ag-grid',
      name: 'ag-grid',
      component: () => import('../pages/AgGridPage.vue')
    },
    {
      path: '/code-editor',
      name: 'code-editor',
      component: () => import('../pages/CodeEditorPage.vue')
    },
    {
      path: '/generator',
      name: 'generator',
      component: () => import('../pages/GeneratorPage.vue')
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('../pages/SearchPage.vue')
    },
    {
      path: '/opfs/:opfsPath(.*)*',
      name: 'opfs',
      component: () => import('../pages/opfs/OpfsPage.vue')
    },
    {
      path: '/storage/:storagePath(.*)*',
      name: 'storage',
      component: () => import('../pages/StoragePage.vue')
    },
    {
      path: '/remote-cache',
      name: 'remote-cache',
      component: () => import('../pages/RemoteCachePage.vue')
    },
    {
      path: '/encrypted',
      name: 'encrypted',
      component: () => import('../pages/EncryptedPage.vue')
    },
    {
      path: '/',
      redirect: '/home'
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/home'
    }
  ]
});

export default router;
