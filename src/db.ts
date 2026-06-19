import type { PatientProfile, RefractionRecord, ReminderStatus } from "./App";
import type { SyncConfig } from "./sync";

export interface FilterState {
  comparisonFilter: string;
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

const DB_NAME = "hxwl-11-optometry-db";
const DB_VERSION = 3;
const STORE_SYNC_SETTINGS = "syncSettings";
const STORE_PATIENTS = "patients";
const STORE_RECORDS = "records";
const STORE_FILTERS = "filters";
const STORE_REMINDERS = "reminders";

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
      const request = store.put({ key: "comparisonFilter", value: filters.comparisonFilter });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
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
  if (!db) return { comparisonFilter: "all" };

  return withTransaction(STORE_FILTERS, "readonly", (store) => {
    return new Promise<FilterState>((resolve, reject) => {
      const request = store.get("comparisonFilter");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve({
          comparisonFilter: result?.value || "all",
        });
      };
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
  ]);
}

export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    initPromise = null;
  }
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
