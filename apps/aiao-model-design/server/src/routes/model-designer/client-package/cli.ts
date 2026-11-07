import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ClientPackageBuildRequest } from './package-builder';
import { createClientPackageService, type ClientPackageService } from './service';

/** 可注入测试替身的客户端包 CLI 依赖。 */
export interface ModelClientPackageCliDependencies {
  service: ClientPackageService;
  writeLine(line: string): void;
}

function option(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

function parseRequest(value: string): ClientPackageBuildRequest {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('Input must be a client package request object');
  return parsed as ClientPackageBuildRequest;
}

/**
 * 执行 archive/publish CLI，并复用服务端客户端包 service。
 *
 * @param args 不含 bun/script 路径的命令参数
 * @param dependencies 可注入的服务与输出函数
 * @returns 进程退出码
 */
export async function runModelClientPackageCli(
  args: readonly string[],
  dependencies: ModelClientPackageCliDependencies = {
    service: createClientPackageService(),
    writeLine: line => process.stdout.write(`${line}\n`)
  }
): Promise<number> {
  try {
    const command = args[0];
    const input = option(args, '--input');
    if ((command !== 'archive' && command !== 'publish') || !input) {
      throw new Error('Usage: model-client-package <archive|publish> --input <request.json> [--out <directory>]');
    }
    const request = parseRequest(await readFile(resolve(input), 'utf8'));
    if (command === 'publish') {
      dependencies.writeLine(JSON.stringify(await dependencies.service.publish(request)));
      return 0;
    }

    const output = resolve(option(args, '--out') ?? '.');
    const archive = await dependencies.service.archive(request);
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, archive.filename), archive.bytes);
    dependencies.writeLine(
      JSON.stringify({
        packageName: archive.packageName,
        version: archive.version,
        designRevision: archive.designRevision,
        filename: archive.filename,
        status: 'packed'
      })
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.writeLine(JSON.stringify({ status: 'failed', message }));
    return 1;
  }
}
