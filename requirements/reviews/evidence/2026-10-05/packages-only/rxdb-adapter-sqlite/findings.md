# rxdb-adapter-sqlite：源码评审意见

结论 **🟡**。34/34受控文件、1980行正文已读；C1–C5意见已交付，未新增确认产品缺陷。

1. **类型判别力不足**：`src/__tests__/execute_helper.spec.ts:5-6`用`as never`越过bindings检查；`src/__tests__/public-api.spec.ts:11`只检查退化的`RepositoryConstructor<never>`。改进是普通实体/自定义仓储的严格正反consumer，不改变公开类型凑绿。当前是测试缺口，不声称类型API已坏。
2. **发布档位需拆证据**：`src/testing.ts:17-23` eager glob引入被lib排除的测试factory，`package.json:30-35`给testing额外source条件，而files排除__tests__。默认打包testing entry与workspace/source消费要分别取证；现在静态entry对齐，冷安装未验，不宣布发布绿。
3. **失败清理判别力**：两个working-tree conformance调用点afterEach先await disconnectAll再cleanup；前者拒绝会阻止后者。共享suite相关关闭best-effort契约已有CORE-PENDING-3，本包只记录本地路径和潜在Worker清理缺口，不重复立业务缺陷或推断物理泄漏。
4. **继承责任正确但不能替代运行证据**：statement/事务/加密/restore均委托shared core，OPFS/memory/fallback能力界限明确，caller-owned Worker规则不变。C3/C4场景验证与core/宿主分开，评审交付不因此归零。
