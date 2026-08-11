/**
 * columnName 支持测试 - PGlite 适配器
 *
 * 验证当属性或关系使用自定义 columnName 时，
 * PGlite 适配器在建表、CRUD、查询等环节是否正确使用数据库列名
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEntityObjectFromResult, normalizeCreateEntity, transformEntityValueToSql } from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import create_table_sql from '../table/create_table_sql.js';

// -- 测试实体定义 --

@Entity({
  name: 'PgDepartment',
  properties: [
    { name: 'deptName', type: PropertyType.string, columnName: 'dept_name' },
    { name: 'deptCode', type: PropertyType.string, columnName: 'dept_code', unique: true }
  ]
})
class PgDepartment extends EntityBase {
  deptName!: string;
  deptCode!: string;
}

@Entity({
  name: 'PgEmployee',
  properties: [
    { name: 'firstName', type: PropertyType.string, columnName: 'first_name' },
    { name: 'lastName', type: PropertyType.string, columnName: 'last_name' },
    { name: 'hireDate', type: PropertyType.date, columnName: 'hire_date' },
    { name: 'isActive', type: PropertyType.boolean, columnName: 'is_active', default: true },
    { name: 'salary', type: PropertyType.number, columnName: 'base_salary' },
    { name: 'level', type: PropertyType.integer, columnName: 'job_level', default: 1 }
  ],
  relations: [
    {
      name: 'department',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PgDepartment',
      mappedProperty: 'employees',
      columnName: 'dept_id'
    }
  ]
})
class PgEmployee extends EntityBase {
  firstName!: string;
  lastName!: string;
  hireDate!: Date;
  isActive!: boolean;
  salary!: number;
  level!: number;
  departmentId!: string;
}

@Entity({
  name: 'PgProfile',
  properties: [{ name: 'bio', type: PropertyType.string, columnName: 'biography' }],
  relations: [
    {
      name: 'employee',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'PgEmployee',
      mappedProperty: 'profile',
      columnName: 'emp_id'
    }
  ]
})
class PgProfile extends EntityBase {
  bio!: string;
  employeeId!: string;
}

// -- 测试 --

describe('PGlite 适配器 - columnName 支持', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `pg-column-name-test-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [PgDepartment, PgEmployee, PgProfile],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });

    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  describe('CREATE TABLE SQL 生成', () => {
    it('属性 columnName 应出现在 CREATE TABLE 中', async () => {
      const metadata = getEntityMetadata(PgEmployee);
      const sql = create_table_sql(adapter, metadata);

      // 应使用 columnName（数据库列名），而非 JS 属性名
      expect(sql).toContain('"first_name"');
      expect(sql).toContain('"last_name"');
      expect(sql).toContain('"hire_date"');
      expect(sql).toContain('"is_active"');
      expect(sql).toContain('"base_salary"');
      expect(sql).toContain('"job_level"');

      // JS 属性名不应出现在列定义中
      expect(sql).not.toMatch(/"firstName"/);
      expect(sql).not.toMatch(/"lastName"/);
      expect(sql).not.toMatch(/"hireDate"/);
      expect(sql).not.toMatch(/"isActive"/);
    });

    it('关系 columnName 应出现在外键列定义中', async () => {
      const metadata = getEntityMetadata(PgEmployee);
      const sql = create_table_sql(adapter, metadata);

      // 应使用自定义的 columnName
      expect(sql).toContain('"dept_id"');
      // 不应使用默认的 name + 'Id'
      expect(sql).not.toMatch(/"departmentId"/);
    });

    it('ONE_TO_ONE 关系自定义 columnName', async () => {
      const metadata = getEntityMetadata(PgProfile);
      const sql = create_table_sql(adapter, metadata);

      expect(sql).toContain('"emp_id"');
      expect(sql).toContain('"biography"');
      expect(sql).not.toMatch(/"employeeId"/);
      expect(sql).not.toMatch(/"bio"/);
    });

    it('唯一索引应使用 columnName', async () => {
      const metadata = getEntityMetadata(PgDepartment);
      const sql = create_table_sql(adapter, metadata);

      expect(sql).toContain('"dept_name"');
      expect(sql).toContain('"dept_code"');
    });
  });

  describe('transformEntityValueToSql - JS→SQL 转换', () => {
    it('属性应映射到 columnName', async () => {
      const metadata = getEntityMetadata(PgEmployee);
      const entity = {
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        salary: 50000,
        level: 3
      };

      const result = await transformEntityValueToSql(metadata, entity);

      // 结果的 key 应该是数据库列名
      expect(result).toHaveProperty('first_name', 'John');
      expect(result).toHaveProperty('last_name', 'Doe');
      expect(result).toHaveProperty('is_active');
      expect(result).toHaveProperty('base_salary');
      expect(result).toHaveProperty('job_level');

      // 不应包含 JS 属性名
      expect(result).not.toHaveProperty('firstName');
      expect(result).not.toHaveProperty('lastName');
      expect(result).not.toHaveProperty('isActive');
      expect(result).not.toHaveProperty('salary');
      expect(result).not.toHaveProperty('level');
    });

    it('外键应映射到 relation.columnName', async () => {
      const metadata = getEntityMetadata(PgEmployee);
      const entity = {
        firstName: 'John',
        departmentId: 'dept-1'
      };

      const result = await transformEntityValueToSql(metadata, entity);

      // 外键应该使用 relation.columnName
      expect(result).toHaveProperty('dept_id', 'dept-1');
      expect(result).not.toHaveProperty('departmentId');
    });
  });

  describe('normalizeCreateEntity', () => {
    it('创建数据应使用 columnName 作为键', async () => {
      const metadata = getEntityMetadata(PgEmployee);
      const entity = {
        firstName: 'Jane',
        lastName: 'Smith',
        departmentId: 'dept-2'
      };

      const result = normalizeCreateEntity(metadata, entity);

      expect(result).toHaveProperty('first_name', 'Jane');
      expect(result).toHaveProperty('last_name', 'Smith');
      expect(result).toHaveProperty('dept_id', 'dept-2');

      expect(result).not.toHaveProperty('firstName');
      expect(result).not.toHaveProperty('lastName');
      expect(result).not.toHaveProperty('departmentId');
    });
  });

  describe('getEntityObjectFromResult - SQL→JS 反转换', () => {
    it('应将 columnName 映射回 JS 属性名', async () => {
      const metadata = getEntityMetadata(PgEmployee);
      const row = {
        id: 'emp-1',
        first_name: 'John',
        last_name: 'Doe',
        is_active: true,
        base_salary: '50000',
        job_level: '3',
        dept_id: 'dept-1'
      };

      const result = await getEntityObjectFromResult(metadata, row);

      // 结果的 key 应该是 JS 属性名
      expect(result).toHaveProperty('id', 'emp-1');
      expect(result).toHaveProperty('firstName', 'John');
      expect(result).toHaveProperty('lastName', 'Doe');
      expect(result).toHaveProperty('isActive', true);
      expect(result).toHaveProperty('salary');
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('departmentId', 'dept-1');

      // 不应包含数据库列名
      expect(result).not.toHaveProperty('first_name');
      expect(result).not.toHaveProperty('last_name');
      expect(result).not.toHaveProperty('dept_id');
    });
  });

  describe('端到端 CRUD', () => {
    let dept: PgDepartment;

    it('创建实体应正确使用 columnName', async () => {
      dept = new PgDepartment();
      dept.deptName = '研发部';
      dept.deptCode = 'RD001';
      await dept.save();

      const found = await firstValueFrom(PgDepartment.get(dept.id));
      expect(found.deptName).toBe('研发部');
      expect(found.deptCode).toBe('RD001');
    });

    it('带关系的实体创建', async () => {
      const emp = new PgEmployee();
      emp.firstName = '张';
      emp.lastName = '三';
      emp.hireDate = new Date('2024-01-15');
      emp.isActive = true;
      emp.salary = 15000;
      emp.level = 2;
      emp.departmentId = dept.id;
      await emp.save();

      const found = await firstValueFrom(PgEmployee.get(emp.id));
      expect(found.firstName).toBe('张');
      expect(found.lastName).toBe('三');
      expect(found.isActive).toBe(true);
      expect(found.salary).toBe(15000);
      expect(found.level).toBe(2);
      expect(found.departmentId).toBe(dept.id);
    });

    it('更新实体应正确使用 columnName', async () => {
      const emp = new PgEmployee();
      emp.firstName = '李';
      emp.lastName = '四';
      emp.hireDate = new Date('2024-03-01');
      emp.salary = 12000;
      emp.level = 1;
      emp.departmentId = dept.id;
      await emp.save();

      emp.firstName = '李_updated';
      emp.salary = 15000;
      await emp.save();

      const found = await firstValueFrom(PgEmployee.get(emp.id));
      expect(found.firstName).toBe('李_updated');
      expect(found.salary).toBe(15000);
    });

    it('查询应支持通过自定义 columnName 字段过滤', async () => {
      const found = await firstValueFrom(
        PgEmployee.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'firstName',
                operator: '=',
                value: '张'
              }
            ]
          }
        })
      );
      expect(found.length).toBe(1);
      expect(found[0].firstName).toBe('张');
    });

    it('count 查询应支持自定义 columnName 字段', async () => {
      const count = await firstValueFrom(
        PgEmployee.count({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'isActive',
                operator: '=',
                value: true
              }
            ]
          }
        })
      );
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('ONE_TO_ONE 关系 CRUD', async () => {
      const emp = new PgEmployee();
      emp.firstName = '王';
      emp.lastName = '五';
      emp.hireDate = new Date('2024-06-01');
      emp.salary = 20000;
      emp.level = 3;
      emp.departmentId = dept.id;
      await emp.save();

      const profile = new PgProfile();
      profile.bio = '资深工程师';
      profile.employeeId = emp.id;
      await profile.save();

      const found = await firstValueFrom(PgProfile.get(profile.id));
      expect(found.bio).toBe('资深工程师');
      expect(found.employeeId).toBe(emp.id);
    });
  });
});
