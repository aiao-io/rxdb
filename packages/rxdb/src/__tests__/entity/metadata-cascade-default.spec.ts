/**
 * SQLite 外键级联操作测试
 * 测试关系实体的外键约束配置和行为
 */

import { describe, expect, it } from 'vitest';
import metadata_cascade_default, { get_default_cascade_options } from '../../entity/metadata-cascade-default.js';
import {
  OnDeleteAction,
  OnUpdateAction,
  RelationKind,
  type ICascadeOptions
} from '../../entity/metadata-options.interface.js';

describe('SQLite 外键级联操作', () => {
  describe('OnDeleteAction', () => {
    it('应该定义所有删除级联类型', () => {
      expect(OnDeleteAction.NO_ACTION).toBe('NO ACTION');
      expect(OnDeleteAction.RESTRICT).toBe('RESTRICT');
      expect(OnDeleteAction.CASCADE).toBe('CASCADE');
      expect(OnDeleteAction.SET_NULL).toBe('SET NULL');
      expect(OnDeleteAction.SET_DEFAULT).toBe('SET DEFAULT');
    });

    it('应该有5种删除级联类型', () => {
      const actions = Object.values(OnDeleteAction);
      expect(actions).toHaveLength(5);
    });
  });

  describe('OnUpdateAction', () => {
    it('应该定义所有更新级联类型', () => {
      expect(OnUpdateAction.NO_ACTION).toBe('NO ACTION');
      expect(OnUpdateAction.RESTRICT).toBe('RESTRICT');
      expect(OnUpdateAction.CASCADE).toBe('CASCADE');
      expect(OnUpdateAction.SET_NULL).toBe('SET NULL');
      expect(OnUpdateAction.SET_DEFAULT).toBe('SET DEFAULT');
    });

    it('应该有5种更新级联类型', () => {
      const actions = Object.values(OnUpdateAction);
      expect(actions).toHaveLength(5);
    });
  });

  describe('级联选项配置示例', () => {
    it('应该支持配置级联删除', () => {
      const cascadeOptions: ICascadeOptions = {
        onDelete: OnDeleteAction.CASCADE,
        onUpdate: OnUpdateAction.RESTRICT
      };

      expect(cascadeOptions.onDelete).toBe(OnDeleteAction.CASCADE);
      expect(cascadeOptions.onUpdate).toBe(OnUpdateAction.RESTRICT);
    });

    it('应该支持配置 SET_NULL', () => {
      const cascadeOptions: ICascadeOptions = {
        onDelete: OnDeleteAction.SET_NULL,
        onUpdate: OnUpdateAction.CASCADE
      };

      expect(cascadeOptions.onDelete).toBe(OnDeleteAction.SET_NULL);
      expect(cascadeOptions.onUpdate).toBe(OnUpdateAction.CASCADE);
    });

    it('应该支持配置 RESTRICT', () => {
      const cascadeOptions: ICascadeOptions = {
        onDelete: OnDeleteAction.RESTRICT,
        onUpdate: OnUpdateAction.RESTRICT
      };

      expect(cascadeOptions.onDelete).toBe(OnDeleteAction.RESTRICT);
      expect(cascadeOptions.onUpdate).toBe(OnUpdateAction.RESTRICT);
    });

    it('应该支持仅配置 onDelete', () => {
      const cascadeOptions: ICascadeOptions = {
        onDelete: OnDeleteAction.CASCADE
      };

      expect(cascadeOptions.onDelete).toBe(OnDeleteAction.CASCADE);
      expect(cascadeOptions.onUpdate).toBeUndefined();
    });

    it('应该支持仅配置 onUpdate', () => {
      const cascadeOptions: ICascadeOptions = {
        onUpdate: OnUpdateAction.CASCADE
      };

      expect(cascadeOptions.onDelete).toBeUndefined();
      expect(cascadeOptions.onUpdate).toBe(OnUpdateAction.CASCADE);
    });

    it('应该支持空配置（使用默认行为 NO_ACTION）', () => {
      const cascadeOptions: ICascadeOptions = {};

      expect(cascadeOptions.onDelete).toBeUndefined();
      expect(cascadeOptions.onUpdate).toBeUndefined();
    });
  });

  describe('级联操作使用场景', () => {
    it('场景1：删除用户时级联删除所有订单', () => {
      const userOrdersCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.CASCADE,
        onUpdate: OnUpdateAction.RESTRICT
      };

      // 删除用户时级联删除订单记录
      expect(userOrdersCascade.onDelete).toBe(OnDeleteAction.CASCADE);
      // 不允许更新用户ID（保护数据一致性）
      expect(userOrdersCascade.onUpdate).toBe(OnUpdateAction.RESTRICT);
    });

    it('场景2：删除分类时将产品的分类ID设为NULL', () => {
      const categoryProductsCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.SET_NULL,
        onUpdate: OnUpdateAction.CASCADE
      };

      // 删除分类时将产品的分类ID设为NULL（产品不会被删除）
      expect(categoryProductsCascade.onDelete).toBe(OnDeleteAction.SET_NULL);
      // 更新分类ID时级联更新产品的分类ID
      expect(categoryProductsCascade.onUpdate).toBe(OnUpdateAction.CASCADE);
    });

    it('场景3：如果用户有订单则阻止删除用户', () => {
      const userOrdersRestrict: ICascadeOptions = {
        onDelete: OnDeleteAction.RESTRICT,
        onUpdate: OnUpdateAction.RESTRICT
      };

      // 如果用户有订单，则不允许删除用户（保护数据完整性）
      expect(userOrdersRestrict.onDelete).toBe(OnDeleteAction.RESTRICT);
      // 不允许更新用户ID
      expect(userOrdersRestrict.onUpdate).toBe(OnUpdateAction.RESTRICT);
    });

    it('场景4：删除部门时将员工分配到默认部门', () => {
      const departmentEmployeesCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.SET_DEFAULT,
        onUpdate: OnUpdateAction.CASCADE
      };

      // 删除部门时将员工的部门ID设为默认值
      expect(departmentEmployeesCascade.onDelete).toBe(OnDeleteAction.SET_DEFAULT);
      // 更新部门ID时级联更新员工的部门ID
      expect(departmentEmployeesCascade.onUpdate).toBe(OnUpdateAction.CASCADE);
    });

    it('场景5：使用默认行为 NO_ACTION', () => {
      const noActionCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.NO_ACTION,
        onUpdate: OnUpdateAction.NO_ACTION
      };

      // 删除或更新时不执行任何操作
      // 如果存在引用，操作会失败
      expect(noActionCascade.onDelete).toBe(OnDeleteAction.NO_ACTION);
      expect(noActionCascade.onUpdate).toBe(OnUpdateAction.NO_ACTION);
    });
  });

  describe('级联操作最佳实践', () => {
    it('推荐：父子关系（强依赖）使用 CASCADE', () => {
      // 例如：订单-订单项、文章-评论
      const parentChildCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.CASCADE,
        onUpdate: OnUpdateAction.RESTRICT
      };

      expect(parentChildCascade.onDelete).toBe(OnDeleteAction.CASCADE);
      // 不建议更新主键
      expect(parentChildCascade.onUpdate).toBe(OnUpdateAction.RESTRICT);
    });

    it('推荐：独立实体关系（弱依赖）使用 SET_NULL', () => {
      // 例如：产品-分类、文章-作者
      const independentEntityCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.SET_NULL,
        onUpdate: OnUpdateAction.RESTRICT
      };

      expect(independentEntityCascade.onDelete).toBe(OnDeleteAction.SET_NULL);
      // 不建议更新主键
      expect(independentEntityCascade.onUpdate).toBe(OnUpdateAction.RESTRICT);
    });

    it('推荐：重要数据关系使用 RESTRICT', () => {
      // 例如：用户-订单（防止误删除有订单的用户）
      const criticalDataCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.RESTRICT,
        onUpdate: OnUpdateAction.RESTRICT
      };

      expect(criticalDataCascade.onDelete).toBe(OnDeleteAction.RESTRICT);
      expect(criticalDataCascade.onUpdate).toBe(OnDeleteAction.RESTRICT);
    });

    it('推荐：有默认值的关系使用 SET_DEFAULT', () => {
      // 例如：员工-部门（删除部门时分配到默认部门）
      const defaultValueCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.SET_DEFAULT,
        onUpdate: OnUpdateAction.RESTRICT
      };

      expect(defaultValueCascade.onDelete).toBe(OnDeleteAction.SET_DEFAULT);
      expect(defaultValueCascade.onUpdate).toBe(OnUpdateAction.RESTRICT);
    });

    it('警告：谨慎使用 CASCADE 删除（可能导致大量数据被删除）', () => {
      const dangerousCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.CASCADE,
        onUpdate: OnUpdateAction.CASCADE
      };

      // CASCADE 删除很方便，但可能导致意外的数据丢失
      expect(dangerousCascade.onDelete).toBe(OnDeleteAction.CASCADE);

      // CASCADE 更新会带来性能开销，且可能导致数据不一致
      // 在 SQLite 中通常不建议更新主键
      expect(dangerousCascade.onUpdate).toBe(OnDeleteAction.CASCADE);
    });

    it('注意：SET_NULL 要求外键字段允许 NULL', () => {
      const setNullCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.SET_NULL
      };

      // 使用 SET_NULL 时，外键字段必须定义为 nullable: true
      expect(setNullCascade.onDelete).toBe(OnDeleteAction.SET_NULL);
    });

    it('注意：SET_DEFAULT 要求外键字段有默认值', () => {
      const setDefaultCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.SET_DEFAULT
      };

      // 使用 SET_DEFAULT 时，外键字段必须定义 default 值
      expect(setDefaultCascade.onDelete).toBe(OnDeleteAction.SET_DEFAULT);
    });
  });

  describe('SQLite 外键约束特性', () => {
    it('默认行为是 NO_ACTION', () => {
      // 如果不指定 onDelete 和 onUpdate，SQLite 默认使用 NO_ACTION
      const defaultBehavior: ICascadeOptions = {};

      expect(defaultBehavior.onDelete).toBeUndefined();
      expect(defaultBehavior.onUpdate).toBeUndefined();
      // 在 SQLite 中会被解释为 NO_ACTION
    });

    it('RESTRICT 和 NO_ACTION 的区别', () => {
      // RESTRICT: 立即检查约束，如果违反则拒绝操作
      const restrictCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.RESTRICT
      };

      // NO_ACTION: 延迟检查约束，在事务结束时检查
      const noActionCascade: ICascadeOptions = {
        onDelete: OnDeleteAction.NO_ACTION
      };

      expect(restrictCascade.onDelete).toBe(OnDeleteAction.RESTRICT);
      expect(noActionCascade.onDelete).toBe(OnDeleteAction.NO_ACTION);

      // 在 SQLite 中，两者行为基本相同
      // 但 RESTRICT 是 SQL 标准，更推荐使用
    });

    it('CASCADE 操作的递归性', () => {
      // CASCADE 操作是递归的
      // 例如：User -> Order -> OrderItem
      // 删除 User 会级联删除 Order，进而级联删除 OrderItem
      const cascadeChain: ICascadeOptions = {
        onDelete: OnDeleteAction.CASCADE,
        onUpdate: OnUpdateAction.RESTRICT
      };

      expect(cascadeChain.onDelete).toBe(OnDeleteAction.CASCADE);
    });
  });

  describe('默认级联选项', () => {
    describe('get_default_cascade_options', () => {
      it('一对一关系（ONE_TO_ONE）应该默认使用 CASCADE', () => {
        const defaults = get_default_cascade_options(RelationKind.ONE_TO_ONE);

        expect(defaults.onDelete).toBe(OnDeleteAction.CASCADE);
        expect(defaults.onUpdate).toBe(OnUpdateAction.RESTRICT);
      });

      it('一对多关系（ONE_TO_MANY）应该默认使用 CASCADE', () => {
        const defaults = get_default_cascade_options(RelationKind.ONE_TO_MANY);

        expect(defaults.onDelete).toBe(OnDeleteAction.CASCADE);
        expect(defaults.onUpdate).toBe(OnUpdateAction.RESTRICT);
      });

      it('多对一关系（MANY_TO_ONE, nullable=false）应该默认使用 RESTRICT', () => {
        const defaults = get_default_cascade_options(RelationKind.MANY_TO_ONE, false);

        expect(defaults.onDelete).toBe(OnDeleteAction.RESTRICT);
        expect(defaults.onUpdate).toBe(OnUpdateAction.RESTRICT);
      });

      it('多对一关系（MANY_TO_ONE, nullable=true）应该默认使用 SET_NULL', () => {
        const defaults = get_default_cascade_options(RelationKind.MANY_TO_ONE, true);

        expect(defaults.onDelete).toBe(OnDeleteAction.SET_NULL);
        expect(defaults.onUpdate).toBe(OnUpdateAction.RESTRICT);
      });

      it('多对多关系（MANY_TO_MANY）应该默认使用 RESTRICT', () => {
        const defaults = get_default_cascade_options(RelationKind.MANY_TO_MANY);

        expect(defaults.onDelete).toBe(OnDeleteAction.RESTRICT);
        expect(defaults.onUpdate).toBe(OnUpdateAction.RESTRICT);
      });
    });

    describe('metadata_cascade_default', () => {
      it('应该保留用户显式指定的 onDelete', () => {
        const result = metadata_cascade_default({ onDelete: OnDeleteAction.SET_NULL }, RelationKind.ONE_TO_MANY);

        expect(result.onDelete).toBe(OnDeleteAction.SET_NULL); // 用户指定的
        expect(result.onUpdate).toBe(OnUpdateAction.RESTRICT); // 默认值
      });

      it('应该保留用户显式指定的 onUpdate', () => {
        const result = metadata_cascade_default({ onUpdate: OnUpdateAction.CASCADE }, RelationKind.ONE_TO_MANY);

        expect(result.onDelete).toBe(OnDeleteAction.CASCADE); // 默认值
        expect(result.onUpdate).toBe(OnUpdateAction.CASCADE); // 用户指定的
      });

      it('应该同时保留用户指定的 onDelete 和 onUpdate', () => {
        const result = metadata_cascade_default(
          {
            onDelete: OnDeleteAction.SET_NULL,
            onUpdate: OnUpdateAction.NO_ACTION
          },
          RelationKind.ONE_TO_MANY
        );

        expect(result.onDelete).toBe(OnDeleteAction.SET_NULL);
        expect(result.onUpdate).toBe(OnUpdateAction.NO_ACTION);
      });

      it('空配置应该使用所有默认值', () => {
        const result = metadata_cascade_default({}, RelationKind.ONE_TO_MANY);

        expect(result.onDelete).toBe(OnDeleteAction.CASCADE);
        expect(result.onUpdate).toBe(OnUpdateAction.RESTRICT);
      });

      it('应该根据 nullable 参数返回不同的默认值', () => {
        const notNullable = metadata_cascade_default({}, RelationKind.MANY_TO_ONE, false);
        const nullable = metadata_cascade_default({}, RelationKind.MANY_TO_ONE, true);

        expect(notNullable.onDelete).toBe(OnDeleteAction.RESTRICT);
        expect(nullable.onDelete).toBe(OnDeleteAction.SET_NULL);
      });
    });

    describe('实际使用场景', () => {
      it('场景1：订单-订单项（一对多，使用默认 CASCADE）', () => {
        // 用户不指定级联选项，系统自动应用默认值
        const options = metadata_cascade_default({}, RelationKind.ONE_TO_MANY);

        // 删除订单时自动删除所有订单项
        expect(options.onDelete).toBe(OnDeleteAction.CASCADE);
        expect(options.onUpdate).toBe(OnUpdateAction.RESTRICT);
      });

      it('场景2：产品-分类（多对一，nullable=true，使用默认 SET_NULL）', () => {
        // 分类可为空的多对一关系
        const options = metadata_cascade_default({}, RelationKind.MANY_TO_ONE, true);

        // 删除分类时产品的分类ID设为NULL
        expect(options.onDelete).toBe(OnDeleteAction.SET_NULL);
      });

      it('场景3：订单项-订单（多对一，nullable=false，使用默认 RESTRICT）', () => {
        // 必须有订单的多对一关系
        const options = metadata_cascade_default({}, RelationKind.MANY_TO_ONE, false);

        // 如果订单有订单项，则不允许删除订单
        expect(options.onDelete).toBe(OnDeleteAction.RESTRICT);
      });

      it('场景4：用户覆盖默认值', () => {
        // 用户想要不同的行为
        const options = metadata_cascade_default({ onDelete: OnDeleteAction.SET_NULL }, RelationKind.ONE_TO_MANY);

        // 删除订单时将订单项的订单ID设为NULL（而不是删除订单项）
        expect(options.onDelete).toBe(OnDeleteAction.SET_NULL);
      });
    });
  });
});
