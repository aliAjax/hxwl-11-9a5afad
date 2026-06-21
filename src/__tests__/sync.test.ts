import { describe, it, expect } from "vitest";
import {
  stripSyncMetadata,
  createSyncableEntity,
  markForSync,
  markSynced,
  markFailed,
  markSubmitting,
  markConflict,
  markConflictWithHistory,
  resolveConflictKeepLocal,
  resolveConflictKeepServer,
  resolveConflictWithMerge,
  mergeEntitiesByFieldChoices,
  calculateSyncStats,
  formatSyncTime,
  computeFieldDiffs,
  DEFAULT_SYNC_CONFIG,
  SYNC_STATUS_LABELS,
  SYNC_STATUS_COLORS,
  SYNC_STATUS_ICONS,
  mockServer,
} from "../sync";
import type { SyncMetadata, SyncConfig } from "../sync";

const MockSyncServerConstructor = Object.getPrototypeOf(mockServer).constructor;

function makeEntity(overrides: Partial<SyncMetadata> & Record<string, any> = {}): SyncMetadata & Record<string, any> {
  return {
    id: "e1",
    name: "Test",
    syncStatus: "pending",
    localVersion: 1,
    serverVersion: undefined,
    submitCount: 0,
    isSubmitting: false,
    ...overrides,
  };
}

const deterministicConfig: SyncConfig = {
  baseDelay: 0,
  failureRate: 0,
  conflictRate: 0,
  duplicateSubmissionRate: 0,
  autoSync: false,
  autoSyncInterval: 30000,
};

describe("stripSyncMetadata", () => {
  it("preserves business data and removes sync metadata fields", () => {
    const entity = {
      id: "1",
      name: "Alice",
      age: 30,
      syncStatus: "pending" as const,
      syncError: "err",
      lastSyncAttempt: "2024-01-01",
      lastSyncedAt: "2024-01-02",
      serverVersion: 3,
      localVersion: 2,
      submitCount: 1,
      isSubmitting: true,
      conflictData: { serverData: {}, localData: {}, conflictType: "update-update" as const },
    };
    const result = stripSyncMetadata(entity);
    expect(result).toEqual({ id: "1", name: "Alice", age: 30 });
    expect(result).not.toHaveProperty("syncStatus");
    expect(result).not.toHaveProperty("syncError");
    expect(result).not.toHaveProperty("lastSyncAttempt");
    expect(result).not.toHaveProperty("lastSyncedAt");
    expect(result).not.toHaveProperty("serverVersion");
    expect(result).not.toHaveProperty("localVersion");
    expect(result).not.toHaveProperty("submitCount");
    expect(result).not.toHaveProperty("isSubmitting");
    expect(result).not.toHaveProperty("conflictData");
  });

  it("returns null/undefined for null/undefined input", () => {
    expect(stripSyncMetadata(null)).toBeNull();
    expect(stripSyncMetadata(undefined)).toBeUndefined();
  });

  it("returns entity as-is if no sync metadata present", () => {
    const entity = { id: "1", name: "Bob" };
    expect(stripSyncMetadata(entity)).toEqual({ id: "1", name: "Bob" });
  });
});

describe("createSyncableEntity", () => {
  it("creates entity with default pending metadata", () => {
    const base = { id: "1", name: "Alice" };
    const result = createSyncableEntity(base);
    expect(result.id).toBe("1");
    expect(result.name).toBe("Alice");
    expect(result.syncStatus).toBe("pending");
    expect(result.localVersion).toBe(1);
    expect(result.serverVersion).toBeUndefined();
    expect(result.lastSyncedAt).toBeUndefined();
    expect(result.submitCount).toBe(0);
    expect(result.isSubmitting).toBe(false);
  });

  it("creates entity with synced status and sets serverVersion and lastSyncedAt", () => {
    const base = { id: "2", name: "Bob" };
    const result = createSyncableEntity(base, "synced");
    expect(result.syncStatus).toBe("synced");
    expect(result.serverVersion).toBe(1);
    expect(result.lastSyncedAt).toBeDefined();
    expect(typeof result.lastSyncedAt).toBe("string");
  });

  it("does not mutate the original entity", () => {
    const base = { id: "3", name: "Carol" };
    const result = createSyncableEntity(base, "failed");
    expect(result.syncStatus).toBe("failed");
    expect((base as any).syncStatus).toBeUndefined();
  });
});

describe("markForSync", () => {
  it("sets syncStatus to pending and increments localVersion", () => {
    const entity = makeEntity({ syncStatus: "failed", localVersion: 3 });
    const result = markForSync(entity);
    expect(result.syncStatus).toBe("pending");
    expect(result.localVersion).toBe(4);
    expect(result.isSubmitting).toBe(false);
    expect(result.lastSyncAttempt).toBeDefined();
  });
});

describe("markSynced", () => {
  it("sets synced status with serverVersion and clears error/conflictData", () => {
    const entity = makeEntity({
      syncStatus: "pending",
      syncError: "old error",
      conflictData: { serverData: {}, localData: {}, conflictType: "update-update" },
    });
    const result = markSynced(entity, 5);
    expect(result.syncStatus).toBe("synced");
    expect(result.serverVersion).toBe(5);
    expect(result.lastSyncedAt).toBeDefined();
    expect(result.syncError).toBeUndefined();
    expect(result.conflictData).toBeUndefined();
    expect(result.isSubmitting).toBe(false);
  });
});

describe("markFailed", () => {
  it("sets failed status with error message", () => {
    const entity = makeEntity({ syncStatus: "pending" });
    const result = markFailed(entity, "网络超时");
    expect(result.syncStatus).toBe("failed");
    expect(result.syncError).toBe("网络超时");
    expect(result.isSubmitting).toBe(false);
    expect(result.lastSyncAttempt).toBeDefined();
  });
});

describe("markSubmitting", () => {
  it("increments submitCount and sets isSubmitting true", () => {
    const entity = makeEntity({ submitCount: 2, isSubmitting: false });
    const result = markSubmitting(entity);
    expect(result.submitCount).toBe(3);
    expect(result.isSubmitting).toBe(true);
    expect(result.lastSyncAttempt).toBeDefined();
  });
});

describe("markConflict", () => {
  it("creates conflictData with serverData, localData, and conflictType", () => {
    const entity = makeEntity({ name: "LocalName" });
    const serverData = { id: "e1", name: "ServerName" };
    const result = markConflict(entity, serverData, "update-update");
    expect(result.syncStatus).toBe("conflict");
    expect(result.conflictData).toBeDefined();
    expect(result.conflictData!.serverData).toBe(serverData);
    expect(result.conflictData!.conflictType).toBe("update-update");
    expect(result.isSubmitting).toBe(false);
    expect(result.lastSyncAttempt).toBeDefined();
  });

  it("preserves localData as the full entity in conflictData", () => {
    const entity = makeEntity({ name: "LocalName", localVersion: 5 });
    const result = markConflict(entity, {}, "delete-update");
    expect(result.conflictData!.localData).toEqual(entity);
  });
});

describe("markConflictWithHistory", () => {
  it("preserves existing mergeHistory from prior conflictData", () => {
    const history = [
      { mergeTimestamp: "2024-01-01T00:00:00Z", resolutions: [{ field: "name", choice: "local" as const }], serverVersionAtMerge: 2 },
    ];
    const entity = makeEntity({
      syncStatus: "conflict",
      conflictData: {
        serverData: { id: "e1", name: "Old" },
        localData: {},
        conflictType: "update-update",
        mergeHistory: history,
      },
    });
    const newServerData = { id: "e1", name: "NewServer" };
    const result = markConflictWithHistory(entity, newServerData, "update-update");
    expect(result.syncStatus).toBe("conflict");
    expect(result.conflictData!.mergeHistory).toEqual(history);
    expect(result.conflictData!.serverData).toBe(newServerData);
  });

  it("sets mergeHistory to undefined if no prior conflictData", () => {
    const entity = makeEntity();
    const result = markConflictWithHistory(entity, {}, "update-delete");
    expect(result.conflictData!.mergeHistory).toBeUndefined();
  });
});

describe("resolveConflictKeepLocal", () => {
  it("sets pending, clears conflictData, increments localVersion", () => {
    const entity = makeEntity({
      syncStatus: "conflict",
      localVersion: 4,
      conflictData: { serverData: {}, localData: {}, conflictType: "update-update" },
    });
    const result = resolveConflictKeepLocal(entity);
    expect(result.syncStatus).toBe("pending");
    expect(result.conflictData).toBeUndefined();
    expect(result.localVersion).toBe(5);
    expect(result.isSubmitting).toBe(false);
  });
});

describe("resolveConflictKeepServer", () => {
  it("uses server data, sets synced, clears conflictData", () => {
    const serverData = { id: "e1", name: "ServerName", age: 25 };
    const entity = makeEntity({
      syncStatus: "conflict",
      name: "LocalName",
      localVersion: 3,
      submitCount: 2,
      conflictData: {
        serverData,
        localData: {},
        conflictType: "update-update",
      },
    });
    const result = resolveConflictKeepServer(entity);
    expect(result.syncStatus).toBe("synced");
    expect(result.name).toBe("ServerName");
    expect(result.conflictData).toBeUndefined();
    expect(result.lastSyncedAt).toBeDefined();
    expect(result.submitCount).toBe(2);
    expect(result.isSubmitting).toBe(false);
  });

  it("returns entity unchanged if no conflictData", () => {
    const entity = makeEntity({ syncStatus: "conflict" });
    const result = resolveConflictKeepServer(entity);
    expect(result).toBe(entity);
  });
});

describe("resolveConflictWithMerge", () => {
  it("merges fields and creates merge history", () => {
    const serverData = { id: "e1", name: "ServerName", age: 40, serverVersion: 5 };
    const entity = makeEntity({
      syncStatus: "conflict",
      name: "LocalName",
      age: 30,
      localVersion: 3,
      conflictData: {
        serverData,
        localData: {},
        conflictType: "update-update",
      },
    });
    const resolutions = [
      { field: "name", choice: "local" as const },
      { field: "age", choice: "server" as const },
    ];
    const result = resolveConflictWithMerge(entity, resolutions);
    expect(result.syncStatus).toBe("pending");
    expect(result.localVersion).toBe(4);
    expect(result.conflictData).toBeDefined();
    expect(result.conflictData!.mergeHistory).toHaveLength(1);
    expect(result.conflictData!.mergeHistory![0].resolutions).toEqual(resolutions);
    expect(result.conflictData!.mergeHistory![0].serverVersionAtMerge).toBe(5);
    expect(result.isSubmitting).toBe(false);
  });

  it("appends to existing mergeHistory", () => {
    const existingHistory = [
      { mergeTimestamp: "2024-01-01T00:00:00Z", resolutions: [{ field: "name", choice: "server" as const }], serverVersionAtMerge: 2 },
    ];
    const serverData = { id: "e1", name: "ServerName", serverVersion: 4 };
    const entity = makeEntity({
      syncStatus: "conflict",
      name: "LocalName",
      localVersion: 5,
      conflictData: {
        serverData,
        localData: {},
        conflictType: "update-update",
        mergeHistory: existingHistory,
      },
    });
    const resolutions = [{ field: "name", choice: "local" as const }];
    const result = resolveConflictWithMerge(entity, resolutions);
    expect(result.conflictData!.mergeHistory).toHaveLength(2);
    expect(result.conflictData!.mergeHistory![0]).toEqual(existingHistory[0]);
  });

  it("returns entity unchanged if no conflictData", () => {
    const entity = makeEntity({ syncStatus: "conflict" });
    const result = resolveConflictWithMerge(entity, []);
    expect(result).toBe(entity);
  });
});

describe("mergeEntitiesByFieldChoices", () => {
  it("handles nested fields like leftEye.sphere", () => {
    const entity = makeEntity({
      syncStatus: "conflict",
      leftEye: { sphere: "-1.00", cylinder: "-0.50" },
      rightEye: { sphere: "-2.00", cylinder: "-0.75" },
      conflictData: {
        serverData: {
          id: "e1",
          leftEye: { sphere: "-1.50", cylinder: "-0.75" },
          rightEye: { sphere: "-2.50", cylinder: "-1.00" },
        },
        localData: {},
        conflictType: "update-update",
      },
    });
    const resolutions = [
      { field: "leftEye.sphere", choice: "server" as const },
      { field: "rightEye.cylinder", choice: "local" as const },
    ];
    const result = mergeEntitiesByFieldChoices(entity, resolutions);
    expect(result.leftEye.sphere).toBe("-1.50");
    expect(result.leftEye.cylinder).toBe("-0.50");
    expect(result.rightEye.sphere).toBe("-2.00");
    expect(result.rightEye.cylinder).toBe("-0.75");
  });

  it("picks local value when choice is local", () => {
    const entity = makeEntity({
      syncStatus: "conflict",
      name: "LocalName",
      age: 30,
      conflictData: {
        serverData: { id: "e1", name: "ServerName", age: 40 },
        localData: {},
        conflictType: "update-update",
      },
    });
    const result = mergeEntitiesByFieldChoices(entity, [
      { field: "name", choice: "local" as const },
    ]);
    expect(result.name).toBe("LocalName");
    expect(result.age).toBe(30);
  });

  it("picks server value when choice is server", () => {
    const entity = makeEntity({
      syncStatus: "conflict",
      name: "LocalName",
      conflictData: {
        serverData: { id: "e1", name: "ServerName" },
        localData: {},
        conflictType: "update-update",
      },
    });
    const result = mergeEntitiesByFieldChoices(entity, [
      { field: "name", choice: "server" as const },
    ]);
    expect(result.name).toBe("ServerName");
  });

  it("returns local data when no conflictData", () => {
    const entity = makeEntity({ name: "OnlyLocal" });
    const result = mergeEntitiesByFieldChoices(entity, []);
    expect(result.name).toBe("OnlyLocal");
  });
});

describe("calculateSyncStats", () => {
  it("counts entities by syncStatus correctly", () => {
    const entities: SyncMetadata[] = [
      makeEntity({ syncStatus: "pending" }),
      makeEntity({ syncStatus: "pending" }),
      makeEntity({ syncStatus: "synced" }),
      makeEntity({ syncStatus: "conflict" }),
      makeEntity({ syncStatus: "failed" }),
      makeEntity({ syncStatus: "failed" }),
      makeEntity({ syncStatus: "failed" }),
    ];
    const stats = calculateSyncStats(entities);
    expect(stats.pending).toBe(2);
    expect(stats.synced).toBe(1);
    expect(stats.conflict).toBe(1);
    expect(stats.failed).toBe(3);
    expect(stats.total).toBe(7);
  });

  it("returns zero counts for empty array", () => {
    const stats = calculateSyncStats([]);
    expect(stats).toEqual({ pending: 0, synced: 0, conflict: 0, failed: 0, total: 0 });
  });
});

describe("formatSyncTime", () => {
  it('returns "从未同步" for undefined input', () => {
    expect(formatSyncTime(undefined)).toBe("从未同步");
  });

  it('returns "刚刚" for very recent timestamp', () => {
    expect(formatSyncTime(new Date().toISOString())).toBe("刚刚");
  });

  it('returns "X 分钟前" for minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatSyncTime(fiveMinAgo)).toBe("5 分钟前");
  });

  it('returns "X 小时前" for hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatSyncTime(threeHoursAgo)).toBe("3 小时前");
  });

  it('returns "X 天前" for days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(formatSyncTime(twoDaysAgo)).toBe("2 天前");
  });

  it("returns formatted date for 7+ days ago", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const result = formatSyncTime(tenDaysAgo);
    expect(result).not.toBe("刚刚");
    expect(result).not.toContain("分钟前");
    expect(result).not.toContain("小时前");
    expect(result).not.toContain("天前");
  });
});

describe("computeFieldDiffs", () => {
  it("identifies different fields for patient type", () => {
    const localData = { name: "Alice", age: 30, phone: "111" };
    const serverData = { name: "Bob", age: 30, phone: "222" };
    const diffs = computeFieldDiffs("patient", localData, serverData);
    const nameDiff = diffs.find((d) => d.field === "name");
    const ageDiff = diffs.find((d) => d.field === "age");
    const phoneDiff = diffs.find((d) => d.field === "phone");
    expect(nameDiff).toBeDefined();
    expect(nameDiff!.isDifferent).toBe(true);
    expect(nameDiff!.localValue).toBe("Alice");
    expect(nameDiff!.serverValue).toBe("Bob");
    expect(ageDiff!.isDifferent).toBe(false);
    expect(phoneDiff!.isDifferent).toBe(true);
  });

  it("identifies different fields for record type including eye data", () => {
    const localData = {
      patientNo: "P001",
      patientName: "Alice",
      leftEye: { sphere: "-1.00", cylinder: "-0.50", axis: "90", nakedVision: "0.8", correctedVision: "1.0", add: "+1.00" },
      rightEye: { sphere: "-2.00", cylinder: "-0.75", axis: "85", nakedVision: "0.6", correctedVision: "1.0", add: "+1.50" },
    };
    const serverData = {
      patientNo: "P001",
      patientName: "Bob",
      leftEye: { sphere: "-1.50", cylinder: "-0.50", axis: "90", nakedVision: "0.8", correctedVision: "1.0", add: "+1.00" },
      rightEye: { sphere: "-2.00", cylinder: "-0.75", axis: "85", nakedVision: "0.6", correctedVision: "1.0", add: "+1.50" },
    };
    const diffs = computeFieldDiffs("record", localData, serverData);
    const patientNameDiff = diffs.find((d) => d.field === "patientName");
    const leftSphereDiff = diffs.find((d) => d.field === "leftEye.sphere");
    expect(patientNameDiff!.isDifferent).toBe(true);
    expect(leftSphereDiff!.isDifferent).toBe(true);
    expect(leftSphereDiff!.localValue).toBe("-1.00");
    expect(leftSphereDiff!.serverValue).toBe("-1.50");
    expect(leftSphereDiff!.label).toContain("左眼");
    const rightSphereDiff = diffs.find((d) => d.field === "rightEye.sphere");
    expect(rightSphereDiff!.isDifferent).toBe(false);
  });

  it("uses correct Chinese labels for patient fields", () => {
    const localData = { name: "A" };
    const serverData = { name: "B" };
    const diffs = computeFieldDiffs("patient", localData, serverData);
    const nameDiff = diffs.find((d) => d.field === "name");
    expect(nameDiff!.label).toBe("姓名");
  });

  it("returns empty diffs for record type without eye data", () => {
    const localData = { patientNo: "P001" };
    const serverData = { patientNo: "P001" };
    const diffs = computeFieldDiffs("record", localData, serverData);
    expect(diffs.every((d) => !d.field.startsWith("leftEye") && !d.field.startsWith("rightEye"))).toBe(true);
  });

  it("shows dash for undefined values", () => {
    const localData = { name: "Alice" };
    const serverData = { name: undefined };
    const diffs = computeFieldDiffs("patient", localData, serverData);
    const nameDiff = diffs.find((d) => d.field === "name");
    expect(nameDiff!.serverValue).toBe("—");
  });
});

describe("DEFAULT_SYNC_CONFIG", () => {
  it("has expected default values", () => {
    expect(DEFAULT_SYNC_CONFIG.baseDelay).toBe(800);
    expect(DEFAULT_SYNC_CONFIG.failureRate).toBe(0.1);
    expect(DEFAULT_SYNC_CONFIG.conflictRate).toBe(0.05);
    expect(DEFAULT_SYNC_CONFIG.duplicateSubmissionRate).toBe(0.1);
    expect(DEFAULT_SYNC_CONFIG.autoSync).toBe(false);
    expect(DEFAULT_SYNC_CONFIG.autoSyncInterval).toBe(30000);
  });
});

describe("SYNC_STATUS_LABELS", () => {
  it("has labels for all statuses", () => {
    expect(SYNC_STATUS_LABELS.pending).toBe("待同步");
    expect(SYNC_STATUS_LABELS.synced).toBe("已同步");
    expect(SYNC_STATUS_LABELS.conflict).toBe("冲突待处理");
    expect(SYNC_STATUS_LABELS.failed).toBe("同步失败");
  });
});

describe("SYNC_STATUS_COLORS", () => {
  it("has colors for all statuses", () => {
    expect(SYNC_STATUS_COLORS.pending).toBeDefined();
    expect(SYNC_STATUS_COLORS.synced).toBeDefined();
    expect(SYNC_STATUS_COLORS.conflict).toBeDefined();
    expect(SYNC_STATUS_COLORS.failed).toBeDefined();
  });
});

describe("SYNC_STATUS_ICONS", () => {
  it("has icons for all statuses", () => {
    expect(SYNC_STATUS_ICONS.pending).toBeDefined();
    expect(SYNC_STATUS_ICONS.synced).toBeDefined();
    expect(SYNC_STATUS_ICONS.conflict).toBeDefined();
    expect(SYNC_STATUS_ICONS.failed).toBeDefined();
  });
});

describe("MockSyncServer", () => {
  function createFreshServer() {
    return new MockSyncServerConstructor();
  }

  it("pushEntity succeeds with deterministic config", async () => {
    const server = createFreshServer();
    const entity = { id: "test-1", name: "Test", submitCount: 0 };
    const result = await server.pushEntity("patient", entity, deterministicConfig);
    expect(result.success).toBe(true);
    expect(result.serverVersion).toBe(1);
    expect(result.data.name).toBe("Test");
  });

  it("pushEntity increments serverVersion on successive pushes", async () => {
    const server = createFreshServer();
    const entity = { id: "test-2", name: "Test", submitCount: 0 };
    const r1 = await server.pushEntity("patient", entity, deterministicConfig);
    expect(r1.serverVersion).toBe(1);
    const r2 = await server.pushEntity("patient", entity, deterministicConfig);
    expect(r2.serverVersion).toBe(2);
  });

  it("pullEntity retrieves pushed data", async () => {
    const server = createFreshServer();
    const entity = { id: "test-3", name: "PullTest", submitCount: 0 };
    await server.pushEntity("patient", entity, deterministicConfig);
    const result = await server.pullEntity("patient", "test-3", deterministicConfig);
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("PullTest");
    expect(result.serverVersion).toBe(1);
  });

  it("pullEntity returns undefined data for non-existent entity", async () => {
    const server = createFreshServer();
    const result = await server.pullEntity("patient", "nonexistent", deterministicConfig);
    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.serverVersion).toBe(0);
  });

  it("pushBatch processes multiple entities and reports stats", async () => {
    const server = createFreshServer();
    const entities = [
      { id: "batch-1", name: "A", submitCount: 0 },
      { id: "batch-2", name: "B", submitCount: 0 },
      { id: "batch-3", name: "C", submitCount: 0 },
    ];
    const progressCalls: [number, number][] = [];
    const { results, stats } = await server.pushBatch("patient", entities, deterministicConfig, (c: number, t: number) => {
      progressCalls.push([c, t]);
    });
    expect(stats.success).toBe(3);
    expect(stats.failed).toBe(0);
    expect(stats.conflict).toBe(0);
    expect(results.size).toBe(3);
    expect(progressCalls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("generateServerConflict updates server data and version", async () => {
    const server = createFreshServer();
    server.initializeServerData("patient", "conflict-1", { id: "conflict-1", name: "Original" }, 1);
    server.generateServerConflict("patient", "conflict-1", { id: "conflict-1", name: "Modified" });
    const result = await server.pullEntity("patient", "conflict-1", deterministicConfig);
    expect(result.data.name).toBe("Modified");
    expect(result.serverVersion).toBe(2);
  });

  it("initializeServerData sets up entity with given version", async () => {
    const server = createFreshServer();
    server.initializeServerData("patient", "init-1", { id: "init-1", name: "InitTest" }, 3);
    const result = await server.pullEntity("patient", "init-1", deterministicConfig);
    expect(result.data.name).toBe("InitTest");
    expect(result.serverVersion).toBe(3);
  });

  it("initializeServerData defaults version to 1", async () => {
    const server = createFreshServer();
    server.initializeServerData("patient", "init-2", { id: "init-2", name: "DefaultVer" });
    const result = await server.pullEntity("patient", "init-2", deterministicConfig);
    expect(result.serverVersion).toBe(1);
  });

  it("pushEntity strips sync metadata from stored data", async () => {
    const server = createFreshServer();
    const entity = {
      id: "strip-1",
      name: "StripTest",
      syncStatus: "pending",
      localVersion: 5,
      submitCount: 0,
    };
    const result = await server.pushEntity("patient", entity, deterministicConfig);
    expect(result.success).toBe(true);
    const pulled = await server.pullEntity("patient", "strip-1", deterministicConfig);
    expect(pulled.data.name).toBe("StripTest");
    expect(pulled.data).not.toHaveProperty("syncStatus");
    expect(pulled.data).not.toHaveProperty("localVersion");
  });

  it("getServerData returns a copy of internal data", () => {
    const server = createFreshServer();
    server.initializeServerData("patient", "gsd-1", { id: "gsd-1", name: "Test" });
    const data1 = server.getServerData();
    const data2 = server.getServerData();
    expect(data1).not.toBe(data2);
    expect(data1.get("patient:gsd-1").name).toBe("Test");
  });
});
