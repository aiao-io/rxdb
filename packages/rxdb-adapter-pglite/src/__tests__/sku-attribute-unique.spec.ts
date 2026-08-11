/**
 * RXT-011：SKU 属性的业务唯一性（PGlite 侧）。
 *
 * `SKUAttributes` 只有三条互不关联的 FK（skuId / attributeId / valueId），
 * 「一个 SKU 上同一个属性出现两次」在库里完全合法。约束必须由数据库承担 ——
 * 应用层去重挡不住并发双写和批量导入。
 * SQLite 侧的同一命题在 `rxdb-adapter-sqlite-core` 的 `shared-crud.suite.ts` 里。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { Attribute, AttributeValue, ENTITIES, IdCard, Product, SKU, SKUAttributes, User } from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

describe('SKU 属性唯一性 (PGlite)', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  let sku: SKU;
  let otherSku: SKU;
  let mismatchSku: SKU;
  let color: Attribute;
  let size: Attribute;
  let colorWhite: AttributeValue;
  let colorBlack: AttributeValue;
  let sizeS: AttributeValue;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');

    const product = new Product({ name: 'RXT-011 T恤', description: 'SKU 属性唯一性夹具' });
    await product.save();

    sku = new SKU({ code: 'RXT011-A', price: 10, stock: 1 });
    sku.product$.set(product);
    await sku.save();

    otherSku = new SKU({ code: 'RXT011-B', price: 10, stock: 1 });
    otherSku.product$.set(product);
    await otherSku.save();

    mismatchSku = new SKU({ code: 'RXT011-C', price: 10, stock: 1 });
    mismatchSku.product$.set(product);
    await mismatchSku.save();

    color = new Attribute({ name: 'RXT011-颜色' });
    size = new Attribute({ name: 'RXT011-尺寸' });
    await color.save();
    await size.save();

    colorWhite = new AttributeValue({ name: 'RXT011-白' });
    colorBlack = new AttributeValue({ name: 'RXT011-黑' });
    sizeS = new AttributeValue({ name: 'RXT011-S' });
    colorWhite.attribute$.set(color);
    colorBlack.attribute$.set(color);
    sizeS.attribute$.set(size);
    await colorWhite.save();
    await colorBlack.save();
    await sizeS.save();
  });

  it('属性值不属于声明属性时会被数据库拒绝', async () => {
    const conflict = new SKUAttributes();
    conflict.sku$.set(mismatchSku);
    conflict.attribute$.set(size);
    conflict.value$.set(colorWhite);

    await expect(conflict.save()).rejects.toThrow();
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  it('同一 SKU 上同一属性再挂一个值会被数据库拒绝', async () => {
    const first = new SKUAttributes();
    first.sku$.set(sku);
    first.attribute$.set(color);
    first.value$.set(colorWhite);
    await first.save();

    // 同一个 (skuId, attributeId)，换个值 —— 这正是「颜色既是白又是黑」的形态
    const conflict = new SKUAttributes();
    conflict.sku$.set(sku);
    conflict.attribute$.set(color);
    conflict.value$.set(colorBlack);

    await expect(conflict.save()).rejects.toThrow();

    const rows = await firstValueFrom(
      SKUAttributes.findAll({
        where: { combinator: 'and', rules: [{ field: 'skuId', operator: '=', value: sku.id }] }
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].valueId).toBe(colorWhite.id);
  });

  it('同一 SKU 上不同属性、以及不同 SKU 复用同一属性都仍然合法', async () => {
    const anotherAttribute = new SKUAttributes();
    anotherAttribute.sku$.set(sku);
    anotherAttribute.attribute$.set(size);
    anotherAttribute.value$.set(sizeS);
    await anotherAttribute.save();

    const anotherSkuSameAttribute = new SKUAttributes();
    anotherSkuSameAttribute.sku$.set(otherSku);
    anotherSkuSameAttribute.attribute$.set(color);
    anotherSkuSameAttribute.value$.set(colorWhite);
    await anotherSkuSameAttribute.save();

    const rows = await firstValueFrom(
      SKUAttributes.findAll({
        where: { combinator: 'and', rules: [{ field: 'skuId', operator: '=', value: sku.id }] }
      })
    );
    expect(rows.map(row => row.attributeId).sort()).toEqual([color.id, size.id].sort());
  });

  it('两用户两卡交叉赋值会被数据库拒绝', async () => {
    const firstUser = new User({ name: 'RXT012-A' });
    const secondUser = new User({ name: 'RXT012-B' });
    await firstUser.save();
    await secondUser.save();

    const firstCard = new IdCard({ code: 'RXT012-CARD-A' });
    firstCard.owner$.set(firstUser);
    await firstCard.save();

    const secondCard = new IdCard({ code: 'RXT012-CARD-B' });
    secondCard.owner$.set(secondUser);
    await secondCard.save();

    await expect(
      adapter.query('UPDATE "shop"."user" SET "idCardId" = $1 WHERE "id" = $2', [secondCard.id, firstUser.id])
    ).rejects.toThrow();
  });
});
