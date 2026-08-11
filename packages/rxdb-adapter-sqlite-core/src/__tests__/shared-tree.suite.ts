import { RxDBError } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';
import { cleanup_db, expect_observable_sequence } from './test-utils.js';

export function treeIntegrationSuite(factory: AdapterFactory) {
  describe(`树结构增量算法测试 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [MenuLarge] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    // ==================== from test-tree-incremental.spec.ts ====================

    describe('树结构增量算法测试 - CREATE 事件', () => {
      afterEach(async () => {
        await adapter.cleanAllCache();
      });

      describe('findDescendants - CREATE 事件增量更新', () => {
        it('应该在创建新子节点时自动更新查询结果', async () => {
          // 1. 创建初始树结构
          const root = new MenuLarge({ title: '根节点' });
          const child1 = new MenuLarge({ title: '子节点1' });
          root.children$.add(child1);
          await root.save();

          const child2 = new MenuLarge({ title: '子节点2' });

          const actions = [
            {
              result: { length: 2, titles: ['根节点', '子节点1'] },
              run: async () => {
                // 创建新的子节点（通过 children$ 关系）
                root.children$.add(child2);
                await child2.save();
              }
            },
            {
              result: { length: 3, titles: ['根节点', '子节点1', '子节点2'] }
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result.length);
                expect(data.map(m => m.title)).toEqual(action.result.titles);
              },
              run: action.run
            }))
          );
        });

        it('应该在创建孙子节点时自动更新查询结果', async () => {
          // 根节点标题必须逐用例唯一：本 describe 只在 afterEach 里 cleanAllCache()（清缓存、不删行），
          // 而 MenuLarge 的 (parentId, title) 现在是数据库级唯一约束（RXT-016）——
          // 根节点的 parentId 都是 NULL，各用例复用同一个标题会直接被 INSERT 拦下。
          // 非根节点不受影响：它们的 parentId 是各自父节点的 id，元组天然不同。
          // 1. 创建初始树结构
          const root = new MenuLarge({ title: '孙子用例根' });
          const child = new MenuLarge({ title: '子节点' });
          root.children$.add(child);
          await root.save();

          const grandchild = new MenuLarge({ title: '孙子节点' });

          const actions = [
            {
              result: { length: 2, titles: ['孙子用例根', '子节点'] },
              run: async () => {
                // 创建孙子节点（通过 children$ 关系）
                child.children$.add(grandchild);
                await grandchild.save();
              }
            },
            {
              result: { length: 3, titles: ['孙子用例根', '子节点', '孙子节点'] }
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result.length);
                expect(data.map(m => m.title)).toEqual(action.result.titles);
              },
              run: action.run
            }))
          );
        });

        it('不应该在创建不相关节点时触发更新', async () => {
          // 1. 创建初始树结构（根节点标题逐用例唯一，理由见上一条用例）
          const root = new MenuLarge({ title: '无关节点用例根' });
          const child = new MenuLarge({ title: '子节点' });
          root.children$.add(child);
          await root.save();

          let callCount = 0;

          return new Promise<void>((resolve, reject) => {
            const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
              next: data => {
                try {
                  callCount++;
                  expect(data.length).toBe(2); // 始终只有 root + child

                  if (callCount === 1) {
                    // 首次订阅后，创建不相关节点
                    const otherRoot = new MenuLarge({ title: '其他根节点' });
                    otherRoot.save().catch(reject);
                    // 等待一段时间确保不会触发第二次更新
                    setTimeout(() => {
                      subscription.unsubscribe();
                      expect(callCount).toBe(1); // 确认只触发了一次
                      resolve();
                    }, 150);
                  } else {
                    // 如果触发了第二次，测试应该失败
                    subscription.unsubscribe();
                    reject(new Error('不应该触发更新'));
                  }
                } catch (error) {
                  subscription.unsubscribe();
                  reject(error);
                }
              },
              error: err => {
                subscription.unsubscribe();
                reject(err);
              }
            });
          });
        });

        it('应该支持 level=1 时只增量更新直接子节点', async () => {
          // 1. 创建初始树结构（根节点标题逐用例唯一，理由见上面的孙子节点用例）
          const root = new MenuLarge({ title: 'level1 用例根' });
          const child = new MenuLarge({ title: '子节点' });
          root.children$.add(child);
          await root.save();

          let callCount = 0;

          return new Promise<void>((resolve, reject) => {
            const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 1 }).subscribe({
              next: data => {
                try {
                  callCount++;
                  expect(data.length).toBe(2); // 始终只有 root + child (level 1)

                  if (callCount === 1) {
                    // 首次订阅后，创建孙子节点（level 2，不应该触发更新）
                    const grandchild = new MenuLarge({ title: '孙子节点' });
                    child.children$.add(grandchild);
                    grandchild.save().catch(reject);
                    // 等待一段时间确保不会触发第二次更新
                    setTimeout(() => {
                      subscription.unsubscribe();
                      expect(callCount).toBe(1); // 确认只触发了一次
                      resolve();
                    }, 150);
                  } else {
                    // 如果触发了第二次，测试应该失败
                    subscription.unsubscribe();
                    reject(new Error('level=1 时不应该因为孙子节点而触发更新'));
                  }
                } catch (error) {
                  subscription.unsubscribe();
                  reject(error);
                }
              },
              error: err => {
                subscription.unsubscribe();
                reject(err);
              }
            });
          });
        });

        it('应该支持批量创建多个后代节点', async () => {
          // 1. 创建初始树结构（根节点标题逐用例唯一，理由见上面的孙子节点用例）
          const root = new MenuLarge({ title: '批量用例根' });
          await root.save();

          const child1 = new MenuLarge({ title: '子节点1' });
          const child2 = new MenuLarge({ title: '子节点2' });

          const actions = [
            {
              result: { length: 1 }, // 只有 root
              run: async () => {
                // 创建第一个子节点
                root.children$.add(child1);
                await child1.save();
              }
            },
            {
              result: { length: 2 }, // root + child1
              run: async () => {
                // 创建第二个子节点
                root.children$.add(child2);
                await child2.save();
              }
            },
            {
              result: { minLength: 3, titles: ['子节点1', '子节点2', '批量用例根'] } // root + child1 + child2
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                if (action.result.minLength !== undefined) {
                  expect(data.length).toBeGreaterThanOrEqual(action.result.minLength);
                  expect(data.map(m => m.title).sort()).toEqual(action.result.titles!.sort());
                  return;
                }

                expect(data.length).toBe(action.result.length);
              },
              run: action.run
            }))
          );
        });

        it('应该在查询根节点时增量添加新的根节点', async () => {
          // 1. 创建初始根节点
          const root1 = new MenuLarge({ title: '根节点1' });
          await root1.save();

          const root2 = new MenuLarge({ title: '根节点2' });

          const actions = [
            {
              validate: (data: MenuLarge[]) => {
                const initialCount = data.length;
                expect(initialCount).toBeGreaterThanOrEqual(1);
                return initialCount;
              },
              run: async () => {
                // 创建新的根节点
                await root2.save();
              }
            },
            {
              validate: (data: MenuLarge[], prevCount?: number) => {
                expect(data.length).toBe((prevCount || 0) + 1);
              }
            }
          ];

          let prevCount: number | undefined;
          await expect_observable_sequence(
            MenuLarge.findDescendants({ level: 100 }),
            actions.map(action => ({
              validate: data => {
                const result = action.validate(data, prevCount);
                if (result !== undefined) {
                  prevCount = result;
                }
              },
              run: action.run
            }))
          );
        });
      });

      describe('level 契约', () => {
        it('不传 level：端到端只返回当前节点（FindTreeOptions 的 @default 0）', async () => {
          const root = new MenuLarge({ title: '默认层级根' });
          const child = new MenuLarge({ title: '默认层级子' });
          root.children$.add(child);
          await root.save();

          const data = await firstValueFrom(MenuLarge.findDescendants({ entityId: root.id }));

          expect(data.map(item => item.title)).toEqual(['默认层级根']);
        });

        it('level 非法：同步抛错，不进入 SQL 生成', async () => {
          const root = new MenuLarge({ title: '注入探针根' });
          await root.save();

          const injection = '1; DROP TABLE public$menu_large --' as unknown as number;

          expect(() => MenuLarge.findDescendants({ entityId: root.id, level: injection })).toThrow(RxDBError);
          expect(() => MenuLarge.countDescendants({ entityId: root.id, level: injection })).toThrow(RxDBError);
          expect(() => MenuLarge.findAncestors({ entityId: root.id, level: injection })).toThrow(RxDBError);
          expect(() => MenuLarge.countAncestors({ entityId: root.id, level: injection })).toThrow(RxDBError);
        });
      });

      describe('边界情况测试', () => {
        it('应该处理空初始结果的情况', async () => {
          // 1. 创建一个没有子节点的根节点
          const root = new MenuLarge({ title: '孤立根节点' });
          await root.save();

          const child = new MenuLarge({ title: '第一个子节点' });

          const actions = [
            {
              result: { length: 1 }, // 只有 root
              run: async () => {
                // 创建第一个子节点（通过 children$ 关系）
                root.children$.add(child);
                await child.save();
              }
            },
            {
              result: { length: 2 } // root + child
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result.length);
              },
              run: action.run
            }))
          );
        });

        it('应该处理深层嵌套的情况', async () => {
          // 1. 创建初始深层结构（根节点标题逐用例唯一，理由见上面的孙子节点用例）
          const root = new MenuLarge({ title: '深层嵌套根' });
          const level1 = new MenuLarge({ title: 'Level 1' });
          const level2 = new MenuLarge({ title: 'Level 2' });
          const level3 = new MenuLarge({ title: 'Level 3' });

          root.children$.add(level1);
          level1.children$.add(level2);
          level2.children$.add(level3);
          await root.save();

          const level4 = new MenuLarge({ title: 'Level 4' });

          const actions = [
            {
              result: { length: 4 }, // root + level1 + level2 + level3
              run: async () => {
                // 在最深层添加新节点（通过 children$ 关系）
                level3.children$.add(level4);
                await level4.save();
              }
            },
            {
              result: { length: 5 } // root + level1 + level2 + level3 + level4
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result.length);
              },
              run: action.run
            }))
          );
        });
      });
    });

    // ==================== from test-tree-incremental-ancestors-count.spec.ts ====================

    describe('树结构增量算法测试 - Ancestors 与 Count', () => {
      afterEach(async () => {
        await adapter.cleanAllCache();
      });

      it('findAncestors 订阅：父级变更应触发增量更新（包含当前节点）', async () => {
        // 初始结构：root -> child -> grand
        const root = new MenuLarge({ title: 'root' });
        const child = new MenuLarge({ title: 'child' });
        const grand = new MenuLarge({ title: 'grand' });
        root.children$.add(child);
        child.children$.add(grand);
        await root.save();

        const actions = [
          {
            result: ['child', 'grand'], // 初始：包含自身 grand（level=0）+ 直接父级 child（level=1）
            run: async () => {
              grand.parentId = root.id;
              await grand.save();
            }
          },
          {
            result: ['grand', 'root'],
            run: async () => {
              grand.parentId = child.id;
              await grand.save();
            }
          },
          {
            result: ['child', 'grand']
          }
        ];

        await expect_observable_sequence(
          MenuLarge.findAncestors({ entityId: grand.id, level: 1 }),
          actions.map(action => ({
            validate: data => {
              const titles = data.map(item => item.title).sort();
              expect(titles).toEqual(action.result.sort());
            },
            run: action.run
          }))
        );
      });

      it('countDescendants 订阅：新增/删除应更新计数', async () => {
        // 上一条用例已经占用了根节点标题 `root`，本 describe 只 cleanAllCache() 不删行，
        // (parentId, title) 唯一后不能再重名（RXT-016）。
        const root = new MenuLarge({ title: 'count-root' });
        await root.save();

        const c1 = new MenuLarge({ title: 'c1' });
        const c2 = new MenuLarge({ title: 'c2' });

        const actions = [
          {
            result: 0, // 初始计数（不包含自身）
            run: async () => {
              // 新增第一个子节点
              root.children$.add(c1);
              await c1.save();
            }
          },
          {
            result: 1, // c1 已添加
            run: async () => {
              // 新增第二个子节点
              root.children$.add(c2);
              await c2.save();
            }
          },
          {
            result: 2, // c1 + c2
            run: async () => {
              // 删除 c1
              await c1.remove();
            }
          },
          {
            result: 1 // 只剩 c2
          }
        ];

        await expect_observable_sequence(
          MenuLarge.countDescendants({ entityId: root.id, level: 100 }),
          actions.map(action => ({
            validate: count => {
              expect(count).toBe(action.result);
            },
            run: action.run
          }))
        );
      });
    });

    // ==================== from test-tree-incremental-remove.spec.ts ====================

    describe('树结构增量算法测试 - REMOVE 事件', () => {
      // 本组用例假定表是空的（标题 `root` / `child` 在组内反复出现），
      // 但前面几组只 cleanAllCache()、不删行，留下的根节点会撞上
      // MenuLarge 的 (parentId, title) 唯一约束（RXT-016）。
      // afterEach 只保证「组内每条用例之后干净」，进组的第一条用例得靠这里兜住。
      beforeAll(async () => {
        await cleanup_db(adapter);
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      describe('findDescendants - 删除增量更新', () => {
        it('删除叶子节点应从结果中移除', async () => {
          const root = new MenuLarge({ title: 'root' });
          const child1 = new MenuLarge({ title: 'child1' });
          const child2 = new MenuLarge({ title: 'child2' });
          root.children$.add(child1);
          root.children$.add(child2);
          await root.save();

          const actions = [
            {
              result: 3, // root + child1 + child2
              run: async () => {
                await child1.remove();
              }
            },
            {
              result: 2 // root + child2
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result);
              },
              run: action.run
            }))
          );
        });

        it('删除中间节点应连带移除其所有后代', async () => {
          // root -> child -> grand1, grand2
          const root = new MenuLarge({ title: 'root' });
          const child = new MenuLarge({ title: 'child' });
          const grand1 = new MenuLarge({ title: 'grand1' });
          const grand2 = new MenuLarge({ title: 'grand2' });
          root.children$.add(child);
          child.children$.add(grand1);
          child.children$.add(grand2);
          await root.save();

          const actions = [
            {
              result: 4, // root + child + grand1 + grand2
              run: async () => {
                await child.remove();
              }
            },
            {
              result: 1 // CASCADE 删除：删除 child 立即级联删除 grand1 和 grand2，仅 root 保留
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result);
              },
              run: action.run
            }))
          );
        });

        it('删除非后代不应触发更新', async () => {
          const root = new MenuLarge({ title: 'root' });
          const child = new MenuLarge({ title: 'child' });
          root.children$.add(child);
          await root.save();

          const otherRoot = new MenuLarge({ title: 'other' });
          await otherRoot.save();

          const lengths: number[] = [];
          const sub = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe(d =>
            lengths.push(d.length)
          );

          // 等待初始订阅
          await new Promise(r => setTimeout(r, 120));
          expect(lengths[0]).toBe(2); // root + child

          // 删除非后代节点
          await otherRoot.remove();
          await new Promise(r => setTimeout(r, 150));

          // 不应触发新的推送，长度数组应该仍然只有1个元素
          expect(lengths.length).toBe(1);
          expect(lengths[0]).toBe(2);

          sub.unsubscribe();
        });

        it('level=1：删除直接子节点应更新结果', async () => {
          const root = new MenuLarge({ title: 'root' });
          const child = new MenuLarge({ title: 'child' });
          const grand = new MenuLarge({ title: 'grand' });
          root.children$.add(child);
          child.children$.add(grand);
          await root.save();

          const actions = [
            {
              result: 2, // root + child (level=1 不包含 grand)
              run: async () => {
                await child.remove();
              }
            },
            {
              result: 1 // 仅 root
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: root.id, level: 1 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result);
              },
              run: action.run
            }))
          );
        });

        it('不传 entityId：删除根节点应从结果中移除', async () => {
          const root1 = new MenuLarge({ title: 'root1' });
          const root2 = new MenuLarge({ title: 'root2' });
          const root3 = new MenuLarge({ title: 'root3' });
          await root1.save();
          await root2.save();
          await root3.save();

          const actions = [
            {
              result: 3, // 3 个根节点
              run: async () => {
                await root2.remove();
              }
            },
            {
              result: 2 // root1 + root3
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result);
              },
              run: action.run
            }))
          );
        });

        it('不传 entityId：删除子节点应触发更新（从结果中移除）', async () => {
          const root1 = new MenuLarge({ title: 'root1' });
          const child = new MenuLarge({ title: 'child' });
          root1.children$.add(child);
          await root1.save();

          const root2 = new MenuLarge({ title: 'root2' });
          await root2.save();

          const actions = [
            {
              result: 3, // root1 + child + root2（包含所有根节点及其后代）
              run: async () => {
                // 删除子节点，应该触发更新
                await child.remove();
              }
            },
            {
              result: 2 // root1 + root2
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result);
              },
              run: action.run
            }))
          );
        });

        it('entityId 为 null：删除根节点应从结果中移除', async () => {
          const root1 = new MenuLarge({ title: 'root1' });
          const root2 = new MenuLarge({ title: 'root2' });
          await root1.save();
          await root2.save();

          const actions = [
            {
              result: 2, // root1 + root2
              run: async () => {
                await root1.remove();
              }
            },
            {
              result: 1 // 仅 root2
            }
          ];

          await expect_observable_sequence(
            MenuLarge.findDescendants({ entityId: null, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result);
              },
              run: action.run
            }))
          );
        });
      });
    });

    // ==================== from test-tree-incremental-update.spec.ts ====================

    describe('树结构增量算法测试 - UPDATE 事件', () => {
      beforeEach(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [MenuLarge] });
      });

      afterEach(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      describe('findDescendants - UPDATE 增量更新', () => {
        it('更新实体字段值（不改变层级）应推送增量结果', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          // 1. 初始树
          const root = new MenuLarge({ title: 'root' });
          const child = new MenuLarge({ title: 'child-old' });
          root.children$.add(child);
          await root.save();

          const actions = [
            {
              result: ['child-old', 'root'], // 初始状态
              run: async () => {
                // 更新子节点标题（不改变 parentId）
                child.title = 'child-new';
                await child.save();
              }
            },
            {
              result: ['child-new', 'root'] // 更新后
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(m => m.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });

        it('当节点脱离后代树时应从结果中移除', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          // root -> child
          const root = new MenuLarge({ title: 'root' });
          const child = new MenuLarge({ title: 'child' });
          root.children$.add(child);
          await root.save();

          // 另一个根
          const otherRoot = new MenuLarge({ title: 'otherRoot' });
          await otherRoot.save();

          const actions = [
            {
              result: 2, // root + child
              run: async () => {
                // 将 child 移到 otherRoot 之下
                otherRoot.children$.add(child);
                await child.save();
              }
            },
            {
              result: 1 // 结果应只剩 root 本身
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result);
              },
              run: action.run
            }))
          );
        });

        it('当节点成为后代时应被增量添加', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          // root 与独立节点
          const root = new MenuLarge({ title: 'root' });
          await root.save();
          const alone = new MenuLarge({ title: 'alone' });
          await alone.save();

          const actions = [
            {
              result: 1, // 仅 root
              run: async () => {
                // 将 alone 挂到 root
                root.children$.add(alone);
                await alone.save();
              }
            },
            {
              result: 2 // root + alone
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ entityId: root.id, level: 100 }),
            actions.map(action => ({
              validate: data => {
                expect(data.length).toBe(action.result);
              },
              run: action.run
            }))
          );
        });

        it('level=1 时，移动到第二层的节点不应出现在结果中', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          // root -> child -> grand
          const root = new MenuLarge({ title: 'root' });
          const child = new MenuLarge({ title: 'child' });
          const grand = new MenuLarge({ title: 'grand' });
          root.children$.add(child);
          child.children$.add(grand);
          await root.save();

          const actions = [
            {
              result: ['child', 'root'], // 初始：level=1 只包含 root 和 child
              run: async () => {
                // 将 grand 升级为 root 的直接子节点（应进入 level=1 结果）
                root.children$.add(grand);
                await grand.save();
              }
            },
            {
              result: ['child', 'grand', 'root'], // 现在应包含 grand
              run: async () => {
                // 再将 grand 挂回 child（应从 level=1 结果移除）
                child.children$.add(grand);
                await grand.save();
              }
            },
            {
              result: ['child', 'root'] // grand 不在 level=1 中了
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ entityId: root.id, level: 1 }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(x => x.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });

        it('where 条件：字段更新使实体从不匹配变为匹配应被添加', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          const root = new MenuLarge({ title: 'root' });
          const child = new MenuLarge({ title: 'no-match' });
          root.children$.add(child);
          await root.save();

          const actions = [
            {
              result: ['root'], // 初始只有 root 匹配（因为 root 的 title 不是 'match'）
              run: async () => {
                // 更新 child 使其匹配 where
                child.title = 'match';
                await child.save();
              }
            },
            {
              result: ['match', 'root'] // 现在应包含 child
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({
              entityId: root.id,
              level: 100,
              where: { combinator: 'and', rules: [{ field: 'children.title', operator: '=', value: 'match' }] }
            }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(x => x.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });

        it('where 条件：裸字段（无 children. 前缀）过滤递归成员应正确工作', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          const root = new MenuLarge({ title: 'root' });
          const child = new MenuLarge({ title: 'no-match' });
          root.children$.add(child);
          await root.save();

          const actions = [
            {
              // 递归成员 where 只过滤子节点，root 作为锚点始终保留
              result: ['root'],
              run: async () => {
                child.title = 'match';
                await child.save();
              }
            },
            {
              result: ['match', 'root']
            }
          ];

          // 使用裸字段 `title`（而非 `children.title`）：修复前会生成 `_."title"`，
          // 在递归成员中触发 “no such column: _” 运行时错误；修复后应绑定到 `"children"."title"`。
          await expect_observable_sequence(
            repository.findDescendants({
              entityId: root.id,
              level: 100,
              where: { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'match' }] }
            }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(x => x.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });

        it('不传 entityId：更新根节点字段应触发增量更新', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          const root1 = new MenuLarge({ title: 'root1-old' });
          const root2 = new MenuLarge({ title: 'root2' });
          await root1.save();
          await root2.save();

          const actions = [
            {
              result: ['root1-old', 'root2'], // 初始状态
              run: async () => {
                // 更新 root1 的标题
                root1.title = 'root1-new';
                await root1.save();
              }
            },
            {
              result: ['root1-new', 'root2'] // 更新后
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ level: 100 }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(x => x.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });

        it('不传 entityId：更新子节点字段应触发增量更新', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          const root1 = new MenuLarge({ title: 'root1' });
          const child = new MenuLarge({ title: 'child-old' });
          root1.children$.add(child);
          await root1.save();

          const root2 = new MenuLarge({ title: 'root2' });
          await root2.save();

          const actions = [
            {
              result: ['child-old', 'root1', 'root2'], // 初始状态
              run: async () => {
                // 更新子节点
                child.title = 'child-new';
                await child.save();
              }
            },
            {
              result: ['child-new', 'root1', 'root2'] // 更新后
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ level: 100 }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(x => x.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });

        it('不传 entityId：子节点层级变化应触发更新', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          const root1 = new MenuLarge({ title: 'root1' });
          const child = new MenuLarge({ title: 'child' });
          root1.children$.add(child);
          await root1.save();

          const root2 = new MenuLarge({ title: 'root2' });
          await root2.save();

          const actions = [
            {
              result: ['child', 'root1', 'root2'], // 初始状态
              run: async () => {
                // 将 child 从 root1 移到 root2
                root2.children$.add(child);
                await child.save();
              }
            },
            {
              result: ['child', 'root1', 'root2'] // child 仍然在结果中（现在是 root2 的子节点）
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ level: 100 }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(x => x.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });

        it('不传 entityId：根节点变为子节点应保持在结果中', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          const root1 = new MenuLarge({ title: 'root1' });
          const root2 = new MenuLarge({ title: 'root2' });
          await root1.save();
          await root2.save();

          const actions = [
            {
              result: ['root1', 'root2'], // 初始状态
              run: async () => {
                // 将 root2 挂到 root1 下（从根节点变为子节点）
                root1.children$.add(root2);
                await root2.save();
              }
            },
            {
              result: ['root1', 'root2'] // root2 仍然在结果中（现在作为 root1 的后代）
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ level: 100 }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(x => x.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });

        it('entityId 为 null：更新根节点应触发增量更新', async () => {
          const repository = adapter.rxdb.entityManager.getRepository(MenuLarge) as unknown as Pick<
            typeof MenuLarge,
            'findDescendants'
          >;
          const root1 = new MenuLarge({ title: 'root1-old' });
          const root2 = new MenuLarge({ title: 'root2' });
          await root1.save();
          await root2.save();

          const actions = [
            {
              result: ['root1-old', 'root2'], // 初始状态
              run: async () => {
                // 更新 root1
                root1.title = 'root1-new';
                await root1.save();
              }
            },
            {
              result: ['root1-new', 'root2'] // 更新后
            }
          ];

          await expect_observable_sequence(
            repository.findDescendants({ entityId: null, level: 100 }),
            actions.map(action => ({
              validate: data => {
                const titles = data.map(x => x.title).sort();
                expect(titles).toEqual(action.result.sort());
              },
              run: action.run
            }))
          );
        });
      });
    });
  });
}
