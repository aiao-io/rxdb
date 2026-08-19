/**
 * 把三个 demo 页注册成**非 exact** 路由，让 `/demos/vue/todo` 这类子应用路径也落到同一个页面。
 *
 * Docusaurus 的 pages 插件只会按文件生成 exact 路由，匹配不到子路径；页面组件因此从
 * `src/pages/demos/` 挪到了 `src/demos/`，由这里独家注册，避免两个插件抢同一个 path。
 *
 * 静态产物只有 `/demos/{name}` 一份（`trailingSlash: false` 下即 `demos/{name}.html`），
 * 深链靠 `public/_redirects` 里的 200 回退把子路径重写到它，再由客户端路由接管。
 */
const DEMOS = ['angular', 'react', 'vue'];

module.exports = function demoRoutesPlugin() {
  return {
    name: 'demo-routes-plugin',
    async contentLoaded({ actions }) {
      for (const demo of DEMOS) {
        actions.addRoute({
          path: `/demos/${demo}`,
          component: `@site/src/demos/${demo}.tsx`,
          exact: false
        });
      }
    }
  };
};
