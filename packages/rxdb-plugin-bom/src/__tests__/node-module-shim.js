// PGlite 0.5.10 的 node 环境守卫分支在浏览器永不执行；此 shim 只为让
// vite/esbuild 的静态解析通过（见 vite.config.mts 的 resolve.alias）。
export const createRequire = () => undefined;
export default { createRequire };
