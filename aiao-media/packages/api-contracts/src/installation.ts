/** 安装向导与用户端共用的公开账号配置。 */
export interface InstallationAuth {
  url: string;
  anonKey: string;
  storageUrl?: string;
}

/** 安装状态不包含服务端密钥或密码。 */
export interface InstallationStatus {
  initialized: boolean;
  managed: boolean;
  auth: InstallationAuth | null;
}

/** 密码只用于本次账号创建或验证。 */
export interface InstallationInput {
  email: string;
  password: string;
  supabaseUrl?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}
