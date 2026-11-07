import { InjectionToken } from '@angular/core';
import type { GeneratedFile } from '../interfaces/designer.interface';

/** 可参与客户端包兼容性判定的字段契约。 */
export interface ClientDesignProperty {
  /** 逻辑字段名。 */
  name: string;
  /** 物理列名。 */
  columnName?: string;
  /** RxDB 字段类型。 */
  type: string;
  /** 字段是否必填。 */
  required?: boolean;
  /** 字段是否可空。 */
  nullable?: boolean;
  /** 字段是否唯一。 */
  unique?: boolean;
}

/** 可参与客户端包兼容性判定的关系契约。 */
export interface ClientDesignRelation {
  /** 关系名。 */
  name: string;
  /** 关系类型。 */
  kind: string;
  /** 目标实体名。 */
  mappedEntity: string;
  /** 目标属性名。 */
  mappedProperty?: string;
}

/** 单个设计实体的发布契约。 */
export interface ClientDesignEntity {
  /** 实体名。 */
  name: string;
  /** 实体命名空间。 */
  namespace?: string;
  /** 物理表名。 */
  tableName?: string;
  /** 实体字段。 */
  properties: ClientDesignProperty[];
  /** 实体关系。 */
  relations: ClientDesignRelation[];
}

/** 用于 revision 与版本判定的规范化设计契约。 */
export interface ClientDesignContract {
  /** 设计实体集合。 */
  entities: ClientDesignEntity[];
  /** 不改变运行兼容性的设计元数据。 */
  metadata: Record<string, string>;
}

/** 客户端包打包或发布请求。 */
export interface ClientPackageRequest {
  /** 符合 `@scope/project-rxdb` 的包名。 */
  packageName: string;
  /** 上游生成器产生的 JavaScript 与声明文件。 */
  generatedFiles: GeneratedFile[];
  /** 当前设计契约。 */
  designContract: ClientDesignContract;
}

/** 可下载的客户端包归档。 */
export interface ClientPackageArchive {
  /** tgz 二进制。 */
  blob: Blob;
  /** 最终包名。 */
  packageName: string;
  /** 最终 semver。 */
  version: string;
  /** 当前设计 revision。 */
  designRevision: string;
  /** 建议下载文件名。 */
  filename: string;
}

/** 成功发布到 registry 的结果。 */
export interface ClientPackagePublication {
  /** 最终包名。 */
  packageName: string;
  /** registry 中的新版本。 */
  version: string;
  /** 当前设计 revision。 */
  designRevision: string;
  /** 只有 npm publish 成功才返回 published。 */
  status: 'published';
}

/** 宿主应用提供的客户端包归档与发布能力。 */
export interface ClientPackageAdapter {
  /** 构建可安装 tgz。 */
  archive(request: ClientPackageRequest): Promise<ClientPackageArchive>;
  /** 发布到服务端配置的私有 registry。 */
  publish(request: ClientPackageRequest): Promise<ClientPackagePublication>;
}

/** 注入宿主侧客户端包 API adapter。 */
export const CLIENT_PACKAGE_ADAPTER = new InjectionToken<ClientPackageAdapter>('CLIENT_PACKAGE_ADAPTER');
