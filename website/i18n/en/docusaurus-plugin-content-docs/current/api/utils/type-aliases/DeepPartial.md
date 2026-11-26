---
sidebar_label: "DeepPartial⟨T⟩"
---

# DeepPartial`<T>`

```ts
type DeepPartial<T> = { [P in keyof T]?: T[P] extends (infer U)[] ? DeepPartial<U>[] : T[P] extends ReadonlyArray<infer UE> ? ReadonlyArray<DeepPartial<UE>> : DeepPartial<T[P]> };
```

Defined in: [packages/utils/src/types/DeepPartial.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/DeepPartial.ts#L46)

Creates a deep partial of a type
All properties (including those of nested objects and array elements) become optional

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | The original type to create a deep partial of |

## Examples

```ts
// basic usage
interface User {
  name: string;
  age: number;
  address: {
    street: string;
    city: string;
  };
  hobbies: string[];
}

// deep partial type
const partialUser: DeepPartial<User> = {
  name: 'John',
  address: {
    street: 'Main St',
  },
  hobbies: ['reading'],
};
```

```ts
// nested arrays
interface Data {
  items: {
    id: number;
    name: string;
  }[];
}

const partialData: DeepPartial<Data> = {
  items: [{
    id: 1,
  }],
};

**Note:** this type recursively makes all properties optional, including nested objects and array elements
**Note:** for array types, it is applied recursively to the element type
**Note:** for readonly arrays, it preserves the readonly property while applying recursively to the element type
```
