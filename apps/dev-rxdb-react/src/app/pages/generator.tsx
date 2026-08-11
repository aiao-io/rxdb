import { CodeEditor } from '@aiao/code-editor-react';
import { EntityMetadataOptions, PropertyType } from '@aiao/rxdb';
import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { zipSync } from 'fflate';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTheme } from '../hooks/useTheme';

const DEMOS: EntityMetadataOptions[] = [
  {
    name: 'Todo',
    displayName: 'Todo',
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'completed', type: PropertyType.boolean, default: false }
    ]
  },
  {
    name: 'Menu',
    displayName: 'Menu',
    repository: 'TreeRepository',
    extends: ['TreeAdjacencyListEntityBase', 'EntityBase'],
    properties: [
      {
        name: 'title',
        type: PropertyType.string
      }
    ]
  }
];

export function getActiveGeneratedFileIndex(selectedIndex: number, fileCount: number): number {
  return selectedIndex >= 0 && selectedIndex < fileCount ? selectedIndex : 0;
}

export function GeneratorPage() {
  const { currentThemeLightDark } = useTheme();
  const [selectedDemoIndex, setSelectedDemoIndex] = useState(0);
  const [jsonValue, setJsonValue] = useState(() => JSON.stringify(DEMOS[0], null, 2));
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  // 使用 useMemo 替代 useEffect 来生成文件，避免级联渲染
  const generatedFiles = useMemo(() => {
    if (!jsonValue) return [];
    try {
      const json = JSON.parse(jsonValue);
      const generator = new RxDBClientGenerator();
      generator.addEntity(json);
      generator.exec();
      return generator.project.getSourceFiles();
    } catch {
      return [];
    }
  }, [jsonValue]);

  const activeFileIndex = getActiveGeneratedFileIndex(selectedFileIndex, generatedFiles.length);

  const handleDemoClick = (index: number) => {
    setSelectedDemoIndex(index);
    setSelectedFileIndex(0);
    setJsonValue(JSON.stringify(DEMOS[index], null, 2));
  };

  const handleJsonChange = (value: string) => {
    setSelectedFileIndex(0);
    setJsonValue(value);
  };

  const handleDownload = () => {
    const files: Record<string, Uint8Array> = {};
    const encoder = new TextEncoder();
    generatedFiles.forEach(sourceFile => {
      files[sourceFile.getFilePath()] = encoder.encode(sourceFile.getText());
    });
    const zipData = zipSync(files, {
      level: 9,
      mem: 8
    });

    const demo = DEMOS[selectedDemoIndex];
    const blob = new Blob([zipData], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${demo.name.toLowerCase()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentFileContent = useMemo(() => {
    if (generatedFiles.length === 0) return '';
    return generatedFiles[activeFileIndex]?.getText() || '';
  }, [activeFileIndex, generatedFiles]);

  const currentFileLanguage = useMemo(() => {
    if (generatedFiles.length === 0) return 'typescript';
    const path = generatedFiles[activeFileIndex]?.getFilePath() || '';
    return path.endsWith('.ts') ? 'typescript' : 'javascript';
  }, [activeFileIndex, generatedFiles]);

  return (
    <div className='flex h-full w-full overflow-hidden'>
      {/* Left Panel: JSON Input */}
      <div className='border-base-300 flex h-full w-[40%] flex-col border-r'>
        <div className='tabs tabs-border bg-base-100' role='tablist'>
          {DEMOS.map((demo, index) => (
            <button
              key={demo.name}
              role='tab'
              className={`tab ${selectedDemoIndex === index ? 'tab-active' : ''}`}
              onClick={() => handleDemoClick(index)}
            >
              {demo.name}
            </button>
          ))}
        </div>
        <div className='flex-1 overflow-hidden' data-testid='generator-input-editor'>
          <CodeEditor
            theme={currentThemeLightDark}
            language='json'
            value={jsonValue}
            onChange={handleJsonChange}
            lineWrapping
          />
        </div>
      </div>

      {/* Right Panel: Generated Code */}
      <div className='bg-base-100 relative flex h-full w-[60%] flex-col'>
        <button
          className='btn btn-primary btn-sm absolute top-2 right-2 z-10'
          data-testid='generator-download'
          onClick={handleDownload}
        >
          <Download size={16} />
          生成并下载
        </button>

        <div className='tabs tabs-lifted w-full overflow-x-auto pt-2 pr-32 pl-2'>
          {generatedFiles.map((file, index) => {
            const path = file.getFilePath();
            const isActive = activeFileIndex === index;
            return (
              <button
                key={path}
                role='tab'
                className={`tab whitespace-nowrap ${isActive ? 'tab-active' : ''}`}
                onClick={() => setSelectedFileIndex(index)}
                title={path}
              >
                {path.split('/').pop()}
              </button>
            );
          })}
        </div>

        <div
          className='bg-base-100 border-base-300 flex-1 overflow-hidden border-t'
          data-testid='generator-output-editor'
        >
          <CodeEditor
            theme={currentThemeLightDark}
            language={currentFileLanguage}
            value={currentFileContent}
            readonly
            lineWrapping
          />
        </div>
      </div>
    </div>
  );
}

export default GeneratorPage;
