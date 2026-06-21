import { useState, useCallback, useRef } from "react";
import type { SyncablePatient, SyncableRecord, SyncStatus, SyncConfig, EntityType, FieldResolution, FieldChoice } from "../sync";
import {
  DEFAULT_SYNC_CONFIG,
  mockServer,
  markSubmitting,
  markSynced,
  markFailed,
  markConflictWithHistory,
  resolveConflictKeepLocal,
  resolveConflictKeepServer,
  resolveConflictWithMerge,
  computeFieldDiffs,
  stripSyncMetadata,
} from "../sync";
import { getSyncConfig, saveSyncConfig } from "../db";

interface UseSyncStateParams {
  patients: SyncablePatient[];
  records: SyncableRecord[];
  setPatients: React.Dispatch<React.SetStateAction<SyncablePatient[]>>;
  setRecords: React.Dispatch<React.SetStateAction<SyncableRecord[]>>;
}

interface UseSyncStateReturn {
  syncConfig: SyncConfig;
  setSyncConfig: React.Dispatch<React.SetStateAction<SyncConfig>>;
  isSyncing: boolean;
  syncProgress: { current: number; total: number };
  showSyncPanel: boolean;
  setShowSyncPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showConflictModal: boolean;
  setShowConflictModal: React.Dispatch<React.SetStateAction<boolean>>;
  conflictEntity: { type: EntityType; entity: any } | null;
  setConflictEntity: React.Dispatch<React.SetStateAction<{ type: EntityType; entity: any } | null>>;
  fieldResolutions: Record<string, FieldChoice>;
  setFieldResolutions: React.Dispatch<React.SetStateAction<Record<string, FieldChoice>>>;
  showSyncErrorModal: boolean;
  setShowSyncErrorModal: React.Dispatch<React.SetStateAction<boolean>>;
  syncErrorEntity: { type: EntityType; entity: any } | null;
  setSyncErrorEntity: React.Dispatch<React.SetStateAction<{ type: EntityType; entity: any } | null>>;
  syncMessage: string | null;
  setSyncMessage: React.Dispatch<React.SetStateAction<string | null>>;
  autoSyncTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  showSyncMessage: (msg: string, duration?: number) => void;
  handleSyncAll: () => Promise<void>;
  handleSyncEntity: (type: EntityType, id: string) => Promise<void>;
  handleRetryFailed: () => void;
  handleResolveConflict: (type: EntityType, id: string, keepLocal: boolean, resolutions?: FieldResolution[]) => void;
  handleGenerateConflict: (type: EntityType, id: string) => void;
  handleUpdateSyncConfig: (config: Partial<SyncConfig>) => Promise<void>;
  openConflictModal: (type: EntityType, entity: any) => void;
  openSyncErrorModal: (type: EntityType, entity: any) => void;
  initSyncConfig: () => Promise<void>;
}

export function useSyncState({
  patients,
  records,
  setPatients,
  setRecords,
}: UseSyncStateParams): UseSyncStateReturn {
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictEntity, setConflictEntity] = useState<{ type: EntityType; entity: any } | null>(null);
  const [fieldResolutions, setFieldResolutions] = useState<Record<string, FieldChoice>>({});
  const [showSyncErrorModal, setShowSyncErrorModal] = useState(false);
  const [syncErrorEntity, setSyncErrorEntity] = useState<{ type: EntityType; entity: any } | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showSyncMessage = useCallback((msg: string, duration = 3000) => {
    setSyncMessage(msg);
    setTimeout(() => setSyncMessage(null), duration);
  }, []);

  const initSyncConfig = useCallback(async () => {
    try {
      const savedConfig = await getSyncConfig();
      if (savedConfig) {
        setSyncConfig(savedConfig);
      }
    } catch (err) {
      console.error("加载同步配置失败:", err);
    }
  }, []);

  const handleSyncAll = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: 0 });

    try {
      const pendingPatients = patients.filter(p =>
        (p.syncStatus === "pending" || p.syncStatus === "failed") &&
        !p.isSubmitting
      );
      const pendingRecords = records.filter(r =>
        (r.syncStatus === "pending" || r.syncStatus === "failed") &&
        !r.isSubmitting
      );
      const total = pendingPatients.length + pendingRecords.length;

      if (total === 0) {
        showSyncMessage("没有需要同步的记录");
        setIsSyncing(false);
        return;
      }

      setSyncProgress({ current: 0, total });

      let completed = 0;
      let successCount = 0;
      let failedCount = 0;
      let conflictCount = 0;

      if (pendingPatients.length > 0) {
        const submittingPatients = pendingPatients.map(p => markSubmitting(p));
        setPatients(prev => prev.map(p => submittingPatients.find(sp => sp.id === p.id) || p));
        const { results } = await mockServer.pushBatch("patient", submittingPatients, syncConfig, (c, t) => {
          setSyncProgress({ current: completed + c, total });
        });

        const updatedPatients = [...patients];
        results.forEach((result, id) => {
          const idx = updatedPatients.findIndex(p => p.id === id);
          if (idx !== -1) {
            const submittedEntity = submittingPatients.find(p => p.id === id) || updatedPatients[idx];
            if (result.conflict && result.data) {
              updatedPatients[idx] = markConflictWithHistory(submittedEntity, result.data, "update-update");
              conflictCount++;
            } else if (result.success && result.serverVersion) {
              updatedPatients[idx] = markSynced(submittedEntity, result.serverVersion);
              successCount++;
            } else if (result.error) {
              const isDuplicate = !!(result as any).duplicate || (submittedEntity as any).submitCount > 1;
              updatedPatients[idx] = markFailed(submittedEntity, isDuplicate ? `${result.error}（已尝试 ${(submittedEntity as any).submitCount} 次提交）` : result.error);
              failedCount++;
            }
            completed++;
            setSyncProgress({ current: completed, total });
          }
        });
        setPatients(updatedPatients);
      }

      if (pendingRecords.length > 0) {
        const submittingRecords = pendingRecords.map(r => markSubmitting(r));
        setRecords(prev => prev.map(r => submittingRecords.find(sr => sr.id === r.id) || r));
        const { results } = await mockServer.pushBatch("record", submittingRecords, syncConfig, (c, t) => {
          setSyncProgress({ current: completed + c, total });
        });

        const updatedRecords = [...records];
        results.forEach((result, id) => {
          const idx = updatedRecords.findIndex(r => r.id === id);
          if (idx !== -1) {
            const submittedEntity = submittingRecords.find(r => r.id === id) || updatedRecords[idx];
            if (result.conflict && result.data) {
              updatedRecords[idx] = markConflictWithHistory(submittedEntity, result.data, "update-update");
              conflictCount++;
            } else if (result.success && result.serverVersion) {
              updatedRecords[idx] = markSynced(submittedEntity, result.serverVersion);
              successCount++;
            } else if (result.error) {
              const isDuplicate = !!(result as any).duplicate || (submittedEntity as any).submitCount > 1;
              updatedRecords[idx] = markFailed(submittedEntity, isDuplicate ? `${result.error}（已尝试 ${(submittedEntity as any).submitCount} 次提交）` : result.error);
              failedCount++;
            }
            completed++;
            setSyncProgress({ current: completed, total });
          }
        });
        setRecords(updatedRecords);
      }

      const msg = `同步完成：成功 ${successCount} 条，失败 ${failedCount} 条，冲突 ${conflictCount} 条`;
      showSyncMessage(msg);
    } catch (err) {
      console.error("同步失败:", err);
      showSyncMessage("同步过程中发生错误，请稍后重试");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, patients, records, syncConfig, showSyncMessage, setPatients, setRecords]);

  const handleSyncEntity = useCallback(async (type: EntityType, id: string) => {
    const list = type === "patient" ? patients : records;
    const setList = type === "patient" ? setPatients : setRecords;
    const entity = list.find(e => e.id === id);

    if (!entity) return;
    if ((entity as any).isSubmitting) {
      showSyncMessage("该记录正在同步中，请勿重复提交");
      return;
    }

    const submittingList = [...list];
    const idx = submittingList.findIndex(e => e.id === id);
    let submittingEntity = entity;
    if (idx !== -1) {
      submittingList[idx] = markSubmitting(submittingList[idx]);
      submittingEntity = submittingList[idx];
      setList(submittingList as any);
    }

    try {
      const result = await mockServer.pushEntity(type, submittingEntity, syncConfig);
      const updatedList = type === "patient" ? [...patients] : [...records];
      const updatedIdx = updatedList.findIndex(e => e.id === id);

      if (updatedIdx !== -1) {
        if (result.conflict && result.data) {
          updatedList[updatedIdx] = markConflictWithHistory(submittingEntity, result.data, "update-update");
          showSyncMessage("检测到数据冲突，请处理后再同步");
        } else if (result.success && result.serverVersion) {
          updatedList[updatedIdx] = markSynced(submittingEntity, result.serverVersion);
          showSyncMessage("同步成功");
        } else if (result.error) {
          const isDuplicate = !!(result as any).duplicate || (submittingEntity as any).submitCount > 1;
          updatedList[updatedIdx] = markFailed(submittingEntity, isDuplicate ? `${result.error}（已尝试 ${(submittingEntity as any).submitCount} 次提交）` : result.error);
          showSyncMessage(`${isDuplicate ? "⚠️ " : ""}同步失败：${result.error}`);
        }
        setList(updatedList as any);
      }
    } catch (err) {
      console.error("单条同步失败:", err);
      const failedList = type === "patient" ? [...patients] : [...records];
      const failedIdx = failedList.findIndex(e => e.id === id);
      if (failedIdx !== -1) {
        failedList[failedIdx] = markFailed(failedList[failedIdx], "未知错误");
        setList(failedList as any);
      }
    }
  }, [patients, records, syncConfig, showSyncMessage, setPatients, setRecords]);

  const handleRetryFailed = useCallback(() => {
    const failedPatients = patients.filter(p => p.syncStatus === "failed");
    const failedRecords = records.filter(r => r.syncStatus === "failed");

    if (failedPatients.length === 0 && failedRecords.length === 0) {
      showSyncMessage("没有需要重试的失败记录");
      return;
    }

    const resetPatients = patients.map(p =>
      p.syncStatus === "failed" ? { ...p, syncStatus: "pending" as SyncStatus, syncError: undefined } : p
    );
    const resetRecords = records.map(r =>
      r.syncStatus === "failed" ? { ...r, syncStatus: "pending" as SyncStatus, syncError: undefined } : r
    );

    setPatients(resetPatients);
    setRecords(resetRecords);
    setTimeout(() => handleSyncAll(), 100);
  }, [patients, records, showSyncMessage, handleSyncAll, setPatients, setRecords]);

  const handleResolveConflict = useCallback((type: EntityType, id: string, keepLocal: boolean, resolutions?: FieldResolution[]) => {
    const list = type === "patient" ? patients : records;
    const setList = type === "patient" ? setPatients : setRecords;

    const updatedList = list.map(entity => {
      if (entity.id !== id) return entity;
      if (resolutions && resolutions.length > 0) {
        return resolveConflictWithMerge(entity, resolutions);
      }
      if (keepLocal) {
        return resolveConflictKeepLocal(entity);
      } else {
        return resolveConflictKeepServer(entity);
      }
    });

    setList(updatedList as any);
    setShowConflictModal(false);
    setConflictEntity(null);
    setFieldResolutions({});
    const message = resolutions && resolutions.length > 0
      ? `已完成字段级合并（${resolutions.length} 个字段），待重新同步`
      : (keepLocal ? "已保留本地版本，待重新同步" : "已采用服务端版本");
    showSyncMessage(message);
  }, [patients, records, showSyncMessage, setPatients, setRecords]);

  const handleGenerateConflict = useCallback((type: EntityType, id: string) => {
    const list = type === "patient" ? patients : records;
    const entity = list.find(e => e.id === id);
    if (!entity) return;

    const strippedEntity = stripSyncMetadata(entity);
    const modifiedData = {
      ...strippedEntity,
      remark: (strippedEntity as any).remark ? `${(strippedEntity as any).remark} (服务端已更新)` : "服务端更新备注",
      lastCheckDate: (strippedEntity as any).lastCheckDate || "2026-06-15",
      updatedAt: new Date().toISOString(),
    };
    const currentServerVersion = (entity as any).serverVersion || 1;
    modifiedData.serverVersion = currentServerVersion + 1;

    mockServer.generateServerConflict(type, id, modifiedData);

    const setList = type === "patient" ? setPatients : setRecords;
    const updatedList = list.map(e =>
      e.id === id ? markConflictWithHistory(e, modifiedData, "update-update") : e
    );
    setList(updatedList as any);
    showSyncMessage("已模拟生成服务端冲突");
  }, [patients, records, showSyncMessage, setPatients, setRecords]);

  const handleUpdateSyncConfig = useCallback(async (config: Partial<SyncConfig>) => {
    const newConfig = { ...syncConfig, ...config };
    setSyncConfig(newConfig);
    try {
      await saveSyncConfig(newConfig);
    } catch (err) {
      console.error("保存同步配置失败:", err);
    }
  }, [syncConfig]);

  const openConflictModal = useCallback((type: EntityType, entity: any) => {
    setConflictEntity({ type, entity });
    const fieldDiffs = computeFieldDiffs(type, entity, entity.conflictData?.serverData);
    const changedFields = fieldDiffs.filter(d => d.isDifferent);
    const initialResolutions: Record<string, FieldChoice> = {};
    changedFields.forEach(diff => {
      initialResolutions[diff.field] = "local";
    });
    setFieldResolutions(initialResolutions);
    setShowConflictModal(true);
  }, []);

  const openSyncErrorModal = useCallback((type: EntityType, entity: any) => {
    setSyncErrorEntity({ type, entity });
    setShowSyncErrorModal(true);
  }, []);

  return {
    syncConfig,
    setSyncConfig,
    isSyncing,
    syncProgress,
    showSyncPanel,
    setShowSyncPanel,
    showConflictModal,
    setShowConflictModal,
    conflictEntity,
    setConflictEntity,
    fieldResolutions,
    setFieldResolutions,
    showSyncErrorModal,
    setShowSyncErrorModal,
    syncErrorEntity,
    setSyncErrorEntity,
    syncMessage,
    setSyncMessage,
    autoSyncTimerRef,
    showSyncMessage,
    handleSyncAll,
    handleSyncEntity,
    handleRetryFailed,
    handleResolveConflict,
    handleGenerateConflict,
    handleUpdateSyncConfig,
    openConflictModal,
    openSyncErrorModal,
    initSyncConfig,
  };
}
