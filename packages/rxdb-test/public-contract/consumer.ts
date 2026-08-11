/**
 * 真实 consumer 编译负载 —— 由 `tsconfig.publish.json`（strict + NodeNext + `paths: {}`）
 * 编译，因此走的是发布物的 `exports` / `types` 解析，而不是工作区源码别名。
 *
 * RXT-028：本文件必须覆盖 `public-contract/baseline.json` 里的**每一个**导出名。
 * 早先只 import 了 11 个符号，其余 41 个的类型入口从未被任何 consumer 校验过 ——
 * `.d.ts` 缺失、种类改变、子路径 types 解析失效都不会让 build 失败。
 * 运行时的名称 / 种类基线由 `scripts/verify-public-contract.mjs` 承担，二者互补。
 */
import {
  cleanupSqliteTestAdapter,
  clearEntityRecords,
  createLockedSeeder,
  expectObservableSequence,
  generateTestDbName,
  getE2eDbName,
  installSearchDemoTestApi,
  makeSearchParityArticles,
  makeSearchParityComments,
  SEARCH_PARITY_ARTICLES,
  SEARCH_PARITY_COMMENTS,
  version,
  withSeedLock
} from '@aiao/rxdb-test';
import {
  ENCRYPTED_SENTINELS,
  EncryptedUser,
  runBigIntBinaryEncryptedSuite,
  runCrudSuite,
  runLifecycleSuite,
  runQueryValidationSuite,
  runTamperSuite,
  SENTINEL_API,
  SENTINEL_CC,
  SENTINEL_JSON
} from '@aiao/rxdb-test/encrypted';
import {
  Article,
  Comment,
  ENTITIES as entityTypes,
  FileLarge,
  FileNode,
  MenuLarge,
  MenuSimple,
  Todo,
  TypeDemo
} from '@aiao/rxdb-test/entities';
import {
  Attribute,
  AttributeValue,
  Category,
  IdCard,
  Order,
  OrderItem,
  Product,
  ENTITIES as shopEntityTypes,
  SKU,
  SKUAttributes,
  User
} from '@aiao/rxdb-test/shop';
import {
  createUnexecutedMigrations,
  freshDbName,
  runBootstrapAtomicitySuite,
  runReadinessSuite,
  runTransactionIsolationSuite,
  TransactionContractFailure,
  TransactionContractNote
} from '@aiao/rxdb-test/transaction';
import {
  runTreeSiblingUniqueSuite,
  TreeFile,
  TreeMenu,
  type TreeSiblingUniqueSuiteOptions,
  type TreeUniqueSuiteDatabase,
  type TreeUniqueSuiteDatabaseOptions,
  type TreeUniqueSuiteFactory
} from '@aiao/rxdb-test/tree-unique';

const todo = new Todo();
const product = new Product();
const encryptedUser = new EncryptedUser();

// tree-unique 的四个类型导出在这里被真实消费：只 import 不使用的话，
// 类型入口解析失败仍能编译通过（RXT-024 的同一教训）。
declare const treeUniqueFactory: TreeUniqueSuiteFactory;
declare const treeUniqueDatabaseOptions: TreeUniqueSuiteDatabaseOptions;
declare const treeUniqueDatabase: TreeUniqueSuiteDatabase;
const treeUniqueOptions: TreeSiblingUniqueSuiteOptions = { factory: treeUniqueFactory };

void [
  // root
  version,
  generateTestDbName,
  getE2eDbName,
  expectObservableSequence,
  cleanupSqliteTestAdapter,
  clearEntityRecords,
  createLockedSeeder,
  installSearchDemoTestApi,
  withSeedLock,
  makeSearchParityArticles,
  makeSearchParityComments,
  SEARCH_PARITY_ARTICLES,
  SEARCH_PARITY_COMMENTS,
  // encrypted
  encryptedUser,
  ENCRYPTED_SENTINELS,
  SENTINEL_API,
  SENTINEL_CC,
  SENTINEL_JSON,
  runBigIntBinaryEncryptedSuite,
  runCrudSuite,
  runLifecycleSuite,
  runQueryValidationSuite,
  runTamperSuite,
  // entities
  entityTypes,
  todo,
  Article,
  Comment,
  FileLarge,
  FileNode,
  MenuLarge,
  MenuSimple,
  TypeDemo,
  // shop
  shopEntityTypes,
  product,
  Attribute,
  AttributeValue,
  Category,
  IdCard,
  Order,
  OrderItem,
  SKU,
  SKUAttributes,
  User,
  // transaction
  runReadinessSuite,
  runTransactionIsolationSuite,
  runBootstrapAtomicitySuite,
  createUnexecutedMigrations,
  freshDbName,
  TransactionContractFailure,
  new TransactionContractNote(),
  // tree-unique
  runTreeSiblingUniqueSuite,
  new TreeFile().name,
  new TreeMenu().title,
  treeUniqueOptions,
  treeUniqueDatabaseOptions.dbName,
  treeUniqueDatabase.countRows
];
