export type Mode = 'macos' | 'windows';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Capability = 'files' | 'settings' | 'apps' | 'storage' | 'messages' | 'notifications' | 'clipboard';
export interface Profile {
  mode: Mode;
  theme: 'light' | 'dark' | 'system';
  scale: number;
  reducedMotion: boolean;
  guided: boolean;
  pinned: string[];
  shortcuts: string[];
  doNotDisturb: boolean;
}
export interface VirtualFile {
  id: string;
  name: string;
  parentId: string | null;
  kind: 'file' | 'directory';
  mime: string;
  bytes: string;
  revision: number;
  modified: number;
  deleted: boolean;
  trashId: string | null;
}
export interface AppDefinition {
  id: string;
  name: string;
  version: string;
  entry: string;
  protocol: 1;
  suspension?: 1;
  instances: 'single' | 'multiple';
  capabilities: Capability[];
  optionalCapabilities: Capability[];
  system: boolean;
  fileTypes: string[];
  minWidth: number;
  minHeight: number;
  description: string;
}
export interface Installation {
  appId: string;
  version: string;
  previousVersion: string | null;
  resourceVersion: string | null;
  previousResourceVersion: string | null;
}
export interface Identity {
  appId: string;
  origin: string;
  instanceId: string;
  capabilities: readonly string[];
}
export interface Grant {
  id: string;
  appId: string;
  origin: string;
  capability: string;
  scope: string;
  instanceId: string | null;
}
export interface AppData {
  appId: string;
  schemaVersion: number;
  key: string;
  value: Json;
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type WindowState = 'normal' | 'minimized' | 'maximized' | 'left' | 'right';
export interface WindowRecord {
  id: string;
  instanceId: string;
  appId: string;
  workspaceId: string;
  title: string;
  bounds: Bounds;
  normalBounds: Bounds;
  state: WindowState;
  previousState: Exclude<WindowState, 'minimized' | 'maximized'>;
  beforeMinimized: Exclude<WindowState, 'minimized'>;
  z: number;
}
export interface WindowModel {
  mode: Mode;
  windows: WindowRecord[];
  activeId: string | null;
  activeWindows: Record<string, string | null>;
  workspaceId: string;
  showingDesktop: boolean;
}
export interface SavedWindow {
  appId: string;
  fileId: string | null;
  route: string;
  workspaceId: string;
  bounds: Bounds;
  state: WindowState;
}
export interface DesktopState {
  schemaVersion: 3;
  navigation: { workspaceId: string; activeWindows: Record<string, number | null> };
  profile: Profile;
  workspaces: { id: string; name: string }[];
  files: VirtualFile[];
  installations: Installation[];
  grants: Grant[];
  appData: AppData[];
  associations: Record<string, string>;
  session: SavedWindow[];
}
