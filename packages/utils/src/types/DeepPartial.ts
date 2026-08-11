/**
 * 创建一个类型的深度部分类型
 * 所有属性（包括嵌套对象和数组元素的属性）都变为可选
 *
 * @template T - 要创建深度部分类型的原始类型
 * @example
 * // 基本用法
 * interface User {
 *   name: string;
 *   age: number;
 *   address: {
 *     street: string;
 *     city: string;
 *   };
 *   hobbies: string[];
 * }
 *
 * // 深度部分类型
 * const partialUser: DeepPartial<User> = {
 *   name: 'John',
 *   address: {
 *     street: 'Main St',
 *   },
 *   hobbies: ['reading'],
 * };
 *
 * @example
 * // 嵌套数组
 * interface Data {
 *   items: {
 *     id: number;
 *     name: string;
 *   }[];
 * }
 *
 * const partialData: DeepPartial<Data> = {
 *   items: [{
 *     id: 1,
 *   }],
 * };
 *
 * **注意：** 此类型递归地将所有属性变为可选，包括嵌套对象和数组元素
 * **注意：** 对于数组类型，会递归应用到数组元素的类型
 * **注意：** 对于只读数组，保持其只读特性的同时递归应用到元素类型
 */
export declare type DeepPartial<T> = {
  /**
   * 将类型T的每个属性变为可选，并递归应用DeepPartial
   * @typeParam P - 类型T的属性键
   */
  [P in keyof T]?: T[P] extends Array<infer U> ?
    Array<DeepPartial<U>> // 处理数组类型
  : T[P] extends ReadonlyArray<infer UE> ?
    ReadonlyArray<DeepPartial<UE>> // 处理只读数组类型
  : DeepPartial<T[P]>; // 递归处理嵌套对象
};
