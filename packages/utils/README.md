# @aiao/utils

Aiao 项目通用工具库，提供常用的工具函数。

## 功能特性

- **类型工具**: TypeScript 类型增强
- **字符串处理**: 字符串常用操作
- **时间处理**: 日期时间相关工具
- **RxJS 工具**: RxJS 辅助函数

## 安装

```bash
npm install @aiao/utils
# 或
pnpm add @aiao/utils
```

## 使用

```typescript
// UTL-031：此前示例里的 deepClone / formatTime 在包里并不存在，照抄会直接编译失败
import { cloneDeep, debounce, formatPassTime } from '@aiao/utils';

const copy = cloneDeep({ nested: { value: 1 } });
const onInput = debounce((text: string) => console.log(text), 300);
const elapsed = formatPassTime(startedAt, new Date());
```
