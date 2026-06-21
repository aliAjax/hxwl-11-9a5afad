import { describe, it, expect, beforeEach } from "vitest";
import {
  isIndexedDBSupported,
  initDB,
  withTransaction,
  savePatients,
  getPatients,
  saveRecords,
  getRecords,
  saveFilters,
  getFilters,
  saveReminders,
  getReminders,
  saveAllData,
  getAllData,
  saveClearedFlag,
  getClearedFlag,
  saveRecordsPersistedFlag,
  getRecordsPersistedFlag,
  saveDraft,
  getDraft,
  deleteDraft,
  saveSyncConfig,
  getSyncConfig,
  saveLastFullSync,
  getLastFullSync,
  saveSyncEnabled,
  getSyncEnabled,
  saveSyncSettings,
  getSyncSettings,
  saveWorkflowProgress,
  getWorkflowProgress,
  getAllWorkflowProgress,
  deleteWorkflowProgress,
  saveLastActivePatient,
  getLastActivePatient,
  clearAllData,
  closeDB,
  hasPersistedData,
} from "../db";
import type { PatientProfile, RefractionRecord } from "../types";
import type { SyncConfig } from "../sync";
import type {
  FilterState,
  ReminderData,
  AppData,
  SyncSettings,
  WorkflowStepProgress,
} from "../db";

const samplePatient: PatientProfile = {
  id: "p1",
  patientNo: "P001",
  ageGroup: "青少年",
  lensType: "单光镜",
  lastCheckDate: "2025-01-15",
  remark: "",
};

const samplePatient2: PatientProfile = {
  id: "p2",
  patientNo: "P002",
  ageGroup: "成人",
  lensType: "渐进镜",
  lastCheckDate: "2025-02-20",
  remark: "test",
};

const sampleRecord: RefractionRecord = {
  id: "r1",
  patientNo: "P001",
  category: "初检",
  type: "电脑验光",
  summary: "近视",
  patientName: "张三",
  ageGroup: "青少年",
  gender: "男",
  examDate: "2025-01-15",
  rightEye: {
    nakedVision: "0.5",
    correctedVision: "1.0",
    sphere: "-2.00",
    cylinder: "-0.50",
    axis: "180",
    add: "",
  },
  leftEye: {
    nakedVision: "0.6",
    correctedVision: "1.0",
    sphere: "-1.75",
    cylinder: "-0.25",
    axis: "175",
    add: "",
  },
  pd: "62",
  cornealCurvature: {
    right: { horizontal: "7.80", vertical: "7.75" },
    left: { horizontal: "7.82", vertical: "7.77" },
  },
  recommendation: "建议配镜",
};

const sampleRecord2: RefractionRecord = {
  id: "r2",
  patientNo: "P001",
  category: "复检",
  type: "综合验光",
  summary: "近视加深",
  patientName: "张三",
  ageGroup: "青少年",
  gender: "男",
  examDate: "2025-06-15",
  rightEye: {
    nakedVision: "0.4",
    correctedVision: "1.0",
    sphere: "-2.50",
    cylinder: "-0.75",
    axis: "180",
    add: "",
  },
  leftEye: {
    nakedVision: "0.5",
    correctedVision: "1.0",
    sphere: "-2.25",
    cylinder: "-0.50",
    axis: "175",
    add: "",
  },
  pd: "63",
  cornealCurvature: {
    right: { horizontal: "7.80", vertical: "7.75" },
    left: { horizontal: "7.82", vertical: "7.77" },
  },
  recommendation: "建议更换镜片",
};

const sampleFilters: FilterState = {
  comparisonFilter: "all",
  ageGroupFilter: "青少年",
  lensTypeFilter: "单光镜",
  reminderStatusFilter: "",
};

const sampleReminder: ReminderData = {
  id: "rem1",
  patientNo: "P001",
  reminderStatus: "upcoming",
  nextCheckDate: "2025-07-15",
  daysUntilNext: 30,
  reminderCycle: 6,
  customCycle: null,
};

const sampleReminder2: ReminderData = {
  id: "rem2",
  patientNo: "P002",
  reminderStatus: "overdue",
  nextCheckDate: "2025-01-01",
  daysUntilNext: -5,
  reminderCycle: 12,
  customCycle: 3,
};

const sampleSyncConfig: SyncConfig = {
  baseDelay: 800,
  failureRate: 0.1,
  conflictRate: 0.05,
  duplicateSubmissionRate: 0.1,
  autoSync: false,
  autoSyncInterval: 30000,
};

const sampleWorkflowProgress: WorkflowStepProgress = {
  patientNo: "P001",
  currentStep: "refraction",
  stepDetails: {
    triage: { status: "completed", completedAt: "2025-06-15T10:00:00Z" },
    refraction: { status: "current" },
    dispensing: { status: "not-started" },
  },
  lastUpdatedAt: "2025-06-15T10:30:00Z",
  lastRole: "optometrist",
};

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase("hxwl-11-optometry-db");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  closeDB();
  await deleteDatabase();
});

describe("isIndexedDBSupported", () => {
  it("returns true in fake-indexeddb environment", () => {
    expect(isIndexedDBSupported()).toBe(true);
  });
});

describe("initDB", () => {
  it("opens the database and returns an IDBDatabase instance", async () => {
    const db = await initDB();
    expect(db).not.toBeNull();
    expect(db!.name).toBe("hxwl-11-optometry-db");
  });

  it("returns the same instance on repeated calls", async () => {
    const db1 = await initDB();
    const db2 = await initDB();
    expect(db1).toBe(db2);
  });

  it("creates all expected object stores", async () => {
    const db = await initDB();
    const storeNames = Array.from(db!.objectStoreNames);
    expect(storeNames).toContain("patients");
    expect(storeNames).toContain("records");
    expect(storeNames).toContain("filters");
    expect(storeNames).toContain("reminders");
    expect(storeNames).toContain("syncSettings");
    expect(storeNames).toContain("drafts");
    expect(storeNames).toContain("workflowProgress");
  });
});

describe("withTransaction", () => {
  it("runs a readonly transaction and returns the result", async () => {
    await initDB();
    const result = await withTransaction("patients", "readonly", (store) => {
      return new Promise<any[]>((resolve, reject) => {
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    });
    expect(result).toEqual([]);
  });

  it("runs a readwrite transaction and persists data", async () => {
    await initDB();
    await withTransaction("patients", "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.add(samplePatient);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
    const patients = await withTransaction("patients", "readonly", (store) => {
      return new Promise<PatientProfile[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
    expect(patients).toHaveLength(1);
    expect(patients[0].patientNo).toBe("P001");
  });
});

describe("savePatients / getPatients", () => {
  it("saves and retrieves patients", async () => {
    await savePatients([samplePatient]);
    const patients = await getPatients();
    expect(patients).toHaveLength(1);
    expect(patients[0].id).toBe("p1");
    expect(patients[0].patientNo).toBe("P001");
  });

  it("saves multiple patients", async () => {
    await savePatients([samplePatient, samplePatient2]);
    const patients = await getPatients();
    expect(patients).toHaveLength(2);
  });

  it("replaces existing patients on save", async () => {
    await savePatients([samplePatient]);
    await savePatients([samplePatient2]);
    const patients = await getPatients();
    expect(patients).toHaveLength(1);
    expect(patients[0].id).toBe("p2");
  });

  it("saves an empty array clears patients", async () => {
    await savePatients([samplePatient]);
    await savePatients([]);
    const patients = await getPatients();
    expect(patients).toHaveLength(0);
  });
});

describe("saveRecords / getRecords", () => {
  it("saves and retrieves records", async () => {
    await saveRecords([sampleRecord]);
    const records = await getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("r1");
    expect(records[0].patientNo).toBe("P001");
  });

  it("saves multiple records", async () => {
    await saveRecords([sampleRecord, sampleRecord2]);
    const records = await getRecords();
    expect(records).toHaveLength(2);
  });

  it("replaces existing records on save", async () => {
    await saveRecords([sampleRecord]);
    await saveRecords([sampleRecord2]);
    const records = await getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("r2");
  });

  it("saves an empty array clears records", async () => {
    await saveRecords([sampleRecord]);
    await saveRecords([]);
    const records = await getRecords();
    expect(records).toHaveLength(0);
  });
});

describe("saveFilters / getFilters", () => {
  it("saves and retrieves filters", async () => {
    await saveFilters(sampleFilters);
    const filters = await getFilters();
    expect(filters.comparisonFilter).toBe("all");
    expect(filters.ageGroupFilter).toBe("青少年");
    expect(filters.lensTypeFilter).toBe("单光镜");
    expect(filters.reminderStatusFilter).toBe("");
  });

  it("returns defaults when no filters saved", async () => {
    const filters = await getFilters();
    expect(filters.comparisonFilter).toBe("all");
    expect(filters.ageGroupFilter).toBe("");
    expect(filters.lensTypeFilter).toBe("");
    expect(filters.reminderStatusFilter).toBe("");
  });

  it("overwrites previous filters", async () => {
    await saveFilters(sampleFilters);
    const updated: FilterState = {
      comparisonFilter: "custom",
      ageGroupFilter: "",
      lensTypeFilter: "渐进镜",
      reminderStatusFilter: "overdue",
    };
    await saveFilters(updated);
    const filters = await getFilters();
    expect(filters.comparisonFilter).toBe("custom");
    expect(filters.lensTypeFilter).toBe("渐进镜");
    expect(filters.reminderStatusFilter).toBe("overdue");
  });
});

describe("saveReminders / getReminders", () => {
  it("saves and retrieves reminders", async () => {
    await saveReminders([sampleReminder]);
    const reminders = await getReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe("rem1");
    expect(reminders[0].reminderStatus).toBe("upcoming");
  });

  it("saves multiple reminders", async () => {
    await saveReminders([sampleReminder, sampleReminder2]);
    const reminders = await getReminders();
    expect(reminders).toHaveLength(2);
  });

  it("replaces existing reminders on save", async () => {
    await saveReminders([sampleReminder]);
    await saveReminders([sampleReminder2]);
    const reminders = await getReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe("rem2");
  });

  it("saves an empty array clears reminders", async () => {
    await saveReminders([sampleReminder]);
    await saveReminders([]);
    const reminders = await getReminders();
    expect(reminders).toHaveLength(0);
  });
});

describe("saveAllData / getAllData", () => {
  it("saves and retrieves all data", async () => {
    const data: AppData = {
      patients: [samplePatient],
      records: [sampleRecord],
      filters: sampleFilters,
      reminders: [sampleReminder],
    };
    await saveAllData(data);
    const result = await getAllData();
    expect(result.patients).toHaveLength(1);
    expect(result.records).toHaveLength(1);
    expect(result.reminders).toHaveLength(1);
    expect(result.filters.comparisonFilter).toBe("all");
  });

  it("sets recordsPersistedFlag to true after saveAllData", async () => {
    const data: AppData = {
      patients: [],
      records: [],
      filters: sampleFilters,
      reminders: [],
    };
    await saveAllData(data);
    const flag = await getRecordsPersistedFlag();
    expect(flag).toBe(true);
  });
});

describe("saveClearedFlag / getClearedFlag", () => {
  it("saves and retrieves cleared flag as true", async () => {
    await saveClearedFlag(true);
    const flag = await getClearedFlag();
    expect(flag).toBe(true);
  });

  it("saves and retrieves cleared flag as false", async () => {
    await saveClearedFlag(false);
    const flag = await getClearedFlag();
    expect(flag).toBe(false);
  });

  it("returns false when no flag is set", async () => {
    const flag = await getClearedFlag();
    expect(flag).toBe(false);
  });
});

describe("saveRecordsPersistedFlag / getRecordsPersistedFlag", () => {
  it("saves and retrieves persisted flag as true", async () => {
    await saveRecordsPersistedFlag(true);
    const flag = await getRecordsPersistedFlag();
    expect(flag).toBe(true);
  });

  it("saves and retrieves persisted flag as false", async () => {
    await saveRecordsPersistedFlag(false);
    const flag = await getRecordsPersistedFlag();
    expect(flag).toBe(false);
  });

  it("returns false when no flag is set", async () => {
    const flag = await getRecordsPersistedFlag();
    expect(flag).toBe(false);
  });
});

describe("saveDraft / getDraft / deleteDraft", () => {
  it("saves and retrieves a draft", async () => {
    await saveDraft("draft1", { foo: "bar" });
    const draft = await getDraft("draft1");
    expect(draft).not.toBeNull();
    expect(draft!.data).toEqual({ foo: "bar" });
    expect(typeof draft!.savedAt).toBe("string");
  });

  it("returns null for nonexistent draft", async () => {
    const draft = await getDraft("nonexistent");
    expect(draft).toBeNull();
  });

  it("overwrites an existing draft", async () => {
    await saveDraft("draft1", { version: 1 });
    await saveDraft("draft1", { version: 2 });
    const draft = await getDraft("draft1");
    expect(draft!.data).toEqual({ version: 2 });
  });

  it("deletes a draft", async () => {
    await saveDraft("draft1", { foo: "bar" });
    await deleteDraft("draft1");
    const draft = await getDraft("draft1");
    expect(draft).toBeNull();
  });

  it("deleting a nonexistent draft does not throw", async () => {
    await expect(deleteDraft("nonexistent")).resolves.toBeUndefined();
  });

  it("handles complex draft data", async () => {
    const complexData = {
      records: [sampleRecord, sampleRecord2],
      meta: { count: 2, timestamp: Date.now() },
    };
    await saveDraft("complex", complexData);
    const draft = await getDraft("complex");
    expect(draft!.data.records).toHaveLength(2);
    expect(draft!.data.meta.count).toBe(2);
  });
});

describe("saveSyncConfig / getSyncConfig", () => {
  it("saves and retrieves sync config", async () => {
    await saveSyncConfig(sampleSyncConfig);
    const config = await getSyncConfig();
    expect(config).not.toBeNull();
    expect(config!.baseDelay).toBe(800);
    expect(config!.autoSync).toBe(false);
    expect(config!.autoSyncInterval).toBe(30000);
  });

  it("returns null when no config saved", async () => {
    const config = await getSyncConfig();
    expect(config).toBeNull();
  });

  it("overwrites existing config", async () => {
    await saveSyncConfig(sampleSyncConfig);
    const updated: SyncConfig = { ...sampleSyncConfig, autoSync: true, baseDelay: 1500 };
    await saveSyncConfig(updated);
    const config = await getSyncConfig();
    expect(config!.autoSync).toBe(true);
    expect(config!.baseDelay).toBe(1500);
  });
});

describe("saveLastFullSync / getLastFullSync", () => {
  it("saves and retrieves last full sync timestamp", async () => {
    const ts = "2025-06-15T10:30:00Z";
    await saveLastFullSync(ts);
    const result = await getLastFullSync();
    expect(result).toBe(ts);
  });

  it("returns null when no timestamp saved", async () => {
    const result = await getLastFullSync();
    expect(result).toBeNull();
  });

  it("overwrites previous timestamp", async () => {
    await saveLastFullSync("2025-01-01T00:00:00Z");
    await saveLastFullSync("2025-06-15T10:30:00Z");
    const result = await getLastFullSync();
    expect(result).toBe("2025-06-15T10:30:00Z");
  });
});

describe("saveSyncEnabled / getSyncEnabled", () => {
  it("saves and retrieves sync enabled as true", async () => {
    await saveSyncEnabled(true);
    const enabled = await getSyncEnabled();
    expect(enabled).toBe(true);
  });

  it("saves and retrieves sync enabled as false", async () => {
    await saveSyncEnabled(false);
    const enabled = await getSyncEnabled();
    expect(enabled).toBe(false);
  });

  it("returns true by default when not set", async () => {
    const enabled = await getSyncEnabled();
    expect(enabled).toBe(true);
  });
});

describe("saveSyncSettings / getSyncSettings", () => {
  it("saves and retrieves sync settings", async () => {
    const settings: SyncSettings = {
      config: sampleSyncConfig,
      lastFullSync: "2025-06-15T10:30:00Z",
      syncEnabled: true,
    };
    await saveSyncSettings(settings);
    const result = await getSyncSettings();
    expect(result).not.toBeNull();
    expect(result!.config.baseDelay).toBe(800);
    expect(result!.syncEnabled).toBe(true);
    expect(result!.lastFullSync).toBe("2025-06-15T10:30:00Z");
  });

  it("saves sync settings without lastFullSync", async () => {
    const settings: SyncSettings = {
      config: sampleSyncConfig,
      syncEnabled: false,
    };
    await saveSyncSettings(settings);
    const result = await getSyncSettings();
    expect(result).not.toBeNull();
    expect(result!.syncEnabled).toBe(false);
    expect(result!.lastFullSync).toBeUndefined();
  });

  it("returns null when no config saved", async () => {
    const result = await getSyncSettings();
    expect(result).toBeNull();
  });
});

describe("saveWorkflowProgress / getWorkflowProgress / getAllWorkflowProgress / deleteWorkflowProgress", () => {
  it("saves and retrieves workflow progress by patientNo", async () => {
    await saveWorkflowProgress(sampleWorkflowProgress);
    const progress = await getWorkflowProgress("P001");
    expect(progress).not.toBeNull();
    expect(progress!.currentStep).toBe("refraction");
    expect(progress!.lastRole).toBe("optometrist");
    expect(progress!.stepDetails.triage.status).toBe("completed");
    expect(progress!.stepDetails.refraction.status).toBe("current");
  });

  it("returns null for nonexistent patientNo", async () => {
    const progress = await getWorkflowProgress("P999");
    expect(progress).toBeNull();
  });

  it("retrieves all workflow progress entries", async () => {
    await saveWorkflowProgress(sampleWorkflowProgress);
    const progress2: WorkflowStepProgress = {
      patientNo: "P002",
      currentStep: "triage",
      stepDetails: {
        triage: { status: "current" },
      },
      lastUpdatedAt: "2025-06-15T11:00:00Z",
      lastRole: "assistant",
    };
    await saveWorkflowProgress(progress2);
    const all = await getAllWorkflowProgress();
    expect(all).toHaveLength(2);
  });

  it("returns empty array when no progress saved", async () => {
    const all = await getAllWorkflowProgress();
    expect(all).toEqual([]);
  });

  it("updates existing workflow progress", async () => {
    await saveWorkflowProgress(sampleWorkflowProgress);
    const updated: WorkflowStepProgress = {
      ...sampleWorkflowProgress,
      currentStep: "dispensing",
      stepDetails: {
        triage: { status: "completed", completedAt: "2025-06-15T10:00:00Z" },
        refraction: { status: "completed", completedAt: "2025-06-15T11:00:00Z" },
        dispensing: { status: "current" },
      },
      lastUpdatedAt: "2025-06-15T12:00:00Z",
    };
    await saveWorkflowProgress(updated);
    const progress = await getWorkflowProgress("P001");
    expect(progress!.currentStep).toBe("dispensing");
    expect(progress!.stepDetails.refraction.status).toBe("completed");
  });

  it("deletes workflow progress by patientNo", async () => {
    await saveWorkflowProgress(sampleWorkflowProgress);
    await deleteWorkflowProgress("P001");
    const progress = await getWorkflowProgress("P001");
    expect(progress).toBeNull();
  });

  it("deleting nonexistent workflow progress does not throw", async () => {
    await expect(deleteWorkflowProgress("P999")).resolves.toBeUndefined();
  });
});

describe("saveLastActivePatient / getLastActivePatient", () => {
  it("saves and retrieves last active patient", async () => {
    await saveLastActivePatient("P001");
    const result = await getLastActivePatient();
    expect(result).toBe("P001");
  });

  it("returns null when no last active patient saved", async () => {
    const result = await getLastActivePatient();
    expect(result).toBeNull();
  });

  it("overwrites previous last active patient", async () => {
    await saveLastActivePatient("P001");
    await saveLastActivePatient("P002");
    const result = await getLastActivePatient();
    expect(result).toBe("P002");
  });

  it("can save null to clear last active patient", async () => {
    await saveLastActivePatient("P001");
    await saveLastActivePatient(null);
    const result = await getLastActivePatient();
    expect(result).toBeNull();
  });
});

describe("clearAllData", () => {
  it("clears all stores", async () => {
    await savePatients([samplePatient]);
    await saveRecords([sampleRecord]);
    await saveFilters(sampleFilters);
    await saveReminders([sampleReminder]);
    await saveDraft("draft1", { data: "test" });
    await saveWorkflowProgress(sampleWorkflowProgress);
    await clearAllData();
    expect(await getPatients()).toEqual([]);
    expect(await getRecords()).toEqual([]);
    expect(await getReminders()).toEqual([]);
    expect(await getDraft("draft1")).toBeNull();
    expect(await getWorkflowProgress("P001")).toBeNull();
  });

  it("does not throw when stores are already empty", async () => {
    await expect(clearAllData()).resolves.toBeUndefined();
  });
});

describe("closeDB", () => {
  it("closes the database and allows reinitialization", async () => {
    const db1 = await initDB();
    closeDB();
    const db2 = await initDB();
    expect(db2).not.toBeNull();
    expect(db2).not.toBe(db1);
  });

  it("does not throw when no database is open", () => {
    expect(() => closeDB()).not.toThrow();
  });
});

describe("hasPersistedData", () => {
  it("returns false when no data is persisted", async () => {
    expect(await hasPersistedData()).toBe(false);
  });

  it("returns true when patients exist", async () => {
    await savePatients([samplePatient]);
    expect(await hasPersistedData()).toBe(true);
  });

  it("returns true when records exist", async () => {
    await saveRecords([sampleRecord]);
    expect(await hasPersistedData()).toBe(true);
  });

  it("returns true when reminders exist", async () => {
    await saveReminders([sampleReminder]);
    expect(await hasPersistedData()).toBe(true);
  });

  it("returns false when only filters exist", async () => {
    await saveFilters(sampleFilters);
    expect(await hasPersistedData()).toBe(false);
  });

  it("returns false after clearAllData", async () => {
    await savePatients([samplePatient]);
    await saveRecords([sampleRecord]);
    await clearAllData();
    expect(await hasPersistedData()).toBe(false);
  });
});
