# 框架集成

目标不是为每个框架发明一套数据层,而是让 Angular、React、Vue 共用同一套模型、查询与写入语义,差异只留在 UI 绑定方式上。

## 你会得到什么

- 相同的实体模型定义
- 相同的查询结构与过滤规则
- 相同的 CRUD 与响应式数据流心智
- 各框架自然的 UI 绑定风格

**状态**:三套接入(Angular Signals、React Hooks、Vue Composables)均已落地,可直接验证。

## 怎么选

| 框架                    | 适合                                            |
| ----------------------- | ----------------------------------------------- |
| [React](./react.md)     | 组件化数据应用,Hooks 心智直接                   |
| [Vue](./vue.md)         | 高迭代效率团队,Composables 与响应式实体天然配合 |
| [Angular](./angular.md) | 重业务后台、复杂表单,Signals 与 DI 更完整       |

## 包对应关系

| 框架    | 核心包               |
| ------- | -------------------- |
| Angular | `@aiao/rxdb-angular` |
| React   | `@aiao/rxdb-react`   |
| Vue     | `@aiao/rxdb-vue`     |

## 建议阅读顺序

1. [快速开始](../getting-started/README.md) — 打通数据库初始化和基础查询
2. [模型定义](../model-definition/README.md) + [模型查询](../model-query/README.md) — 建立数据层心智
3. 回到本章挑选对应的框架集成文档
