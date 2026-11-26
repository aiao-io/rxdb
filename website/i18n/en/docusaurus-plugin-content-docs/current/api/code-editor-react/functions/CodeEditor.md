# CodeEditor()

```ts
function CodeEditor(__namedParameters): Element;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:292](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L292)

React component for the CodeMirror code editor

## Parameters

| Parameter | Type |
| ------ | ------ |
| `__namedParameters` | [`CodeEditorProps`](../interfaces/CodeEditorProps.md) |

## Returns

`Element`

## Example

```tsx
import { CodeEditor } from '@aiao/code-editor-react';

function App() {
  const [code, setCode] = useState('SELECT * FROM users');

  return (
    <CodeEditor
      value={code}
      onChange={setCode}
      language="sql"
      theme="dark"
    />
  );
}
```
