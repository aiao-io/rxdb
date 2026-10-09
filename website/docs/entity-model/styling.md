# 样式接入

组件包**不发布编译样式**：组件模板使用约定的工具类（Tailwind + daisyUI 类名），由消费方的样式管线生成。没有样式管线的消费方会得到**无样式但结构完整**的组件 —— 这是文档化行为，不是缺陷。

## 约定

- 样式管线：Tailwind CSS + [daisyUI](https://daisyui.com/)（`light` / `dark` 两套主题），消费方决定 preflight、主题与配色，组件包不输出其中任何一项；
- 组件包各自发布一个 **Tailwind source 注册入口**，让 Tailwind 扫描组件模板、按需生成用到的工具类：
  - `@aiao/rxdb-model-angular/tailwind.css`
  - `@aiao/rxdb-model-react/tailwind.css`
  - `@aiao/rxdb-model-vue/tailwind.css`
- 表格引擎（`@visactor/vtable`）以对等依赖形式由消费方提供，不计入组件包体积。

## 接入步骤

在应用的 Tailwind 入口（即引入 `tailwindcss` 的样式文件）中引入对应包的注册入口：

```css
/* 例如 Angular 消费方 */
@import 'tailwindcss';
@import '@aiao/rxdb-model-angular/tailwind.css';

@plugin 'daisyui' {
  themes: light --default, dark --prefersdark;
}
```

React / Vue 同理换成 `@aiao/rxdb-model-react/tailwind.css` / `@aiao/rxdb-model-vue/tailwind.css`。注册入口只声明 `@source`（发布产物 dist / 本地源码目录），不输出 preflight / theme / daisyUI 主题。

### 微前端 / Shadow DOM

组件在无界（wujie）等 Shadow DOM 宿主中渲染时，daisyUI 的 CSS 变量要同时挂在 `:host` 上；独立打开时仍要 `:root`：

```css
@plugin 'daisyui/index.js' {
  themes: light --default, dark --prefersdark;
  /* 必须用 :is()：daisyUI 会把 root 当前缀拼接 */
  root: ':is(:host, :root)';
}
```

## 主题

- 明暗主题跟随 daisyUI 的 `data-theme`；表格与查询构建器在深色 / 浅色下按主题变量渲染，切换过程无闪烁。
- 查询构建器的**组件主题**（字段选择器 / 操作符选择器 / 值输入的替换实现）与 CSS 无关，经各框架的主题注入机制提供：
  - Angular：`provideQueryBuilderTheme(theme)`（DI token `QUERY_BUILDER_THEME`）；
  - React：`QueryBuilderThemeProvider`（context `QUERY_BUILDER_THEME`）；
  - Vue：`provideQueryBuilderTheme(theme)`（injection key `QUERY_BUILDER_THEME`）。
  缺省为内置 `DEFAULT_QUERY_BUILDER_THEME`。

## 无样式管线时的行为

不引入 Tailwind / daisyUI 也能使用组件：结构、语义（fieldset / legend、tab、aria 状态）与交互全部正常，只是没有视觉样式。需要视觉还原时按上文接入注册入口即可。
