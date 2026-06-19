import type { PatientProfile, RefractionRecord } from "./App";

export interface FilterState {
  comparisonFilter: string;
}

export interface AppData {
  patients: PatientProfile[];
  records: RefractionRecord[];
  filters: FilterState;
}

const DB_NAME = "hxwl-11-optometry-db";
const DB_VERSION = 1;
const STORE_PATIENTS = "patients";
const STORE_RECORDS = "records";
const STORE_FILTERS = "filters";

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

export async function saveAllData(data: AppData): Promise<void> {
  await Promise.all([
    savePatients(data.patients),
    saveRecords(data.records),
    saveFilters(data.filters),
  ]);
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

export async function getAllData(): Promise<AppData> {
  const [patients, records, filters] = await Promise.all([
    getPatients(),
    getRecords(),
    getFilters(),
  ]);
  return { patients, records, filters };
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
  return data.patients.length > 0 || data.records.length > 0;
}
