# 权限设计

## 表级权限 (Grants) - 决定“能否操作”

个数据库角色（如 anon, authenticated）是否可以对该表执行特定命令（如 SELECT, INSERT）。
核心作用：如果某个角色在 entity 表上没有 SELECT 的权限，那么任何查询请求在进入行级检查之前就会被直接拒绝。
关键特性：添加 RLS 策略并不会自动撤销已经授予的表级权限。即使 RLS 策略很严格，如果之前给 anon 角色授予了 INSERT 权限，那么匿名用户仍然可以尝试插入数据。

最佳实践：遵循最小权限原则。仅为 entity 表授予应用程序实际需要的权限，不多不少。

- anon（未登录用户）：通常只授予 SELECT 权限（如果公开数据可读）。
- authenticated（已登录用户）：根据业务逻辑授予 SELECT, INSERT, UPDATE, DELETE 的权限组合。
- service_role：此角色用于后端服务，它会绕过 RLS，因此通常保留其完整权限，但务必仅在服务器端安全环境中使用。

## 行级权限 (RLS Policies) - 决定“能操作哪些行”

RLS 策略是附加在表上的规则，它像一个隐式的 WHERE 子句，自动应用于每一次查询，从而精细地控制一个角色可以看到或修改哪些特定的行。

核心作用：即使一个角色拥有 entity 表的 SELECT 权限，RLS 策略也能确保它只返回符合策略条件的行。例如，策略可以限制用户只能查看 user_id 等于自己 ID 的行。

操作类型：策略是针对特定操作类型定义的，你需要为 SELECT, INSERT, UPDATE, DELETE 分别创建策略，以实现最精细的控制。

USING vs. WITH CHECK：这是策略定义中的关键概念：

USING：用于定义哪些现有行是可见的，应用于 SELECT, UPDATE, DELETE 操作。

WITH CHECK：用于定义哪些新行可以被写入，应用于 INSERT, UPDATE 操作。

最佳实践：避免使用 FOR ALL 来制定一条包罗万象的策略，而是为每一种操作（SELECT, INSERT, UPDATE, DELETE）单独创建明确的策略，这样更安全、更清晰。

## 列级权限 (Column-Level Privileges)

在表级和行级权限之外，Postgres 还提供了一种更细粒度的列级权限，用于控制角色可以访问表中的哪些特定列。
这可以用于保护 entity 表中的敏感字段，如 email 或 phone，即使整行数据对用户可见，这些列也可以被隐藏。
通常建议优先使用 RLS 配合专门的角色表来管理访问，列级权限被视为高级功能，在大多数场景下并非首选。
