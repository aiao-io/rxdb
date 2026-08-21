import { createRouter, createWebHistory } from 'vue-router';
import setup_rxdb from '../app/rxdb/setup_rxdb_sqlite-wasm';

/**
 * 进入 `/search` 之前先把本地适配器连上。
 *
 * rxdb-plugin-search 声明 `inject: ['adapter:local']`（US-015）：宿主要等本地适配器的引导链
 * （迁移、建表、索引）跑完才调 `install()`。搜索页在 `setup()` 里**同步**调用 `db.search()`，
 * 深链直接进来时连接尚未建立，组件初始化就会抛「plugin is not installed」。
 *
 * 别的页面不需要这道门：它们的首次查询会经适配器 `ready()` 回到 `connect()`，自然把连接带起来。
 * `setup_rxdb()` 是模块级单例，`connect()` 自带去重，重复进入本路由不会重复连接。
 */
const connectLocalAdapter = async (): Promise<true> => {
  const db = setup_rxdb();
  const adapterName = db.config.sync.local?.adapter;
  if (adapterName === undefined) throw new Error('[demo] sync.local.adapter is not configured');
  await db.connect(adapterName);
  return true;
};

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
      beforeEnter: connectLocalAdapter,
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
