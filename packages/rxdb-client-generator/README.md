# @aiao/rxdb-client-generator

RxDB 客户端代码生成器，从实体定义生成 JavaScript 实体入口和 TypeScript 声明。

## 功能

- 生成单文件或按实体拆分的客户端代码
- 生成 RxDB、Repository、关系和查询规则类型
- 提供 CLI 与 Vite 插件
- 使用 manifest 只清理由生成器拥有的陈旧输出，不删除输出目录中的其他文件

## 安装

```bash
pnpm add -D @aiao/rxdb-client-generator
```

## CLI

```bash
rxdb-client-generator ./rxdb.config.ts
```

配置文件由 `jiti` 执行，可以导出一个配置或配置数组：

```typescript
export default {
  entities: ['./src/entities/**/*.ts'],
  outDir: './src/generated',
  relationQueryDeep: 3,
  splitFiles: true
};
```

路径相对于配置文件解析。多个不同的输出目录可以并行生成；同一个物理 `outDir`（包括规范化路径和软链别名）不能出现在多个配置中。需要聚合生成时，请合并 `entities` patterns，只保留一项输出配置。

默认采用 fail-closed：`entities` 为空、任一 glob 零匹配或所有文件都没有实体时，保留旧产物并报错。
确实需要空客户端时必须显式设置 `allowEmpty: true`。

分析器一次把全部实体文件加载进共享 TypeScript Project；跨文件、多层继承不依赖 glob 顺序。
带实体装饰器的父类无法解析时会直接报错，不生成缺少父字段的客户端。

## Vite 插件

单配置：

```typescript
import { rxdbClientGeneratorVitePlugin } from '@aiao/rxdb-client-generator/vite';

export default {
  plugins: [
    rxdbClientGeneratorVitePlugin({
      entities: ['./src/entities/**/*.ts'],
      outDir: './src/generated'
    })
  ]
};
```

多配置：

```typescript
rxdbClientGeneratorVitePlugin([
  {
    entities: ['./src/entities/**/*.ts'],
    outDir: './src/generated'
  },
  {
    entities: ['./src/admin/**/*.ts'],
    outDir: './src/generated-admin'
  }
]);
```

生产构建在 `buildStart` 生成，产物会参与当前 bundle 的模块解析。开发服务器启动前先生成，
随后监听实体文件的增删改；重建按单飞队列串行执行，成功后触发 full reload，失败显示 Vite error overlay。

## 自定义 Repository 生成器

`GeneratorContext.file` 是纯内存 `SourceFile`。使用 `getText()` 读取生成文本；磁盘提交由 CLI/Vite
构建器负责，`save()` 与 `saveSync()` 会明确抛错。公开结构中可用于声明文件的 scope、可选成员和
rest 参数会被渲染；initializer、definite assignment、async/body 与 decorator 等不适用于 ambient
declaration 的字段会 fail-fast，不会静默丢弃。

## 实体元数据安全边界

实体扫描不会执行装饰器参数。`@Entity`、`@TreeEntity`、`@GraphEntity` 的参数必须是可静态求值的内联对象，只允许：

- 对象、数组
- 字符串、数字、布尔值、`null`
- `PropertyType.*`、`RelationKind.*`、`OnDeleteAction.*`
- 仅用于类型收窄的括号、`as`、`satisfies`

局部变量、函数调用、箭头函数、对象展开、计算属性名和其他动态表达式会直接报错；错误包含文件路径、行和列。配置文件仍按现有合同由 `jiti` 执行。

## 输出所有权

每个 `outDir` 会写入 `.rxdb-client-generator-manifest.json`。后续生成只删除旧 manifest 中存在、但本次不再生成的文件；手写文件和其他工具输出不会被清理。损坏或越界的 manifest 会直接报错，不会静默忽略。
