---
id: US-402
title: 代码编辑器组件
status: Done
priority: Medium
epic: epic-003-ui-developer-tools
created: 2025-12-08
updated: 2026-02-08
tags: [ui, code-editor, cross-framework]
---

# 用户故事：代码编辑器组件

## 作为/我想要/以便

**作为** 开发者
**我想要** 在应用中嵌入代码编辑器组件
**以便** 用户可以在浏览器中编辑和查看代码

## 验收标准

| #   | 前置条件                      | 操作                        | 预期结果                    | 状态 |
| --- | ----------------------------- | --------------------------- | --------------------------- | ---- |
| 1   | 核心包封装 CodeMirror 6       | 使用 `LanguageDescription`  | 支持语言懒加载              | ✅   |
| 2   | Angular 组件                  | 实现 `ControlValueAccessor` | 支持 Angular Forms 双向绑定 | ✅   |
| 3   | React 组件                    | 传入 `value`/`onChange`     | 支持受控组件模式            | ✅   |
| 4   | Vue 组件                      | 使用 `v-model`              | 支持双向绑定                | ✅   |
| 5   | 设置 `readonly` 或 `disabled` | 渲染编辑器                  | 正确禁用编辑功能            | ✅   |
| 6   | 切换 `language` 属性          | 语言变化                    | 高亮和自动补全随之切换      | ✅   |
| 7   | 三端组件 API                  | 对比                        | 功能和行为一致              | ✅   |

## 技术笔记

- 核心包：`code-editor` — CodeMirror 6 封装，语言懒加载
- Angular：`code-editor-angular` — ControlValueAccessor 集成
- React：`code-editor-react` — 受控组件模式
- Vue：`code-editor-vue` — v-model 双向绑定

## 实现文件

- `packages/code-editor/` — 核心 CodeMirror 封装
- `packages/code-editor-angular/` — Angular 组件
- `packages/code-editor-react/` — React 组件
- `packages/code-editor-vue/` — Vue 组件

## 参考

- [文档: Code Editor](../../../packages/code-editor/README.md)
