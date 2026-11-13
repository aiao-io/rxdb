/** 平台任务原始响应的本机解析协议，不暴露上游地址或型号。 */
export type ImageResponseProtocol = 'openai' | 'minimax';
/** 用户可见的平台模型及每次单张生成预占的积分。 */
export interface PlatformModel {
  id: string;
  name: string;
  credits: number;
  protocol: ImageResponseProtocol;
}
/** 严格读取公开目录；未知字段和重复模型不能进入界面或本机记录。 */
export function validatePlatformModels(value: unknown): PlatformModel[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join() !== 'models')
    throw new Error('平台模型目录无效。');
  const models: unknown = Reflect.get(value, 'models');
  if (!Array.isArray(models) || models.length > 20) throw new Error('平台模型目录无效。');
  const ids = new Set<string>();
  return models.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).sort().join() !== 'credits,id,name,protocol'
    )
      throw new Error('平台模型目录无效。');
    const model = item as PlatformModel;
    if (
      typeof model.id !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,80}$/.test(model.id) ||
      ids.has(model.id) ||
      typeof model.name !== 'string' ||
      !model.name.trim() ||
      model.name.length > 80 ||
      !Number.isSafeInteger(model.credits) ||
      model.credits < 1 ||
      model.credits > 100000 ||
      !['openai', 'minimax'].includes(model.protocol)
    )
      throw new Error('平台模型目录无效。');
    ids.add(model.id);
    return { id: model.id, name: model.name, credits: model.credits, protocol: model.protocol };
  });
}
