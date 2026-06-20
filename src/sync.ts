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
  submitCount: number;
  isSubmitting: boolean;
  conflictData?: ConflictData;
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
  duplicateSubmissionRate: number;
  autoSync: boolean;
  autoSyncInterval: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  baseDelay: 800,
  failureRate: 0.1,
  conflictRate: 0.05,
  duplicateSubmissionRate: 0.1,
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
  duplicate?: boolean;
  serverVersion?: number;
}

class MockSyncServer {
  private data: Map<string, any> = new Map();
  private versions: Map<string, number> = new Map();
  private recentSubmissions: Map<string, { count: number; firstAt: number }> = new Map();
  private duplicateWindowMs = 5000;

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

  private shouldDetectDuplicate(rate: number): boolean {
    return Math.random() < rate;
  }

  private checkDuplicate(key: string): boolean {
    const now = Date.now();
    const existing = this.recentSubmissions.get(key);
    if (existing && now - existing.firstAt < this.duplicateWindowMs) {
      existing.count++;
      return existing.count > 1;
    }
    this.recentSubmissions.set(key, { count: 1, firstAt: now });
    return false;
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

    const submitCount = entity.submitCount || 0;
    const hasRecentSubmission = this.checkDuplicate(key);
    if (submitCount > 1 && hasRecentSubmission && this.shouldDetectDuplicate(config.duplicateSubmissionRate)) {
      return {
        success: false,
        error: `检测到重复提交（${submitCount} 次）：请稍后再试，避免重复提交`,
        duplicate: true,
      };
    }

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
    const strippedEntity = this.stripSyncMetadata(entity);
    const serverEntity = { ...strippedEntity, serverVersion: newVersion, updatedAt: new Date().toISOString() };
    this.data.set(key, serverEntity);
    this.versions.set(key, newVersion);

    return {
      success: true,
      data: serverEntity,
      serverVersion: newVersion,
    };
  }

  private stripSyncMetadata(entity: any): any {
    const { syncStatus, syncError, lastSyncAttempt, lastSyncedAt, serverVersion, localVersion, submitCount, isSubmitting, conflictData, ...businessData } = entity;
    return businessData;
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
    const strippedData = this.stripSyncMetadata(modifiedData);
    this.data.set(key, { ...strippedData, serverVersion: newVersion, updatedAt: new Date().toISOString() });
    this.versions.set(key, newVersion);
  }

  initializeServerData(type: EntityType, id: string, data: any, version: number = 1): void {
    const key = this.makeKey(type, id);
    const strippedData = this.stripSyncMetadata(data);
    this.data.set(key, { ...strippedData, serverVersion: version, updatedAt: new Date().toISOString() });
    this.versions.set(key, version);
  }

  getServerData(): Map<string, any> {
    return new Map(this.data);
  }
}

export const mockServer = new MockSyncServer();

export function stripSyncMetadata(entity: any): any {
  if (!entity) return entity;
  const { syncStatus, syncError, lastSyncAttempt, lastSyncedAt, serverVersion, localVersion, submitCount, isSubmitting, conflictData, ...businessData } = entity;
  return businessData;
}

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
    submitCount: 0,
    isSubmitting: false,
  };
}

export function markForSync<T extends SyncMetadata>(entity: T): T {
  return {
    ...entity,
    syncStatus: "pending",
    localVersion: entity.localVersion + 1,
    lastSyncAttempt: new Date().toISOString(),
    isSubmitting: false,
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
    isSubmitting: false,
  };
}

export function markFailed<T extends SyncMetadata>(entity: T, error: string): T {
  return {
    ...entity,
    syncStatus: "failed",
    syncError: error,
    lastSyncAttempt: new Date().toISOString(),
    isSubmitting: false,
  };
}

export function markSubmitting<T extends SyncMetadata>(entity: T): T {
  return {
    ...entity,
    isSubmitting: true,
    submitCount: entity.submitCount + 1,
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
    isSubmitting: false,
  };
}

export function resolveConflictKeepLocal<T extends SyncMetadata>(entity: T): T {
  return {
    ...entity,
    syncStatus: "pending",
    conflictData: undefined,
    localVersion: entity.localVersion + 1,
    isSubmitting: false,
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
    submitCount: entity.submitCount,
    isSubmitting: false,
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

export interface FieldDiff {
  field: string;
  label: string;
  localValue: any;
  serverValue: any;
  isDifferent: boolean;
}

export type FieldChoice = "local" | "server";

export interface FieldResolution {
  field: string;
  choice: FieldChoice;
}

export interface MergeResult<T> {
  mergedData: T;
  resolutions: FieldResolution[];
  mergeTimestamp: string;
}

export interface ConflictData {
  serverData: any;
  localData: any;
  conflictType: "update-update" | "update-delete" | "delete-update";
  mergeHistory?: Array<{
    mergeTimestamp: string;
    resolutions: FieldResolution[];
    serverVersionAtMerge: number;
  }>;
}

const PATIENT_FIELD_LABELS: Record<string, string> = {
  patientNo: "患者编号",
  name: "姓名",
  age: "年龄",
  gender: "性别",
  phone: "电话",
  address: "地址",
  ageGroup: "年龄段",
  lensType: "镜片类型",
  lastCheckDate: "上次检查日期",
  remark: "备注",
};

const RECORD_FIELD_LABELS: Record<string, string> = {
  patientNo: "患者编号",
  patientName: "患者姓名",
  examDate: "检查日期",
  type: "类型",
  summary: "摘要",
  recommendation: "建议",
  pd: "瞳距",
};

export function computeFieldDiffs(
  type: EntityType,
  localData: any,
  serverData: any
): FieldDiff[] {
  const labelMap = type === "patient" ? PATIENT_FIELD_LABELS : RECORD_FIELD_LABELS;
  const diffs: FieldDiff[] = [];

  const allKeys = new Set([...Object.keys(labelMap)]);
  for (const field of allKeys) {
    const localVal = localData?.[field];
    const serverVal = serverData?.[field];
    const isDifferent = JSON.stringify(localVal) !== JSON.stringify(serverVal);
    if (isDifferent || localVal !== undefined || serverVal !== undefined) {
      diffs.push({
        field,
        label: labelMap[field] || field,
        localValue: localVal ?? "—",
        serverValue: serverVal ?? "—",
        isDifferent,
      });
    }
  }

  if (type === "record" && localData?.leftEye && serverData?.leftEye) {
    const eyeFields: Record<string, string> = {
      sphere: "球镜(SPH)", cylinder: "柱镜(CYL)", axis: "轴位(AXI)",
      vision: "裸眼视力", correctedVision: "矫正视力", add: "下加光(ADD)"
    };
    for (const [f, label] of Object.entries(eyeFields)) {
      const lv = localData.leftEye?.[f];
      const sv = serverData.leftEye?.[f];
      const isDiff = JSON.stringify(lv) !== JSON.stringify(sv);
      if (isDiff || lv !== undefined || sv !== undefined) {
        diffs.push({ field: `leftEye.${f}`, label: `左眼 ${label}`, localValue: lv ?? "—", serverValue: sv ?? "—", isDifferent: isDiff });
      }
    }
    for (const [f, label] of Object.entries(eyeFields)) {
      const lv = localData.rightEye?.[f];
      const sv = serverData.rightEye?.[f];
      const isDiff = JSON.stringify(lv) !== JSON.stringify(sv);
      if (isDiff || lv !== undefined || sv !== undefined) {
        diffs.push({ field: `rightEye.${f}`, label: `右眼 ${label}`, localValue: lv ?? "—", serverValue: sv ?? "—", isDifferent: isDiff });
      }
    }
  }

  return diffs;
}

function getNestedValue(obj: any, path: string): any {
  if (!obj) return undefined;
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

function setNestedValue(obj: any, path: string, value: any): void {
  if (!obj) return;
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

export function mergeEntitiesByFieldChoices<T extends SyncMetadata>(
  entity: T,
  resolutions: FieldResolution[]
): T {
  const localData = stripSyncMetadata(entity);
  const serverData = entity.conflictData?.serverData ? stripSyncMetadata(entity.conflictData.serverData) : {};
  const mergedData: any = { ...localData };

  resolutions.forEach(({ field, choice }) => {
    const sourceData = choice === "local" ? localData : serverData;
    const value = getNestedValue(sourceData, field);
    if (value !== undefined) {
      setNestedValue(mergedData, field, value);
    } else {
      const keys = field.split(".");
      if (keys.length === 1) {
        delete mergedData[field];
      }
    }
  });

  return mergedData;
}

export function resolveConflictWithMerge<T extends SyncMetadata>(
  entity: T,
  resolutions: FieldResolution[]
): T {
  if (!entity.conflictData) return entity;

  const mergedData = mergeEntitiesByFieldChoices(entity, resolutions);
  const serverVersion = entity.conflictData.serverData?.serverVersion;

  const existingMergeHistory = entity.conflictData.mergeHistory || [];
  const newMergeHistory = [
    ...existingMergeHistory,
    {
      mergeTimestamp: new Date().toISOString(),
      resolutions,
      serverVersionAtMerge: serverVersion || 0,
    },
  ];

  return {
    ...entity,
    ...mergedData,
    syncStatus: "pending" as SyncStatus,
    conflictData: {
      ...entity.conflictData,
      mergeHistory: newMergeHistory,
    },
    localVersion: entity.localVersion + 1,
    lastSyncAttempt: new Date().toISOString(),
    isSubmitting: false,
  };
}

export function markConflictWithHistory<T extends SyncMetadata>(
  entity: T,
  serverData: any,
  conflictType: "update-update" | "update-delete" | "delete-update"
): T {
  const existingConflictData = entity.conflictData;
  const mergeHistory = existingConflictData?.mergeHistory;

  return {
    ...entity,
    syncStatus: "conflict" as SyncStatus,
    conflictData: {
      serverData,
      localData: entity,
      conflictType,
      mergeHistory,
    },
    lastSyncAttempt: new Date().toISOString(),
    isSubmitting: false,
  };
}
