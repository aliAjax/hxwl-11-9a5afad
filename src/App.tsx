import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import "./styles.css";
import {
  initDB,
  isIndexedDBSupported,
  saveAllData,
  getAllData,
  clearAllData,
  savePatients,
  saveRecords,
  saveFilters,
  saveClearedFlag,
  getClearedFlag,
  getRecordsPersistedFlag,
  getSyncConfig,
  saveSyncConfig,
  getSyncSettings,
  saveSyncSettings,
  saveDraft,
  getDraft,
  deleteDraft,
  saveWorkflowProgress,
  getWorkflowProgress,
  getAllWorkflowProgress,
  deleteWorkflowProgress,
  saveLastActivePatient,
  getLastActivePatient,
  type AppData,
  type FilterState,
  type ReminderData,
  type WorkflowStepProgress,
  type StepInfo,
} from "./db";
import {
  type SyncStatus,
  type SyncablePatient,
  type SyncableRecord,
  type SyncStats,
  type SyncConfig,
  type EntityType,
  type FieldDiff,
  type FieldResolution,
  type FieldChoice,
  type MergeHistoryItem,
  DEFAULT_SYNC_CONFIG,
  SYNC_STATUS_LABELS,
  SYNC_STATUS_COLORS,
  SYNC_STATUS_ICONS,
  mockServer,
  createSyncableEntity,
  markForSync,
  markSynced,
  markFailed,
  markConflict,
  markConflictWithHistory,
  markSubmitting,
  resolveConflictKeepLocal,
  resolveConflictKeepServer,
  resolveConflictWithMerge,
  calculateSyncStats,
  computeFieldDiffs,
  stripSyncMetadata,
  formatSyncTime,
} from "./sync";
import {
  parseSafeNumber,
  cleanNumber,
  type FieldError,
  validateVision,
  validateSphere,
  validateCylinder,
  validateAxis,
  validateAdd,
  validatePd,
  validateCurvature,
} from "./validation";
import {
  CSV_FIELD_MAPPINGS,
  ageGroups,
  formatLocalDate,
  type CsvParseResult,
  parseCsvText,
} from "./csvParsers";
import {
  type UserRole,
  type WorkflowStep,
  type DashboardSection,
  type RoleConfig,
  type RolePermission,
  type PatientProfile,
  type ReminderStatus,
  type EyeRefraction,
  type EyeCurvature,
  type CornealCurvature,
  type RefractionRecord,
  type PatientReminder,
  type PrescriptionErrors,
  type ComparisonCategory,
  type ComparisonBaselineType,
  type ComparisonBaselineConfig,
  type EyeComparison,
  type CurvatureComparison,
  type PrescriptionComparisonResult,
  type LensCategory,
  type LensRecommendationInput,
  type LensRecommendationResult,
  type PrescriptionFormData,
  ROLE_LABELS,
  ROLE_CONFIGS,
  ROLE_PERMISSIONS,
  STEP_LABELS,
  STEP_ICONS,
  CATEGORY_CONFIG as categoryConfig,
  LENS_CATEGORY_CONFIG as lensCategoryConfig,
  EMPTY_PATIENT_FORM as emptyForm,
  EMPTY_PRESCRIPTION_FORM as emptyPrescriptionForm,
} from "./types";
import {
  lensTypes,
  categories,
  examTypes,
  genders,
  INITIAL_PATIENTS as initialPatients,
  INITIAL_RECORDS as refractionRecords,
  PROJECT_CONFIG as project,
} from "./constants";
import {
  parseLocalDate,
  startOfLocalDay,
  calculateReminder,
  compareNumber,
  compareEyeRefraction,
  compareCurvature,
  classifyComparison,
  comparePrescriptions,
  getPatientRecords,
  getAllComparisons,
  getLatestTwoComparisons,
  getFirstToCurrentComparisons,
  getCustomComparison,
  getComparisonsByBaseline,
  getVisibleRecordSummary,
  categorizeLensRecommendation,
  parseDiopter,
  generateLensRecommendation,
  generatePrescriptionExportText,
  generateRecordsExportCSV,
  formatDiff,
} from "./utils";
import { useSyncState } from "./hooks";
import {
  MetricCard,
  RecordSyncIndicator,
  PatientForm,
  PrescriptionForm,
  PatientCard,
  ReminderCard,
  ComparisonCard,
  ComparisonDrawer,
  RefractionDrawer,
  ImportPreview,
  LensRecommendationForm,
  LensRecommendationResultDisplay,
} from "./components";

function App() {
  const [dbSupported, setDbSupported] = useState<boolean | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [patients, setPatients] = useState<SyncablePatient[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [today] = useState(() => new Date());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<RefractionRecord | null>(null);
  const [previousRecordForCompare, setPreviousRecordForCompare] = useState<RefractionRecord | null>(null);
  const [records, setRecords] = useState<SyncableRecord[]>([]);
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [prescriptionDraft, setPrescriptionDraft] = useState<PrescriptionFormData | null>(null);
  const [prescriptionDraftSavedAt, setPrescriptionDraftSavedAt] = useState<string | null>(null);
  const draftKeyRef = useRef<string>("prescription-draft");
  const draftSyncRef = useRef<PrescriptionFormData | null>(null);
  const [comparisonDrawerOpen, setComparisonDrawerOpen] = useState(false);
  const [selectedComparison, setSelectedComparison] = useState<PrescriptionComparisonResult | null>(null);
  const [comparisonFilter, setComparisonFilter] = useState<ComparisonCategory | "all">("all");
  const [comparisonBaseline, setComparisonBaseline] = useState<ComparisonBaselineConfig>({ type: "latest-two" });
  const [showBaselineSelector, setShowBaselineSelector] = useState(false);
  const [customSelectStep, setCustomSelectStep] = useState<0 | 1>(0);
  const [customSelectPatientNo, setCustomSelectPatientNo] = useState<string | null>(null);
  const [showLensRecommendation, setShowLensRecommendation] = useState(false);
  const [lensRecommendationResult, setLensRecommendationResult] = useState<LensRecommendationResult | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customCycles, setCustomCycles] = useState<Record<string, number>>({});
  const [selectedReminderPatientNos, setSelectedReminderPatientNos] = useState<Set<string>>(new Set());
  const [showBatchResetConfirm, setShowBatchResetConfirm] = useState(false);

  const [currentRole, setCurrentRoleState] = useState<UserRole>("optometrist");
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(ROLE_CONFIGS["optometrist"].defaultStep);
  const [selectedPatientNo, setSelectedPatientNo] = useState<string | null>(null);
  const [workflowProgressMap, setWorkflowProgressMap] = useState<Record<string, WorkflowStepProgress>>({});
  const [progressRestored, setProgressRestored] = useState(false);

  const [patientFormDirty, setPatientFormDirty] = useState(false);
  const patientFormDataRef = useRef<Omit<PatientProfile, "id">>(emptyForm);
  const [prescriptionFormDirty, setPrescriptionFormDirty] = useState(false);
  const prescriptionFormDataRef = useRef<PrescriptionFormData>(emptyPrescriptionForm);
  const [showRoleSwitchConfirm, setShowRoleSwitchConfirm] = useState(false);
  const pendingRoleRef = useRef<UserRole | null>(null);
  const patientFormSubmitRef = useRef<((data: Omit<PatientProfile, "id">) => void) | null>(null);
  const prescriptionFormSubmitRef = useRef<(() => boolean) | null>(null);
  const cancelAddRef = useRef<(() => void) | null>(null);
  const cancelEditRef = useRef<(() => void) | null>(null);
  const cancelPrescriptionFormRef = useRef<(() => void) | null>(null);
  const handlePrescriptionDraftDiscardRef = useRef<(() => void) | null>(null);
  const handleAddRef = useRef<((data: Omit<PatientProfile, "id">) => void) | null>(null);
  const handleEditRef = useRef<((data: Omit<PatientProfile, "id">) => void) | null>(null);

  const syncState = useSyncState({
    patients,
    records,
    setPatients,
    setRecords,
  });

  const {
    syncConfig,
    setSyncConfig,
    isSyncing,
    syncProgress,
    showSyncPanel,
    showConflictModal,
    conflictEntity,
    setConflictEntity,
    fieldResolutions,
    showSyncErrorModal,
    syncErrorEntity,
    syncMessage,
    setShowSyncPanel,
    setShowConflictModal,
    setFieldResolutions,
    setShowSyncErrorModal,
    setSyncMessage,
    handleSyncAll,
    handleSyncEntity,
    handleRetryFailed,
    handleResolveConflict,
    handleGenerateConflict,
    handleUpdateSyncConfig,
    openConflictModal,
    openSyncErrorModal,
    showSyncMessage,
    autoSyncTimerRef,
    initSyncConfig,
  } = syncState;

  const switchStep = useCallback((step: WorkflowStep, skipCheck = false) => {
    if (showPrescriptionForm && draftSyncRef.current && step !== "initial-exam") {
      const data = draftSyncRef.current;
      const hasContent = data.patientNo.trim() || data.patientName.trim() ||
        data.rightEye.sphere.trim() || data.leftEye.sphere.trim() ||
        data.rightEye.cylinder.trim() || data.leftEye.cylinder.trim();
      if (hasContent && dbSupported && dbReady) {
        saveDraft(draftKeyRef.current, data).catch(() => {});
      }
    }

    if (!skipCheck && step !== "dashboard") {
      const rolePerm = ROLE_PERMISSIONS[currentRole];
      const permissionMap: Record<WorkflowStep, keyof RolePermission> = {
        "dashboard": "canViewPatientProfile",
        "patient-profile": "canViewPatientProfile",
        "initial-exam": "canViewInitialExam",
        "recheck-compare": "canViewRecheckCompare",
        "prescription-summary": "canViewPrescriptionSummary",
        "export": "canExport",
      };
      const permKey = permissionMap[step];
      if (!rolePerm[permKey]) {
        showSyncMessage?.(`当前角色「${ROLE_LABELS[currentRole]}」无权访问此步骤`, 3000);
        return;
      }
    }

    setCurrentStep(step);
  }, [showPrescriptionForm, dbSupported, dbReady, currentRole]);
  const [patientFilter, setPatientFilter] = useState<string>("");
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>("");
  const [lensTypeFilter, setLensTypeFilter] = useState<string>("");
  const [reminderStatusFilter, setReminderStatusFilter] = useState<string>("");
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const permission = ROLE_PERMISSIONS[currentRole];
  const roleConfig = ROLE_CONFIGS[currentRole];

  const hasActiveFilters = ageGroupFilter || lensTypeFilter || reminderStatusFilter;

  const clearAllFilters = useCallback(() => {
    setAgeGroupFilter("");
    setLensTypeFilter("");
    setReminderStatusFilter("");
  }, []);

  const detectUnsavedEditions = useCallback((targetRole: UserRole): {
    hasPrescriptionUnsaved: boolean;
    hasPatientUnsaved: boolean;
    hasConflictOpen: boolean;
    willLosePrescriptionEdit: boolean;
    willLosePatientEdit: boolean;
  } => {
    const currentPermission = ROLE_PERMISSIONS[currentRole];
    const targetPermission = ROLE_PERMISSIONS[targetRole];
    const hasPrescriptionUnsaved = showPrescriptionForm && prescriptionFormDirty;
    const hasPatientUnsaved = (showForm || !!editingId) && patientFormDirty;
    const hasConflictOpen = showConflictModal;
    const willLosePrescriptionEdit = currentPermission.canEditInitialExam && !targetPermission.canEditInitialExam;
    const willLosePatientEdit = currentPermission.canEditPatientProfile && !targetPermission.canEditPatientProfile;
    return {
      hasPrescriptionUnsaved,
      hasPatientUnsaved,
      hasConflictOpen,
      willLosePrescriptionEdit,
      willLosePatientEdit
    };
  }, [currentRole, showPrescriptionForm, prescriptionFormDirty, showForm, editingId, patientFormDirty, showConflictModal]);

  const finalizeRoleSwitch = useCallback((role: UserRole) => {
    if (showPrescriptionForm && draftSyncRef.current && dbSupported && dbReady) {
      const data = draftSyncRef.current;
      const hasContent = data.patientNo.trim() || data.patientName.trim() ||
        data.rightEye.sphere.trim() || data.leftEye.sphere.trim() ||
        data.rightEye.cylinder.trim() || data.leftEye.cylinder.trim();
      if (hasContent) {
        saveDraft(draftKeyRef.current, data).catch(() => {});
      }
    }
    setCurrentRoleState(role);
    setCurrentStep(ROLE_CONFIGS[role].defaultStep);
    setExportSuccess(null);
    setShowRoleSwitchConfirm(false);
    pendingRoleRef.current = null;
  }, [showPrescriptionForm, dbSupported, dbReady]);

  const handleRoleChange = useCallback((role: UserRole) => {
    if (role === currentRole) return;
    const info = detectUnsavedEditions(role);
    const needsConfirm =
      (info.hasPrescriptionUnsaved && info.willLosePrescriptionEdit) ||
      (info.hasPatientUnsaved && info.willLosePatientEdit) ||
      (info.hasConflictOpen && (info.willLosePrescriptionEdit || info.willLosePatientEdit));

    if (!needsConfirm) {
      finalizeRoleSwitch(role);
      return;
    }

    pendingRoleRef.current = role;
    setShowRoleSwitchConfirm(true);
  }, [currentRole, detectUnsavedEditions, finalizeRoleSwitch]);

  const setCurrentRole = handleRoleChange;

  const handleRoleSwitchSave = useCallback(() => {
    const info = pendingRoleRef.current ? detectUnsavedEditions(pendingRoleRef.current) : null;
    if (info?.hasPatientUnsaved && patientFormSubmitRef.current) {
      const data = patientFormDataRef.current;
      if (data.patientNo.trim()) {
        patientFormSubmitRef.current(data);
      }
    }
    if (info?.hasPrescriptionUnsaved) {
      const submitted = prescriptionFormSubmitRef.current ? prescriptionFormSubmitRef.current() : false;
      if (!submitted && cancelPrescriptionFormRef.current) {
        cancelPrescriptionFormRef.current();
      }
    }
    if (info?.hasConflictOpen) {
      setShowConflictModal(false);
      setConflictEntity(null);
    }
    if (pendingRoleRef.current) {
      finalizeRoleSwitch(pendingRoleRef.current);
    }
  }, [detectUnsavedEditions, finalizeRoleSwitch]);

  const handleRoleSwitchDiscard = useCallback(() => {
    const info = pendingRoleRef.current ? detectUnsavedEditions(pendingRoleRef.current) : null;
    if (info?.hasPatientUnsaved) {
      if (showForm && cancelAddRef.current) cancelAddRef.current();
      if (editingId && cancelEditRef.current) cancelEditRef.current();
    }
    if (info?.hasPrescriptionUnsaved) {
      if (handlePrescriptionDraftDiscardRef.current) handlePrescriptionDraftDiscardRef.current();
      if (cancelPrescriptionFormRef.current) cancelPrescriptionFormRef.current();
    }
    if (info?.hasConflictOpen) {
      setShowConflictModal(false);
      setConflictEntity(null);
    }
    if (pendingRoleRef.current) {
      finalizeRoleSwitch(pendingRoleRef.current);
    }
  }, [detectUnsavedEditions, finalizeRoleSwitch, showForm, editingId]);

  const handleRoleSwitchCancel = useCallback(() => {
    setShowRoleSwitchConfirm(false);
    pendingRoleRef.current = null;
  }, []);

  const handlePatientFormDirtyChange = useCallback((dirty: boolean, data: Omit<PatientProfile, "id">) => {
    setPatientFormDirty(dirty);
    patientFormDataRef.current = data;
  }, []);

  const handlePrescriptionFormDirtyChange = useCallback((dirty: boolean, data: PrescriptionFormData) => {
    setPrescriptionFormDirty(dirty);
    prescriptionFormDataRef.current = data;
  }, []);

  useEffect(() => {
    if (showForm) {
      patientFormSubmitRef.current = (data) => {
        if (handleAddRef.current) handleAddRef.current(data);
      };
      patientFormDataRef.current = emptyForm;
      setPatientFormDirty(false);
    } else if (editingId) {
      const target = patients.find(p => p.id === editingId);
      if (target) {
        patientFormSubmitRef.current = (data) => {
          if (handleEditRef.current) handleEditRef.current(data);
        };
        patientFormDataRef.current = {
          patientNo: target.patientNo,
          ageGroup: target.ageGroup,
          lensType: target.lensType,
          lastCheckDate: target.lastCheckDate,
          remark: target.remark
        };
        setPatientFormDirty(false);
      }
    } else {
      patientFormSubmitRef.current = null;
      patientFormDataRef.current = emptyForm;
      setPatientFormDirty(false);
    }
  }, [showForm, editingId, patients]);

  useEffect(() => {
    if (!showPrescriptionForm) {
      setPrescriptionFormDirty(false);
      prescriptionFormDataRef.current = emptyPrescriptionForm;
    }
  }, [showPrescriptionForm]);

  const workflowSteps: WorkflowStep[] = useMemo(() => {
    const steps: WorkflowStep[] = ["dashboard"];
    if (permission.canViewPatientProfile) steps.push("patient-profile");
    if (permission.canViewInitialExam) steps.push("initial-exam");
    if (permission.canViewRecheckCompare) steps.push("recheck-compare");
    if (permission.canViewPrescriptionSummary) steps.push("prescription-summary");
    if (permission.canExport) steps.push("export");
    return steps;
  }, [permission]);

  const businessSteps: WorkflowStep[] = useMemo(
    () => ["patient-profile", "initial-exam", "recheck-compare", "prescription-summary", "export"],
    []
  );

  const getPatientRecordCount = useCallback((patientNo: string) => {
    return records.filter(r => r.patientNo === patientNo).length;
  }, [records]);

  const getPatientRecordsByType = useCallback((patientNo: string, type: string) => {
    return records.filter(r => r.patientNo === patientNo && r.type === type).length;
  }, [records]);

  const computeStepInfo = useCallback(
    (step: WorkflowStep, patientNo: string | null, role: UserRole): StepInfo => {
      const rolePerm = ROLE_PERMISSIONS[role];
      const now = new Date().toISOString();

      const permissionMap: Record<WorkflowStep, keyof RolePermission> = {
        "dashboard": "canViewPatientProfile",
        "patient-profile": "canViewPatientProfile",
        "initial-exam": "canViewInitialExam",
        "recheck-compare": "canViewRecheckCompare",
        "prescription-summary": "canViewPrescriptionSummary",
        "export": "canExport",
      };

      const permKey = permissionMap[step];
      if (!rolePerm[permKey]) {
        return {
          status: "blocked",
          blockReason: "permission",
          blockDetail: `当前角色「${ROLE_LABELS[role]}」无此步骤访问权限`,
        };
      }

      if (step === "dashboard") {
        return { status: "completed", completedAt: now };
      }

      if (!patientNo) {
        return { status: "not-started" };
      }

      const patient = patients.find(p => p.patientNo === patientNo);
      const existingProgress = workflowProgressMap[patientNo];
      const prevDetails = existingProgress?.stepDetails || {};

      switch (step) {
        case "patient-profile": {
          if (patient) {
            return {
              status: "completed",
              completedAt: prevDetails["patient-profile"]?.completedAt || now,
            };
          }
          return { status: "not-started" };
        }
        case "initial-exam": {
          if (!patient) {
            return {
              status: "blocked",
              blockReason: "data-missing",
              blockDetail: "请先完成患者建档",
            };
          }
          const examCount = getPatientRecordCount(patientNo);
          if (examCount > 0) {
            return {
              status: "completed",
              completedAt: prevDetails["initial-exam"]?.completedAt || now,
            };
          }
          return { status: "not-started" };
        }
        case "recheck-compare": {
          if (!patient) {
            return {
              status: "blocked",
              blockReason: "data-missing",
              blockDetail: "请先完成患者建档",
            };
          }
          const examCount = getPatientRecordCount(patientNo);
          if (examCount < 2) {
            return {
              status: "blocked",
              blockReason: "data-missing",
              blockDetail: `至少需要2条验光记录（当前${examCount}条），请先录入初次验光数据`,
            };
          }
          if (existingProgress && prevDetails["recheck-compare"]?.status === "completed") {
            return {
              status: "completed",
              completedAt: prevDetails["recheck-compare"].completedAt,
            };
          }
          return { status: "not-started" };
        }
        case "prescription-summary": {
          if (!patient) {
            return {
              status: "blocked",
              blockReason: "data-missing",
              blockDetail: "请先完成患者建档",
            };
          }
          const examCount = getPatientRecordCount(patientNo);
          if (examCount === 0) {
            return {
              status: "blocked",
              blockReason: "data-missing",
              blockDetail: "请先录入验光记录",
            };
          }
          if (existingProgress && prevDetails["prescription-summary"]?.status === "completed") {
            return {
              status: "completed",
              completedAt: prevDetails["prescription-summary"].completedAt,
            };
          }
          return { status: "not-started" };
        }
        case "export": {
          if (!patient) {
            return {
              status: "blocked",
              blockReason: "data-missing",
              blockDetail: "请先完成患者建档",
            };
          }
          const examCount = getPatientRecordCount(patientNo);
          if (examCount === 0) {
            return {
              status: "blocked",
              blockReason: "data-missing",
              blockDetail: "请先录入验光记录",
            };
          }
          if (existingProgress && prevDetails["export"]?.status === "completed") {
            return {
              status: "completed",
              completedAt: prevDetails["export"].completedAt,
            };
          }
          return { status: "not-started" };
        }
      }
      return { status: "not-started" };
    },
    [patients, workflowProgressMap, getPatientRecordCount]
  );

  const selectedPatientStepDetails: Record<WorkflowStep, StepInfo> = useMemo(() => {
    const result = {} as Record<WorkflowStep, StepInfo>;
    const allSteps: WorkflowStep[] = [
      "dashboard",
      "patient-profile",
      "initial-exam",
      "recheck-compare",
      "prescription-summary",
      "export",
    ];
    allSteps.forEach((step) => {
      result[step] = computeStepInfo(step, selectedPatientNo, currentRole);
    });
    return result;
  }, [computeStepInfo, selectedPatientNo, currentRole]);

  const savePatientProgress = useCallback(
    async (
      patientNo: string,
      step: WorkflowStep,
      markCompleted?: WorkflowStep[]
    ) => {
      if (!dbSupported || !dbReady) return;

      const now = new Date().toISOString();
      const existing = workflowProgressMap[patientNo];
      const stepDetails: Record<string, StepInfo> = { ...(existing?.stepDetails || {}) };

      businessSteps.forEach((bs) => {
        if (!stepDetails[bs]) {
          stepDetails[bs] = computeStepInfo(bs, patientNo, currentRole);
        } else {
          const recomputed = computeStepInfo(bs, patientNo, currentRole);
          if (recomputed.status === "blocked") {
            stepDetails[bs] = recomputed;
          } else if (recomputed.status === "completed" && stepDetails[bs].status !== "completed") {
            stepDetails[bs] = recomputed;
          }
        }
      });

      if (markCompleted) {
        markCompleted.forEach((s) => {
          stepDetails[s] = {
            status: "completed",
            completedAt: stepDetails[s]?.completedAt || now,
          };
        });
      }

      stepDetails[step] = {
        ...(stepDetails[step] || {}),
        status: "current",
      };

      const progress: WorkflowStepProgress = {
        patientNo,
        currentStep: step,
        stepDetails,
        lastUpdatedAt: now,
        lastRole: currentRole,
      };

      try {
        await saveWorkflowProgress(progress);
        setWorkflowProgressMap((prev) => ({ ...prev, [patientNo]: progress }));
      } catch (err) {
        console.error("保存工作流进度失败:", err);
      }
    },
    [dbSupported, dbReady, workflowProgressMap, businessSteps, computeStepInfo, currentRole]
  );

  const markStepCompleted = useCallback(
    async (patientNo: string, step: WorkflowStep) => {
      if (!dbSupported || !dbReady) return;
      const now = new Date().toISOString();
      const existing = workflowProgressMap[patientNo];
      const stepDetails = { ...(existing?.stepDetails || {}) };

      businessSteps.forEach((bs) => {
        stepDetails[bs] = stepDetails[bs] || computeStepInfo(bs, patientNo, currentRole);
      });

      stepDetails[step] = {
        status: "completed",
        completedAt: stepDetails[step]?.completedAt || now,
      };

      const currentStepForProgress = existing?.currentStep || step;
      if (stepDetails[currentStepForProgress]?.status !== "current") {
        stepDetails[currentStepForProgress] = {
          ...(stepDetails[currentStepForProgress] || {}),
          status: currentStepForProgress === step ? "completed" : "current",
        };
      }

      const progress: WorkflowStepProgress = {
        patientNo,
        currentStep: currentStepForProgress,
        stepDetails,
        lastUpdatedAt: now,
        lastRole: currentRole,
      };

      try {
        await saveWorkflowProgress(progress);
        setWorkflowProgressMap((prev) => ({ ...prev, [patientNo]: progress }));
      } catch (err) {
        console.error("标记步骤完成失败:", err);
      }
    },
    [dbSupported, dbReady, workflowProgressMap, businessSteps, computeStepInfo, currentRole]
  );

  const reminders = useMemo(() => {
    return patients
      .filter(p => p.lastCheckDate)
      .map(p => calculateReminder(p, today, customCycles[p.patientNo]))
      .sort((a, b) => a.daysUntilNext - b.daysUntilNext);
  }, [patients, today, customCycles]);

  const patientSyncStats = useMemo(() => calculateSyncStats(patients), [patients]);
  const recordSyncStats = useMemo(() => calculateSyncStats(records), [records]);

  const overallSyncStats = useMemo<SyncStats>(() => {
    const all = [...patients, ...records];
    return calculateSyncStats(all);
  }, [patients, records]);

  const hasPendingSync = useMemo(() => {
    return overallSyncStats.pending > 0 || overallSyncStats.failed > 0 || overallSyncStats.conflict > 0;
  }, [overallSyncStats]);

  const scheduleSave = useCallback((data: AppData) => {
    if (!dbSupported || !dbReady) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveAllData(data);
        if (data.patients.length > 0 || data.records.length > 0) {
          await saveClearedFlag(false);
        }
      } catch (err) {
        console.error("自动保存失败:", err);
      }
    }, 500);
  }, [dbSupported, dbReady]);

  useEffect(() => {
    const checkSupport = () => {
      const supported = isIndexedDBSupported();
      setDbSupported(supported);
      if (!supported) {
        setIsLoading(false);
        return;
      }
    };

    const init = async () => {
      try {
        const db = await initDB();
        if (db) {
          setDbReady(true);
          const wasCleared = await getClearedFlag();
          const recordsPersisted = await getRecordsPersistedFlag();
          const persistedData = await getAllData();
          const savedConfig = await getSyncConfig();
          if (savedConfig) {
            setSyncConfig(savedConfig);
          }

          if (persistedData.patients.length > 0) {
            const hasSyncStatus = persistedData.patients.some((p: any) => p.syncStatus);
            if (hasSyncStatus) {
              const migratedPatients = persistedData.patients.map((p: any) => ({
                ...p,
                submitCount: p.submitCount ?? 0,
                isSubmitting: false,
              }));
              setPatients(migratedPatients as SyncablePatient[]);
            } else {
              const syncablePatients = persistedData.patients.map(p => 
                createSyncableEntity(p, "synced")
              );
              setPatients(syncablePatients);
            }
          } else if (wasCleared) {
            setPatients([]);
          } else {
            const patientsWithSync = initialPatients.map((p, idx) => {
              const status: SyncStatus = idx < 5 ? "synced" : idx < 7 ? "pending" : idx < 9 ? "conflict" : "failed";
              const syncable = createSyncableEntity(p, status);
              if (status === "conflict") {
                const stripped = stripSyncMetadata(syncable);
                const serverData = {
                  ...stripped,
                  remark: (stripped as any).remark ? `${(stripped as any).remark} (服务端已更新)` : "服务端更新备注",
                  lastCheckDate: "2026-06-15",
                  serverVersion: 2,
                  updatedAt: new Date().toISOString(),
                };
                mockServer.initializeServerData("patient", syncable.id, serverData, 2);
                return markConflictWithHistory(syncable, serverData, "update-update");
              }
              if (status === "synced") {
                mockServer.initializeServerData("patient", syncable.id, stripSyncMetadata(syncable), 1);
              }
              return syncable;
            });
            setPatients(patientsWithSync);
          }

          if (persistedData.records.length > 0) {
            const hasSyncStatus = persistedData.records.some((r: any) => r.syncStatus);
            if (hasSyncStatus) {
              const migratedRecords = persistedData.records.map((r: any) => ({
                ...r,
                submitCount: r.submitCount ?? 0,
                isSubmitting: false,
              }));
              setRecords(migratedRecords as SyncableRecord[]);
            } else {
              const syncableRecords = persistedData.records.map(r => 
                createSyncableEntity(r, "synced")
              );
              setRecords(syncableRecords);
            }
          } else if (recordsPersisted || wasCleared) {
            setRecords([]);
          } else {
            const recordsWithSync = refractionRecords.map((r, idx) => {
              const status: SyncStatus = idx < 8 ? "synced" : idx < 12 ? "pending" : idx < 14 ? "conflict" : "failed";
              const syncable = createSyncableEntity(r, status);
              if (status === "conflict") {
                const stripped = stripSyncMetadata(syncable);
                const serverData = {
                  ...stripped,
                  summary: (stripped as any).summary ? `${(stripped as any).summary} (服务端已修订)` : "服务端修订摘要",
                  recommendation: "服务端配镜建议更新",
                  serverVersion: 2,
                  updatedAt: new Date().toISOString(),
                };
                mockServer.initializeServerData("record", syncable.id, serverData, 2);
                return markConflictWithHistory(syncable, serverData, "update-update");
              }
              if (status === "synced") {
                mockServer.initializeServerData("record", syncable.id, stripSyncMetadata(syncable), 1);
              }
              return syncable;
            });
            setRecords(recordsWithSync);
          }

          if (persistedData.filters.comparisonFilter) {
            setComparisonFilter(persistedData.filters.comparisonFilter as ComparisonCategory | "all");
          }
          if (persistedData.filters.ageGroupFilter) {
            setAgeGroupFilter(persistedData.filters.ageGroupFilter);
          }
          if (persistedData.filters.lensTypeFilter) {
            setLensTypeFilter(persistedData.filters.lensTypeFilter);
          }
          if (persistedData.filters.reminderStatusFilter) {
            setReminderStatusFilter(persistedData.filters.reminderStatusFilter);
          }
          if (persistedData.reminders.length > 0) {
            const cycleMap: Record<string, number> = {};
            persistedData.reminders.forEach(r => {
              if (r.customCycle && r.customCycle > 0) {
                cycleMap[r.patientNo] = r.customCycle;
              }
            });
            setCustomCycles(cycleMap);
          }

          const allProgress = await getAllWorkflowProgress();
          const progressMap: Record<string, WorkflowStepProgress> = {};
          allProgress.forEach(p => {
            progressMap[p.patientNo] = p;
          });
          setWorkflowProgressMap(progressMap);

          const lastPatient = await getLastActivePatient();
          if (lastPatient) {
            const progress = progressMap[lastPatient];
            const patientExists = persistedData.patients.some(p => p.patientNo === lastPatient) ||
              initialPatients.some(p => p.patientNo === lastPatient);
            if (patientExists && progress) {
              const savedStep = progress.currentStep as WorkflowStep;
              const rolePerm = ROLE_PERMISSIONS[currentRole];
              const permissionMap: Record<WorkflowStep, keyof RolePermission> = {
                "dashboard": "canViewPatientProfile",
                "patient-profile": "canViewPatientProfile",
                "initial-exam": "canViewInitialExam",
                "recheck-compare": "canViewRecheckCompare",
                "prescription-summary": "canViewPrescriptionSummary",
                "export": "canExport",
              };
              const permKey = permissionMap[savedStep];
              if (rolePerm[permKey]) {
                setSelectedPatientNo(lastPatient);
                setCurrentStep(savedStep);
              } else {
                setSelectedPatientNo(lastPatient);
              }
            } else if (patientExists) {
              setSelectedPatientNo(lastPatient);
            }
          }
          setProgressRestored(true);
        }
      } catch (err) {
        console.error("数据库初始化失败:", err);
        setDbSupported(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkSupport();
    if (isIndexedDBSupported()) {
      init();
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (autoSyncTimerRef.current) {
        clearInterval(autoSyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoading && dbSupported && dbReady) {
      const reminderData: ReminderData[] = reminders.map(r => ({
        id: r.id,
        patientNo: r.patientNo,
        reminderStatus: r.reminderStatus,
        nextCheckDate: r.nextCheckDate,
        daysUntilNext: r.daysUntilNext,
        reminderCycle: r.reminderCycle,
        customCycle: customCycles[r.patientNo] || null,
      }));
      scheduleSave({
        patients,
        records,
        filters: { comparisonFilter, ageGroupFilter, lensTypeFilter, reminderStatusFilter },
        reminders: reminderData,
      });
    }
  }, [patients, records, comparisonFilter, ageGroupFilter, lensTypeFilter, reminderStatusFilter, reminders, customCycles, isLoading, scheduleSave, dbSupported, dbReady]);

  const handleClearData = async () => {
    try {
      await clearAllData();
      await saveClearedFlag(true);
      setPatients([]);
      setRecords([]);
      setComparisonFilter("all");
      setAgeGroupFilter("");
      setLensTypeFilter("");
      setReminderStatusFilter("");
      setShowClearConfirm(false);
      setShowForm(false);
      setEditingId(null);
      setDrawerOpen(false);
      setSelectedRecord(null);
      setShowPrescriptionForm(false);
      setShowImportForm(false);
      setComparisonDrawerOpen(false);
      setSelectedComparison(null);
      setShowLensRecommendation(false);
      setLensRecommendationResult(null);
      setCustomCycles({});
      setSelectedPatientNo(null);
      setWorkflowProgressMap({});
    } catch (err) {
      console.error("清空数据失败:", err);
    }
  };

  useEffect(() => {
    if (!progressRestored || !dbSupported || !dbReady) return;
    if (!selectedPatientNo || currentStep === "dashboard") {
      if (selectedPatientNo) {
        saveLastActivePatient(selectedPatientNo).catch(() => {});
      }
      return;
    }
    saveLastActivePatient(selectedPatientNo).catch(() => {});
    savePatientProgress(selectedPatientNo, currentStep);
  }, [selectedPatientNo, currentStep, progressRestored, dbSupported, dbReady, savePatientProgress]);

  useEffect(() => {
    if (!progressRestored || !selectedPatientNo || currentStep === "dashboard") return;
    const autoMarkSteps: WorkflowStep[] = ["recheck-compare", "prescription-summary"];
    if (autoMarkSteps.includes(currentStep)) {
      const stepInfo = computeStepInfo(currentStep, selectedPatientNo, currentRole);
      if (stepInfo.status !== "blocked") {
        markStepCompleted(selectedPatientNo, currentStep).catch(() => {});
      }
    }
  }, [currentStep, selectedPatientNo, progressRestored, computeStepInfo, currentRole, markStepCompleted]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (showPrescriptionForm && draftSyncRef.current) {
        const data = draftSyncRef.current;
        const hasContent = data.patientNo.trim() || data.patientName.trim() ||
          data.rightEye.sphere.trim() || data.leftEye.sphere.trim() ||
          data.rightEye.cylinder.trim() || data.leftEye.cylinder.trim();
        if (hasContent) {
          try {
            localStorage.setItem(draftKeyRef.current, JSON.stringify({ data, savedAt: new Date().toISOString() }));
          } catch {}
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [showPrescriptionForm]);

  const openDrawer = (record: RefractionRecord) => {
    setPreviousRecordForCompare(null);
    setSelectedRecord(record);
    setDrawerOpen(true);
  };

  const navigateSiblingRecord = (direction: "prev" | "next") => {
    if (!selectedRecord) return;
    const patientRecords = records
      .filter(r => r.patientNo === selectedRecord.patientNo)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
    const currentIdx = patientRecords.findIndex(r => r.id === selectedRecord.id);
    if (currentIdx === -1) return;
    const targetIdx = direction === "prev" ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= patientRecords.length) return;
    setPreviousRecordForCompare(selectedRecord);
    setSelectedRecord(patientRecords[targetIdx]);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setPreviousRecordForCompare(null);
  };

  const openComparisonDrawer = (comparison: PrescriptionComparisonResult) => {
    setSelectedComparison(comparison);
    setComparisonDrawerOpen(true);
  };

  const closeComparisonDrawer = () => {
    setComparisonDrawerOpen(false);
  };

  const handleBaselineChange = (type: ComparisonBaselineType) => {
    if (type === "custom" && selectedPatientNo) {
      const patientRecords = getPatientRecords(records, selectedPatientNo);
      if (patientRecords.length >= 2) {
        setCustomSelectPatientNo(selectedPatientNo);
        setCustomSelectStep(1);
        setComparisonBaseline({ type: "custom", customRecordIds: ["", ""] });
        return;
      }
    }
    setComparisonBaseline({ type });
    if (type !== "custom") {
      setCustomSelectStep(0);
      setCustomSelectPatientNo(null);
    }
  };

  const handleSelectPatientForCustom = (patientNo: string) => {
    setCustomSelectPatientNo(patientNo);
    setCustomSelectStep(1);
    setSelectedPatientNo(patientNo);
    setComparisonBaseline({ type: "custom", customRecordIds: ["", ""] });
  };

  const handleSelectRecordForCustom = (recordId: string) => {
    const currentIds = comparisonBaseline.customRecordIds || ["", ""];
    const [firstId, secondId] = currentIds;

    if (recordId === firstId) {
      setComparisonBaseline({
        type: "custom",
        customRecordIds: [secondId, ""],
      });
      return;
    }
    if (recordId === secondId) {
      setComparisonBaseline({
        type: "custom",
        customRecordIds: [firstId, ""],
      });
      return;
    }

    if (!firstId) {
      setComparisonBaseline({
        type: "custom",
        customRecordIds: [recordId, ""],
      });
    } else if (!secondId) {
      setComparisonBaseline({
        type: "custom",
        customRecordIds: [firstId, recordId],
      });
    } else {
      setComparisonBaseline({
        type: "custom",
        customRecordIds: [recordId, ""],
      });
    }
  };

  const resetCustomSelection = () => {
    setComparisonBaseline({ type: "custom", customRecordIds: ["", ""] });
    setCustomSelectStep(0);
    setCustomSelectPatientNo(null);
  };

  const goBackToPatientSelect = () => {
    setCustomSelectStep(0);
    setCustomSelectPatientNo(null);
    setComparisonBaseline({ type: "custom", customRecordIds: ["", ""] });
  };

  const baselineLabelMap: Record<ComparisonBaselineType, string> = {
    "latest-two": "最近两次",
    "first-to-current": "首次对当前",
    "custom": "指定两次记录",
  };

  const patientsWithMultipleRecords = useMemo(() => {
    const patientRecordCount: Record<string, number> = {};
    records.forEach(r => {
      patientRecordCount[r.patientNo] = (patientRecordCount[r.patientNo] || 0) + 1;
    });
    return patients.filter(p => (patientRecordCount[p.patientNo] || 0) >= 2);
  }, [patients, records]);

  const customSelectPatientRecords = useMemo(() => {
    if (!customSelectPatientNo) return [];
    return getPatientRecords(records, customSelectPatientNo);
  }, [records, customSelectPatientNo]);

  const filteredPatientNos = useMemo(() => {
    let result = patients;
    if (ageGroupFilter) {
      result = result.filter(p => p.ageGroup === ageGroupFilter);
    }
    if (lensTypeFilter) {
      result = result.filter(p => p.lensType === lensTypeFilter);
    }
    if (reminderStatusFilter) {
      const statusPatientNos = new Set(
        reminders
          .filter(r => r.reminderStatus === reminderStatusFilter)
          .map(r => r.patientNo)
      );
      result = result.filter(p => statusPatientNos.has(p.patientNo));
    }
    return new Set(result.map(p => p.patientNo));
  }, [patients, ageGroupFilter, lensTypeFilter, reminderStatusFilter, reminders]);

  const { overdue, upcoming, normal } = useMemo(() => {
    const filterByPatients = (list: PatientReminder[]) => {
      if (!ageGroupFilter && !lensTypeFilter && !reminderStatusFilter) return list;
      return list.filter(r => filteredPatientNos.has(r.patientNo));
    };
    return {
      overdue: filterByPatients(reminders.filter(r => r.reminderStatus === "overdue")),
      upcoming: filterByPatients(reminders.filter(r => r.reminderStatus === "upcoming")),
      normal: filterByPatients(reminders.filter(r => r.reminderStatus === "normal")),
    };
  }, [reminders, filteredPatientNos, ageGroupFilter, lensTypeFilter, reminderStatusFilter]);

  const reminderCounts = {
    overdue: overdue.length,
    upcoming: upcoming.length,
    normal: normal.length,
  };

  const comparisons = useMemo(() => getComparisonsByBaseline(records, comparisonBaseline), [records, comparisonBaseline]);

  const { myopiaProgress, astigmatismChange, stable } = useMemo(() => {
    return {
      myopiaProgress: comparisons.filter(c => c.category === "myopia-progress"),
      astigmatismChange: comparisons.filter(c => c.category === "astigmatism-change"),
      stable: comparisons.filter(c => c.category === "stable"),
    };
  }, [comparisons]);

  const filteredComparisons = useMemo(() => {
    if (comparisonFilter === "all") return comparisons;
    return comparisons.filter(c => c.category === comparisonFilter);
  }, [comparisons, comparisonFilter]);

  const displayComparisons = useMemo(() => {
    if (comparisonBaseline.type === "custom") {
      return filteredComparisons;
    }
    if (selectedPatientNo) {
      return filteredComparisons.filter(c => c.patientNo === selectedPatientNo);
    }
    return filteredComparisons;
  }, [filteredComparisons, selectedPatientNo, comparisonBaseline.type]);

  const filteredPatients = useMemo(() => {
    let result = patients;
    if (patientFilter) {
      const lower = patientFilter.toLowerCase();
      result = result.filter(p =>
        p.patientNo.toLowerCase().includes(lower) ||
        p.ageGroup.includes(patientFilter) ||
        p.lensType.includes(patientFilter) ||
        p.remark.toLowerCase().includes(lower)
      );
    }
    if (ageGroupFilter || lensTypeFilter || reminderStatusFilter) {
      result = result.filter(p => filteredPatientNos.has(p.patientNo));
    }
    return result;
  }, [patients, patientFilter, ageGroupFilter, lensTypeFilter, reminderStatusFilter, filteredPatientNos]);

  const selectedPatientRecords = useMemo(() => {
    if (!selectedPatientNo) return [];
    return getPatientRecords(records, selectedPatientNo);
  }, [records, selectedPatientNo]);

  const selectedPatient = useMemo(() => {
    return patients.find(p => p.patientNo === selectedPatientNo);
  }, [patients, selectedPatientNo]);

  const metricLabels = useMemo(() => [
    "患者总数",
    "已逾期复查",
    "即将到期复查",
    "正常复查",
    "近视进展",
    "散光变化",
    "处方稳定",
  ], []);

  const metricValues = useMemo(() => [
    String(patients.length),
    String(overdue.length),
    String(upcoming.length),
    String(normal.length),
    String(myopiaProgress.length),
    String(astigmatismChange.length),
    String(stable.length),
  ], [patients.length, overdue.length, upcoming.length, normal.length, myopiaProgress.length, astigmatismChange.length, stable.length]);

  const metricStatusClasses = useMemo(() => [
    "status-ok",
    "status-danger",
    "status-watch",
    "status-ok",
    "status-danger",
    "status-watch",
    "status-ok",
  ], []);

  const handleAdd = (data: Omit<PatientProfile, "id">) => {
    const newPatient = createSyncableEntity(
      { ...data, id: `p-${Date.now()}` },
      "pending"
    );
    setPatients(prev => [newPatient, ...prev]);
    setShowForm(false);
    setSelectedPatientNo(newPatient.patientNo);
    markStepCompleted(newPatient.patientNo, "patient-profile").catch(() => {});
    if (permission.canViewInitialExam) {
      setCurrentStep("initial-exam");
    }
  };

  const handleEdit = (data: Omit<PatientProfile, "id">) => {
    if (!editingId) return;
    setPatients(prev =>
      prev.map(p => (p.id === editingId ? markForSync({ ...p, ...data }) : p))
    );
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("确定要删除该患者档案吗？关联的验光记录和复查周期设置也会一并删除。")) return;
    const targetPatient = patients.find(p => p.id === id);
    const targetPatientNo = targetPatient?.patientNo;
    setPatients(prev => prev.filter(p => p.id !== id));
    if (targetPatientNo) {
      setRecords(prev => prev.filter(r => r.patientNo !== targetPatientNo));
      setCustomCycles(prev => {
        const next = { ...prev };
        delete next[targetPatientNo];
        return next;
      });
      deleteWorkflowProgress(targetPatientNo).catch(() => {});
      setWorkflowProgressMap(prev => {
        const next = { ...prev };
        delete next[targetPatientNo];
        return next;
      });
    }
    if (editingId === id) setEditingId(null);
    if (selectedRecord && targetPatientNo && selectedRecord.patientNo === targetPatientNo) {
      setSelectedRecord(null);
      setDrawerOpen(false);
    }
    if (selectedPatientNo === targetPatientNo) {
      setSelectedPatientNo(null);
    }
  };

  const startEdit = (patient: PatientProfile) => {
    setEditingId(patient.id);
    setShowForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const openAddForm = () => {
    setShowForm(true);
    setEditingId(null);
  };

  const cancelAdd = () => {
    setShowForm(false);
  };

  const openPrescriptionForm = async () => {
    let draftData: PrescriptionFormData | null = null;
    let draftTime: string | null = null;

    if (dbSupported && dbReady) {
      try {
        const saved = await getDraft(draftKeyRef.current);
        if (saved && saved.data) {
          draftData = saved.data as PrescriptionFormData;
          draftTime = saved.savedAt;
        }
      } catch {}
    }

    try {
      const lsRaw = localStorage.getItem(draftKeyRef.current);
      if (lsRaw) {
        const lsParsed = JSON.parse(lsRaw);
        if (lsParsed.data) {
          if (!draftData || (lsParsed.savedAt && draftTime && lsParsed.savedAt > draftTime)) {
            draftData = lsParsed.data as PrescriptionFormData;
            draftTime = lsParsed.savedAt;
          }
          localStorage.removeItem(draftKeyRef.current);
          if (draftData && dbSupported && dbReady) {
            saveDraft(draftKeyRef.current, draftData).catch(() => {});
          }
        }
      }
    } catch {}

    setPrescriptionDraft(draftData);
    setPrescriptionDraftSavedAt(draftTime);
    setShowPrescriptionForm(true);
  };

  const cancelPrescriptionForm = () => {
    if (draftSyncRef.current && dbSupported && dbReady) {
      const data = draftSyncRef.current;
      const hasContent = data.patientNo.trim() || data.patientName.trim() ||
        data.rightEye.sphere.trim() || data.leftEye.sphere.trim() ||
        data.rightEye.cylinder.trim() || data.leftEye.cylinder.trim();
      if (hasContent) {
        saveDraft(draftKeyRef.current, data).catch(() => {});
      } else {
        deleteDraft(draftKeyRef.current).catch(() => {});
      }
    }
    setShowPrescriptionForm(false);
    setPrescriptionDraft(null);
    setPrescriptionDraftSavedAt(null);
  };

  const handlePrescriptionDraftChange = useCallback((data: PrescriptionFormData) => {
    draftSyncRef.current = data;
    if (!dbSupported || !dbReady) return;
    const hasContent = data.patientNo.trim() || data.patientName.trim() ||
      data.rightEye.sphere.trim() || data.leftEye.sphere.trim() ||
      data.rightEye.cylinder.trim() || data.leftEye.cylinder.trim();
    if (!hasContent) return;
    saveDraft(draftKeyRef.current, data).then(() => {
      setPrescriptionDraftSavedAt(new Date().toISOString());
    }).catch(() => {});
  }, [dbSupported, dbReady]);

  const handlePrescriptionDraftDiscard = useCallback(() => {
    setPrescriptionDraft(null);
    setPrescriptionDraftSavedAt(null);
    deleteDraft(draftKeyRef.current).catch(() => {});
  }, []);

  useEffect(() => {
    cancelAddRef.current = cancelAdd;
    cancelEditRef.current = cancelEdit;
    cancelPrescriptionFormRef.current = cancelPrescriptionForm;
    handlePrescriptionDraftDiscardRef.current = handlePrescriptionDraftDiscard;
    handleAddRef.current = handleAdd;
    handleEditRef.current = handleEdit;
  }, [cancelAdd, cancelEdit, cancelPrescriptionForm, handlePrescriptionDraftDiscard, handleAdd, handleEdit]);

  const handlePrescriptionSubmit = (data: Omit<RefractionRecord, "id" | "summary"> & { summary: string }) => {
    const newRecord = createSyncableEntity(
      { id: `r-${Date.now()}`, ...data },
      "pending"
    );
    setRecords(prev => [newRecord, ...prev]);
    setShowPrescriptionForm(false);
    setPrescriptionDraft(null);
    setPrescriptionDraftSavedAt(null);
    draftSyncRef.current = null;
    deleteDraft(draftKeyRef.current).catch(() => {});
    let needCreatePatient = false;
    if (!patients.find(p => p.patientNo === data.patientNo)) {
      needCreatePatient = true;
      const newPatient = createSyncableEntity(
        {
          id: `p-${Date.now()}`,
          patientNo: data.patientNo,
          ageGroup: data.ageGroup,
          lensType: "",
          lastCheckDate: data.examDate,
          remark: `自动建档，${data.patientName}`
        },
        "pending"
      );
      setPatients(prev => [newPatient, ...prev]);
    } else {
      setPatients(prev => prev.map(p => {
        if (p.patientNo === data.patientNo) {
          return markForSync({ ...p, lastCheckDate: data.examDate });
        }
        return p;
      }));
    }
    setSelectedPatientNo(data.patientNo);
    setTimeout(async () => {
      try {
        if (needCreatePatient) {
          await markStepCompleted(data.patientNo, "patient-profile");
        }
        await markStepCompleted(data.patientNo, "initial-exam");
      } catch {}
    }, 50);
    if (permission.canViewPrescriptionSummary) {
      setCurrentStep("prescription-summary");
    }
  };

  const openImportForm = () => {
    setShowImportForm(true);
    setShowPrescriptionForm(false);
  };

  const cancelImportForm = () => {
    setShowImportForm(false);
  };

  const handleImportSubmit = (recordsData: Array<Omit<RefractionRecord, "id" | "summary"> & { summary: string }>) => {
    const newRecords = recordsData.map((data, index) => 
      createSyncableEntity(
        { id: `r-import-${Date.now()}-${index}`, ...data },
        "pending"
      )
    );
    setRecords(prev => [...newRecords, ...prev]);
    setShowImportForm(false);
    showSyncMessage(`已导入 ${newRecords.length} 条记录，等待同步`);
  };

  const openLensRecommendation = () => {
    setShowLensRecommendation(true);
  };

  const closeLensRecommendation = () => {
    setShowLensRecommendation(false);
    setLensRecommendationResult(null);
  };

  const handleLensRecommendationGenerate = (result: LensRecommendationResult) => {
    setLensRecommendationResult(result);
  };

  const resetLensRecommendation = () => {
    setLensRecommendationResult(null);
  };

  const handleSetCustomCycle = (patientNo: string, days: number | null) => {
    setCustomCycles(prev => {
      const next = { ...prev };
      if (days && days > 0) {
        next[patientNo] = days;
      } else {
        delete next[patientNo];
      }
      return next;
    });
  };

  const visibleReminders = useMemo(() => [...overdue, ...upcoming, ...normal], [overdue, upcoming, normal]);

  const handleToggleReminderSelect = (patientNo: string) => {
    setSelectedReminderPatientNos(prev => {
      const next = new Set(prev);
      if (next.has(patientNo)) {
        next.delete(patientNo);
      } else {
        next.add(patientNo);
      }
      return next;
    });
  };

  const handleSelectAllVisibleReminders = () => {
    const allNos = visibleReminders.map(r => r.patientNo);
    const allSelected = allNos.every(no => selectedReminderPatientNos.has(no));
    if (allSelected) {
      setSelectedReminderPatientNos(new Set());
    } else {
      setSelectedReminderPatientNos(new Set(allNos));
    }
  };

  const handleClearReminderSelection = () => {
    setSelectedReminderPatientNos(new Set());
  };

  const openBatchResetConfirm = () => {
    const countWithCustom = Array.from(selectedReminderPatientNos).filter(no => customCycles[no]).length;
    if (countWithCustom === 0) {
      showSyncMessage("所选患者中没有使用自定义周期的记录");
      return;
    }
    setShowBatchResetConfirm(true);
  };

  const handleBatchResetCycles = () => {
    const affectedPatientNos = Array.from(selectedReminderPatientNos).filter(no => customCycles[no]);
    setCustomCycles(prev => {
      const next = { ...prev };
      affectedPatientNos.forEach(no => delete next[no]);
      return next;
    });
    const affectedCount = affectedPatientNos.length;
    setSelectedReminderPatientNos(new Set());
    setShowBatchResetConfirm(false);
    showSyncMessage(`已将 ${affectedCount} 位患者的复查周期恢复为默认规则`);
  };

  const batchResetAffectedCount = useMemo(() => {
    return Array.from(selectedReminderPatientNos).filter(no => customCycles[no]).length;
  }, [selectedReminderPatientNos, customCycles]);

  const allVisibleSelected = useMemo(() => {
    const allNos = visibleReminders.map(r => r.patientNo);
    return allNos.length > 0 && allNos.every(no => selectedReminderPatientNos.has(no));
  }, [visibleReminders, selectedReminderPatientNos]);

  const handleSelectPatient = (patientNo: string) => {
    const isToggleOff = selectedPatientNo === patientNo;
    setSelectedPatientNo(prev => prev === patientNo ? null : patientNo);

    if (!isToggleOff && progressRestored) {
      const progress = workflowProgressMap[patientNo];
      if (progress?.currentStep && progress.currentStep !== "dashboard") {
        const savedStep = progress.currentStep as WorkflowStep;
        const rolePerm = ROLE_PERMISSIONS[currentRole];
        const permissionMap: Record<WorkflowStep, keyof RolePermission> = {
          "dashboard": "canViewPatientProfile",
          "patient-profile": "canViewPatientProfile",
          "initial-exam": "canViewInitialExam",
          "recheck-compare": "canViewRecheckCompare",
          "prescription-summary": "canViewPrescriptionSummary",
          "export": "canExport",
        };
        const permKey = permissionMap[savedStep];
        if (rolePerm[permKey]) {
          const stepInfo = computeStepInfo(savedStep, patientNo, currentRole);
          if (stepInfo.status !== "blocked") {
            setTimeout(() => switchStep(savedStep), 50);
          }
        }
      }
    }
  };

  const handleExportSinglePrescription = (record: RefractionRecord) => {
    const patient = patients.find(p => p.patientNo === record.patientNo);
    const text = generatePrescriptionExportText(record, patient);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `处方_${record.patientNo}_${record.examDate}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportSuccess(`已导出处方: ${record.patientNo}`);
    setTimeout(() => setExportSuccess(null), 3000);
    markStepCompleted(record.patientNo, "export").catch(() => {});
  };

  const handleExportAllCSV = () => {
    const csv = generateRecordsExportCSV(records, patients);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `验光记录_${formatLocalDate(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportSuccess(`已导出 ${records.length} 条验光记录`);
    setTimeout(() => setExportSuccess(null), 3000);
  };

  const editingPatient = patients.find(p => p.id === editingId);

  const renderRoleWelcome = () => (
    <section className={`role-welcome panel role-theme-${currentRole}`}>
      <div className="role-welcome-header">
        <div className="role-avatar">
          {currentRole === "optometrist" && "🔬"}
          {currentRole === "advisor" && "👤"}
          {currentRole === "review-doctor" && "📊"}
        </div>
        <div className="role-info">
          <p className="role-label">工作台 · {roleConfig.label}视角</p>
          <h2 className="role-title">{roleConfig.description}</h2>
        </div>
        <p className="role-date">今日日期：{formatLocalDate(today)}</p>
      </div>
      <div className="role-quick-actions">
        <p className="role-quick-label">快速入口</p>
        <div className="role-quick-btns">
          {roleConfig.primaryEntryPoints.map((step, idx) => (
            <button
              key={step}
              className={`quick-action-btn ${idx === 0 ? "primary" : ""}`}
              onClick={() => switchStep(step)}
            >
              <span className="quick-action-icon">{STEP_ICONS[step]}</span>
              <span className="quick-action-text">{STEP_LABELS[step]}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );

  const renderReminderBoard = () => (
    permission.canViewReminderBoard && (
      <section className="reminder-board panel">
        <div className="section-heading">
          <div>
            <p>复查管理</p>
            <h2>复查提醒看板</h2>
          </div>
          <div className="reminder-board-header-right">
            <span className="today-info">共 {overdue.length + upcoming.length + normal.length} 位患者</span>
            {permission.canEditReminderCycle && (
              <div className="reminder-batch-actions">
                <label className="reminder-select-all">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleSelectAllVisibleReminders}
                  />
                  <span>全选</span>
                </label>
                {selectedReminderPatientNos.size > 0 && (
                  <>
                    <span className="reminder-selected-count">
                      已选 {selectedReminderPatientNos.size} 人
                      {batchResetAffectedCount > 0 && ` · 其中 ${batchResetAffectedCount} 人使用自定义周期`}
                    </span>
                    <button
                      className="primary-action reminder-batch-reset-btn"
                      onClick={openBatchResetConfirm}
                      disabled={batchResetAffectedCount === 0}
                    >
                      ↺ 批量重置周期
                    </button>
                    <button className="ghost-btn reminder-clear-select-btn" onClick={handleClearReminderSelection}>
                      取消选择
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="reminder-columns">
          <div className="reminder-column">
            <div className="column-header column-danger">
              <span className="column-dot"></span>
              <h3>已逾期</h3>
              <span className="column-count">{overdue.length}</span>
            </div>
            <div className="reminder-list">
              {overdue.length > 0 ? (
                overdue.slice(0, 3).map((reminder, index) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    index={index}
                    isCustom={!!customCycles[reminder.patientNo]}
                    onCycleChange={(days: number) => handleSetCustomCycle(reminder.patientNo, days)}
                    onCycleReset={() => handleSetCustomCycle(reminder.patientNo, null)}
                    canEditCycle={permission.canEditReminderCycle}
                    onSync={() => {
                      const p = patients.find(pp => pp.id === reminder.id);
                      if (p) {
                        if ((p as any).syncStatus === "conflict") {
                          openConflictModal("patient", p);
                        } else {
                          handleSyncEntity("patient", reminder.id);
                        }
                      }
                    }}
                    onGenerateConflict={() => handleGenerateConflict("patient", reminder.id)}
                    isSelected={selectedReminderPatientNos.has(reminder.patientNo)}
                    onToggleSelect={() => handleToggleReminderSelect(reminder.patientNo)}
                    selectionMode={permission.canEditReminderCycle}
                  />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无逾期复查</p>
                </div>
              )}
              {overdue.length > 3 && (
                <button
                  className="text-btn"
                  style={{ marginTop: "8px", alignSelf: "center" }}
                  onClick={() => switchStep("recheck-compare")}
                >
                  查看全部 {overdue.length} 条 →
                </button>
              )}
            </div>
          </div>
          <div className="reminder-column">
            <div className="column-header column-watch">
              <span className="column-dot"></span>
              <h3>即将到期</h3>
              <span className="column-count">{upcoming.length}</span>
            </div>
            <div className="reminder-list">
              {upcoming.length > 0 ? (
                upcoming.slice(0, 3).map((reminder, index) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    index={index}
                    isCustom={!!customCycles[reminder.patientNo]}
                    onCycleChange={(days: number) => handleSetCustomCycle(reminder.patientNo, days)}
                    onCycleReset={() => handleSetCustomCycle(reminder.patientNo, null)}
                    canEditCycle={permission.canEditReminderCycle}
                    onSync={() => {
                      const p = patients.find(pp => pp.id === reminder.id);
                      if (p) {
                        if ((p as any).syncStatus === "conflict") {
                          openConflictModal("patient", p);
                        } else {
                          handleSyncEntity("patient", reminder.id);
                        }
                      }
                    }}
                    onGenerateConflict={() => handleGenerateConflict("patient", reminder.id)}
                    isSelected={selectedReminderPatientNos.has(reminder.patientNo)}
                    onToggleSelect={() => handleToggleReminderSelect(reminder.patientNo)}
                    selectionMode={permission.canEditReminderCycle}
                  />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无即将到期</p>
                </div>
              )}
              {upcoming.length > 3 && (
                <button
                  className="text-btn"
                  style={{ marginTop: "8px", alignSelf: "center" }}
                  onClick={() => switchStep("recheck-compare")}
                >
                  查看全部 {upcoming.length} 条 →
                </button>
              )}
            </div>
          </div>
          <div className="reminder-column">
            <div className="column-header column-ok">
              <span className="column-dot"></span>
              <h3>正常</h3>
              <span className="column-count">{normal.length}</span>
            </div>
            <div className="reminder-list">
              {normal.length > 0 ? (
                normal.slice(0, 3).map((reminder, index) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    index={index}
                    isCustom={!!customCycles[reminder.patientNo]}
                    onCycleChange={(days: number) => handleSetCustomCycle(reminder.patientNo, days)}
                    onCycleReset={() => handleSetCustomCycle(reminder.patientNo, null)}
                    canEditCycle={permission.canEditReminderCycle}
                    onSync={() => {
                      const p = patients.find(pp => pp.id === reminder.id);
                      if (p) {
                        if ((p as any).syncStatus === "conflict") {
                          openConflictModal("patient", p);
                        } else {
                          handleSyncEntity("patient", reminder.id);
                        }
                      }
                    }}
                    onGenerateConflict={() => handleGenerateConflict("patient", reminder.id)}
                    isSelected={selectedReminderPatientNos.has(reminder.patientNo)}
                    onToggleSelect={() => handleToggleReminderSelect(reminder.patientNo)}
                    selectionMode={permission.canEditReminderCycle}
                  />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无正常复查</p>
                </div>
              )}
              {normal.length > 3 && (
                <button
                  className="text-btn"
                  style={{ marginTop: "8px", alignSelf: "center" }}
                  onClick={() => switchStep("recheck-compare")}
                >
                  查看全部 {normal.length} 条 →
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  );

  const renderComparisonBoard = () => (
    permission.canViewRecheckCompare && (
      <section className="comparison-board panel">
        <div className="section-heading">
          <div>
            <p>处方分析</p>
            <h2>处方对比看板</h2>
          </div>
          <div className="comparison-filter-tabs">
            <button
              className={comparisonFilter === "all" ? "tab-active" : ""}
              onClick={() => setComparisonFilter("all")}
            >
              全部 ({comparisons.length})
            </button>
            <button
              className={comparisonFilter === "myopia-progress" ? "tab-active tab-progress" : ""}
              onClick={() => setComparisonFilter("myopia-progress")}
            >
              近视进展 ({myopiaProgress.length})
            </button>
            <button
              className={comparisonFilter === "astigmatism-change" ? "tab-active tab-astigmatism" : ""}
              onClick={() => setComparisonFilter("astigmatism-change")}
            >
              散光变化 ({astigmatismChange.length})
            </button>
            <button
              className={comparisonFilter === "stable" ? "tab-active tab-stable" : ""}
              onClick={() => setComparisonFilter("stable")}
            >
              处方稳定 ({stable.length})
            </button>
          </div>
        </div>

        <div className="baseline-selector">
          <span className="baseline-selector-label">对比基准:</span>
          <div className="baseline-tabs">
            <button
              className={comparisonBaseline.type === "latest-two" ? "baseline-active" : ""}
              onClick={() => handleBaselineChange("latest-two")}
            >
              最近两次
            </button>
            <button
              className={comparisonBaseline.type === "first-to-current" ? "baseline-active" : ""}
              onClick={() => handleBaselineChange("first-to-current")}
            >
              首次对当前
            </button>
            <button
              className={comparisonBaseline.type === "custom" ? "baseline-active" : ""}
              onClick={() => handleBaselineChange("custom")}
            >
              指定两次记录
            </button>
          </div>
          <span className="baseline-info-badge">
            {baselineLabelMap[comparisonBaseline.type]}
          </span>
        </div>

        {comparisonBaseline.type === "custom" && (
          <div className="record-select-panel">
            <h4>选择记录进行对比</h4>
            <div className="record-select-steps">
              <span className={`step-badge ${customSelectStep === 0 ? "active" : customSelectStep > 0 ? "done" : ""}`}>
                1. 选择患者
              </span>
              <span className={`step-badge ${customSelectStep === 1 ? "active" : customSelectStep > 1 ? "done" : ""}`}>
                2. 选择两条记录
              </span>
            </div>

            {customSelectStep === 0 && (
              <>
                <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                  请选择有两条以上记录的患者:
                </p>
                <div className="patient-select-list">
                  {patientsWithMultipleRecords.length > 0 ? (
                    patientsWithMultipleRecords.map(patient => (
                      <div
                        key={patient.id}
                        className={`patient-item ${customSelectPatientNo === patient.patientNo ? "selected" : ""}`}
                        onClick={() => handleSelectPatientForCustom(patient.patientNo)}
                      >
                        {patient.patientNo} · {getPatientRecords(records, patient.patientNo)[0]?.patientName || patient.patientNo}
                        <span style={{ float: "right", color: "#94a3b8", fontSize: "12px" }}>
                          {getPatientRecords(records, patient.patientNo).length} 条记录
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="patient-item disabled" style={{ cursor: "default" }}>
                      暂无有多条记录的患者
                    </div>
                  )}
                </div>
              </>
            )}

            {customSelectStep === 1 && (
              <>
                <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                  请选择两条记录进行对比 (已选 {comparisonBaseline.customRecordIds?.filter(id => id).length || 0}/2):
                </p>
                <div className="record-select-list">
                  {customSelectPatientRecords.map(record => {
                    const isSelected = comparisonBaseline.customRecordIds?.includes(record.id);
                    return (
                      <div
                        key={record.id}
                        className={`record-item ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectRecordForCustom(record.id)}
                      >
                        {record.examDate} · {record.type || "常规检查"}
                        {isSelected && <span style={{ float: "right" }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="record-select-actions">
                  <button onClick={goBackToPatientSelect}>返回选择患者</button>
                  <button onClick={resetCustomSelection}>重置选择</button>
                </div>
                {comparisonBaseline.customRecordIds?.[0] && comparisonBaseline.customRecordIds?.[1] && (
                  <p style={{ fontSize: "12px", color: "#10b981", marginTop: "8px", textAlign: "center" }}>
                    ✓ 已选择两条记录，对比结果已自动生成
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="comparison-list">
          {filteredComparisons.length > 0 ? (
            filteredComparisons.slice(0, 4).map((comparison, index) => (
              <ComparisonCard
                key={`${comparison.prevRecord.id}-${comparison.currRecord.id}`}
                comparison={comparison}
                index={index}
                onClick={() => openComparisonDrawer(comparison)}
                canViewProfessionalParams={permission.canViewProfessionalParams}
              />
            ))
          ) : (
            <div className="empty-state">
              <p>暂无对比数据</p>
              <p className="empty-hint">
                {comparisonBaseline.type === "custom"
                  ? "请先选择患者和两条记录进行对比"
                  : "同一患者需至少两条验光记录才能进行对比"}
              </p>
            </div>
          )}
          {filteredComparisons.length > 4 && (
            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                className="ghost-btn"
                onClick={() => switchStep("recheck-compare")}
              >
                查看全部 {filteredComparisons.length} 条对比 →
              </button>
            </div>
          )}
        </div>
      </section>
    )
  );

  const renderLensRecommendation = () => (
    permission.canGenerateLensRecommendation && (
      <section className="lens-recommendation-panel panel">
        <div className="section-heading">
          <div>
            <p>门店顾问工具</p>
            <h2>配镜建议生成</h2>
          </div>
          {!showLensRecommendation && (
            <button className="primary-action" onClick={openLensRecommendation}>
              开启建议生成
            </button>
          )}
          {showLensRecommendation && (
            <button className="ghost-btn" onClick={closeLensRecommendation}>
              收起
            </button>
          )}
        </div>

        {showLensRecommendation && (
          <div className="recommendation-content">
            {lensRecommendationResult ? (
              <LensRecommendationResultDisplay
                result={lensRecommendationResult}
                onReset={resetLensRecommendation}
              />
            ) : (
              <LensRecommendationForm onGenerate={handleLensRecommendationGenerate} />
            )}
          </div>
        )}

        {!showLensRecommendation && (
          <div className="recommendation-collapsed-hint">
            <p>根据年龄段、屈光参数、用镜类型等信息，快速生成初步配镜建议</p>
            <p className="empty-hint">适用于门店顾问为患者提供参考建议，不替代医疗诊断</p>
          </div>
        )}
      </section>
    )
  );

  const renderFieldWorkspace = () => (
    <section className="workspace">
      <aside className="panel narrow">
        <h2>当前角色</h2>
        <div className="chips">
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={currentRole === key ? "chip-active" : ""}
              onClick={() => setCurrentRole(key as UserRole)}
            >
              {label}
            </button>
          ))}
        </div>
        <h2>年龄段</h2>
        <div className="chips muted">
          {ageGroups.map(ag => (
            <button
              key={ag}
              className={ageGroupFilter === ag ? "chip-active" : ""}
              onClick={() => setAgeGroupFilter(ageGroupFilter === ag ? "" : ag)}
            >
              {ag}
            </button>
          ))}
        </div>
        <h2>镜片类型</h2>
        <div className="chips muted">
          {lensTypes.map(lt => (
            <button
              key={lt}
              className={lensTypeFilter === lt ? "chip-active" : ""}
              onClick={() => setLensTypeFilter(lensTypeFilter === lt ? "" : lt)}
            >
              {lt}
            </button>
          ))}
        </div>
        <h2>复查状态</h2>
        <div className="chips muted">
          {[
            { value: "overdue", label: "已逾期" },
            { value: "upcoming", label: "即将到期" },
            { value: "normal", label: "正常" },
          ].map(rs => (
            <button
              key={rs.value}
              className={reminderStatusFilter === rs.value ? "chip-active" : ""}
              onClick={() => setReminderStatusFilter(reminderStatusFilter === rs.value ? "" : rs.value)}
            >
              {rs.label}
            </button>
          ))}
        </div>
        {hasActiveFilters && (
          <button className="ghost-btn" style={{ marginTop: "8px", width: "100%" }} onClick={clearAllFilters}>
            清除筛选
          </button>
        )}
        <h2>快速搜索</h2>
        <input
          type="text"
          placeholder="搜索患者编号、备注..."
          value={patientFilter}
          onChange={e => setPatientFilter(e.target.value)}
        />
      </aside>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>{project.domain}</p>
            <h2>记录字段</h2>
          </div>
          {permission.canEditInitialExam && (
            <button className="primary-action" onClick={openPrescriptionForm}>新增处方记录</button>
          )}
        </div>
        <div className="field-grid">
          {project.fields.map((field: string) => (
            <label key={field}>
              <span>{field}</span>
              <input placeholder={"填写" + field + " · 请使用上方新增处方"} readOnly />
            </label>
          ))}
        </div>
      </section>
    </section>
  );

  const renderDashboard = () => {
    const sectionComponents: Record<DashboardSection, React.ReactElement | null> = {
      "metrics": (
        <section key="metrics" className="metrics-grid">
          {metricLabels.map((metric: string, index: number) => (
            <MetricCard
              key={metric}
              label={metric}
              value={metricValues[index]}
              index={index}
              statusClass={metricStatusClasses[index]}
            />
          ))}
        </section>
      ),
      "reminder": <div key="reminder">{renderReminderBoard()}</div>,
      "comparison": <div key="comparison">{renderComparisonBoard()}</div>,
      "lens-recommendation": <div key="lens">{renderLensRecommendation()}</div>,
      "field-workspace": <div key="workspace">{renderFieldWorkspace()}</div>
    };

    return (
      <>
        {renderRoleWelcome()}
        {roleConfig.dashboardSections.map((section) => (
          sectionComponents[section]
        ))}
      </>
    );
  };

  const renderPatientProfile = () => (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>第一步</p>
          <h2>患者建档</h2>
        </div>
        <div className="panel-actions">
          {permission.canClearAllData && dbSupported && (
            <button
              className="ghost-btn danger-btn"
              onClick={() => setShowClearConfirm(true)}
              disabled={isLoading}
            >
              清空数据
            </button>
          )}
          {permission.canEditPatientProfile && !showForm && !editingId && (
            <button className="primary-action" onClick={openAddForm}>+ 新增档案</button>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">年龄段</span>
          <div className="filter-chips">
            {ageGroups.map(ag => (
              <button
                key={ag}
                className={`filter-chip ${ageGroupFilter === ag ? "filter-chip-active" : ""}`}
                onClick={() => setAgeGroupFilter(ageGroupFilter === ag ? "" : ag)}
              >
                {ag}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">镜片类型</span>
          <div className="filter-chips">
            {lensTypes.map(lt => (
              <button
                key={lt}
                className={`filter-chip ${lensTypeFilter === lt ? "filter-chip-active" : ""}`}
                onClick={() => setLensTypeFilter(lensTypeFilter === lt ? "" : lt)}
              >
                {lt}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">复查状态</span>
          <div className="filter-chips">
            {[
              { value: "overdue", label: "已逾期" },
              { value: "upcoming", label: "即将到期" },
              { value: "normal", label: "正常" },
            ].map(rs => (
              <button
                key={rs.value}
                className={`filter-chip ${reminderStatusFilter === rs.value ? "filter-chip-active" : ""}`}
                onClick={() => setReminderStatusFilter(reminderStatusFilter === rs.value ? "" : rs.value)}
              >
                {rs.label}
              </button>
            ))}
          </div>
        </div>
        {hasActiveFilters && (
          <button className="filter-clear-btn" onClick={clearAllFilters}>
            清除筛选
          </button>
        )}
      </div>

      {showForm && permission.canEditPatientProfile && (
        <PatientForm
          key="add-form"
          onSubmit={handleAdd}
          onCancel={cancelAdd}
          onDirtyChange={handlePatientFormDirtyChange}
        />
      )}

      {editingPatient && !showForm && permission.canEditPatientProfile && (
        <div className="editing-form">
          <p className="form-title">编辑档案</p>
          <PatientForm
            key={editingPatient.id}
            initialData={{
              patientNo: editingPatient.patientNo,
              ageGroup: editingPatient.ageGroup,
              lensType: editingPatient.lensType,
              lastCheckDate: editingPatient.lastCheckDate,
              remark: editingPatient.remark
            }}
            onSubmit={handleEdit}
            onCancel={cancelEdit}
            onDirtyChange={handlePatientFormDirtyChange}
          />
        </div>
      )}

      <div className="patient-list">
        {filteredPatients.map((patient, index) => {
          const patientStepDetails = {} as Record<WorkflowStep, StepInfo>;
          (["patient-profile", "initial-exam", "recheck-compare", "prescription-summary", "export"] as WorkflowStep[]).forEach(step => {
            patientStepDetails[step] = computeStepInfo(step, patient.patientNo, currentRole);
          });
          return editingId === patient.id ? null : (
            <PatientCard
              key={patient.id}
              patient={patient as SyncablePatient}
              index={index}
              onEdit={() => startEdit(patient)}
              onDelete={() => handleDelete(patient.id)}
              onSelect={() => handleSelectPatient(patient.patientNo)}
              onSync={() => {
                if ((patient as any).syncStatus === "conflict") {
                  openConflictModal("patient", patient);
                } else {
                  handleSyncEntity("patient", patient.id);
                }
              }}
              onViewError={() => openSyncErrorModal("patient", patient)}
              onGenerateConflict={() => handleGenerateConflict("patient", patient.id)}
              isSelected={selectedPatientNo === patient.patientNo}
              canEdit={permission.canEditPatientProfile}
              canDelete={permission.canEditPatientProfile}
              workflowProgress={workflowProgressMap[patient.patientNo]}
              role={currentRole}
              computedStepDetails={patientStepDetails}
            />
          );
        })}
        {filteredPatients.length === 0 && (
          <div className="empty-state">
            <p>暂无患者档案</p>
            <p className="empty-hint">{permission.canEditPatientProfile ? '点击"新增档案"添加第一条记录' : '请联系有权限的用户添加档案'}</p>
          </div>
        )}
      </div>

      {selectedPatient && selectedPatientRecords.length > 0 && (
        <div className="workflow-patient-records">
          <h3 className="workflow-section-title">该患者近期记录 ({selectedPatientRecords.length})</h3>
          <div className="record-list">
            {selectedPatientRecords.slice(0, 5).map((record, index) => (
              <article
                key={record.id}
                className={`record-card record-clickable record-sync-${((record as any).syncStatus || "synced") as SyncStatus}`}
                onClick={() => openDrawer(record)}
              >
                <div className="record-index" style={
                  ((record as any).syncStatus || "synced") !== "synced"
                    ? { backgroundColor: SYNC_STATUS_COLORS[((record as any).syncStatus || "synced") as SyncStatus] + "20", color: SYNC_STATUS_COLORS[((record as any).syncStatus || "synced") as SyncStatus] }
                    : undefined
                }>
                  {((record as any).syncStatus || "synced") !== "synced"
                    ? SYNC_STATUS_ICONS[((record as any).syncStatus || "synced") as SyncStatus]
                    : String(index + 1).padStart(2, "0")}
                </div>
                <div style={{ flex: 1 }}>
                  <h3>{record.examDate} · <span className={`type-badge type-${record.type}`}>{record.type}</span></h3>
                  <p>{getVisibleRecordSummary(record, permission.canViewDetailedRecords)}</p>
                  <RecordSyncIndicator
                    record={record as SyncableRecord}
                    onSync={() => {
                      if ((record as any).syncStatus === "conflict") {
                        openConflictModal("record", record);
                      } else {
                        handleSyncEntity("record", record.id);
                      }
                    }}
                    onViewError={() => openSyncErrorModal("record", record)}
                    onGenerateConflict={() => handleGenerateConflict("record", record.id)}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {permission.canEditPatientProfile && (
        <div className="workflow-next-step">
          {permission.canViewInitialExam && (
            <button
              className="primary-action"
              onClick={() => switchStep("initial-exam")}
              disabled={!selectedPatientNo && selectedPatientRecords.length === 0}
            >
              下一步 → 初次验光
            </button>
          )}
        </div>
      )}
    </section>
  );

  const renderInitialExam = () => (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>第二步</p>
          <h2>初次验光</h2>
        </div>
        <div className="record-actions">
          {permission.canEditInitialExam && !showPrescriptionForm && !showImportForm && (
            <button className="primary-action" onClick={openPrescriptionForm}>+ 新增处方录入</button>
          )}
          {permission.canEditInitialExam && !showPrescriptionForm && !showImportForm && (
            <button onClick={openImportForm}>批量导入</button>
          )}
        </div>
      </div>

      {showPrescriptionForm && permission.canEditInitialExam && (
        <PrescriptionForm
          onSubmit={handlePrescriptionSubmit}
          onCancel={cancelPrescriptionForm}
          draftData={prescriptionDraft}
          draftSavedAt={prescriptionDraftSavedAt}
          onDraftChange={handlePrescriptionDraftChange}
          onDraftDiscard={handlePrescriptionDraftDiscard}
          onDirtyChange={handlePrescriptionFormDirtyChange}
          submitRef={prescriptionFormSubmitRef}
        />
      )}

      {showImportForm && permission.canEditInitialExam && (
        <ImportPreview
          onConfirm={handleImportSubmit}
          onCancel={cancelImportForm}
        />
      )}

      {!showPrescriptionForm && !showImportForm && (
        <>
          {selectedPatientNo && (
            <div className="workflow-patient-info">
              <h3 className="workflow-section-title">
                当前患者: {selectedPatientNo}
                {selectedPatient && ` · ${selectedPatient.ageGroup} · ${selectedPatient.lensType}`}
              </h3>
            </div>
          )}

          <div className="record-list">
            {(selectedPatientNo ? selectedPatientRecords : records).map((record, index) => (
              <article
                key={record.id}
                className={`record-card record-clickable record-sync-${((record as any).syncStatus || "synced") as SyncStatus}`}
                onClick={() => openDrawer(record)}
              >
                <div className="record-index" style={
                  ((record as any).syncStatus || "synced") !== "synced"
                    ? { backgroundColor: SYNC_STATUS_COLORS[((record as any).syncStatus || "synced") as SyncStatus] + "20", color: SYNC_STATUS_COLORS[((record as any).syncStatus || "synced") as SyncStatus] }
                    : undefined
                }>
                  {((record as any).syncStatus || "synced") !== "synced"
                    ? SYNC_STATUS_ICONS[((record as any).syncStatus || "synced") as SyncStatus]
                    : String(index + 1).padStart(2, "0")}
                </div>
                <div style={{ flex: 1 }}>
                  <h3>{record.patientNo} · {record.patientName} · {record.examDate}</h3>
                  <p>{getVisibleRecordSummary(record, permission.canViewDetailedRecords)}</p>
                  <RecordSyncIndicator
                    record={record as SyncableRecord}
                    onSync={() => {
                      if ((record as any).syncStatus === "conflict") {
                        openConflictModal("record", record);
                      } else {
                        handleSyncEntity("record", record.id);
                      }
                    }}
                    onViewError={() => openSyncErrorModal("record", record)}
                    onGenerateConflict={() => handleGenerateConflict("record", record.id)}
                  />
                </div>
              </article>
            ))}
            {(selectedPatientNo ? selectedPatientRecords : records).length === 0 && (
              <div className="empty-state">
                <p>暂无验光记录</p>
                <p className="empty-hint">
                  {permission.canEditInitialExam
                    ? '点击"新增处方录入"添加第一条记录'
                    : '请联系验光师添加记录'}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="workflow-next-step">
        <button className="ghost-btn" onClick={() => switchStep("patient-profile")}>
          ← 上一步
        </button>
        {permission.canViewRecheckCompare && (
          <button className="primary-action" onClick={() => switchStep("recheck-compare")}>
            下一步 → 复查对比
          </button>
        )}
      </div>
    </section>
  );

  const renderRecheckCompare = () => (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>第三步</p>
          <h2>复查对比</h2>
        </div>
        <div className="comparison-filter-tabs">
          <button
            className={comparisonFilter === "all" ? "tab-active" : ""}
            onClick={() => setComparisonFilter("all")}
          >
            全部 ({comparisons.length})
          </button>
          <button
            className={comparisonFilter === "myopia-progress" ? "tab-active tab-progress" : ""}
            onClick={() => setComparisonFilter("myopia-progress")}
          >
            近视进展 ({myopiaProgress.length})
          </button>
          <button
            className={comparisonFilter === "astigmatism-change" ? "tab-active tab-astigmatism" : ""}
            onClick={() => setComparisonFilter("astigmatism-change")}
          >
            散光变化 ({astigmatismChange.length})
          </button>
          <button
            className={comparisonFilter === "stable" ? "tab-active tab-stable" : ""}
            onClick={() => setComparisonFilter("stable")}
          >
            处方稳定 ({stable.length})
          </button>
        </div>
      </div>

      <div className="baseline-selector">
        <span className="baseline-selector-label">对比基准:</span>
        <div className="baseline-tabs">
          <button
            className={comparisonBaseline.type === "latest-two" ? "baseline-active" : ""}
            onClick={() => handleBaselineChange("latest-two")}
          >
            最近两次
          </button>
          <button
            className={comparisonBaseline.type === "first-to-current" ? "baseline-active" : ""}
            onClick={() => handleBaselineChange("first-to-current")}
          >
            首次对当前
          </button>
          <button
            className={comparisonBaseline.type === "custom" ? "baseline-active" : ""}
            onClick={() => handleBaselineChange("custom")}
          >
            指定两次记录
          </button>
        </div>
        <span className="baseline-info-badge">
          {baselineLabelMap[comparisonBaseline.type]}
        </span>
      </div>

      {comparisonBaseline.type === "custom" && (
        <div className="record-select-panel">
          <h4>选择记录进行对比</h4>
          <div className="record-select-steps">
            <span className={`step-badge ${customSelectStep === 0 ? "active" : customSelectStep > 0 ? "done" : ""}`}>
              1. 选择患者
            </span>
            <span className={`step-badge ${customSelectStep === 1 ? "active" : customSelectStep > 1 ? "done" : ""}`}>
              2. 选择两条记录
            </span>
          </div>

          {customSelectStep === 0 && (
            <>
              <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                请选择有两条以上记录的患者:
              </p>
              <div className="patient-select-list">
                {patientsWithMultipleRecords.length > 0 ? (
                  patientsWithMultipleRecords.map(patient => (
                    <div
                      key={patient.id}
                      className={`patient-item ${customSelectPatientNo === patient.patientNo ? "selected" : ""}`}
                      onClick={() => handleSelectPatientForCustom(patient.patientNo)}
                    >
                      {patient.patientNo} · {getPatientRecords(records, patient.patientNo)[0]?.patientName || patient.patientNo}
                      <span style={{ float: "right", color: "#94a3b8", fontSize: "12px" }}>
                        {getPatientRecords(records, patient.patientNo).length} 条记录
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="patient-item disabled" style={{ cursor: "default" }}>
                    暂无有多条记录的患者
                  </div>
                )}
              </div>
            </>
          )}

          {customSelectStep === 1 && (
            <>
              <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                请选择两条记录进行对比 (已选 {comparisonBaseline.customRecordIds?.filter(id => id).length || 0}/2):
              </p>
              <div className="record-select-list">
                {customSelectPatientRecords.map(record => {
                  const isSelected = comparisonBaseline.customRecordIds?.includes(record.id);
                  return (
                    <div
                      key={record.id}
                      className={`record-item ${isSelected ? "selected" : ""}`}
                      onClick={() => handleSelectRecordForCustom(record.id)}
                    >
                      {record.examDate} · {record.type || "常规检查"}
                      {isSelected && <span style={{ float: "right" }}>✓</span>}
                    </div>
                  );
                })}
              </div>
              <div className="record-select-actions">
                <button onClick={goBackToPatientSelect}>返回选择患者</button>
                <button onClick={resetCustomSelection}>重置选择</button>
              </div>
              {comparisonBaseline.customRecordIds?.[0] && comparisonBaseline.customRecordIds?.[1] && (
                <p style={{ fontSize: "12px", color: "#10b981", marginTop: "8px", textAlign: "center" }}>
                  ✓ 已选择两条记录，对比结果已自动生成
                </p>
              )}
            </>
          )}
        </div>
      )}

      {selectedPatientNo && (
        <div className="workflow-patient-info">
          <h3 className="workflow-section-title">
            当前患者: {selectedPatientNo}
            {selectedPatient && ` · ${selectedPatient.ageGroup} · ${selectedPatient.lensType}`}
          </h3>
        </div>
      )}

      <div className="comparison-list">
        {displayComparisons.length > 0 ? (
          displayComparisons.map((comparison, index) => (
            <ComparisonCard
              key={`${comparison.prevRecord.id}-${comparison.currRecord.id}`}
              comparison={comparison}
              index={index}
              onClick={() => openComparisonDrawer(comparison)}
              canViewProfessionalParams={permission.canViewProfessionalParams}
            />
          ))
        ) : (
          <div className="empty-state">
            <p>暂无对比数据</p>
            <p className="empty-hint">
              {comparisonBaseline.type === "custom"
                ? "请先选择患者和两条记录进行对比"
                : selectedPatientNo
                  ? "该患者需至少两条验光记录才能进行对比"
                  : "系统中需至少有同一患者的两条验光记录"}
            </p>
          </div>
        )}
      </div>

      <div className="workflow-next-step">
        <button className="ghost-btn" onClick={() => switchStep("initial-exam")}>
          ← 上一步
        </button>
        {permission.canViewPrescriptionSummary && (
          <button
            className="primary-action"
            onClick={() => switchStep("prescription-summary")}
          >
            下一步 → 处方摘要
          </button>
        )}
      </div>
    </section>
  );

  const renderPrescriptionSummary = () => (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>第四步</p>
          <h2>处方摘要</h2>
        </div>
      </div>

      {selectedPatientNo && (
        <div className="workflow-patient-info">
          <h3 className="workflow-section-title">
            当前患者: {selectedPatientNo}
            {selectedPatient && ` · ${selectedPatient.ageGroup} · ${selectedPatient.lensType}`}
          </h3>
        </div>
      )}

      <div className="record-list">
        {(selectedPatientNo ? selectedPatientRecords : records).map((record, index) => (
          <div key={record.id} className={`prescription-summary-card prescription-sync-${((record as any).syncStatus || "synced") as SyncStatus}`}>
            <article
              className={`record-card record-clickable record-sync-${((record as any).syncStatus || "synced") as SyncStatus}`}
              onClick={() => openDrawer(record)}
            >
              <div className="record-index" style={
                ((record as any).syncStatus || "synced") !== "synced"
                  ? { backgroundColor: SYNC_STATUS_COLORS[((record as any).syncStatus || "synced") as SyncStatus] + "20", color: SYNC_STATUS_COLORS[((record as any).syncStatus || "synced") as SyncStatus] }
                  : undefined
              }>
                {((record as any).syncStatus || "synced") !== "synced"
                  ? SYNC_STATUS_ICONS[((record as any).syncStatus || "synced") as SyncStatus]
                  : String(index + 1).padStart(2, "0")}
              </div>
              <div style={{ flex: 1 }}>
                <h3>{record.patientNo} · {record.patientName} · {record.examDate}</h3>
                <p>{getVisibleRecordSummary(record, permission.canViewDetailedRecords)}</p>
                <RecordSyncIndicator
                  record={record as SyncableRecord}
                  onSync={() => {
                    if ((record as any).syncStatus === "conflict") {
                      openConflictModal("record", record);
                    } else {
                      handleSyncEntity("record", record.id);
                    }
                  }}
                  onViewError={() => openSyncErrorModal("record", record)}
                  onGenerateConflict={() => handleGenerateConflict("record", record.id)}
                />
              </div>
            </article>
            {permission.canExport && (
              <div className="prescription-summary-actions">
                <button
                  className="primary-action"
                  onClick={() => handleExportSinglePrescription(record)}
                >
                  📄 导出此处方
                </button>
              </div>
            )}
          </div>
        ))}
        {(selectedPatientNo ? selectedPatientRecords : records).length === 0 && (
          <div className="empty-state">
            <p>暂无处方记录</p>
            <p className="empty-hint">请先添加验光记录</p>
          </div>
        )}
      </div>

      {permission.canGenerateLensRecommendation && (
        <div className="workflow-lens-section">
          <h3 className="workflow-section-title">配镜建议生成</h3>
          {lensRecommendationResult ? (
            <LensRecommendationResultDisplay
              result={lensRecommendationResult}
              onReset={resetLensRecommendation}
            />
          ) : (
            <LensRecommendationForm onGenerate={handleLensRecommendationGenerate} />
          )}
        </div>
      )}

      <div className="workflow-next-step">
        <button className="ghost-btn" onClick={() => switchStep("recheck-compare")}>
          ← 上一步
        </button>
        {permission.canExport && (
          <button className="primary-action" onClick={() => switchStep("export")}>
            下一步 → 导出摘要
          </button>
        )}
      </div>
    </section>
  );

  const renderExport = () => (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>第五步</p>
          <h2>导出摘要</h2>
        </div>
      </div>

      {exportSuccess && (
        <div className="db-status-banner" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#059669" }}>
          <span className="status-dot online"></span>
          <span>✓ {exportSuccess}</span>
        </div>
      )}

      <div className="export-options-grid">
        <div className="export-card">
          <div className="export-icon">📋</div>
          <h3>单条处方摘要导出</h3>
          <p>选择特定患者的验光记录，导出为结构化文本文件</p>
          <div className="export-patient-select">
            <label>
              <span>选择患者</span>
              <select
                value={selectedPatientNo || ""}
                onChange={e => setSelectedPatientNo(e.target.value || null)}
              >
                <option value="">全部患者</option>
                {patients.map(p => (
                  <option key={p.id} value={p.patientNo}>{p.patientNo}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="record-list export-record-list">
            {(selectedPatientNo ? selectedPatientRecords : records).slice(0, 3).map((record, index) => (
              <div key={record.id} className={`export-record-item export-sync-${((record as any).syncStatus || "synced") as SyncStatus}`}>
                <div style={{ flex: 1 }}>
                  <strong>{record.patientNo} · {record.patientName}</strong>
                  <p>{record.examDate} · {record.type}</p>
                  <RecordSyncIndicator
                    record={record as SyncableRecord}
                    onSync={() => {
                      if ((record as any).syncStatus === "conflict") {
                        openConflictModal("record", record);
                      } else {
                        handleSyncEntity("record", record.id);
                      }
                    }}
                    onViewError={() => openSyncErrorModal("record", record)}
                    onGenerateConflict={() => handleGenerateConflict("record", record.id)}
                  />
                </div>
                <button
                  className="primary-action"
                  onClick={() => handleExportSinglePrescription(record)}
                >
                  导出
                </button>
              </div>
            ))}
            {(selectedPatientNo ? selectedPatientRecords : records).length === 0 && (
              <div className="empty-state small">
                <p>暂无记录</p>
              </div>
            )}
          </div>
        </div>

        <div className="export-card">
          <div className="export-icon">📊</div>
          <h3>批量CSV导出</h3>
          <p>将所有验光记录导出为CSV文件，可用于Excel或其他系统导入</p>
          <div className="export-stats">
            <div className="export-stat-item">
              <span className="export-stat-label">总记录数</span>
              <span className="export-stat-value">{records.length}</span>
            </div>
            <div className="export-stat-item">
              <span className="export-stat-label">患者总数</span>
              <span className="export-stat-value">{patients.length}</span>
            </div>
            <div className="export-stat-item">
              <span className="export-stat-label">导出日期</span>
              <span className="export-stat-value">{formatLocalDate(new Date())}</span>
            </div>
          </div>
          <button className="primary-action export-big-btn" onClick={handleExportAllCSV}>
            📥 导出全部记录 (CSV)
          </button>
        </div>
      </div>

      <div className="workflow-flow-summary">
        <h3 className="workflow-section-title">验光流程闭环完成</h3>
        <div className="workflow-flow-steps">
          {(["patient-profile", "initial-exam", "recheck-compare", "prescription-summary", "export"] as WorkflowStep[]).map((step, idx) => {
            const stepInfo = selectedPatientStepDetails[step] || computeStepInfo(step, selectedPatientNo, currentRole);
            const isBlocked = stepInfo.status === "blocked";
            const isCompleted = stepInfo.status === "completed";
            const isCurrent = step === currentStep;
            let stepClass = "";
            if (isCurrent) stepClass = "step-active";
            else if (isCompleted) stepClass = "step-done";
            else if (isBlocked) stepClass = "step-blocked";

            const stepStatusIcon = isBlocked ? "🔒" : isCompleted ? "✓" : "";
            return (
              <div
                key={step}
                className={`workflow-flow-step ${stepClass}`}
                title={stepInfo.blockDetail || (isCompleted ? "已完成" : isCurrent ? "当前步骤" : "待完成")}
              >
                <span className="workflow-flow-icon">
                  {STEP_ICONS[step]}
                  {stepStatusIcon && <span className="step-status-badge">{stepStatusIcon}</span>}
                </span>
                <span className="workflow-flow-label">{STEP_LABELS[step]}</span>
                {idx < 4 && <span className="workflow-flow-arrow">→</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="workflow-next-step">
        <button className="ghost-btn" onClick={() => switchStep("prescription-summary")}>
          ← 返回处方摘要
        </button>
        <button className="primary-action" onClick={() => {
          setCurrentStep("dashboard");
          setSelectedPatientNo(null);
        }}>
          🏠 返回工作台首页
        </button>
      </div>
    </section>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case "dashboard":
        return renderDashboard();
      case "patient-profile":
        return renderPatientProfile();
      case "initial-exam":
        return renderInitialExam();
      case "recheck-compare":
        return renderRecheckCompare();
      case "prescription-summary":
        return renderPrescriptionSummary();
      case "export":
        return renderExport();
      default:
        return renderDashboard();
    }
  };

  return (
    <main className="app-shell">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>正在加载数据...</p>
        </div>
      )}

      {dbSupported === false && (
        <div className="db-warning-banner">
          <div className="warning-icon">⚠️</div>
          <div className="warning-content">
            <strong>浏览器不支持本地数据存储</strong>
            <p>您的浏览器不支持 IndexedDB，数据将无法在页面刷新后保存。建议使用 Chrome、Firefox、Safari 或 Edge 等现代浏览器。</p>
          </div>
        </div>
      )}

      {dbSupported === true && dbReady && (
        <div className="sync-status-bar">
          <div className="sync-status-left">
            <span className={`status-dot ${hasPendingSync ? "pending" : "synced"}`}></span>
            <span className="sync-status-text">
              {isSyncing ? "正在同步..." : hasPendingSync ? `有 ${overallSyncStats.pending + overallSyncStats.failed + overallSyncStats.conflict} 条数据待同步` : "所有数据已同步"}
            </span>
            {!isSyncing && overallSyncStats.synced > 0 && (
              <span className="sync-synced-count">已同步 {overallSyncStats.synced} 条</span>
            )}
          </div>
          <div className="sync-status-right">
            {overallSyncStats.failed > 0 && (
              <span className="sync-badge sync-badge-failed" title="同步失败">
                {SYNC_STATUS_ICONS.failed} {overallSyncStats.failed}
              </span>
            )}
            {overallSyncStats.conflict > 0 && (
              <span className="sync-badge sync-badge-conflict" title="待处理冲突">
                {SYNC_STATUS_ICONS.conflict} {overallSyncStats.conflict}
              </span>
            )}
            {overallSyncStats.pending > 0 && (
              <span className="sync-badge sync-badge-pending" title="待同步">
                {SYNC_STATUS_ICONS.pending} {overallSyncStats.pending}
              </span>
            )}
            <button 
              className="sync-panel-btn"
              onClick={() => setShowSyncPanel(true)}
            >
              同步管理
            </button>
          </div>
        </div>
      )}

      {syncMessage && (
        <div className="sync-toast">
          {syncMessage}
        </div>
      )}

      <section className="hero hero-workflow">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle} · 验光工作台闭环流程</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
          <span style={{ marginTop: "8px" }}>当前角色</span>
          <strong style={{ color: "var(--primary)" }}>{ROLE_LABELS[currentRole]}</strong>
        </div>
      </section>

      <nav className="workflow-nav">
        {workflowSteps.map((step) => {
          const stepInfo = selectedPatientStepDetails[step] || computeStepInfo(step, selectedPatientNo, currentRole);
          const isBlocked = stepInfo.status === "blocked";
          const isCompleted = stepInfo.status === "completed" && currentStep !== step;
          const isCurrent = currentStep === step;
          let statusClass = "";
          if (isCurrent) statusClass = "workflow-nav-active";
          else if (isCompleted) statusClass = "workflow-nav-completed";
          else if (isBlocked) statusClass = "workflow-nav-blocked";

          const statusIcon = isBlocked ? "🔒" : isCompleted ? "✅" : "";

          return (
            <button
              key={step}
              className={`workflow-nav-item ${statusClass}`}
              onClick={() => !isBlocked && switchStep(step)}
              disabled={isBlocked}
              title={stepInfo.blockDetail || (isCompleted ? "已完成" : isCurrent ? "当前步骤" : "")}
            >
              <span className="workflow-nav-icon">
                {STEP_ICONS[step]}
                {statusIcon && <span className="workflow-nav-status">{statusIcon}</span>}
              </span>
              <span className="workflow-nav-label">{STEP_LABELS[step]}</span>
            </button>
          );
        })}
      </nav>

      <section className="role-selector-bar panel">
        <div className="role-selector-content">
          <span className="role-selector-label">切换角色体验：</span>
          <div className="chips role-chips">
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <button
                key={key}
                className={currentRole === key ? "chip-active chip-role" : "chip-role"}
                onClick={() => setCurrentRole(key as UserRole)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="role-permission-hint">
            <span>当前角色可操作：</span>
            <span className="role-permission-tags">
              {permission.canViewPatientProfile && <span className="tag tag-primary">建档</span>}
              {permission.canEditInitialExam && <span className="tag tag-accent">验光录入</span>}
              {permission.canEditRecheckCompare && <span className="tag tag-primary">复查对比</span>}
              {permission.canEditPrescriptionSummary && <span className="tag tag-accent">处方编辑</span>}
              {permission.canExport && <span className="tag tag-primary">导出</span>}
            </span>
          </div>
        </div>
      </section>

      {renderStepContent()}

      <RefractionDrawer
        record={selectedRecord}
        previousRecord={previousRecordForCompare}
        allRecords={records}
        open={drawerOpen}
        onClose={closeDrawer}
        onNavigate={navigateSiblingRecord}
        canViewProfessionalParams={permission.canViewProfessionalParams}
        canViewDetailedRecords={permission.canViewDetailedRecords}
      />
      <ComparisonDrawer
        comparison={selectedComparison}
        open={comparisonDrawerOpen}
        onClose={closeComparisonDrawer}
        canViewProfessionalParams={permission.canViewProfessionalParams}
        canViewDetailedRecords={permission.canViewDetailedRecords}
      />

      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认清空所有数据</h3>
              <button className="modal-close" onClick={() => setShowClearConfirm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-warning-icon">⚠️</div>
              <p className="modal-warning-text">
                此操作将永久删除所有本地存储的数据，包括：
              </p>
              <ul className="modal-warning-list">
                <li>所有患者档案（{patients.length} 条）</li>
                <li>所有验光记录（{records.length} 条）</li>
                <li>所有复查提醒（{reminders.length} 条）</li>
                <li>筛选条件设置</li>
              </ul>
              <p className="modal-warning-text strong">
                清空后数据将无法恢复，是否继续？
              </p>
            </div>
            <div className="modal-actions">
              <button className="ghost-btn" onClick={() => setShowClearConfirm(false)}>
                取消
              </button>
              <button className="primary-action danger-btn" onClick={handleClearData}>
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatchResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowBatchResetConfirm(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>批量重置复查周期</h3>
              <button className="modal-close" onClick={() => setShowBatchResetConfirm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-warning-icon">↺</div>
              <p className="modal-warning-text">
                此操作将把 <strong>{batchResetAffectedCount}</strong> 位患者的复查周期恢复为默认规则。
              </p>
              <ul className="modal-warning-list">
                <li>共选择 {selectedReminderPatientNos.size} 位患者</li>
                <li>其中使用自定义周期：{batchResetAffectedCount} 人</li>
                <li>使用默认周期：{selectedReminderPatientNos.size - batchResetAffectedCount} 人（不受影响）</li>
              </ul>
              <div className="batch-reset-details">
                <p className="batch-reset-subtitle">默认周期规则：</p>
                <div className="cycle-rules-grid">
                  <div className="cycle-rule-item"><span>角膜塑形镜（所有年龄）</span><strong>30 天</strong></div>
                  <div className="cycle-rule-item"><span>儿童（单光镜/散光镜）</span><strong>30 天</strong></div>
                  <div className="cycle-rule-item"><span>青少年（单光镜/散光镜）</span><strong>60 天</strong></div>
                  <div className="cycle-rule-item"><span>成人/中老年（渐进片/老花镜）</span><strong>180 天</strong></div>
                  <div className="cycle-rule-item"><span>其他组合</span><strong>90 天</strong></div>
                </div>
              </div>
              <p className="modal-warning-text strong">
                重置后不影响患者档案中除复查周期外的其他信息，是否继续？
              </p>
            </div>
            <div className="modal-actions">
              <button className="ghost-btn" onClick={() => setShowBatchResetConfirm(false)}>
                取消
              </button>
              <button className="primary-action danger-btn" onClick={handleBatchResetCycles}>
                确认重置 {batchResetAffectedCount} 人
              </button>
            </div>
          </div>
        </div>
      )}

      {showSyncPanel && (
        <div className="sync-panel-overlay" onClick={() => setShowSyncPanel(false)}>
          <div className="sync-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sync-panel-header">
              <h3>同步管理</h3>
              <button className="modal-close" onClick={() => setShowSyncPanel(false)}>✕</button>
            </div>
            <div className="sync-panel-body">
              <div className="sync-stats-section">
                <h4>同步状态概览</h4>
                <div className="sync-stats-grid">
                  <div className="sync-stat-card synced">
                    <div className="sync-stat-icon">{SYNC_STATUS_ICONS.synced}</div>
                    <div className="sync-stat-info">
                      <div className="sync-stat-value">{overallSyncStats.synced}</div>
                      <div className="sync-stat-label">已同步</div>
                    </div>
                  </div>
                  <div className="sync-stat-card pending">
                    <div className="sync-stat-icon">{SYNC_STATUS_ICONS.pending}</div>
                    <div className="sync-stat-info">
                      <div className="sync-stat-value">{overallSyncStats.pending}</div>
                      <div className="sync-stat-label">待同步</div>
                    </div>
                  </div>
                  <div className="sync-stat-card conflict">
                    <div className="sync-stat-icon">{SYNC_STATUS_ICONS.conflict}</div>
                    <div className="sync-stat-info">
                      <div className="sync-stat-value">{overallSyncStats.conflict}</div>
                      <div className="sync-stat-label">冲突</div>
                    </div>
                  </div>
                  <div className="sync-stat-card failed">
                    <div className="sync-stat-icon">{SYNC_STATUS_ICONS.failed}</div>
                    <div className="sync-stat-info">
                      <div className="sync-stat-value">{overallSyncStats.failed}</div>
                      <div className="sync-stat-label">失败</div>
                    </div>
                  </div>
                </div>
                <div className="sync-detail-stats">
                  <div className="sync-detail-row">
                    <span>患者档案</span>
                    <span>已同步 {patientSyncStats.synced} / 待同步 {patientSyncStats.pending} / 冲突 {patientSyncStats.conflict} / 失败 {patientSyncStats.failed}</span>
                  </div>
                  <div className="sync-detail-row">
                    <span>验光记录</span>
                    <span>已同步 {recordSyncStats.synced} / 待同步 {recordSyncStats.pending} / 冲突 {recordSyncStats.conflict} / 失败 {recordSyncStats.failed}</span>
                  </div>
                </div>
              </div>

              {isSyncing && (
                <div className="sync-progress-section">
                  <h4>同步进度</h4>
                  <div className="sync-progress-bar">
                    <div 
                      className="sync-progress-fill"
                      style={{ width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total * 100) : 0}%` }}
                    ></div>
                  </div>
                  <p className="sync-progress-text">{syncProgress.current} / {syncProgress.total}</p>
                </div>
              )}

              <div className="sync-actions-section">
                <h4>同步操作</h4>
                <div className="sync-actions-grid">
                  <button 
                    className="sync-action-btn primary"
                    onClick={handleSyncAll}
                    disabled={isSyncing || (!hasPendingSync && overallSyncStats.conflict === 0)}
                  >
                    {isSyncing ? "同步中..." : "立即同步"}
                  </button>
                  <button 
                    className="sync-action-btn secondary"
                    onClick={handleRetryFailed}
                    disabled={isSyncing || overallSyncStats.failed === 0}
                  >
                    重试失败项
                  </button>
                </div>
              </div>

              <div className="sync-config-section">
                <h4>模拟同步参数</h4>
                <div className="sync-config-form">
                  <div className="sync-config-item">
                    <label>基础延迟 (ms)</label>
                    <input 
                      type="range" 
                      min="100" 
                      max="3000" 
                      step="100"
                      value={syncConfig.baseDelay}
                      onChange={(e) => handleUpdateSyncConfig({ baseDelay: Number(e.target.value) })}
                    />
                    <span className="sync-config-value">{syncConfig.baseDelay}ms</span>
                  </div>
                  <div className="sync-config-item">
                    <label>失败率</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="0.5" 
                      step="0.05"
                      value={syncConfig.failureRate}
                      onChange={(e) => handleUpdateSyncConfig({ failureRate: Number(e.target.value) })}
                    />
                    <span className="sync-config-value">{Math.round(syncConfig.failureRate * 100)}%</span>
                  </div>
                  <div className="sync-config-item">
                    <label>冲突率</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="0.3" 
                      step="0.05"
                      value={syncConfig.conflictRate}
                      onChange={(e) => handleUpdateSyncConfig({ conflictRate: Number(e.target.value) })}
                    />
                    <span className="sync-config-value">{Math.round(syncConfig.conflictRate * 100)}%</span>
                  </div>
                  <div className="sync-config-item">
                    <label>重复提交检测率</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="0.5" 
                      step="0.05"
                      value={syncConfig.duplicateSubmissionRate}
                      onChange={(e) => handleUpdateSyncConfig({ duplicateSubmissionRate: Number(e.target.value) })}
                    />
                    <span className="sync-config-value">{Math.round(syncConfig.duplicateSubmissionRate * 100)}%</span>
                  </div>
                </div>
                <p className="sync-config-hint">
                  💡 以上参数用于模拟网络环境，方便测试各种同步场景。重复提交检测：多次重试时触发。
                </p>
              </div>

              <div className="sync-conflict-section">
                <h4>冲突记录</h4>
                {overallSyncStats.conflict === 0 ? (
                  <p className="sync-empty-text">暂无冲突记录</p>
                ) : (
                  <div className="sync-conflict-list">
                    {patients.filter(p => p.syncStatus === "conflict").map(patient => (
                      <div key={patient.id} className="sync-conflict-item">
                        <div className="sync-conflict-info">
                          <span className="sync-conflict-type">患者档案</span>
                          <span className="sync-conflict-name">{patient.patientNo} · {patient.ageGroup}</span>
                        </div>
                        <button 
                          className="sync-conflict-btn"
                          onClick={() => openConflictModal("patient", patient)}
                        >
                          处理冲突
                        </button>
                      </div>
                    ))}
                    {records.filter(r => r.syncStatus === "conflict").map(record => (
                      <div key={record.id} className="sync-conflict-item">
                        <div className="sync-conflict-info">
                          <span className="sync-conflict-type">验光记录</span>
                          <span className="sync-conflict-name">{record.patientNo} · {record.examDate}</span>
                        </div>
                        <button 
                          className="sync-conflict-btn"
                          onClick={() => openConflictModal("record", record)}
                        >
                          处理冲突
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sync-failed-section">
                <h4>同步失败记录</h4>
                {overallSyncStats.failed === 0 ? (
                  <p className="sync-empty-text">暂无失败记录</p>
                ) : (
                  <div className="sync-failed-list">
                    {patients.filter(p => p.syncStatus === "failed").map(patient => (
                      <div key={patient.id} className="sync-failed-item">
                        <div className="sync-failed-info">
                          <span className="sync-failed-type">患者档案</span>
                          <span className="sync-failed-name">{patient.patientNo}</span>
                          <p className="sync-failed-error" title={(patient as any).syncError}>
                            {(patient as any).syncError || "未知错误"}
                          </p>
                        </div>
                        <div className="sync-failed-actions">
                          <button 
                            className="text-btn"
                            onClick={() => openSyncErrorModal("patient", patient)}
                          >
                            查看详情
                          </button>
                          <button 
                            className="sync-conflict-btn"
                            onClick={() => handleSyncEntity("patient", patient.id)}
                            disabled={(patient as any).isSubmitting}
                          >
                            {(patient as any).isSubmitting ? "同步中..." : "重试"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {records.filter(r => r.syncStatus === "failed").map(record => (
                      <div key={record.id} className="sync-failed-item">
                        <div className="sync-failed-info">
                          <span className="sync-failed-type">验光记录</span>
                          <span className="sync-failed-name">{record.patientNo} · {record.examDate}</span>
                          <p className="sync-failed-error" title={(record as any).syncError}>
                            {(record as any).syncError || "未知错误"}
                          </p>
                        </div>
                        <div className="sync-failed-actions">
                          <button 
                            className="text-btn"
                            onClick={() => openSyncErrorModal("record", record)}
                          >
                            查看详情
                          </button>
                          <button 
                            className="sync-conflict-btn"
                            onClick={() => handleSyncEntity("record", record.id)}
                            disabled={(record as any).isSubmitting}
                          >
                            {(record as any).isSubmitting ? "同步中..." : "重试"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showConflictModal && conflictEntity && (() => {
        const fieldDiffs = computeFieldDiffs(
          conflictEntity.type,
          conflictEntity.entity,
          conflictEntity.entity.conflictData?.serverData
        );
        const changedFields = fieldDiffs.filter(d => d.isDifferent);
        const unchangedFields = fieldDiffs.filter(d => !d.isDifferent);
        const mergeHistory: MergeHistoryItem[] = conflictEntity.entity.conflictData?.mergeHistory || [];

        const handleFieldChoiceChange = (field: string, choice: FieldChoice) => {
          setFieldResolutions(prev => ({
            ...prev,
            [field]: choice
          }));
        };

        const handleSelectAllLocal = () => {
          const allLocal: Record<string, FieldChoice> = {};
          changedFields.forEach(diff => {
            allLocal[diff.field] = "local";
          });
          setFieldResolutions(allLocal);
        };

        const handleSelectAllServer = () => {
          const allServer: Record<string, FieldChoice> = {};
          changedFields.forEach(diff => {
            allServer[diff.field] = "server";
          });
          setFieldResolutions(allServer);
        };

        const handleToggleAll = () => {
          const toggled: Record<string, FieldChoice> = {};
          changedFields.forEach(diff => {
            const current = fieldResolutions[diff.field] || "local";
            toggled[diff.field] = current === "local" ? "server" : "local";
          });
          setFieldResolutions(toggled);
        };

        const handleMerge = () => {
          const resolutions: FieldResolution[] = changedFields.map(diff => ({
            field: diff.field,
            choice: fieldResolutions[diff.field] || "local"
          }));
          handleResolveConflict(conflictEntity.type, conflictEntity.entity.id, true, resolutions);
        };

        const localCount = Object.values(fieldResolutions).filter(c => c === "local").length;
        const serverCount = Object.values(fieldResolutions).filter(c => c === "server").length;

        return (
          <div className="modal-overlay" onClick={() => setShowConflictModal(false)}>
            <div className="modal-dialog modal-xl conflict-merge-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>字段级冲突合并</h3>
                <button className="modal-close" onClick={() => setShowConflictModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="conflict-warning">
                  <div className="conflict-warning-icon">⚠️</div>
                  <div className="conflict-warning-text">
                    <strong>检测到数据冲突</strong>
                    <p>该记录的本地版本与服务端版本不一致。请逐项选择保留哪一侧的值，或使用快捷操作批量选择。</p>
                  </div>
                </div>

                <div className="conflict-meta-row">
                  <span className="conflict-meta-item">
                    <span className="conflict-version-badge local-badge">本地</span>
                    v{conflictEntity.entity.localVersion}
                  </span>
                  <span className="conflict-meta-sep">→</span>
                  <span className="conflict-meta-item">
                    <span className="conflict-version-badge server-badge">服务端</span>
                    v{conflictEntity.entity.conflictData?.serverData?.serverVersion || "?"}
                  </span>
                  <span className="conflict-meta-item conflict-type-label">
                    冲突类型：{conflictEntity.entity.conflictData?.conflictType === "update-update" ? "双方更新" : conflictEntity.entity.conflictData?.conflictType === "update-delete" ? "本地更新/服务端删除" : "本地删除/服务端更新"}
                  </span>
                </div>

                {mergeHistory.length > 0 && (
                  <div className="merge-history-section">
                    <div className="merge-history-header" onClick={() => {
                      const details = document.querySelector('.merge-history-details') as HTMLDetailsElement;
                      if (details) details.open = !details.open;
                    }}>
                      <span className="merge-history-icon">📋</span>
                      <span>历史合并记录（{mergeHistory.length} 次）</span>
                      <span className="merge-history-toggle">▼</span>
                    </div>
                    <details className="merge-history-details">
                      <summary style={{ display: 'none' }}></summary>
                      <div className="merge-history-list">
                        {mergeHistory.map((history, idx) => (
                          <div key={idx} className="merge-history-item">
                            <div className="merge-history-time">
                              {new Date(history.mergeTimestamp).toLocaleString('zh-CN')}
                            </div>
                            <div className="merge-history-version">
                              服务端版本: v{history.serverVersionAtMerge}
                            </div>
                            <div className="merge-history-resolutions">
                              {history.resolutions.map((r, ridx) => (
                                <span key={ridx} className={`merge-resolution-tag ${r.choice}`}>
                                  {r.field}: {r.choice === 'local' ? '本地' : '服务端'}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                {changedFields.length > 0 && (
                  <div className="conflict-diff-section">
                    <div className="conflict-diff-header-row">
                      <h4 className="conflict-diff-title">变更字段（{changedFields.length} 处差异）</h4>
                      <div className="conflict-bulk-actions">
                        <button className="bulk-action-btn" onClick={handleSelectAllLocal}>
                          全选本地
                        </button>
                        <button className="bulk-action-btn" onClick={handleSelectAllServer}>
                          全选服务端
                        </button>
                        <button className="bulk-action-btn" onClick={handleToggleAll}>
                          反选
                        </button>
                      </div>
                    </div>

                    <div className="conflict-merge-summary">
                      <span className="merge-summary-item local">
                        保留本地: <strong>{localCount}</strong> 项
                      </span>
                      <span className="merge-summary-item server">
                        采用服务端: <strong>{serverCount}</strong> 项
                      </span>
                      <span className="merge-summary-item pending">
                        未选择: <strong>{changedFields.length - localCount - serverCount}</strong> 项
                      </span>
                    </div>

                    <div className="conflict-merge-table">
                      <div className="conflict-merge-header">
                        <span className="merge-col-field">字段</span>
                        <span className="merge-col-choice">选择</span>
                        <span className="merge-col-local">本地值</span>
                        <span className="merge-col-server">服务端值</span>
                      </div>
                      {changedFields.map(diff => {
                        const choice = fieldResolutions[diff.field] || "local";
                        return (
                          <div key={diff.field} className={`conflict-merge-row merge-choice-${choice}`}>
                            <span className="merge-col-field">{diff.label}</span>
                            <span className="merge-col-choice">
                              <div className="choice-toggle-group">
                                <button
                                  className={`choice-toggle ${choice === 'local' ? 'active local' : ''}`}
                                  onClick={() => handleFieldChoiceChange(diff.field, 'local')}
                                  title="保留本地值"
                                >
                                  本地
                                </button>
                                <button
                                  className={`choice-toggle ${choice === 'server' ? 'active server' : ''}`}
                                  onClick={() => handleFieldChoiceChange(diff.field, 'server')}
                                  title="采用服务端值"
                                >
                                  服务端
                                </button>
                              </div>
                            </span>
                            <span className={`merge-col-local ${choice === 'local' ? 'selected' : ''}`}>
                              {String(diff.localValue)}
                            </span>
                            <span className={`merge-col-server ${choice === 'server' ? 'selected' : ''}`}>
                              {String(diff.serverValue)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {unchangedFields.length > 0 && (
                  <details className="conflict-unchanged-section">
                    <summary>未变更字段（{unchangedFields.length} 处一致）</summary>
                    <div className="conflict-diff-table">
                      <div className="conflict-diff-header">
                        <span className="diff-col-label">字段</span>
                        <span className="diff-col-local">本地值</span>
                        <span className="diff-col-server">服务端值</span>
                      </div>
                      {unchangedFields.map(diff => (
                        <div key={diff.field} className="conflict-diff-row diff-unchanged">
                          <span className="diff-col-label">{diff.label}</span>
                          <span className="diff-col-local">{String(diff.localValue)}</span>
                          <span className="diff-col-server">{String(diff.serverValue)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="conflict-diff-hint">
                  <p><strong>合并说明：</strong></p>
                  <ul>
                    <li><span className="choice-indicator local">本地</span> 选中时，该字段将保留本地修改的值</li>
                    <li><span className="choice-indicator server">服务端</span> 选中时，该字段将采用服务端更新的值</li>
                    <li>确认合并后，系统将按照您的选择组合生成最终记录</li>
                    <li>合并后的记录将重新进入待同步状态，等待同步到服务端</li>
                    <li>如再次同步时遇到新的冲突，历史合并记录会被保留供参考</li>
                  </ul>
                </div>
              </div>
              <div className="modal-actions">
                <button className="ghost-btn" onClick={() => setShowConflictModal(false)}>
                  稍后处理
                </button>
                <button 
                  className="secondary-btn"
                  onClick={() => handleResolveConflict(conflictEntity.type, conflictEntity.entity.id, false)}
                >
                  全部采用服务端
                </button>
                <button 
                  className="secondary-btn"
                  onClick={() => handleResolveConflict(conflictEntity.type, conflictEntity.entity.id, true)}
                >
                  全部保留本地
                </button>
                <button 
                  className="primary-action merge-confirm-btn"
                  onClick={handleMerge}
                >
                  ✓ 确认字段级合并
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showSyncErrorModal && syncErrorEntity && (() => {
        const entity = syncErrorEntity.entity;
        const entityType = syncErrorEntity.type;
        const typeLabel = entityType === "patient" ? "患者档案" : "验光记录";
        const entityName = entityType === "patient" 
          ? entity.patientNo 
          : `${entity.patientNo} · ${entity.examDate}`;
        
        return (
          <div className="modal-overlay" onClick={() => setShowSyncErrorModal(false)}>
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>同步错误详情</h3>
                <button className="modal-close" onClick={() => setShowSyncErrorModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="sync-error-warning">
                  <div className="sync-error-icon">✕</div>
                  <div className="sync-error-text">
                    <strong>同步失败</strong>
                    <p>{typeLabel}「{entityName}」最近一次同步遇到错误</p>
                  </div>
                </div>

                <div className="sync-error-details">
                  <div className="sync-error-detail-row">
                    <span className="sync-error-detail-label">错误信息</span>
                    <span className="sync-error-detail-value error-text">
                      {entity.syncError || "未知错误"}
                    </span>
                  </div>
                  <div className="sync-error-detail-row">
                    <span className="sync-error-detail-label">提交次数</span>
                    <span className="sync-error-detail-value">
                      {entity.submitCount || 0} 次
                    </span>
                  </div>
                  <div className="sync-error-detail-row">
                    <span className="sync-error-detail-label">最后尝试时间</span>
                    <span className="sync-error-detail-value">
                      {entity.lastSyncAttempt ? formatSyncTime(entity.lastSyncAttempt) : "—"}
                    </span>
                  </div>
                  <div className="sync-error-detail-row">
                    <span className="sync-error-detail-label">上次成功同步</span>
                    <span className="sync-error-detail-value">
                      {entity.lastSyncedAt ? formatSyncTime(entity.lastSyncedAt) : "从未同步"}
                    </span>
                  </div>
                  <div className="sync-error-detail-row">
                    <span className="sync-error-detail-label">本地版本</span>
                    <span className="sync-error-detail-value">
                      v{entity.localVersion || 1}
                    </span>
                  </div>
                </div>

                <div className="sync-error-hint">
                  <p><strong>常见原因与解决方案：</strong></p>
                  <ul>
                    <li><strong>网络超时：</strong>请检查网络连接后点击"重试同步"</li>
                    <li><strong>服务器错误：</strong>服务器暂时不可用，请稍后再试</li>
                    <li><strong>重复提交：</strong>请等待几秒后再重试，避免频繁提交</li>
                    <li><strong>数据冲突：</strong>服务端数据有更新，需处理冲突后再同步</li>
                  </ul>
                </div>
              </div>
              <div className="modal-actions">
                <button className="ghost-btn" onClick={() => setShowSyncErrorModal(false)}>
                  关闭
                </button>
                <button 
                  className="primary-action"
                  onClick={() => {
                    setShowSyncErrorModal(false);
                    if (entity.syncStatus === "conflict") {
                      openConflictModal(entityType, entity);
                    } else {
                      handleSyncEntity(entityType, entity.id);
                    }
                  }}
                >
                  {entity.syncStatus === "conflict" ? "处理冲突" : "重试同步"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showRoleSwitchConfirm && pendingRoleRef.current && (() => {
        const targetRole = pendingRoleRef.current;
        const info = detectUnsavedEditions(targetRole);
        const targetRoleLabel = ROLE_LABELS[targetRole];
        const warnings: string[] = [];
        if (info.hasPrescriptionUnsaved && info.willLosePrescriptionEdit) {
          warnings.push("处方录入存在未保存的修改，切换后您将失去处方编辑权限");
        }
        if (info.hasPatientUnsaved && info.willLosePatientEdit) {
          warnings.push("患者档案编辑存在未保存的修改，切换后您将失去患者档案编辑权限");
        }
        if (info.hasConflictOpen && (info.willLosePrescriptionEdit || info.willLosePatientEdit)) {
          warnings.push("同步冲突尚未处理完成，切换后您可能无法继续处理当前冲突");
        }

        return (
          <div className="modal-overlay">
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>⚠️ 未保存变更提醒</h3>
              </div>
              <div className="modal-body">
                <div className="conflict-warning">
                  <div className="conflict-warning-icon">⚠️</div>
                  <div className="conflict-warning-text">
                    <strong>即将切换角色至「{targetRoleLabel}」</strong>
                    <p>检测到以下问题，请选择如何处理：</p>
                  </div>
                </div>
                <ul style={{ paddingLeft: "20px", lineHeight: "1.8", color: "var(--text-secondary)" }}>
                  {warnings.map((w, i) => (
                    <li key={i} style={{ marginBottom: "6px" }}>{w}</li>
                  ))}
                </ul>
                <p style={{ marginTop: "16px", color: "var(--text-secondary)", fontSize: "13px" }}>
                  选择「保存并切换」将尝试保存当前编辑内容后切换；
                  选择「放弃变更」将丢弃所有未保存修改；
                  选择「取消」将停留在当前角色。
                </p>
              </div>
              <div className="modal-actions">
                <button className="ghost-btn" onClick={handleRoleSwitchCancel}>
                  取消
                </button>
                <button
                  className="secondary-btn"
                  onClick={handleRoleSwitchDiscard}
                >
                  放弃变更并切换
                </button>
                <button
                  className="primary-action"
                  onClick={handleRoleSwitchSave}
                >
                  保存并切换
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}

export default App;
