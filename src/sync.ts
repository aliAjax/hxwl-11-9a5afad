import type { PatientProfile, RefractionRecord } from "./App";
import type { ReminderData } from "./db";

export type SyncStatus = "pending" | "synced" | "conflict" | "failed";

export type EntityType = "patient" | "record" | "reminder";

export interface SyncMetadata {
  syncStatus: SyncStatus;
  syncError?: string;
  lastSyncAttempt?: string;
  lastSyncedAt?: string;
  serverVersion?: number;
  localVersion: number;
  conflictData?: {
    serverData: any;
    localData: any;
    conflictType: "update-update" | "update-delete" | "delete-update";
  };
}

export interface SyncablePatient extends PatientProfile, SyncMetadata {}
export interface SyncableRecord extends RefractionRecord, SyncMetadata {}
export interface SyncableReminder extends ReminderData, SyncMetadata {}

export interface SyncStats {
  pending: number;
  synced: number;
  conflict: number;
  failed: number;
  total: number;
}

export interface SyncConfig {
  baseDelay: number;
  failureRate: number;
  conflictRate: number;
  autoSync: boolean;
  autoSyncInterval: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  baseDelay: 800,
  failureRate: 0.1,
  conflictRate: 0.05,
  autoSync: false,
  autoSyncInterval: 30000,
};

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  pending: "待同步",
  synced: "已同步",
  conflict: "冲突待处理",
  failed: "同步失败",
};

export const SYNC_STATUS_COLORS: Record<SyncStatus, string> = {
  pending: "#f59e0b",
  synced: "#10b981",
  conflict: "#ef4444",
  failed: "#6b7280",
};

export const SYNC_STATUS_ICONS: Record<SyncStatus, string> = {
  pending: "⏳",
  synced: "✓",
  conflict: "⚠",
  failed: "✕",
};

interface SyncOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  conflict?: boolean;
  serverVersion?: number;
}

class MockSyncServer {
  private data: Map<string, any> = new Map();
  private versions: Map<string, number> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData() {
    const seedPatients = [
      { id: "p-server-1", patientNo: "P20240001", name: "张三", age: 28, gender: "male", phone: "13800138001", address: "北京市朝阳区", createdAt: "2024-01-15T10:00:00Z" },
      { id: "p-server-2", patientNo: "P20240002", name: "李四", age: 35, gender: "female", phone: "13800138002", address: "上海市浦东新区", createdAt: "2024-02-20T14:30:00Z" },
    ];
    seedPatients.forEach((p) => {
      this.data.set(`patient:${p.id}`, p);
      this.versions.set(`patient:${p.id}`, 1);
    });
  }

  private makeKey(type: EntityType, id: string): string {
    return `${type}:${id}`;
  }

  private randomDelay(baseDelay: number): Promise<void> {
    const jitter = Math.random() * baseDelay * 0.5;
    const delay = baseDelay + jitter;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  private shouldFail(failureRate: number): boolean {
    return Math.random() < failureRate;
  }

  private shouldConflict(conflictRate: number): boolean {
    return Math.random() < conflictRate;
  }

  async pushEntity(
    type: EntityType,
    entity: any,
    config: SyncConfig
  ): Promise<SyncOperationResult<any>> {
    await this.randomDelay(config.baseDelay);

    if (this.shouldFail(config.failureRate)) {
      return {
        success: false,
        error: "网络连接超时，请检查网络后重试",
      };
    }

    const key = this.makeKey(type, entity.id);
    const currentVersion = this.versions.get(key) || 0;

    if (currentVersion > 0 && entity.serverVersion && entity.serverVersion < currentVersion) {
      if (this.shouldConflict(config.conflictRate)) {
        const serverData = this.data.get(key);
        return {
          success: false,
          conflict: true,
          error: "数据版本冲突：服务端有更新的版本",
          serverVersion: currentVersion,
          data: serverData,
        };
      }
    }

    const newVersion = currentVersion + 1;
    const serverEntity = { ...entity, serverVersion: newVersion, updatedAt: new Date().toISOString() };
    this.data.set(key, serverEntity);
    this.versions.set(key, newVersion);

    return {
      success: true,
      data: serverEntity,
      serverVersion: newVersion,
    };
  }

  async pullEntity(
    type: EntityType,
    id: string,
    config: SyncConfig
  ): Promise<SyncOperationResult<any>> {
    await this.randomDelay(config.baseDelay);

    if (this.shouldFail(config.failureRate)) {
      return {
        success: false,
        error: "拉取数据失败，请稍后重试",
      };
    }

    const key = this.makeKey(type, id);
    const data = this.data.get(key);
    const version = this.versions.get(key) || 0;

    return {
      success: true,
      data,
      serverVersion: version,
    };
  }

  async pushBatch(
    type: EntityType,
    entities: any[],
    config: SyncConfig,
    onProgress?: (completed: number, total: number) => void
  ): Promise<{
    results: Map<string, SyncOperationResult<any>>;
    stats: { success: number; failed: number; conflict: number };
  }> {
    const results = new Map<string, SyncOperationResult<any>>();
    let success = 0;
    let failed = 0;
    let conflict = 0;

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const result = await this.pushEntity(type, entity, config);
      results.set(entity.id, result);

      if (result.conflict) {
        conflict++;
      } else if (result.success) {
        success++;
      } else {
        failed++;
      }

      if (onProgress) {
        onProgress(i + 1, entities.length);
      }
    }

    return { results, stats: { success, failed, conflict } };
  }

  generateServerConflict(type: EntityType, id: string, modifiedData: any): void {
    const key = this.makeKey(type, id);
    const currentVersion = this.versions.get(key) || 0;
    const newVersion = currentVersion + 1;
    this.data.set(key, { ...modifiedData, serverVersion: newVersion, updatedAt: new Date().toISOString() });
    this.versions.set(key, newVersion);
  }

  getServerData(): Map<string, any> {
    return new Map(this.data);
  }
}

export const mockServer = new MockSyncServer();

export function createSyncableEntity<T extends { id: string }>(
  entity: T,
  status: SyncStatus = "pending"
): T & SyncMetadata {
  return {
    ...entity,
    syncStatus: status,
    localVersion: 1,
    serverVersion: status === "synced" ? 1 : undefined,
    lastSyncedAt: status === "synced" ? new Date().toISOString() : undefined,
  };
}

export function markForSync<T extends SyncMetadata>(entity: T): T {
  return {
    ...entity,
    syncStatus: "pending",
    localVersion: entity.localVersion + 1,
    lastSyncAttempt: new Date().toISOString(),
  };
}

export function markSynced<T extends SyncMetadata>(entity: T, serverVersion: number): T {
  return {
    ...entity,
    syncStatus: "synced",
    serverVersion,
    lastSyncedAt: new Date().toISOString(),
    syncError: undefined,
    conflictData: undefined,
  };
}

export function markFailed<T extends SyncMetadata>(entity: T, error: string): T {
  return {
    ...entity,
    syncStatus: "failed",
    syncError: error,
    lastSyncAttempt: new Date().toISOString(),
  };
}

export function markConflict<T extends SyncMetadata>(
  entity: T,
  serverData: any,
  conflictType: "update-update" | "update-delete" | "delete-update"
): T {
  return {
    ...entity,
    syncStatus: "conflict",
    conflictData: {
      serverData,
      localData: entity,
      conflictType,
    },
    lastSyncAttempt: new Date().toISOString(),
  };
}

export function resolveConflictKeepLocal<T extends SyncMetadata>(entity: T): T {
  return {
    ...entity,
    syncStatus: "pending",
    conflictData: undefined,
    localVersion: entity.localVersion + 1,
  };
}

export function resolveConflictKeepServer<T extends SyncMetadata>(entity: T): T & SyncMetadata {
  if (!entity.conflictData) return entity;
  return {
    ...entity.conflictData.serverData,
    syncStatus: "synced",
    conflictData: undefined,
    localVersion: entity.localVersion,
    lastSyncedAt: new Date().toISOString(),
  };
}

export function calculateSyncStats(entities: SyncMetadata[]): SyncStats {
  const stats: SyncStats = { pending: 0, synced: 0, conflict: 0, failed: 0, total: entities.length };
  entities.forEach((e) => {
    stats[e.syncStatus]++;
  });
  return stats;
}

export function formatSyncTime(isoString?: string): string {
  if (!isoString) return "从未同步";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString("zh-CN");
}
