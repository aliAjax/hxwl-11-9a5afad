import type { PatientProfile, RefractionRecord, ReminderStatus } from "./types";
import type { SyncConfig } from "./sync";

export interface FilterState {
  comparisonFilter: string;
  ageGroupFilter: string;
  lensTypeFilter: string;
  reminderStatusFilter: string;
}

export interface ReminderData {
  id: string;
  patientNo: string;
  reminderStatus: ReminderStatus;
  nextCheckDate: string;
  daysUntilNext: number;
  reminderCycle: number;
  customCycle: number | null;
}

export interface AppData {
  patients: PatientProfile[];
  records: RefractionRecord[];
  filters: FilterState;
  reminders: ReminderData[];
}

export interface SyncSettings {
  config: SyncConfig;
  lastFullSync?: string;
  syncEnabled: boolean;
}

export type StepStatus = "not-started" | "completed" | "current" | "blocked";

export type StepBlockReason = "permission" | "data-missing";

export interface StepInfo {
  status: StepStatus;
  blockReason?: StepBlockReason;
  blockDetail?: string;
  completedAt?: string;
}

export interface WorkflowStepProgress {
  patientNo: string;
  currentStep: string;
  stepDetails: Record<string, StepInfo>;
  lastUpdatedAt: string;
  lastRole: string;
}

const DB_NAME = "hxwl-11-optometry-db";
const DB_VERSION = 5;
const STORE_SYNC_SETTINGS = "syncSettings";
const STORE_PATIENTS = "patients";
const STORE_RECORDS = "records";
const STORE_FILTERS = "filters";
const STORE_REMINDERS = "reminders";
const STORE_DRAFTS = "drafts";
const STORE_WORKFLOW_PROGRESS = "workflowProgress";

let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase | null> | null = null;

export function isIndexedDBSupported(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function initDB(): Promise<IDBDatabase | null> {
  if (!isIndexedDBSupported()) {
    return Promise.resolve(null);
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB 打开失败:", request.error);
      initPromise = null;
      resolve(null);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onerror = (event) => {
        console.error("IndexedDB 错误:", event);
      };
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(STORE_PATIENTS)) {
        const patientStore = db.createObjectStore(STORE_PATIENTS, { keyPath: "id" });
        patientStore.createIndex("patientNo", "patientNo", { unique: true });
      }

      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const recordStore = db.createObjectStore(STORE_RECORDS, { keyPath: "id" });
        recordStore.createIndex("patientNo", "patientNo", { unique: false });
        recordStore.createIndex("examDate", "examDate", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_FILTERS)) {
        db.createObjectStore(STORE_FILTERS, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(STORE_REMINDERS)) {
        const reminderStore = db.createObjectStore(STORE_REMINDERS, { keyPath: "id" });
        reminderStore.createIndex("patientNo", "patientNo", { unique: false });
        reminderStore.createIndex("reminderStatus", "reminderStatus", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SYNC_SETTINGS)) {
        db.createObjectStore(STORE_SYNC_SETTINGS, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(STORE_WORKFLOW_PROGRESS)) {
        const progressStore = db.createObjectStore(STORE_WORKFLOW_PROGRESS, { keyPath: "patientNo" });
        progressStore.createIndex("lastUpdatedAt", "lastUpdatedAt", { unique: false });
        progressStore.createIndex("lastRole", "lastRole", { unique: false });
      }

      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_FILTERS)) {
        const filtersStore = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_FILTERS);
        if (!filtersStore.indexNames.contains("key")) {
          filtersStore.createIndex("key", "key", { unique: false });
        }
      }
    };

    request.onblocked = () => {
      console.warn("IndexedDB 被阻塞，请关闭其他标签页后重试");
      reject(new Error("IndexedDB 被阻塞"));
    };
  });

  return initPromise;
}

export async function withTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await initDB();
  if (!db) {
    throw new Error("IndexedDB 不可用");
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    transaction.onerror = () => {
      reject(transaction.error);
    };

    transaction.oncomplete = () => {
    };

    try {
      const result = callback(store);
      if (result instanceof Promise) {
        result.then(resolve).catch(reject);
      } else {
        resolve(result);
      }
    } catch (error) {
      reject(error);
    }
  });
}

export async function savePatients(patients: PatientProfile[]): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_PATIENTS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onerror = () => reject(clearRequest.error);
      clearRequest.onsuccess = () => {
        let completed = 0;
        if (patients.length === 0) {
          resolve();
          return;
        }
        patients.forEach((patient) => {
          const addRequest = store.add(patient);
          addRequest.onerror = () => reject(addRequest.error);
          addRequest.onsuccess = () => {
            completed++;
            if (completed === patients.length) {
              resolve();
            }
          };
        });
      };
    });
  });
}

export async function saveRecords(records: RefractionRecord[]): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_RECORDS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onerror = () => reject(clearRequest.error);
      clearRequest.onsuccess = () => {
        let completed = 0;
        if (records.length === 0) {
          resolve();
          return;
        }
        records.forEach((record) => {
          const addRequest = store.add(record);
          addRequest.onerror = () => reject(addRequest.error);
          addRequest.onsuccess = () => {
            completed++;
            if (completed === records.length) {
              resolve();
            }
          };
        });
      };
    });
  });
}

export async function saveFilters(filters: FilterState): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_FILTERS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const entries = [
        { key: "comparisonFilter", value: filters.comparisonFilter },
        { key: "ageGroupFilter", value: filters.ageGroupFilter },
        { key: "lensTypeFilter", value: filters.lensTypeFilter },
        { key: "reminderStatusFilter", value: filters.reminderStatusFilter },
      ];
      let completed = 0;
      entries.forEach((entry) => {
        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          completed++;
          if (completed === entries.length) resolve();
        };
      });
    });
  });
}

export async function saveReminders(reminders: ReminderData[]): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_REMINDERS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onerror = () => reject(clearRequest.error);
      clearRequest.onsuccess = () => {
        let completed = 0;
        if (reminders.length === 0) {
          resolve();
          return;
        }
        reminders.forEach((reminder) => {
          const addRequest = store.add(reminder);
          addRequest.onerror = () => reject(addRequest.error);
          addRequest.onsuccess = () => {
            completed++;
            if (completed === reminders.length) {
              resolve();
            }
          };
        });
      };
    });
  });
}

export async function saveClearedFlag(cleared: boolean): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_FILTERS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put({ key: "dataCleared", value: cleared });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function saveRecordsPersistedFlag(persisted: boolean): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_FILTERS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put({ key: "recordsPersisted", value: persisted });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function getClearedFlag(): Promise<boolean> {
  const db = await initDB();
  if (!db) return false;

  return withTransaction(STORE_FILTERS, "readonly", (store) => {
    return new Promise<boolean>((resolve, reject) => {
      const request = store.get("dataCleared");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(!!request.result?.value);
      };
    });
  });
}

export async function getRecordsPersistedFlag(): Promise<boolean> {
  const db = await initDB();
  if (!db) return false;

  return withTransaction(STORE_FILTERS, "readonly", (store) => {
    return new Promise<boolean>((resolve, reject) => {
      const request = store.get("recordsPersisted");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(!!request.result?.value);
      };
    });
  });
}

export async function saveAllData(data: AppData): Promise<void> {
  await Promise.all([
    savePatients(data.patients),
    saveRecords(data.records),
    saveFilters(data.filters),
    saveReminders(data.reminders),
  ]);
  await saveRecordsPersistedFlag(true);
}

export async function getPatients(): Promise<PatientProfile[]> {
  const db = await initDB();
  if (!db) return [];

  return withTransaction(STORE_PATIENTS, "readonly", (store) => {
    return new Promise<PatientProfile[]>((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  });
}

export async function getRecords(): Promise<RefractionRecord[]> {
  const db = await initDB();
  if (!db) return [];

  return withTransaction(STORE_RECORDS, "readonly", (store) => {
    return new Promise<RefractionRecord[]>((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  });
}

export async function getFilters(): Promise<FilterState> {
  const db = await initDB();
  if (!db) return { comparisonFilter: "all", ageGroupFilter: "", lensTypeFilter: "", reminderStatusFilter: "" };

  return withTransaction(STORE_FILTERS, "readonly", (store) => {
    return new Promise<FilterState>((resolve, reject) => {
      const keys = ["comparisonFilter", "ageGroupFilter", "lensTypeFilter", "reminderStatusFilter"];
      const results: Record<string, string> = {};
      let completed = 0;
      keys.forEach((key) => {
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          results[key] = request.result?.value || (key === "comparisonFilter" ? "all" : "");
          completed++;
          if (completed === keys.length) {
            resolve({
              comparisonFilter: results.comparisonFilter,
              ageGroupFilter: results.ageGroupFilter,
              lensTypeFilter: results.lensTypeFilter,
              reminderStatusFilter: results.reminderStatusFilter,
            });
          }
        };
      });
    });
  });
}

export async function getReminders(): Promise<ReminderData[]> {
  const db = await initDB();
  if (!db) return [];

  return withTransaction(STORE_REMINDERS, "readonly", (store) => {
    return new Promise<ReminderData[]>((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  });
}

export async function getAllData(): Promise<AppData> {
  const [patients, records, filters, reminders] = await Promise.all([
    getPatients(),
    getRecords(),
    getFilters(),
    getReminders(),
  ]);
  return { patients, records, filters, reminders };
}

export async function clearAllData(): Promise<void> {
  const db = await initDB();
  if (!db) return;

  await Promise.all([
    withTransaction(STORE_PATIENTS, "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }),
    withTransaction(STORE_RECORDS, "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }),
    withTransaction(STORE_FILTERS, "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }),
    withTransaction(STORE_REMINDERS, "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }),
    withTransaction(STORE_DRAFTS, "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }),
    withTransaction(STORE_WORKFLOW_PROGRESS, "readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }),
  ]);
}

export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    initPromise = null;
  }
}

export async function saveDraft(key: string, data: any): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_DRAFTS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put({ key, data, savedAt: new Date().toISOString() });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function getDraft(key: string): Promise<{ data: any; savedAt: string } | null> {
  const db = await initDB();
  if (!db) return null;

  return withTransaction(STORE_DRAFTS, "readonly", (store) => {
    return new Promise<{ data: any; savedAt: string } | null>((resolve, reject) => {
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (result && result.data !== undefined) {
          resolve({ data: result.data, savedAt: result.savedAt });
        } else {
          resolve(null);
        }
      };
    });
  });
}

export async function deleteDraft(key: string): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_DRAFTS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function hasPersistedData(): Promise<boolean> {
  const data = await getAllData();
  return data.patients.length > 0 || data.records.length > 0 || data.reminders.length > 0;
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_SYNC_SETTINGS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put({ key: "syncConfig", value: config });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function getSyncConfig(): Promise<SyncConfig | null> {
  const db = await initDB();
  if (!db) return null;

  return withTransaction(STORE_SYNC_SETTINGS, "readonly", (store) => {
    return new Promise<SyncConfig | null>((resolve, reject) => {
      const request = store.get("syncConfig");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.value || null);
      };
    });
  });
}

export async function saveLastFullSync(timestamp: string): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_SYNC_SETTINGS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put({ key: "lastFullSync", value: timestamp });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function getLastFullSync(): Promise<string | null> {
  const db = await initDB();
  if (!db) return null;

  return withTransaction(STORE_SYNC_SETTINGS, "readonly", (store) => {
    return new Promise<string | null>((resolve, reject) => {
      const request = store.get("lastFullSync");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.value || null);
      };
    });
  });
}

export async function saveSyncEnabled(enabled: boolean): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_SYNC_SETTINGS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put({ key: "syncEnabled", value: enabled });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function getSyncEnabled(): Promise<boolean> {
  const db = await initDB();
  if (!db) return false;

  return withTransaction(STORE_SYNC_SETTINGS, "readonly", (store) => {
    return new Promise<boolean>((resolve, reject) => {
      const request = store.get("syncEnabled");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.value ?? true);
      };
    });
  });
}

export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  await Promise.all([
    saveSyncConfig(settings.config),
    saveSyncEnabled(settings.syncEnabled),
    settings.lastFullSync && saveLastFullSync(settings.lastFullSync),
  ]);
}

export async function getSyncSettings(): Promise<SyncSettings | null> {
  const [config, syncEnabled, lastFullSync] = await Promise.all([
    getSyncConfig(),
    getSyncEnabled(),
    getLastFullSync(),
  ]);

  if (!config) return null;

  return {
    config,
    syncEnabled,
    lastFullSync: lastFullSync || undefined,
  };
}

export async function saveWorkflowProgress(progress: WorkflowStepProgress): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_WORKFLOW_PROGRESS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(progress);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function getWorkflowProgress(patientNo: string): Promise<WorkflowStepProgress | null> {
  const db = await initDB();
  if (!db) return null;

  return withTransaction(STORE_WORKFLOW_PROGRESS, "readonly", (store) => {
    return new Promise<WorkflowStepProgress | null>((resolve, reject) => {
      const request = store.get(patientNo);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  });
}

export async function getAllWorkflowProgress(): Promise<WorkflowStepProgress[]> {
  const db = await initDB();
  if (!db) return [];

  return withTransaction(STORE_WORKFLOW_PROGRESS, "readonly", (store) => {
    return new Promise<WorkflowStepProgress[]>((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  });
}

export async function deleteWorkflowProgress(patientNo: string): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_WORKFLOW_PROGRESS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(patientNo);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function saveLastActivePatient(patientNo: string | null): Promise<void> {
  const db = await initDB();
  if (!db) return;

  return withTransaction(STORE_FILTERS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put({ key: "lastActivePatient", value: patientNo });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

export async function getLastActivePatient(): Promise<string | null> {
  const db = await initDB();
  if (!db) return null;

  return withTransaction(STORE_FILTERS, "readonly", (store) => {
    return new Promise<string | null>((resolve, reject) => {
      const request = store.get("lastActivePatient");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        return resolve(result?.value || null);
      };
    });
  });
}
