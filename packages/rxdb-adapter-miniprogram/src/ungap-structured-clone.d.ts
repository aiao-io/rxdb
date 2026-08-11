declare module '@ungap/structured-clone' {
  type Serialized = unknown[];

  export function serialize(value: unknown): Serialized;
  export function deserialize<T>(serialized: Serialized): T;
}
