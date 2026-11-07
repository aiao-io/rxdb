# @modules/orbit

文档站宿主（Docusaurus）与 Orbit 演示子应用（Angular / React / Vue）之间的共享协议。

| 文件            | 内容                                                             |
| --------------- | ---------------------------------------------------------------- |
| `host-route.ts` | 路由双向同步：bus 事件、路径归一化、TTL 同步闸门、三端适配器内核 |
| `host-theme.ts` | 主题双向同步：宿主下发与子应用回请两条独立通道                   |
| `shadow-css.ts` | Shadow DOM 里的 daisyUI 选择器改写                               |

## 为什么不放 `@aiao/utils`

`@aiao/utils` 是对外发布的包，进了它的 barrel 就等于进了公开 API 表面
（`scripts/audit/api-surface.mjs` 会盯着）。这套协议还在随文档站演进，
现阶段留在内部模块里，等形态稳定再考虑上提。

## 消费方式

- 三个 demo 应用与 `modules/angular`：走 `tsconfig.base.json` 的 `@modules/orbit` path，直接吃 `src/`
- `website`：Docusaurus 的 webpack 不认 tsconfig paths，走 pnpm workspace 软链读 `dist/`，
  所以整站构建前必须先 `pnpm nx build orbit-protocol`（已接进 `website/scripts/build-website.mjs`）

运行内核为 [`@aiao/orbit`](../../packages/orbit/README.md)。本模块只维护文档站的主题与路由接线；`shadow-css.ts` 保留给直接渲染到 Shadow DOM 的消费方，Orbit 原生 iframe 不使用它。
