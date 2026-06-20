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
  type AppData,
  type FilterState,
  type ReminderData,
} from "./db";
import {
  type SyncStatus,
  type SyncablePatient,
  type SyncableRecord,
  type SyncStats,
  type SyncConfig,
  type EntityType,
  type FieldDiff,
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
  markSubmitting,
  resolveConflictKeepLocal,
  resolveConflictKeepServer,
  calculateSyncStats,
  computeFieldDiffs,
  stripSyncMetadata,
  formatSyncTime,
} from "./sync";

export type UserRole = "optometrist" | "advisor" | "review-doctor";

export const ROLE_LABELS: Record<UserRole, string> = {
  "optometrist": "验光师",
  "advisor": "门店顾问",
  "review-doctor": "复查医生"
};

export type WorkflowStep = "dashboard" | "patient-profile" | "initial-exam" | "recheck-compare" | "prescription-summary" | "export";

export const STEP_LABELS: Record<WorkflowStep, string> = {
  "dashboard": "工作台总览",
  "patient-profile": "患者建档",
  "initial-exam": "初次验光",
  "recheck-compare": "复查对比",
  "prescription-summary": "处方摘要",
  "export": "导出摘要"
};

export const STEP_ICONS: Record<WorkflowStep, string> = {
  "dashboard": "🏠",
  "patient-profile": "👤",
  "initial-exam": "🔬",
  "recheck-compare": "📊",
  "prescription-summary": "📋",
  "export": "📤"
};

export type DashboardSection = "metrics" | "reminder" | "comparison" | "lens-recommendation" | "field-workspace";

export interface RoleConfig {
  label: string;
  defaultStep: WorkflowStep;
  primaryEntryPoints: WorkflowStep[];
  description: string;
  dashboardSections: DashboardSection[];
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  "optometrist": {
    label: "验光师",
    defaultStep: "initial-exam",
    primaryEntryPoints: ["initial-exam", "patient-profile", "recheck-compare"],
    description: "负责验光检查、处方开具与患者管理",
    dashboardSections: ["metrics", "reminder", "comparison", "field-workspace", "lens-recommendation"]
  },
  "advisor": {
    label: "门店顾问",
    defaultStep: "patient-profile",
    primaryEntryPoints: ["patient-profile"],
    description: "负责患者接待、建档管理与配镜建议",
    dashboardSections: ["metrics", "reminder", "lens-recommendation"]
  },
  "review-doctor": {
    label: "复查医生",
    defaultStep: "recheck-compare",
    primaryEntryPoints: ["recheck-compare", "prescription-summary"],
    description: "负责复查对比、处方审核与稳定评估",
    dashboardSections: ["metrics", "comparison", "reminder"]
  }
};

export interface RolePermission {
  canViewPatientProfile: boolean;
  canEditPatientProfile: boolean;
  canViewInitialExam: boolean;
  canEditInitialExam: boolean;
  canViewRecheckCompare: boolean;
  canEditRecheckCompare: boolean;
  canViewPrescriptionSummary: boolean;
  canEditPrescriptionSummary: boolean;
  canExport: boolean;
  canGenerateLensRecommendation: boolean;
  canViewReminderBoard: boolean;
  canEditReminderCycle: boolean;
  canClearAllData: boolean;
  canViewProfessionalParams: boolean;
  canViewDetailedRecords: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermission> = {
  "optometrist": {
    canViewPatientProfile: true,
    canEditPatientProfile: true,
    canViewInitialExam: true,
    canEditInitialExam: true,
    canViewRecheckCompare: true,
    canEditRecheckCompare: true,
    canViewPrescriptionSummary: true,
    canEditPrescriptionSummary: true,
    canExport: true,
    canGenerateLensRecommendation: true,
    canViewReminderBoard: true,
    canEditReminderCycle: true,
    canClearAllData: true,
    canViewProfessionalParams: true,
    canViewDetailedRecords: true
  },
  "advisor": {
    canViewPatientProfile: true,
    canEditPatientProfile: true,
    canViewInitialExam: false,
    canEditInitialExam: false,
    canViewRecheckCompare: false,
    canEditRecheckCompare: false,
    canViewPrescriptionSummary: false,
    canEditPrescriptionSummary: false,
    canExport: false,
    canGenerateLensRecommendation: true,
    canViewReminderBoard: true,
    canEditReminderCycle: true,
    canClearAllData: false,
    canViewProfessionalParams: false,
    canViewDetailedRecords: false
  },
  "review-doctor": {
    canViewPatientProfile: true,
    canEditPatientProfile: false,
    canViewInitialExam: true,
    canEditInitialExam: false,
    canViewRecheckCompare: true,
    canEditRecheckCompare: true,
    canViewPrescriptionSummary: true,
    canEditPrescriptionSummary: true,
    canExport: true,
    canGenerateLensRecommendation: true,
    canViewReminderBoard: true,
    canEditReminderCycle: true,
    canClearAllData: false,
    canViewProfessionalParams: true,
    canViewDetailedRecords: true
  }
};

export interface PatientProfile {
  id: string;
  patientNo: string;
  ageGroup: string;
  lensType: string;
  lastCheckDate: string;
  remark: string;
}

export type ReminderStatus = "overdue" | "upcoming" | "normal";

export interface EyeRefraction {
  nakedVision: string;
  correctedVision: string;
  sphere: string;
  cylinder: string;
  axis: string;
  add: string;
}

export interface EyeCurvature {
  horizontal: string;
  vertical: string;
}

export interface CornealCurvature {
  right: EyeCurvature;
  left: EyeCurvature;
}

export interface RefractionRecord {
  id: string;
  patientNo: string;
  category: string;
  type: string;
  summary: string;
  patientName: string;
  ageGroup: string;
  gender: string;
  examDate: string;
  rightEye: EyeRefraction;
  leftEye: EyeRefraction;
  pd: string;
  cornealCurvature: CornealCurvature;
  recommendation: string;
}

interface PatientReminder extends PatientProfile {
  reminderStatus: ReminderStatus;
  nextCheckDate: string;
  daysUntilNext: number;
  reminderCycle: number;
}

const ageGroups = ["儿童", "青少年", "成人", "中老年"];
const lensTypes = ["单光镜", "渐进片", "角膜塑形镜", "散光镜", "老花镜"];

const REMINDER_CYCLES: Record<string, number> = {
  "儿童-角膜塑形镜": 30,
  "青少年-角膜塑形镜": 30,
  "成人-角膜塑形镜": 30,
  "中老年-角膜塑形镜": 30,
  "儿童-单光镜": 30,
  "儿童-散光镜": 30,
  "青少年-单光镜": 60,
  "青少年-散光镜": 60,
  "成人-渐进片": 180,
  "中老年-渐进片": 180,
  "成人-老花镜": 180,
  "中老年-老花镜": 180,
};

const DEFAULT_CYCLE = 90;
const UPCOMING_THRESHOLD = 7;
const DAY_IN_MS = 1000 * 60 * 60 * 24;

function getReminderCycle(ageGroup: string, lensType: string): number {
  const key = `${ageGroup}-${lensType}`;
  return REMINDER_CYCLES[key] || DEFAULT_CYCLE;
}

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateReminder(patient: PatientProfile, today: Date, customCycle?: number | null): PatientReminder {
  const cycleDays = customCycle && customCycle > 0 ? customCycle : getReminderCycle(patient.ageGroup, patient.lensType);
  const lastCheck = parseLocalDate(patient.lastCheckDate);
  const nextCheck = new Date(lastCheck);
  nextCheck.setDate(lastCheck.getDate() + cycleDays);

  const diffTime = nextCheck.getTime() - startOfLocalDay(today).getTime();
  const diffDays = Math.round(diffTime / DAY_IN_MS);

  let status: ReminderStatus;
  if (diffDays < 0) {
    status = "overdue";
  } else if (diffDays <= UPCOMING_THRESHOLD) {
    status = "upcoming";
  } else {
    status = "normal";
  }

  return {
    ...patient,
    reminderStatus: status,
    nextCheckDate: formatLocalDate(nextCheck),
    daysUntilNext: diffDays,
    reminderCycle: cycleDays,
  };
}

const initialPatients: PatientProfile[] = [
  {
    id: "p-001",
    patientNo: "Patient-032",
    ageGroup: "儿童",
    lensType: "单光镜",
    lastCheckDate: "2026-05-15",
    remark: "近视进展较快，需密切关注"
  },
  {
    id: "p-002",
    patientNo: "Patient-081",
    ageGroup: "中老年",
    lensType: "渐进片",
    lastCheckDate: "2026-04-20",
    remark: "ADD +1.50，瞳高待确认"
  },
  {
    id: "p-003",
    patientNo: "Patient-144",
    ageGroup: "青少年",
    lensType: "散光镜",
    lastCheckDate: "2026-06-01",
    remark: "柱镜变化0.50D"
  },
  {
    id: "p-004",
    patientNo: "Patient-256",
    ageGroup: "儿童",
    lensType: "角膜塑形镜",
    lastCheckDate: "2026-05-10",
    remark: "OK镜配戴良好，需定期复查眼轴"
  },
  {
    id: "p-005",
    patientNo: "Patient-312",
    ageGroup: "儿童",
    lensType: "角膜塑形镜",
    lastCheckDate: "2026-06-15",
    remark: "视力稳定，继续保持"
  },
  {
    id: "p-006",
    patientNo: "Patient-478",
    ageGroup: "青少年",
    lensType: "角膜塑形镜",
    lastCheckDate: "2026-05-18",
    remark: "眼压略高，需关注"
  },
  {
    id: "p-007",
    patientNo: "Patient-521",
    ageGroup: "成人",
    lensType: "渐进片",
    lastCheckDate: "2025-12-10",
    remark: "花眼症状明显，渐进片适配中"
  },
  {
    id: "p-008",
    patientNo: "Patient-634",
    ageGroup: "成人",
    lensType: "单光镜",
    lastCheckDate: "2026-03-15",
    remark: "高度近视，每年需检查眼底"
  },
  {
    id: "p-009",
    patientNo: "Patient-789",
    ageGroup: "中老年",
    lensType: "老花镜",
    lastCheckDate: "2026-01-05",
    remark: "ADD +2.00，视近清晰"
  },
  {
    id: "p-010",
    patientNo: "Patient-890",
    ageGroup: "儿童",
    lensType: "散光镜",
    lastCheckDate: "2026-05-20",
    remark: "散光度数稳定"
  },
  {
    id: "p-011",
    patientNo: "Patient-901",
    ageGroup: "成人",
    lensType: "散光镜",
    lastCheckDate: "2026-04-01",
    remark: "工作性质需长时间对着电脑"
  },
  {
    id: "p-012",
    patientNo: "Patient-102",
    ageGroup: "青少年",
    lensType: "单光镜",
    lastCheckDate: "2026-06-10",
    remark: "近视度数稳定"
  },
  {
    id: "p-013",
    patientNo: "Patient-666",
    ageGroup: "成人",
    lensType: "单光镜",
    lastCheckDate: "2026-05-20",
    remark: "矫正视力提升，屈光度数稳定"
  },
  {
    id: "p-014",
    patientNo: "Patient-777",
    ageGroup: "儿童",
    lensType: "角膜塑形镜",
    lastCheckDate: "2026-05-25",
    remark: "OK镜塑形效果良好，曲率变平"
  }
];

const project = {
  "id": "hxwl-11",
  "port": 5111,
  "title": "眼科验光记录",
  "subtitle": "视力、屈光参数与复查处方对比",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#2563eb",
    "#059669",
    "#dc2626"
  ],
  "domain": "眼视光",
  "users": [
    "验光师",
    "门店顾问",
    "复查医生"
  ],
  "metrics": [
    "患者总数",
    "已逾期",
    "即将到期",
    "正常"
  ],
  "filters": [
    "儿童",
    "成人",
    "渐进片",
    "角膜塑形镜"
  ],
  "fields": [
    "裸眼视力",
    "矫正视力",
    "球镜",
    "柱镜",
    "轴位",
    "瞳距",
    "角膜曲率"
  ]
};

const refractionRecords: RefractionRecord[] = [
  {
    id: "r-001",
    patientNo: "Patient-032",
    category: "儿童近视",
    type: "初配",
    summary: "右眼-2.25DS/-0.50DC×180°，左眼-1.75DS/-0.25DC×175°，PD 58mm",
    patientName: "张小明",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-02-15",
    rightEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.25", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.4", correctedVision: "1.0", sphere: "-1.75", cylinder: "-0.25", axis: "175", add: "" },
    pd: "58",
    cornealCurvature: { right: { horizontal: "42.50", vertical: "43.00" }, left: { horizontal: "42.75", vertical: "43.25" } },
    recommendation: "初次配镜，建议每3个月复查，注意用眼习惯，增加户外活动时间。"
  },
  {
    id: "r-001b",
    patientNo: "Patient-032",
    category: "儿童近视",
    type: "复查",
    summary: "右眼-2.75DS/-0.50DC×180°，左眼-2.25DS/-0.25DC×175°，PD 58mm",
    patientName: "张小明",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-05-15",
    rightEye: { nakedVision: "0.25", correctedVision: "1.0", sphere: "-2.75", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.25", cylinder: "-0.25", axis: "175", add: "" },
    pd: "58",
    cornealCurvature: { right: { horizontal: "42.75", vertical: "43.25" }, left: { horizontal: "43.00", vertical: "43.50" } },
    recommendation: "近视进展较快，双眼各增加0.50D，建议增加户外活动时间，考虑角膜塑形镜控制近视进展，3个月后复查。"
  },
  {
    id: "r-002",
    patientNo: "Patient-081",
    category: "渐进片",
    type: "初配",
    summary: "ADD +1.50D，右眼+0.50DS/-0.75DC×90°，左眼+0.75DS/-1.00DC×85°，PD 63mm",
    patientName: "李建国",
    ageGroup: "中老年",
    gender: "男",
    examDate: "2026-04-20",
    rightEye: { nakedVision: "0.6", correctedVision: "1.0", sphere: "+0.50", cylinder: "-0.75", axis: "90", add: "+1.50" },
    leftEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "+0.75", cylinder: "-1.00", axis: "85", add: "+1.50" },
    pd: "63",
    cornealCurvature: { right: { horizontal: "43.25", vertical: "44.00" }, left: { horizontal: "43.50", vertical: "44.25" } },
    recommendation: "ADD +1.50，渐进片初配需确认瞳高，建议选择短通道渐进片，2周后回访适应情况。"
  },
  {
    id: "r-003",
    patientNo: "Patient-144",
    category: "散光",
    type: "初配",
    summary: "右眼-1.50DS/-0.75DC×15°，左眼-1.75DS/-1.00DC×165°，PD 60mm",
    patientName: "王思雨",
    ageGroup: "青少年",
    gender: "女",
    examDate: "2026-01-10",
    rightEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "-1.50", cylinder: "-0.75", axis: "15", add: "" },
    leftEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "-1.75", cylinder: "-1.00", axis: "165", add: "" },
    pd: "60",
    cornealCurvature: { right: { horizontal: "42.00", vertical: "43.25" }, left: { horizontal: "42.25", vertical: "43.50" } },
    recommendation: "散光度数较高，建议半年复查一次，注意用眼姿势，避免躺着看书。"
  },
  {
    id: "r-003b",
    patientNo: "Patient-144",
    category: "散光",
    type: "复查",
    summary: "右眼-1.50DS/-1.25DC×10°，左眼-1.75DS/-1.50DC×170°，PD 60mm",
    patientName: "王思雨",
    ageGroup: "青少年",
    gender: "女",
    examDate: "2026-06-01",
    rightEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "-1.50", cylinder: "-1.25", axis: "10", add: "" },
    leftEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "-1.75", cylinder: "-1.50", axis: "170", add: "" },
    pd: "60",
    cornealCurvature: { right: { horizontal: "42.00", vertical: "43.75" }, left: { horizontal: "42.25", vertical: "44.00" } },
    recommendation: "柱镜较上次增加0.50D，散光变化需关注，建议半年后复查，注意用眼姿势。"
  },
  {
    id: "r-004",
    patientNo: "Patient-256",
    category: "角膜塑形镜",
    type: "初配",
    summary: "右眼-3.00DS/-0.75DC×170°，左眼-3.25DS/-0.50DC×5°，PD 61mm",
    patientName: "陈晓峰",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-02-20",
    rightEye: { nakedVision: "0.2", correctedVision: "1.0", sphere: "-3.00", cylinder: "-0.75", axis: "170", add: "" },
    leftEye: { nakedVision: "0.2", correctedVision: "1.0", sphere: "-3.25", cylinder: "-0.50", axis: "5", add: "" },
    pd: "61",
    cornealCurvature: { right: { horizontal: "43.00", vertical: "44.00" }, left: { horizontal: "43.25", vertical: "44.25" } },
    recommendation: "角膜塑形镜初配，夜间配戴，白天摘镜，需密切随访角膜地形图，1周、1个月、3个月定期复查。"
  },
  {
    id: "r-004b",
    patientNo: "Patient-256",
    category: "角膜塑形镜",
    type: "复查",
    summary: "右眼-3.25DS/-0.75DC×170°，左眼-3.50DS/-0.50DC×5°，PD 61mm",
    patientName: "陈晓峰",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-05-20",
    rightEye: { nakedVision: "0.8", correctedVision: "1.0", sphere: "-3.25", cylinder: "-0.75", axis: "170", add: "" },
    leftEye: { nakedVision: "0.8", correctedVision: "1.0", sphere: "-3.50", cylinder: "-0.50", axis: "5", add: "" },
    pd: "61",
    cornealCurvature: { right: { horizontal: "42.75", vertical: "43.75" }, left: { horizontal: "43.00", vertical: "44.00" } },
    recommendation: "OK镜配戴3个月复查，白天裸眼视力0.8，近视略有进展，眼轴增长需关注，继续配戴，3个月后复查。"
  },
  {
    id: "r-005",
    patientNo: "Patient-312",
    category: "角膜塑形镜",
    type: "初配",
    summary: "右眼-2.00DS/-0.50DC×180°，左眼-2.00DS/-0.25DC×175°，PD 59mm",
    patientName: "刘梦瑶",
    ageGroup: "儿童",
    gender: "女",
    examDate: "2026-03-01",
    rightEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.00", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.00", cylinder: "-0.25", axis: "175", add: "" },
    pd: "59",
    cornealCurvature: { right: { horizontal: "42.25", vertical: "43.00" }, left: { horizontal: "42.50", vertical: "43.25" } },
    recommendation: "角膜塑形镜初配，注意眼部卫生，按规范护理镜片，定期复查。"
  },
  {
    id: "r-005b",
    patientNo: "Patient-312",
    category: "角膜塑形镜",
    type: "复查",
    summary: "右眼-2.00DS/-0.50DC×180°，左眼-2.00DS/-0.25DC×175°，PD 59mm",
    patientName: "刘梦瑶",
    ageGroup: "儿童",
    gender: "女",
    examDate: "2026-06-15",
    rightEye: { nakedVision: "0.9", correctedVision: "1.0", sphere: "-2.00", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.9", correctedVision: "1.0", sphere: "-2.00", cylinder: "-0.25", axis: "175", add: "" },
    pd: "59",
    cornealCurvature: { right: { horizontal: "42.25", vertical: "43.00" }, left: { horizontal: "42.50", vertical: "43.25" } },
    recommendation: "视力稳定，近视控制良好，继续保持，建议半年后复查。"
  },
  {
    id: "r-006",
    patientNo: "Patient-478",
    category: "角膜塑形镜",
    type: "初配",
    summary: "右眼-4.00DS/-1.00DC×10°，左眼-3.75DS/-0.75DC×170°，PD 62mm",
    patientName: "赵宇航",
    ageGroup: "青少年",
    gender: "男",
    examDate: "2026-02-10",
    rightEye: { nakedVision: "0.15", correctedVision: "1.0", sphere: "-4.00", cylinder: "-1.00", axis: "10", add: "" },
    leftEye: { nakedVision: "0.15", correctedVision: "1.0", sphere: "-3.75", cylinder: "-0.75", axis: "170", add: "" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "43.50", vertical: "44.50" }, left: { horizontal: "43.75", vertical: "44.75" } },
    recommendation: "高度近视，建议角膜塑形镜联合低浓度阿托品控制近视，密切关注眼轴增长。"
  },
  {
    id: "r-006b",
    patientNo: "Patient-478",
    category: "角膜塑形镜",
    type: "复查",
    summary: "右眼-4.25DS/-1.25DC×10°，左眼-4.00DS/-1.00DC×170°，PD 62mm",
    patientName: "赵宇航",
    ageGroup: "青少年",
    gender: "男",
    examDate: "2026-05-18",
    rightEye: { nakedVision: "0.7", correctedVision: "1.0", sphere: "-4.25", cylinder: "-1.25", axis: "10", add: "" },
    leftEye: { nakedVision: "0.7", correctedVision: "1.0", sphere: "-4.00", cylinder: "-1.00", axis: "170", add: "" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "43.25", vertical: "44.25" }, left: { horizontal: "43.50", vertical: "44.50" } },
    recommendation: "近视进展+0.25D，散光略有增加，眼压略高需关注，建议3个月后复查眼轴和视野。"
  },
  {
    id: "r-007",
    patientNo: "Patient-521",
    category: "渐进片",
    type: "初配",
    summary: "ADD +1.75D，右眼-1.00DS/-0.50DC×90°，左眼-0.75DS/-0.75DC×85°，PD 62mm",
    patientName: "周美玲",
    ageGroup: "成人",
    gender: "女",
    examDate: "2025-12-10",
    rightEye: { nakedVision: "0.7", correctedVision: "1.0", sphere: "-1.00", cylinder: "-0.50", axis: "90", add: "+1.75" },
    leftEye: { nakedVision: "0.7", correctedVision: "1.0", sphere: "-0.75", cylinder: "-0.75", axis: "85", add: "+1.75" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "42.75", vertical: "43.50" }, left: { horizontal: "43.00", vertical: "43.75" } },
    recommendation: "花眼症状明显，渐进片初配，需适应期2-4周，建议室内外各备一副眼镜。"
  },
  {
    id: "r-008",
    patientNo: "Patient-666",
    category: "成人近视",
    type: "初配",
    summary: "右眼-3.00DS/-0.50DC×180°，左眼-2.75DS/-0.50DC×175°，PD 62mm",
    patientName: "孙晓燕",
    ageGroup: "成人",
    gender: "女",
    examDate: "2026-01-20",
    rightEye: { nakedVision: "0.2", correctedVision: "0.8", sphere: "-3.00", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.25", correctedVision: "0.8", sphere: "-2.75", cylinder: "-0.50", axis: "175", add: "" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "43.00", vertical: "44.00" }, left: { horizontal: "43.25", vertical: "44.25" } },
    recommendation: "双眼矫正视力0.8，略低于正常，建议进一步检查眼底，排除弱视可能，半年后复查。"
  },
  {
    id: "r-008b",
    patientNo: "Patient-666",
    category: "成人近视",
    type: "复查",
    summary: "右眼-3.00DS/-0.50DC×180°，左眼-2.75DS/-0.50DC×175°，PD 62mm",
    patientName: "孙晓燕",
    ageGroup: "成人",
    gender: "女",
    examDate: "2026-05-20",
    rightEye: { nakedVision: "0.2", correctedVision: "1.0", sphere: "-3.00", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.25", correctedVision: "1.0", sphere: "-2.75", cylinder: "-0.50", axis: "175", add: "" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "43.00", vertical: "44.00" }, left: { horizontal: "43.25", vertical: "44.25" } },
    recommendation: "矫正视力提升至1.0，屈光度数稳定，建议半年后复查。"
  },
  {
    id: "r-009",
    patientNo: "Patient-777",
    category: "角膜塑形镜",
    type: "初配",
    summary: "右眼-2.50DS/-0.75DC×90°，左眼-2.25DS/-0.75DC×85°，PD 60mm",
    patientName: "钱天佑",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-02-25",
    rightEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.50", cylinder: "-0.75", axis: "90", add: "" },
    leftEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.25", cylinder: "-0.75", axis: "85", add: "" },
    pd: "60",
    cornealCurvature: { right: { horizontal: "42.50", vertical: "43.50" }, left: { horizontal: "42.75", vertical: "43.75" } },
    recommendation: "OK镜初配，曲率偏高，需密切随访角膜形态变化，1周后首次复查。"
  },
  {
    id: "r-009b",
    patientNo: "Patient-777",
    category: "角膜塑形镜",
    type: "复查",
    summary: "右眼-2.50DS/-0.75DC×90°，左眼-2.25DS/-0.75DC×85°，PD 60mm",
    patientName: "钱天佑",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-05-25",
    rightEye: { nakedVision: "0.8", correctedVision: "1.0", sphere: "-2.50", cylinder: "-0.75", axis: "90", add: "" },
    leftEye: { nakedVision: "0.8", correctedVision: "1.0", sphere: "-2.25", cylinder: "-0.75", axis: "85", add: "" },
    pd: "60",
    cornealCurvature: { right: { horizontal: "42.00", vertical: "43.00" }, left: { horizontal: "42.25", vertical: "43.25" } },
    recommendation: "OK镜配戴3个月，角膜曲率变平0.50D，塑形效果良好，屈光度数稳定，建议3个月后复查。"
  }
];

type ComparisonCategory = "myopia-progress" | "astigmatism-change" | "stable";

type ComparisonBaselineType = "latest-two" | "first-to-current" | "custom";

interface ComparisonBaselineConfig {
  type: ComparisonBaselineType;
  customRecordIds?: [string, string];
}

interface EyeComparison {
  sphere: { prev: string; curr: string; diff: number; changed: boolean };
  cylinder: { prev: string; curr: string; diff: number; changed: boolean };
  axis: { prev: string; curr: string; diff: number; changed: boolean };
  correctedVision: { prev: string; curr: string; diff: number; changed: boolean };
}

interface CurvatureComparison {
  horizontal: { prev: string; curr: string; diff: number; changed: boolean };
  vertical: { prev: string; curr: string; diff: number; changed: boolean };
}

interface PrescriptionComparisonResult {
  patientNo: string;
  patientName: string;
  prevRecord: RefractionRecord;
  currRecord: RefractionRecord;
  rightEye: EyeComparison;
  leftEye: EyeComparison;
  cornealCurvature: {
    right: CurvatureComparison;
    left: CurvatureComparison;
  };
  category: ComparisonCategory;
  categoryLabel: string;
  daysBetween: number;
}

interface ParsedRecordRow {
  record: Omit<RefractionRecord, "id" | "summary"> & { summary: string };
  rightEyeSummary: string;
  rowIndex: number;
}

interface ParseErrorRow {
  rowIndex: number;
  rowText: string;
  errors: string[];
}

interface CsvParseResult {
  validRows: ParsedRecordRow[];
  errorRows: ParseErrorRow[];
  missingRequired: string[];
  extraColumns: string[];
  headerMapping: Record<string, number>;
}

interface CsvFieldMapping {
  key: string;
  required: boolean;
  label: string;
  aliases: string[];
}

const CSV_FIELD_MAPPINGS: CsvFieldMapping[] = [
  { key: "patientNo", required: true, label: "患者编号", aliases: ["患者编号", "编号", "patientNo", "patient_no", "患者号", "病案号"] },
  { key: "patientName", required: true, label: "患者姓名", aliases: ["患者姓名", "姓名", "patientName", "patient_name", "名字", "患者名"] },
  { key: "category", required: true, label: "分类", aliases: ["分类", "category", "类别", "诊断分类"] },
  { key: "examDate", required: true, label: "检查日期", aliases: ["检查日期", "examDate", "exam_date", "日期", "检查时间", "验光日期"] },
  { key: "rightSphere", required: true, label: "右眼球镜", aliases: ["右眼球镜", "rightSphere", "right_sphere", "右眼DS", "OD球镜", "R球镜"] },
  { key: "rightCylinder", required: true, label: "右眼柱镜", aliases: ["右眼柱镜", "rightCylinder", "right_cylinder", "右眼DC", "OD柱镜", "R柱镜"] },
  { key: "rightAxis", required: true, label: "右眼轴位", aliases: ["右眼轴位", "rightAxis", "right_axis", "右眼AX", "OD轴位", "R轴位"] },
  { key: "leftSphere", required: true, label: "左眼球镜", aliases: ["左眼球镜", "leftSphere", "left_sphere", "左眼DS", "OS球镜", "L球镜"] },
  { key: "leftCylinder", required: true, label: "左眼柱镜", aliases: ["左眼柱镜", "leftCylinder", "left_cylinder", "左眼DC", "OS柱镜", "L柱镜"] },
  { key: "leftAxis", required: true, label: "左眼轴位", aliases: ["左眼轴位", "leftAxis", "left_axis", "左眼AX", "OS轴位", "L轴位"] },
  { key: "type", required: false, label: "类型", aliases: ["类型", "type", "检查类型", "验光类型"] },
  { key: "ageGroup", required: false, label: "年龄段", aliases: ["年龄段", "ageGroup", "age_group", "年龄"] },
  { key: "pd", required: false, label: "瞳距", aliases: ["瞳距", "pd", "PD", "瞳距PD"] },
  { key: "recommendation", required: false, label: "建议", aliases: ["建议", "recommendation", "验配建议", "备注"] }
];

const CSV_REQUIRED_LABELS = CSV_FIELD_MAPPINGS.filter(f => f.required).map(f => f.label);

function matchHeaderToField(headerName: string): CsvFieldMapping | null {
  const trimmed = headerName.trim();
  for (const mapping of CSV_FIELD_MAPPINGS) {
    if (mapping.aliases.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
      return mapping;
    }
  }
  return null;
}

interface HeaderMappingResult {
  mapping: Record<string, number>;
  missingRequired: string[];
  extraColumns: string[];
}

function buildHeaderMapping(headerFields: string[]): HeaderMappingResult {
  const mapping: Record<string, number> = {};
  const missingRequired: string[] = [];
  const extraColumns: string[] = [];
  const matchedKeys = new Set<string>();

  for (let colIdx = 0; colIdx < headerFields.length; colIdx++) {
    const fieldMapping = matchHeaderToField(headerFields[colIdx]);
    if (fieldMapping) {
      mapping[fieldMapping.key] = colIdx;
      matchedKeys.add(fieldMapping.key);
    } else {
      extraColumns.push(headerFields[colIdx].trim());
    }
  }

  for (const field of CSV_FIELD_MAPPINGS) {
    if (field.required && !matchedKeys.has(field.key)) {
      missingRequired.push(field.label);
    }
  }

  return { mapping, missingRequired, extraColumns };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function formatRightEyeSummary(sphere: string, cylinder: string, axis: string): string {
  const sphNum = parseSafeNumber(sphere);
  const cylNum = parseSafeNumber(cylinder);
  const hasCylinder = cylNum !== null && cylNum !== 0;
  const sphText = sphNum !== null ? `${sphNum > 0 ? "+" : ""}${sphNum.toFixed(2)}DS` : sphere;
  if (hasCylinder) {
    const cylText = cylNum !== null ? `${cylNum > 0 ? "+" : ""}${cylNum.toFixed(2)}DC` : cylinder;
    const axText = axis ? `${parseInt(axis, 10) || axis}°` : "";
    return `${sphText}/${cylText}×${axText}`;
  }
  return sphText;
}

const NUMBER_REGEX = /^[+-]?\d+(\.\d+)?$/;
const POSITIVE_NUMBER_REGEX = /^\d+(\.\d+)?$/;
const NON_NEGATIVE_INTEGER_REGEX = /^\d+$/;

function isValidNumberFormat(value: string, allowSign: boolean = true): boolean {
  if (!value.trim()) return false;
  const regex = allowSign ? NUMBER_REGEX : POSITIVE_NUMBER_REGEX;
  return regex.test(value.trim());
}

function parseSafeNumber(value: string): number | null {
  if (!isValidNumberFormat(value)) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function cleanNumber(value: string, allowSign: boolean = true): string {
  if (allowSign) {
    return value.replace(/[^0-9.+\-]/g, "").replace(/(?!^)[+-]/g, "").replace(/(\..*)\./g, "$1");
  } else {
    return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
  }
}

function isQuarterStep(value: string): boolean {
  if (!value || value === "-" || value === "+" || value === "." || value === "-." || value === "+.") return true;
  if (!isValidNumberFormat(value)) return false;
  const num = parseSafeNumber(value);
  if (num === null) return false;
  return Math.abs(num * 4 - Math.round(num * 4)) < 0.001;
}

interface FieldError {
  message: string;
}

interface PrescriptionErrors {
  patientNo?: FieldError;
  patientName?: FieldError;
  ageGroup?: FieldError;
  gender?: FieldError;
  examDate?: FieldError;
  pd?: FieldError;
  rightEye?: {
    nakedVision?: FieldError;
    correctedVision?: FieldError;
    sphere?: FieldError;
    cylinder?: FieldError;
    axis?: FieldError;
    add?: FieldError;
  };
  leftEye?: {
    nakedVision?: FieldError;
    correctedVision?: FieldError;
    sphere?: FieldError;
    cylinder?: FieldError;
    axis?: FieldError;
    add?: FieldError;
  };
  cornealCurvature?: {
    right?: { horizontal?: FieldError; vertical?: FieldError };
    left?: { horizontal?: FieldError; vertical?: FieldError };
  };
}

function validateVision(value: string): FieldError | undefined {
  if (!value.trim()) return { message: "必填" };
  if (!isValidNumberFormat(value, false)) return { message: "请输入正数" };
  const num = parseSafeNumber(value);
  if (num === null || num <= 0 || num > 2.0) return { message: "范围0.01~2.0" };
  return undefined;
}

function validateSphere(value: string): FieldError | undefined {
  if (!value.trim()) return { message: "必填" };
  if (!isValidNumberFormat(value, true)) return { message: "请输入有效数字" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < -20 || num > 20) return { message: "范围-20~+20D" };
  if (!isQuarterStep(value)) return { message: "需0.25D步进" };
  return undefined;
}

function validateCylinder(value: string): FieldError | undefined {
  if (!value.trim()) return { message: "必填" };
  if (!isValidNumberFormat(value, true)) return { message: "请输入有效数字" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < -10 || num > 10) return { message: "范围-10~+10D" };
  if (!isQuarterStep(value)) return { message: "需0.25D步进" };
  return undefined;
}

function validateAxis(value: string, hasCylinder: boolean): FieldError | undefined {
  if (!hasCylinder && !value.trim()) return undefined;
  if (hasCylinder && !value.trim()) return { message: "有柱镜时必填" };
  if (!value.trim()) return undefined;
  if (!NON_NEGATIVE_INTEGER_REGEX.test(value.trim())) return { message: "请输入正整数" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < 0 || num > 180) return { message: "范围0~180°" };
  return undefined;
}

function validateAdd(value: string): FieldError | undefined {
  if (!value.trim()) return undefined;
  if (!isValidNumberFormat(value, true)) return { message: "请输入有效数字" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < 0 || num > 4) return { message: "范围0~+4.00D" };
  if (!isQuarterStep(value)) return { message: "需0.25D步进" };
  return undefined;
}

function validatePd(value: string): FieldError | undefined {
  if (!value.trim()) return { message: "必填" };
  if (!isValidNumberFormat(value, false)) return { message: "请输入正数" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < 40 || num > 80) return { message: "范围40~80mm" };
  return undefined;
}

function validateCurvature(value: string): FieldError | undefined {
  if (!value.trim()) return undefined;
  if (!isValidNumberFormat(value, false)) return { message: "请输入正数" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < 35 || num > 50) return { message: "范围35~50D" };
  if (!isQuarterStep(value)) return { message: "需0.25D步进" };
  return undefined;
}

function getField(fields: string[], mapping: Record<string, number>, key: string): string | undefined {
  const idx = mapping[key];
  if (idx === undefined || idx >= fields.length) return undefined;
  return fields[idx];
}

function validateAndBuildRecord(fields: string[], rowIndex: number, mapping: Record<string, number>): { record?: ParsedRecordRow; errors?: string[] } {
  const errors: string[] = [];

  const patientNo = getField(fields, mapping, "patientNo");
  const patientName = getField(fields, mapping, "patientName");
  const category = getField(fields, mapping, "category");
  const type = getField(fields, mapping, "type");
  const ageGroup = getField(fields, mapping, "ageGroup");
  const examDate = getField(fields, mapping, "examDate");
  const rightSphere = getField(fields, mapping, "rightSphere");
  const rightCylinder = getField(fields, mapping, "rightCylinder");
  const rightAxis = getField(fields, mapping, "rightAxis");
  const leftSphere = getField(fields, mapping, "leftSphere");
  const leftCylinder = getField(fields, mapping, "leftCylinder");
  const leftAxis = getField(fields, mapping, "leftAxis");
  const pd = getField(fields, mapping, "pd");
  const recommendation = getField(fields, mapping, "recommendation");

  if (!patientNo?.trim()) errors.push("患者编号不能为空");
  if (!patientName?.trim()) errors.push("患者姓名不能为空");

  if (ageGroup && !ageGroups.includes(ageGroup.trim())) {
    errors.push(`年龄段无效：${ageGroup}（有效值：${ageGroups.join("、")}）`);
  }

  if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate.trim())) {
    errors.push(`检查日期格式无效：${examDate}（请使用 YYYY-MM-DD 格式）`);
  }

  if (rightSphere && validateSphere(rightSphere.trim())) {
    errors.push(`右眼球镜：${validateSphere(rightSphere.trim())?.message}`);
  }
  if (leftSphere && validateSphere(leftSphere.trim())) {
    errors.push(`左眼球镜：${validateSphere(leftSphere.trim())?.message}`);
  }

  const hasRightCyl = !!(rightCylinder && parseSafeNumber(rightCylinder.trim()) !== null && parseSafeNumber(rightCylinder.trim()) !== 0);
  const hasLeftCyl = !!(leftCylinder && parseSafeNumber(leftCylinder.trim()) !== null && parseSafeNumber(leftCylinder.trim()) !== 0);

  if (rightCylinder && validateCylinder(rightCylinder.trim())) {
    errors.push(`右眼柱镜：${validateCylinder(rightCylinder.trim())?.message}`);
  }
  if (leftCylinder && validateCylinder(leftCylinder.trim())) {
    errors.push(`左眼柱镜：${validateCylinder(leftCylinder.trim())?.message}`);
  }

  if (hasRightCyl && (!rightAxis || !rightAxis.trim())) {
    errors.push("右眼有柱镜时轴位必填");
  }
  if (hasLeftCyl && (!leftAxis || !leftAxis.trim())) {
    errors.push("左眼有柱镜时轴位必填");
  }

  if (rightAxis && validateAxis(rightAxis.trim(), hasRightCyl)) {
    errors.push(`右眼轴位：${validateAxis(rightAxis.trim(), hasRightCyl)?.message}`);
  }
  if (leftAxis && validateAxis(leftAxis.trim(), hasLeftCyl)) {
    errors.push(`左眼轴位：${validateAxis(leftAxis.trim(), hasLeftCyl)?.message}`);
  }

  if (pd && validatePd(pd.trim())) {
    errors.push(`瞳距：${validatePd(pd.trim())?.message}`);
  }

  if (errors.length > 0) {
    return { errors };
  }

  const emptyEye: EyeRefraction = {
    nakedVision: "",
    correctedVision: "",
    sphere: "",
    cylinder: "",
    axis: "",
    add: ""
  };

  const rightEye: EyeRefraction = {
    ...emptyEye,
    sphere: rightSphere?.trim() || "",
    cylinder: rightCylinder?.trim() || "",
    axis: rightAxis?.trim() || ""
  };

  const leftEye: EyeRefraction = {
    ...emptyEye,
    sphere: leftSphere?.trim() || "",
    cylinder: leftCylinder?.trim() || "",
    axis: leftAxis?.trim() || ""
  };

  const rightEyeSummary = formatRightEyeSummary(
    rightSphere?.trim() || "",
    rightCylinder?.trim() || "",
    rightAxis?.trim() || ""
  );

  const summaryParts: string[] = [];
  summaryParts.push(`右眼${formatRightEyeSummary(rightSphere?.trim() || "", rightCylinder?.trim() || "", rightAxis?.trim() || "")}`);
  summaryParts.push(`左眼${formatRightEyeSummary(leftSphere?.trim() || "", leftCylinder?.trim() || "", leftAxis?.trim() || "")}`);
  if (pd?.trim()) {
    summaryParts.push(`PD ${parseInt(pd.trim(), 10) || pd.trim()}mm`);
  }
  const summary = summaryParts.join("，");

  const record: ParsedRecordRow = {
    rowIndex,
    rightEyeSummary,
    record: {
      patientNo: patientNo?.trim() || "",
      patientName: patientName?.trim() || "",
      category: category?.trim() || (ageGroup?.trim() ? `${ageGroup.trim()}` : ""),
      type: type?.trim() || "初配",
      ageGroup: ageGroup?.trim() || "",
      gender: "",
      examDate: examDate?.trim() || formatLocalDate(new Date()),
      rightEye,
      leftEye,
      pd: pd?.trim() || "",
      cornealCurvature: {
        right: { horizontal: "", vertical: "" },
        left: { horizontal: "", vertical: "" }
      },
      recommendation: recommendation?.trim() || "",
      summary
    }
  };

  return { record };
}

function parseCsvText(csvText: string): CsvParseResult {
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  const validRows: ParsedRecordRow[] = [];
  const errorRows: ParseErrorRow[] = [];

  if (lines.length === 0) {
    return { validRows: [], errorRows: [], missingRequired: CSV_REQUIRED_LABELS, extraColumns: [], headerMapping: {} };
  }

  const firstLineFields = parseCsvLine(lines[0]);
  const looksLikeHeader = firstLineFields.some(f =>
    matchHeaderToField(f.trim()) !== null
  );

  if (!looksLikeHeader) {
    const fallbackMapping: Record<string, number> = {};
    CSV_FIELD_MAPPINGS.forEach((field, idx) => {
      fallbackMapping[field.key] = idx;
    });
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const rowIndex = i + 1;
      const fields = parseCsvLine(line);
      const result = validateAndBuildRecord(fields, rowIndex, fallbackMapping);

      if (result.errors && result.errors.length > 0) {
        errorRows.push({
          rowIndex,
          rowText: line,
          errors: result.errors
        });
      } else if (result.record) {
        validRows.push(result.record);
      }
    }
    return { validRows, errorRows, missingRequired: [], extraColumns: [], headerMapping: fallbackMapping };
  }

  const headerFields = firstLineFields;
  const { mapping, missingRequired, extraColumns } = buildHeaderMapping(headerFields);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const rowIndex = i;
    const fields = parseCsvLine(line);

    if (missingRequired.length > 0) {
      errorRows.push({
        rowIndex,
        rowText: line,
        errors: [`缺少必需列：${missingRequired.join("、")}，无法解析此行`]
      });
      continue;
    }

    const result = validateAndBuildRecord(fields, rowIndex, mapping);

    if (result.errors && result.errors.length > 0) {
      errorRows.push({
        rowIndex,
        rowText: line,
        errors: result.errors
      });
    } else if (result.record) {
      validRows.push(result.record);
    }
  }

  return { validRows, errorRows, missingRequired, extraColumns, headerMapping: mapping };
}

const SPHERE_CHANGE_THRESHOLD = 0.25;
const CYLINDER_CHANGE_THRESHOLD = 0.25;
const AXIS_CHANGE_THRESHOLD = 10;
const VISION_CHANGE_THRESHOLD = 0.1;
const CURVATURE_CHANGE_THRESHOLD = 0.25;

const categoryConfig: Record<ComparisonCategory, { label: string; className: string; dotClass: string }> = {
  "myopia-progress": { label: "近视进展", className: "cat-progress", dotClass: "dot-progress" },
  "astigmatism-change": { label: "散光变化", className: "cat-astigmatism", dotClass: "dot-astigmatism" },
  "stable": { label: "处方稳定", className: "cat-stable", dotClass: "dot-stable" },
};

function compareNumber(prev: string, curr: string, threshold: number): { prev: string; curr: string; diff: number; changed: boolean } {
  const prevNum = parseSafeNumber(prev);
  const currNum = parseSafeNumber(curr);
  if (prevNum === null || currNum === null) {
    return { prev, curr, diff: 0, changed: false };
  }
  const diff = currNum - prevNum;
  return { prev, curr, diff, changed: Math.abs(diff) >= threshold };
}

function compareEyeRefraction(prev: EyeRefraction, curr: EyeRefraction): EyeComparison {
  return {
    sphere: compareNumber(prev.sphere, curr.sphere, SPHERE_CHANGE_THRESHOLD),
    cylinder: compareNumber(prev.cylinder, curr.cylinder, CYLINDER_CHANGE_THRESHOLD),
    axis: compareNumber(prev.axis, curr.axis, AXIS_CHANGE_THRESHOLD),
    correctedVision: compareNumber(prev.correctedVision, curr.correctedVision, VISION_CHANGE_THRESHOLD),
  };
}

function compareCurvature(prev: EyeCurvature, curr: EyeCurvature): CurvatureComparison {
  return {
    horizontal: compareNumber(prev.horizontal, curr.horizontal, CURVATURE_CHANGE_THRESHOLD),
    vertical: compareNumber(prev.vertical, curr.vertical, CURVATURE_CHANGE_THRESHOLD),
  };
}

function classifyComparison(result: {
  rightEye: EyeComparison;
  leftEye: EyeComparison;
  cornealCurvature: { right: CurvatureComparison; left: CurvatureComparison };
}): ComparisonCategory {
  const myopiaProgressed = (
    (result.rightEye.sphere.diff < 0 && Math.abs(result.rightEye.sphere.diff) >= SPHERE_CHANGE_THRESHOLD) ||
    (result.leftEye.sphere.diff < 0 && Math.abs(result.leftEye.sphere.diff) >= SPHERE_CHANGE_THRESHOLD)
  );

  const cylinderChanged = result.rightEye.cylinder.changed || result.leftEye.cylinder.changed;
  const axisChanged = result.rightEye.axis.changed || result.leftEye.axis.changed;
  const visionChanged = result.rightEye.correctedVision.changed || result.leftEye.correctedVision.changed;
  const curvatureChanged =
    result.cornealCurvature.right.horizontal.changed ||
    result.cornealCurvature.right.vertical.changed ||
    result.cornealCurvature.left.horizontal.changed ||
    result.cornealCurvature.left.vertical.changed;

  if (myopiaProgressed) {
    return "myopia-progress";
  }
  if (cylinderChanged || axisChanged || visionChanged || curvatureChanged) {
    return "astigmatism-change";
  }
  return "stable";
}

function comparePrescriptions(prevRecord: RefractionRecord, currRecord: RefractionRecord): PrescriptionComparisonResult {
  const rightEye = compareEyeRefraction(prevRecord.rightEye, currRecord.rightEye);
  const leftEye = compareEyeRefraction(prevRecord.leftEye, currRecord.leftEye);
  const cornealCurvature = {
    right: compareCurvature(prevRecord.cornealCurvature.right, currRecord.cornealCurvature.right),
    left: compareCurvature(prevRecord.cornealCurvature.left, currRecord.cornealCurvature.left),
  };
  const category = classifyComparison({ rightEye, leftEye, cornealCurvature });

  const prevDate = parseLocalDate(prevRecord.examDate);
  const currDate = parseLocalDate(currRecord.examDate);
  const daysBetween = Math.round((currDate.getTime() - prevDate.getTime()) / DAY_IN_MS);

  return {
    patientNo: currRecord.patientNo,
    patientName: currRecord.patientName,
    prevRecord,
    currRecord,
    rightEye,
    leftEye,
    cornealCurvature,
    category,
    categoryLabel: categoryConfig[category].label,
    daysBetween,
  };
}

function getPatientRecords(records: RefractionRecord[], patientNo: string): RefractionRecord[] {
  return records
    .filter(r => r.patientNo === patientNo)
    .sort((a, b) => parseLocalDate(a.examDate).getTime() - parseLocalDate(b.examDate).getTime());
}

function getAllComparisons(records: RefractionRecord[]): PrescriptionComparisonResult[] {
  const patientNos = [...new Set(records.map(r => r.patientNo))];
  const results: PrescriptionComparisonResult[] = [];

  for (const patientNo of patientNos) {
    const patientRecords = getPatientRecords(records, patientNo);
    for (let i = 1; i < patientRecords.length; i++) {
      results.push(comparePrescriptions(patientRecords[i - 1], patientRecords[i]));
    }
  }

  return results.sort((a, b) =>
    parseLocalDate(b.currRecord.examDate).getTime() - parseLocalDate(a.currRecord.examDate).getTime()
  );
}

function getLatestTwoComparisons(records: RefractionRecord[]): PrescriptionComparisonResult[] {
  const patientNos = [...new Set(records.map(r => r.patientNo))];
  const results: PrescriptionComparisonResult[] = [];

  for (const patientNo of patientNos) {
    const patientRecords = getPatientRecords(records, patientNo);
    if (patientRecords.length >= 2) {
      const lastTwo = patientRecords.slice(-2);
      results.push(comparePrescriptions(lastTwo[0], lastTwo[1]));
    }
  }

  return results.sort((a, b) =>
    parseLocalDate(b.currRecord.examDate).getTime() - parseLocalDate(a.currRecord.examDate).getTime()
  );
}

function getFirstToCurrentComparisons(records: RefractionRecord[]): PrescriptionComparisonResult[] {
  const patientNos = [...new Set(records.map(r => r.patientNo))];
  const results: PrescriptionComparisonResult[] = [];

  for (const patientNo of patientNos) {
    const patientRecords = getPatientRecords(records, patientNo);
    if (patientRecords.length >= 2) {
      results.push(comparePrescriptions(patientRecords[0], patientRecords[patientRecords.length - 1]));
    }
  }

  return results.sort((a, b) =>
    parseLocalDate(b.currRecord.examDate).getTime() - parseLocalDate(a.currRecord.examDate).getTime()
  );
}

function getCustomComparison(records: RefractionRecord[], recordIds: [string, string]): PrescriptionComparisonResult | null {
  const record1 = records.find(r => r.id === recordIds[0]);
  const record2 = records.find(r => r.id === recordIds[1]);
  if (!record1 || !record2) return null;
  if (record1.id === record2.id) return null;
  if (record1.patientNo !== record2.patientNo) return null;

  const date1 = parseLocalDate(record1.examDate).getTime();
  const date2 = parseLocalDate(record2.examDate).getTime();

  if (date1 <= date2) {
    return comparePrescriptions(record1, record2);
  } else {
    return comparePrescriptions(record2, record1);
  }
}

function getComparisonsByBaseline(
  records: RefractionRecord[],
  baseline: ComparisonBaselineConfig
): PrescriptionComparisonResult[] {
  switch (baseline.type) {
    case "latest-two":
      return getLatestTwoComparisons(records);
    case "first-to-current":
      return getFirstToCurrentComparisons(records);
    case "custom":
      if (baseline.customRecordIds && baseline.customRecordIds[0] && baseline.customRecordIds[1]) {
        const result = getCustomComparison(records, baseline.customRecordIds);
        return result ? [result] : [];
      }
      return [];
    default:
      return getLatestTwoComparisons(records);
  }
}

function getVisibleRecordSummary(record: RefractionRecord, canViewDetailedRecords: boolean): string {
  if (canViewDetailedRecords) {
    return [record.category, record.type, record.summary].filter(Boolean).join(" · ");
  }
  return [record.category, record.type, `检查日期 ${record.examDate}`].filter(Boolean).join(" · ");
}

type LensCategory = "children-myopia" | "progressive" | "ortho-k" | "adult-regular";

interface LensRecommendationInput {
  ageGroup: string;
  isReview: boolean;
  lensType: string;
  rightSphere: string;
  leftSphere: string;
  rightCylinder: string;
  leftCylinder: string;
  cylinderChange: string;
}

interface LensRecommendationResult {
  category: LensCategory;
  categoryLabel: string;
  primaryAdvice: string;
  detailedAdvice: string[];
  doctorConfirmationRequired: boolean;
  confirmationReasons: string[];
  reviewCycle: string;
  disclaimers: string[];
}

const lensCategoryConfig: Record<LensCategory, { label: string; className: string; icon: string }> = {
  "children-myopia": { label: "儿童近视防控", className: "rec-children", icon: "👶" },
  "progressive": { label: "渐进片验配", className: "rec-progressive", icon: "📏" },
  "ortho-k": { label: "角膜塑形镜", className: "rec-orthok", icon: "💎" },
  "adult-regular": { label: "成人普通配镜", className: "rec-adult", icon: "👓" },
};

function categorizeLensRecommendation(input: LensRecommendationInput): LensCategory {
  const { ageGroup, lensType } = input;

  if (lensType === "角膜塑形镜") return "ortho-k";
  if (lensType === "渐进片" || ageGroup === "中老年") return "progressive";
  if (ageGroup === "儿童" || ageGroup === "青少年") return "children-myopia";
  return "adult-regular";
}

function parseDiopter(value: string): number | null {
  const num = parseSafeNumber(value);
  return num;
}

function generateLensRecommendation(input: LensRecommendationInput): LensRecommendationResult {
  const category = categorizeLensRecommendation(input);
  const { isReview, lensType, cylinderChange } = input;

  const rightSphere = parseDiopter(input.rightSphere) || 0;
  const leftSphere = parseDiopter(input.leftSphere) || 0;
  const rightCylinder = Math.abs(parseDiopter(input.rightCylinder) || 0);
  const leftCylinder = Math.abs(parseDiopter(input.leftCylinder) || 0);
  const maxCylinder = Math.max(rightCylinder, leftCylinder);
  const cylChange = Math.abs(parseDiopter(cylinderChange) || 0);

  const rightMyopia = rightSphere < 0 ? Math.abs(rightSphere) : 0;
  const leftMyopia = leftSphere < 0 ? Math.abs(leftSphere) : 0;
  const maxMyopia = Math.max(rightMyopia, leftMyopia);
  const isMyopic = maxMyopia > 0;

  const rightHyperopia = rightSphere > 0 ? rightSphere : 0;
  const leftHyperopia = leftSphere > 0 ? leftSphere : 0;
  const maxHyperopia = Math.max(rightHyperopia, leftHyperopia);
  const isHyperopic = maxHyperopia > 0;

  const detailedAdvice: string[] = [];
  const confirmationReasons: string[] = [];
  let primaryAdvice = "";
  let reviewCycle = "";
  let doctorConfirmationRequired = false;

  const disclaimers = [
    "本建议为门店顾问初步参考，不替代专业医疗诊断",
    "最终配镜方案需由验光师或眼科医生确认",
    "如有眼部不适或视力变化，请及时就医"
  ];

  switch (category) {
    case "children-myopia": {
      if (isHyperopic && !isMyopic) {
        primaryAdvice = isReview
          ? "远视复查评估：关注远视度数变化，评估弱视风险"
          : "初配评估：儿童远视需排查弱视和斜视风险";

        if (maxHyperopia >= 5.0) {
          confirmationReasons.push("高度远视（≥5.00D），高度远视易引起弱视，需医生评估");
          doctorConfirmationRequired = true;
        }
        if (maxCylinder >= 2.0) {
          confirmationReasons.push("高度散光（≥2.00DC），需排除圆锥角膜等疾病");
          doctorConfirmationRequired = true;
        }
        if (cylChange >= 0.75) {
          confirmationReasons.push("散光变化较大（≥0.75DC），需进一步检查");
          doctorConfirmationRequired = true;
        }

        detailedAdvice.push("建议每3个月复查视力和屈光状态");
        detailedAdvice.push("儿童远视需关注视力发育，定期检查矫正视力");
        detailedAdvice.push("如存在弱视，需配合弱视训练并严格遵医嘱戴镜");
        detailedAdvice.push("保证充足睡眠，均衡饮食，增加户外活动");

        if (maxHyperopia < 3.0) {
          detailedAdvice.push("轻度远视：如无症状可暂不配镜，定期观察");
        } else if (maxHyperopia < 5.0) {
          detailedAdvice.push("中度远视：建议配镜矫正，预防弱视和视疲劳");
        } else {
          detailedAdvice.push("高度远视：必须配镜矫正，定期检查眼底和眼轴");
        }
      } else {
        primaryAdvice = isReview
          ? "复查评估：关注近视进展情况，调整防控方案"
          : "初配评估：建议采取近视防控措施，延缓近视进展";

        if (maxMyopia >= 6.0) {
          confirmationReasons.push("高度近视（≥6.00D），需医生评估眼底情况");
          doctorConfirmationRequired = true;
        }
        if (maxCylinder >= 2.0) {
          confirmationReasons.push("高度散光（≥2.00DC），需排除圆锥角膜等疾病");
          doctorConfirmationRequired = true;
        }
        if (cylChange >= 0.75) {
          confirmationReasons.push("散光变化较大（≥0.75DC），需进一步检查");
          doctorConfirmationRequired = true;
        }
        if (isReview && maxMyopia >= 4.0) {
          confirmationReasons.push("中高度近视复查，需关注近视进展情况");
          doctorConfirmationRequired = true;
        }

        detailedAdvice.push("建议每3个月复查视力和屈光状态");
        detailedAdvice.push("增加户外活动时间，每天不少于2小时");
        detailedAdvice.push("保持正确用眼姿势，控制近距离用眼时长");
        detailedAdvice.push("保证充足睡眠，均衡饮食");

        if (maxMyopia < 3.0) {
          detailedAdvice.push("低度近视：可考虑周边离焦镜片或低浓度阿托品防控");
        } else if (maxMyopia < 6.0) {
          detailedAdvice.push("中度近视：建议评估角膜塑形镜或离焦镜片适用性");
        } else {
          detailedAdvice.push("高度近视：需定期检查眼底，避免剧烈运动");
        }
      }

      if (maxCylinder > 0) {
        detailedAdvice.push(`散光 ${maxCylinder.toFixed(2)}DC，需足矫并定期监测变化`);
      }

      reviewCycle = "3个月";
      break;
    }

    case "progressive": {
      primaryAdvice = isReview
        ? "渐进片复查评估：确认适应情况，调整参数"
        : "渐进片初配评估：确认适应症，选择合适通道设计";

      if (maxCylinder >= 2.0) {
        confirmationReasons.push("高度散光（≥2.00DC），渐进片适配需谨慎评估");
        doctorConfirmationRequired = true;
      }
      if (cylChange >= 0.75) {
        confirmationReasons.push("散光变化较大（≥0.75DC），需确认处方稳定性");
        doctorConfirmationRequired = true;
      }

      detailedAdvice.push("建议测量瞳高，确保渐进片光学中心精准定位");
      detailedAdvice.push("初配者需2-4周适应期，由近及远逐步适应");
      detailedAdvice.push("选择合适的通道设计，根据使用场景推荐");
      detailedAdvice.push("建议室内外各备一副眼镜，提高生活质量");

      if (input.ageGroup === "中老年") {
        detailedAdvice.push("中老年患者：优先考虑短通道渐进片，适应更快");
        detailedAdvice.push("定期检查眼压和眼底，排除青光眼、白内障等疾病");
      }

      if (maxCylinder > 1.0) {
        detailedAdvice.push("较高散光：建议选择非球面设计，提升视觉质量");
      }

      reviewCycle = "6个月";
      break;
    }

    case "ortho-k": {
      if (isHyperopic && !isMyopic) {
        primaryAdvice = "注意：角膜塑形镜仅适用于近视矫正，远视患者不适用";
        confirmationReasons.push("远视患者不适合角膜塑形镜，需咨询医生选择其他矫正方式");
        doctorConfirmationRequired = true;

        detailedAdvice.push("角膜塑形镜主要用于近视控制和矫正，对远视无效");
        detailedAdvice.push("建议咨询眼科医生，选择合适的远视矫正方案");
        detailedAdvice.push("如为儿童远视，需关注弱视和斜视风险");
        reviewCycle = "按医生评估周期复查";
      } else {
        primaryAdvice = isReview
          ? "角膜塑形镜复查：评估塑形效果，监测角膜健康"
          : "角膜塑形镜初配评估：确认适应症，完善术前检查";

        if (maxMyopia >= 6.0) {
          confirmationReasons.push("近视度数较高（≥6.00D），OK镜矫治效果受限，需医生评估");
          doctorConfirmationRequired = true;
        }
        if (maxCylinder >= 1.5) {
          confirmationReasons.push("散光较大（≥1.50DC），需评估散光OK镜适用性");
          doctorConfirmationRequired = true;
        }
        if (isReview && cylChange >= 0.5) {
          confirmationReasons.push("散光变化明显（≥0.50DC），需评估镜片配适状态");
          doctorConfirmationRequired = true;
        }

        detailedAdvice.push("严格按照规范流程护理镜片，注意眼部卫生");
        detailedAdvice.push("初配后1周、1个月、3个月定期复查，之后每3个月复查一次");
        detailedAdvice.push("监测角膜地形图，评估塑形效果和角膜形态变化");
        detailedAdvice.push("如出现眼红、眼痛、畏光等症状，立即停戴并就医");

        if (isReview) {
          detailedAdvice.push("复查需检查：裸眼视力、矫正视力、角膜曲率、角膜地形图、眼压");
          detailedAdvice.push("评估镜片配适状态，必要时调整镜片参数或更换镜片");
        } else {
          detailedAdvice.push("初配前需完善：角膜地形图、眼压、眼轴、角膜内皮等检查");
          detailedAdvice.push("评估适应症，排除禁忌症，选择合适的镜片设计");
        }

        reviewCycle = "1个月（初配期）/ 3个月（稳定期）";
      }
      break;
    }

    case "adult-regular": {
      primaryAdvice = isReview
        ? "成人配镜复查：确认视力变化，调整处方"
        : "成人普通配镜：根据验光结果，推荐合适镜片";

      if (maxMyopia >= 8.0) {
        confirmationReasons.push("高度近视（≥8.00D），建议定期检查眼底");
        doctorConfirmationRequired = true;
      }
      if (maxHyperopia >= 6.0) {
        confirmationReasons.push("高度远视（≥6.00D），需排查其他眼部问题");
        doctorConfirmationRequired = true;
      }
      if (maxCylinder >= 3.0) {
        confirmationReasons.push("高度散光（≥3.00DC），需排除病理性因素");
        doctorConfirmationRequired = true;
      }
      if (cylChange >= 1.0) {
        confirmationReasons.push("散光变化较大（≥1.00DC），需进一步检查原因");
        doctorConfirmationRequired = true;
      }

      detailedAdvice.push("建议每半年至一年复查一次视力和屈光状态");
      detailedAdvice.push("根据工作和生活场景选择合适的镜片类型和功能");
      detailedAdvice.push("注意用眼休息，每40分钟近距离用眼后远眺5分钟");

      if (maxMyopia >= 6.0) {
        detailedAdvice.push("高度近视：建议选择高折射率镜片，更轻薄美观");
        detailedAdvice.push("高度近视：每年检查眼底，预防视网膜病变");
      } else if (maxMyopia >= 3.0) {
        detailedAdvice.push("中度近视：可选择中高折射率镜片，兼顾美观与舒适度");
      } else if (maxMyopia > 0) {
        detailedAdvice.push("低度近视：常规镜片即可满足需求，可按需选择功能镜片");
      }

      if (maxHyperopia >= 4.0) {
        detailedAdvice.push("高度远视：建议选择高折射率镜片，减少镜片厚度和重量");
      } else if (maxHyperopia > 0) {
        detailedAdvice.push("远视配镜：建议足矫，尤其是近距离工作较多的人群");
      }

      if (maxCylinder > 0) {
        detailedAdvice.push(`散光 ${maxCylinder.toFixed(2)}DC，建议足矫以获得最佳视觉质量`);
      }

      if (lensType === "单光镜") {
        detailedAdvice.push("单光镜片：推荐非球面设计，提升周边视觉质量");
      } else if (lensType === "散光镜") {
        detailedAdvice.push("散光镜片：确保轴位精准，必要时选择稳定型设计");
      }

      reviewCycle = "6-12个月";
      break;
    }
  }

  if (cylChange > 0 && !confirmationReasons.some(r => r.includes("散光变化"))) {
    if (cylChange >= 0.5) {
      detailedAdvice.unshift(`散光变化 ${cylChange.toFixed(2)}DC，需关注变化原因`);
    }
  }

  return {
    category,
    categoryLabel: lensCategoryConfig[category].label,
    primaryAdvice,
    detailedAdvice,
    doctorConfirmationRequired,
    confirmationReasons,
    reviewCycle,
    disclaimers,
  };
}

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index, statusClass }: { label: string; value: string; index: number; statusClass?: string }) {
  const colorClass = statusClass || statusColors[index % statusColors.length];
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={colorClass} />
    </article>
  );
}

const emptyForm: Omit<PatientProfile, "id"> = {
  patientNo: "",
  ageGroup: "",
  lensType: "",
  lastCheckDate: "",
  remark: ""
};

function PatientForm({
  initialData,
  onSubmit,
  onCancel,
  readOnly = false,
  onDirtyChange
}: {
  initialData?: Omit<PatientProfile, "id">;
  onSubmit: (data: Omit<PatientProfile, "id">) => void;
  onCancel: () => void;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean, data: Omit<PatientProfile, "id">) => void;
}) {
  const [formData, setFormData] = useState<Omit<PatientProfile, "id">>(initialData || emptyForm);
  const baseDataRef = useRef<Omit<PatientProfile, "id">>(initialData || emptyForm);
  const [dirty, setDirty] = useState(false);

  const computeDirty = useCallback((data: Omit<PatientProfile, "id">, base: Omit<PatientProfile, "id">) => {
    return (
      data.patientNo !== base.patientNo ||
      data.ageGroup !== base.ageGroup ||
      data.lensType !== base.lensType ||
      data.lastCheckDate !== base.lastCheckDate ||
      data.remark !== base.remark
    );
  }, []);

  const handleChange = (field: keyof Omit<PatientProfile, "id">, value: string) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      const isDirty = computeDirty(next, baseDataRef.current);
      setDirty(isDirty);
      if (onDirtyChange) onDirtyChange(isDirty, next);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!formData.patientNo.trim()) return;
    onSubmit(formData);
    setDirty(false);
    if (onDirtyChange) onDirtyChange(false, emptyForm);
    setFormData(emptyForm);
  };

  return (
    <form className="patient-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          <span>患者编号</span>
          <input
            type="text"
            placeholder="例如：Patient-100"
            value={formData.patientNo}
            onChange={e => handleChange("patientNo", e.target.value)}
            required
            readOnly={readOnly}
          />
        </label>
        <label>
          <span>年龄段</span>
          <select
            value={formData.ageGroup}
            onChange={e => handleChange("ageGroup", e.target.value)}
            disabled={readOnly}
          >
            <option value="">请选择</option>
            {ageGroups.map(age => (
              <option key={age} value={age}>{age}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          <span>用镜类型</span>
          <select
            value={formData.lensType}
            onChange={e => handleChange("lensType", e.target.value)}
            disabled={readOnly}
          >
            <option value="">请选择</option>
            {lensTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          <span>最近复查日期</span>
          <input
            type="date"
            value={formData.lastCheckDate}
            onChange={e => handleChange("lastCheckDate", e.target.value)}
            readOnly={readOnly}
          />
        </label>
      </div>
      <label>
        <span>备注</span>
        <textarea
          placeholder="填写患者备注信息..."
          value={formData.remark}
          onChange={e => handleChange("remark", e.target.value)}
          rows={2}
          readOnly={readOnly}
        />
      </label>
      {!readOnly && (
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={() => {
            setDirty(false);
            if (onDirtyChange) onDirtyChange(false, emptyForm);
            onCancel();
          }}>取消</button>
          <button type="submit" className="primary-action">
            {initialData ? "保存修改" : "新增档案"}
          </button>
        </div>
      )}
    </form>
  );
}

interface PrescriptionFormData {
  patientNo: string;
  patientName: string;
  ageGroup: string;
  gender: string;
  examDate: string;
  category: string;
  type: string;
  rightEye: EyeRefraction;
  leftEye: EyeRefraction;
  pd: string;
  cornealCurvature: CornealCurvature;
  recommendation: string;
}

const emptyEye: EyeRefraction = {
  nakedVision: "",
  correctedVision: "",
  sphere: "",
  cylinder: "",
  axis: "",
  add: ""
};

const emptyCurvature: EyeCurvature = { horizontal: "", vertical: "" };

const emptyPrescriptionForm: PrescriptionFormData = {
  patientNo: "",
  patientName: "",
  ageGroup: "",
  gender: "",
  examDate: formatLocalDate(new Date()),
  category: "",
  type: "初配",
  rightEye: { ...emptyEye },
  leftEye: { ...emptyEye },
  pd: "",
  cornealCurvature: { right: { ...emptyCurvature }, left: { ...emptyCurvature } },
  recommendation: ""
};

const categories = ["儿童近视", "青少年近视", "成人近视", "远视", "散光", "老花", "渐进片", "角膜塑形镜", "其他"];
const examTypes = ["初配", "复查", "换镜", "体检"];
const genders = ["男", "女"];

function PrescriptionForm({
  onSubmit,
  onCancel,
  readOnly = false,
  initialData,
  draftData,
  draftSavedAt,
  onDraftChange,
  onDraftDiscard,
  onDirtyChange,
  submitRef
}: {
  onSubmit: (record: Omit<RefractionRecord, "id" | "summary"> & { summary: string }) => void;
  onCancel: () => void;
  readOnly?: boolean;
  initialData?: RefractionRecord;
  draftData?: PrescriptionFormData | null;
  draftSavedAt?: string | null;
  onDraftChange?: (data: PrescriptionFormData) => void;
  onDraftDiscard?: () => void;
  onDirtyChange?: (dirty: boolean, data: PrescriptionFormData) => void;
  submitRef?: React.MutableRefObject<(() => boolean) | null>;
}) {
  const resolveInitialFormData = (): PrescriptionFormData => {
    if (initialData) {
      return {
        patientNo: initialData.patientNo,
        patientName: initialData.patientName,
        ageGroup: initialData.ageGroup,
        gender: initialData.gender,
        examDate: initialData.examDate,
        category: initialData.category,
        type: initialData.type,
        rightEye: { ...initialData.rightEye },
        leftEye: { ...initialData.leftEye },
        pd: initialData.pd,
        cornealCurvature: {
          right: { ...initialData.cornealCurvature.right },
          left: { ...initialData.cornealCurvature.left }
        },
        recommendation: initialData.recommendation
      };
    }
    if (draftData) {
      return {
        patientNo: draftData.patientNo || "",
        patientName: draftData.patientName || "",
        ageGroup: draftData.ageGroup || "",
        gender: draftData.gender || "",
        examDate: draftData.examDate || formatLocalDate(new Date()),
        category: draftData.category || "",
        type: draftData.type || "初配",
        rightEye: { ...emptyEye, ...draftData.rightEye },
        leftEye: { ...emptyEye, ...draftData.leftEye },
        pd: draftData.pd || "",
        cornealCurvature: {
          right: { ...emptyCurvature, ...(draftData.cornealCurvature?.right || {}) },
          left: { ...emptyCurvature, ...(draftData.cornealCurvature?.left || {}) }
        },
        recommendation: draftData.recommendation || ""
      };
    }
    return emptyPrescriptionForm;
  };

  const [formData, setFormData] = useState<PrescriptionFormData>(resolveInitialFormData);
  const [errors, setErrors] = useState<PrescriptionErrors>({});
  const [showDraftBanner, setShowDraftBanner] = useState(!!draftData);
  const [dirty, setDirty] = useState(false);
  const baseDataRef = useRef<PrescriptionFormData>(resolveInitialFormData());
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computePrescriptionDirty = useCallback((data: PrescriptionFormData, base: PrescriptionFormData): boolean => {
    if (data.patientNo !== base.patientNo) return true;
    if (data.patientName !== base.patientName) return true;
    if (data.ageGroup !== base.ageGroup) return true;
    if (data.gender !== base.gender) return true;
    if (data.examDate !== base.examDate) return true;
    if (data.category !== base.category) return true;
    if (data.type !== base.type) return true;
    if (data.pd !== base.pd) return true;
    if (data.recommendation !== base.recommendation) return true;
    const re = data.rightEye, bre = base.rightEye;
    if (re.nakedVision !== bre.nakedVision || re.correctedVision !== bre.correctedVision ||
        re.sphere !== bre.sphere || re.cylinder !== bre.cylinder ||
        re.axis !== bre.axis || re.add !== bre.add) return true;
    const le = data.leftEye, ble = base.leftEye;
    if (le.nakedVision !== ble.nakedVision || le.correctedVision !== ble.correctedVision ||
        le.sphere !== ble.sphere || le.cylinder !== ble.cylinder ||
        le.axis !== ble.axis || le.add !== ble.add) return true;
    const rcc = data.cornealCurvature.right, brcc = base.cornealCurvature.right;
    if (rcc.horizontal !== brcc.horizontal || rcc.vertical !== brcc.vertical) return true;
    const lcc = data.cornealCurvature.left, blcc = base.cornealCurvature.left;
    if (lcc.horizontal !== blcc.horizontal || lcc.vertical !== blcc.vertical) return true;
    return false;
  }, []);

  const notifyDirty = useCallback((data: PrescriptionFormData) => {
    const isDirty = computePrescriptionDirty(data, baseDataRef.current);
    setDirty(isDirty);
    if (onDirtyChange) onDirtyChange(isDirty, data);
  }, [computePrescriptionDirty, onDirtyChange]);

  const notifyDraftChange = useCallback((data: PrescriptionFormData) => {
    if (!onDraftChange) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      onDraftChange(data);
    }, 800);
  }, [onDraftChange]);

  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  const setField = <K extends keyof PrescriptionFormData>(field: K, value: PrescriptionFormData[K]) => {
    if (field === "pd") {
      value = cleanNumber(value as string, false) as PrescriptionFormData[K];
    }
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      notifyDirty(next);
      notifyDraftChange(next);
      return next;
    });
  };

  const setEyeField = (
    eye: "rightEye" | "leftEye",
    field: keyof EyeRefraction,
    value: string
  ) => {
    let cleaned = value;
    if (field === "sphere" || field === "cylinder" || field === "add") {
      cleaned = cleanNumber(value, true);
    } else if (field === "nakedVision" || field === "correctedVision") {
      cleaned = cleanNumber(value, false);
    } else if (field === "axis") {
      cleaned = cleanNumber(value, false);
    }
    setFormData(prev => {
      const next = {
        ...prev,
        [eye]: { ...prev[eye], [field]: cleaned }
      };
      notifyDirty(next);
      notifyDraftChange(next);
      return next;
    });
  };

  const setCurvatureField = (
    eye: "right" | "left",
    field: keyof EyeCurvature,
    value: string
  ) => {
    const cleaned = cleanNumber(value, false);
    setFormData(prev => {
      const next = {
        ...prev,
        cornealCurvature: {
          ...prev.cornealCurvature,
          [eye]: { ...prev.cornealCurvature[eye], [field]: cleaned }
        }
      };
      notifyDirty(next);
      notifyDraftChange(next);
      return next;
    });
  };

  const validate = (): PrescriptionErrors => {
    const newErrors: PrescriptionErrors = {};
    if (!formData.patientNo.trim()) newErrors.patientNo = { message: "必填" };
    if (!formData.patientName.trim()) newErrors.patientName = { message: "必填" };
    if (!formData.ageGroup) newErrors.ageGroup = { message: "必选" };
    if (!formData.gender) newErrors.gender = { message: "必选" };
    if (!formData.examDate) newErrors.examDate = { message: "必选" };

    const re = formData.rightEye;
    const reErrors: PrescriptionErrors["rightEye"] = {};
    const nv = validateVision(re.nakedVision); if (nv) reErrors.nakedVision = nv;
    const cv = validateVision(re.correctedVision); if (cv) reErrors.correctedVision = cv;
    const sp = validateSphere(re.sphere); if (sp) reErrors.sphere = sp;
    const cy = validateCylinder(re.cylinder); if (cy) reErrors.cylinder = cy;
    const ax = validateAxis(re.axis, !!re.cylinder.trim()); if (ax) reErrors.axis = ax;
    const ad = validateAdd(re.add); if (ad) reErrors.add = ad;
    if (Object.keys(reErrors).length > 0) newErrors.rightEye = reErrors;

    const le = formData.leftEye;
    const leErrors: PrescriptionErrors["leftEye"] = {};
    const lnv = validateVision(le.nakedVision); if (lnv) leErrors.nakedVision = lnv;
    const lcv = validateVision(le.correctedVision); if (lcv) leErrors.correctedVision = lcv;
    const lsp = validateSphere(le.sphere); if (lsp) leErrors.sphere = lsp;
    const lcy = validateCylinder(le.cylinder); if (lcy) leErrors.cylinder = lcy;
    const lax = validateAxis(le.axis, !!le.cylinder.trim()); if (lax) leErrors.axis = lax;
    const lad = validateAdd(le.add); if (lad) leErrors.add = lad;
    if (Object.keys(leErrors).length > 0) newErrors.leftEye = leErrors;

    const pdErr = validatePd(formData.pd); if (pdErr) newErrors.pd = pdErr;

    const ccErrors: PrescriptionErrors["cornealCurvature"] = {};
    const rch = validateCurvature(formData.cornealCurvature.right.horizontal);
    const rcv = validateCurvature(formData.cornealCurvature.right.vertical);
    const lch = validateCurvature(formData.cornealCurvature.left.horizontal);
    const lcv2 = validateCurvature(formData.cornealCurvature.left.vertical);
    if (rch || rcv) ccErrors.right = { horizontal: rch, vertical: rcv };
    if (lch || lcv2) ccErrors.left = { horizontal: lch, vertical: lcv2 };
    if (Object.keys(ccErrors).length > 0) newErrors.cornealCurvature = ccErrors;

    return newErrors;
  };

  const formatNumber = (value: string, decimals: number = 2): string => {
    const num = parseSafeNumber(value);
    if (num === null) return value;
    return num.toFixed(decimals);
  };

  const generateSummary = (): string => {
    const parts: string[] = [];
    const reAddNum = parseSafeNumber(formData.rightEye.add);
    if (reAddNum !== null && reAddNum > 0) {
      parts.push(`ADD ${formatNumber(formData.rightEye.add)}D`);
    }
    const reSphere = formatNumber(formData.rightEye.sphere);
    const reCylNum = parseSafeNumber(formData.rightEye.cylinder);
    const hasRCylinder = reCylNum !== null && reCylNum !== 0;
    const reText = `右眼${reSphere}DS${hasRCylinder ? `/${formatNumber(formData.rightEye.cylinder)}DC×${formatNumber(formData.rightEye.axis, 0)}°` : ""}`;
    parts.push(reText);
    const leSphere = formatNumber(formData.leftEye.sphere);
    const leCylNum = parseSafeNumber(formData.leftEye.cylinder);
    const hasLCylinder = leCylNum !== null && leCylNum !== 0;
    const leText = `左眼${leSphere}DS${hasLCylinder ? `/${formatNumber(formData.leftEye.cylinder)}DC×${formatNumber(formData.leftEye.axis, 0)}°` : ""}`;
    parts.push(leText);
    const pdNum = parseSafeNumber(formData.pd);
    parts.push(`PD ${pdNum !== null ? pdNum.toFixed(0) : formData.pd}mm`);
    return parts.join("，");
  };

  const sanitizeEyeData = (eye: EyeRefraction): EyeRefraction => ({
    nakedVision: formatNumber(eye.nakedVision, 2),
    correctedVision: formatNumber(eye.correctedVision, 2),
    sphere: formatNumber(eye.sphere, 2),
    cylinder: formatNumber(eye.cylinder, 2),
    axis: formatNumber(eye.axis, 0),
    add: eye.add ? formatNumber(eye.add, 2) : ""
  });

  const sanitizeCurvature = (curv: EyeCurvature): EyeCurvature => ({
    horizontal: curv.horizontal ? formatNumber(curv.horizontal, 2) : "",
    vertical: curv.vertical ? formatNumber(curv.vertical, 2) : ""
  });

  const trySubmit = useCallback((): boolean => {
    if (readOnly) return false;
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return false;

    const sanitizedRightEye = sanitizeEyeData(formData.rightEye);
    const sanitizedLeftEye = sanitizeEyeData(formData.leftEye);
    const sanitizedCurvature: CornealCurvature = {
      right: sanitizeCurvature(formData.cornealCurvature.right),
      left: sanitizeCurvature(formData.cornealCurvature.left)
    };
    const sanitizedPd = formatNumber(formData.pd, 0);

    const summary = generateSummary();
    onSubmit({
      patientNo: formData.patientNo.trim(),
      category: formData.category.trim() || formData.ageGroup,
      type: formData.type,
      summary,
      patientName: formData.patientName.trim(),
      ageGroup: formData.ageGroup,
      gender: formData.gender,
      examDate: formData.examDate,
      rightEye: sanitizedRightEye,
      leftEye: sanitizedLeftEye,
      pd: sanitizedPd,
      cornealCurvature: sanitizedCurvature,
      recommendation: formData.recommendation.trim()
    });
    setDirty(false);
    if (onDirtyChange) onDirtyChange(false, emptyPrescriptionForm);
    setFormData(emptyPrescriptionForm);
    setErrors({});
    return true;
  }, [readOnly, formData, onSubmit, onDirtyChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trySubmit();
  };

  useEffect(() => {
    if (submitRef) {
      submitRef.current = trySubmit;
    }
    return () => {
      if (submitRef) {
        submitRef.current = null;
      }
    };
  }, [submitRef, trySubmit]);

  const EyeBlock = ({ eye, title, eyeErrors }: {
    eye: "rightEye" | "leftEye";
    title: string;
    eyeErrors: PrescriptionErrors["rightEye"];
  }) => {
    const data = formData[eye];
    const err = eyeErrors || {};
    return (
      <div className="eye-block">
        <div className="eye-block-title">{title}</div>
        <div className="eye-fields-grid">
          <label className={err.nakedVision ? "field-error" : ""}>
            <span>裸眼视力</span>
            <input
              type="text"
              placeholder="如 0.3"
              value={data.nakedVision}
              onChange={e => setEyeField(eye, "nakedVision", e.target.value)}
              readOnly={readOnly}
            />
            {err.nakedVision && <em>{err.nakedVision.message}</em>}
          </label>
          <label className={err.correctedVision ? "field-error" : ""}>
            <span>矫正视力</span>
            <input
              type="text"
              placeholder="如 1.0"
              value={data.correctedVision}
              onChange={e => setEyeField(eye, "correctedVision", e.target.value)}
              readOnly={readOnly}
            />
            {err.correctedVision && <em>{err.correctedVision.message}</em>}
          </label>
          <label className={err.sphere ? "field-error" : ""}>
            <span>球镜 (DS)</span>
            <input
              type="text"
              placeholder="如 -2.75"
              value={data.sphere}
              onChange={e => setEyeField(eye, "sphere", e.target.value)}
              readOnly={readOnly}
            />
            {err.sphere && <em>{err.sphere.message}</em>}
          </label>
          <label className={err.cylinder ? "field-error" : ""}>
            <span>柱镜 (DC)</span>
            <input
              type="text"
              placeholder="如 -0.50"
              value={data.cylinder}
              onChange={e => setEyeField(eye, "cylinder", e.target.value)}
              readOnly={readOnly}
            />
            {err.cylinder && <em>{err.cylinder.message}</em>}
          </label>
          <label className={err.axis ? "field-error" : ""}>
            <span>轴位 (°)</span>
            <input
              type="text"
              placeholder="如 180"
              value={data.axis}
              onChange={e => setEyeField(eye, "axis", e.target.value)}
              readOnly={readOnly}
            />
            {err.axis && <em>{err.axis.message}</em>}
          </label>
          <label className={err.add ? "field-error" : ""}>
            <span>ADD (D)</span>
            <input
              type="text"
              placeholder="老花/渐进时填，如 +1.50"
              value={data.add}
              onChange={e => setEyeField(eye, "add", e.target.value)}
              readOnly={readOnly}
            />
            {err.add && <em>{err.add.message}</em>}
          </label>
        </div>
      </div>
    );
  };

  return (
    <form className="prescription-form" onSubmit={handleSubmit}>
      {showDraftBanner && draftSavedAt && (
        <div className="draft-banner">
          <span className="draft-banner-icon">📋</span>
          <span className="draft-banner-text">
            已恢复 {new Date(draftSavedAt).toLocaleString("zh-CN")} 保存的草稿
          </span>
          <button type="button" className="draft-banner-discard" onClick={() => {
            setShowDraftBanner(false);
            setFormData(emptyPrescriptionForm);
            baseDataRef.current = emptyPrescriptionForm;
            setDirty(false);
            if (onDirtyChange) onDirtyChange(false, emptyPrescriptionForm);
            if (onDraftDiscard) onDraftDiscard();
          }}>
            丢弃草稿
          </button>
          <button type="button" className="draft-banner-close" onClick={() => setShowDraftBanner(false)}>
            ✕
          </button>
        </div>
      )}
      <div className="form-section">
        <div className="form-section-title">基础信息</div>
        <div className="form-row">
          <label className={errors.patientNo ? "field-error" : ""}>
            <span>患者编号 *</span>
            <input
              type="text"
              placeholder="如 Patient-100"
              value={formData.patientNo}
              onChange={e => setField("patientNo", e.target.value)}
              readOnly={readOnly}
            />
            {errors.patientNo && <em>{errors.patientNo.message}</em>}
          </label>
          <label className={errors.patientName ? "field-error" : ""}>
            <span>患者姓名 *</span>
            <input
              type="text"
              placeholder="如 张小明"
              value={formData.patientName}
              onChange={e => setField("patientName", e.target.value)}
              readOnly={readOnly}
            />
            {errors.patientName && <em>{errors.patientName.message}</em>}
          </label>
        </div>
        <div className="form-row">
          <label className={errors.ageGroup ? "field-error" : ""}>
            <span>年龄段 *</span>
            <select
              value={formData.ageGroup}
              onChange={e => setField("ageGroup", e.target.value)}
              disabled={readOnly}
            >
              <option value="">请选择</option>
              {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {errors.ageGroup && <em>{errors.ageGroup.message}</em>}
          </label>
          <label className={errors.gender ? "field-error" : ""}>
            <span>性别 *</span>
            <select
              value={formData.gender}
              onChange={e => setField("gender", e.target.value)}
              disabled={readOnly}
            >
              <option value="">请选择</option>
              {genders.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {errors.gender && <em>{errors.gender.message}</em>}
          </label>
        </div>
        <div className="form-row">
          <label className={errors.examDate ? "field-error" : ""}>
            <span>检查日期 *</span>
            <input
              type="date"
              value={formData.examDate}
              onChange={e => setField("examDate", e.target.value)}
              readOnly={readOnly}
            />
            {errors.examDate && <em>{errors.examDate.message}</em>}
          </label>
          <label>
            <span>类型</span>
            <select
              value={formData.type}
              onChange={e => setField("type", e.target.value)}
              disabled={readOnly}
            >
              {examTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            <span>分类（可选）</span>
            <select
              value={formData.category}
              onChange={e => setField("category", e.target.value)}
              disabled={readOnly}
            >
              <option value="">（自动根据年龄判断）</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={errors.pd ? "field-error" : ""}>
            <span>瞳距 PD (mm) *</span>
            <input
              type="text"
              placeholder="如 58"
              value={formData.pd}
              onChange={e => setField("pd", e.target.value)}
              readOnly={readOnly}
            />
            {errors.pd && <em>{errors.pd.message}</em>}
          </label>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">屈光参数（必填）</div>
        <div className="eyes-row">
          <EyeBlock eye="rightEye" title="右眼 (OD)" eyeErrors={errors.rightEye} />
          <EyeBlock eye="leftEye" title="左眼 (OS)" eyeErrors={errors.leftEye} />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">角膜曲率（可选，35~50D，0.25D步进）</div>
        <div className="eyes-row">
          <div className="eye-block">
            <div className="eye-block-title">右眼 (OD)</div>
            <div className="eye-fields-grid">
              <label className={errors.cornealCurvature?.right?.horizontal ? "field-error" : ""}>
                <span>水平曲率 (D)</span>
                <input
                  type="text"
                  placeholder="如 42.50"
                  value={formData.cornealCurvature.right.horizontal}
                  onChange={e => setCurvatureField("right", "horizontal", e.target.value)}
                  readOnly={readOnly}
                />
                {errors.cornealCurvature?.right?.horizontal && <em>{errors.cornealCurvature.right.horizontal.message}</em>}
              </label>
              <label className={errors.cornealCurvature?.right?.vertical ? "field-error" : ""}>
                <span>垂直曲率 (D)</span>
                <input
                  type="text"
                  placeholder="如 43.00"
                  value={formData.cornealCurvature.right.vertical}
                  onChange={e => setCurvatureField("right", "vertical", e.target.value)}
                  readOnly={readOnly}
                />
                {errors.cornealCurvature?.right?.vertical && <em>{errors.cornealCurvature.right.vertical.message}</em>}
              </label>
            </div>
          </div>
          <div className="eye-block">
            <div className="eye-block-title">左眼 (OS)</div>
            <div className="eye-fields-grid">
              <label className={errors.cornealCurvature?.left?.horizontal ? "field-error" : ""}>
                <span>水平曲率 (D)</span>
                <input
                  type="text"
                  placeholder="如 42.75"
                  value={formData.cornealCurvature.left.horizontal}
                  onChange={e => setCurvatureField("left", "horizontal", e.target.value)}
                  readOnly={readOnly}
                />
                {errors.cornealCurvature?.left?.horizontal && <em>{errors.cornealCurvature.left.horizontal.message}</em>}
              </label>
              <label className={errors.cornealCurvature?.left?.vertical ? "field-error" : ""}>
                <span>垂直曲率 (D)</span>
                <input
                  type="text"
                  placeholder="如 43.25"
                  value={formData.cornealCurvature.left.vertical}
                  onChange={e => setCurvatureField("left", "vertical", e.target.value)}
                  readOnly={readOnly}
                />
                {errors.cornealCurvature?.left?.vertical && <em>{errors.cornealCurvature.left.vertical.message}</em>}
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">验配建议（可选）</div>
        <label>
          <textarea
            placeholder="填写验配建议，如近视控制方案、复查周期等..."
            value={formData.recommendation}
            onChange={e => setField("recommendation", e.target.value)}
            rows={3}
            readOnly={readOnly}
          />
        </label>
      </div>

      {!readOnly && (
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={() => {
            setDirty(false);
            if (onDirtyChange) onDirtyChange(false, emptyPrescriptionForm);
            setFormData(emptyPrescriptionForm); setErrors({}); onCancel();
          }}>取消</button>
          <button type="submit" className="primary-action">{initialData ? "保存修改" : "生成记录并加入列表"}</button>
        </div>
      )}
    </form>
  );
}

function ImportPreview({
  onConfirm,
  onCancel
}: {
  onConfirm: (records: Array<Omit<RefractionRecord, "id" | "summary"> & { summary: string }>) => void;
  onCancel: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [hasParsed, setHasParsed] = useState(false);

  const handleParse = () => {
    const result = parseCsvText(csvText);
    setParseResult(result);
    setHasParsed(true);
  };

  const handleClear = () => {
    setCsvText("");
    setParseResult(null);
    setHasParsed(false);
  };

  const handleConfirm = () => {
    if (!parseResult || parseResult.validRows.length === 0) return;
    if (parseResult.missingRequired.length > 0) return;
    const records = parseResult.validRows.map(row => row.record);
    onConfirm(records);
    setCsvText("");
    setParseResult(null);
    setHasParsed(false);
  };

  const canConfirm = parseResult && parseResult.validRows.length > 0 && parseResult.missingRequired.length === 0;

  const sampleHeaders = CSV_FIELD_MAPPINGS.map(f => f.label);
  const sampleCsv = [
    sampleHeaders.join(","),
    "Patient-201,王小明,儿童近视,2026-06-10,-2.50,-0.50,180,-2.25,-0.50,175,复查,儿童,58,视力稳定，继续保持",
    "Patient-202,李小红,成人近视,2026-06-12,-3.00,-0.75,90,-2.75,-0.50,85,初配,成人,62,初次配镜"
  ].join("\n");

  return (
    <div className="import-preview">
      <div className="import-section">
        <div className="form-section-title">粘贴CSV数据</div>
        <p className="import-hint">
          自动识别表头，支持多种列名：{sampleHeaders.join("、")}
        </p>
        <textarea
          className="import-textarea"
          placeholder={`请粘贴带表头的CSV数据，系统将自动匹配列名。\n支持的表头别名：患者编号/编号/patientNo、姓名、分类、检查日期、右眼球镜/R球镜 等\n\n示例：\n${sampleCsv}`}
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          rows={8}
        />
        <div className="import-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
          <button type="button" className="ghost-btn" onClick={handleClear}>清空</button>
          <button
            type="button"
            className="primary-action"
            onClick={handleParse}
            disabled={!csvText.trim()}
          >
            解析预览
          </button>
        </div>
      </div>

      {hasParsed && parseResult && (
        <div className="parse-results">
          {parseResult.missingRequired.length > 0 && (
            <div className="parse-error-section">
              <div className="parse-result-header error">
                <span>✕ 缺少必需列</span>
              </div>
              <div className="missing-columns-warning">
                <p>以下必需列未在表头中找到，无法确认导入：</p>
                <ul>
                  {parseResult.missingRequired.map((col, i) => (
                    <li key={i}>{col}</li>
                  ))}
                </ul>
                <p className="hint-text">请在CSV数据首行添加对应的列名后重试。</p>
              </div>
            </div>
          )}

          {parseResult.extraColumns.length > 0 && (
            <div className="parse-warning-section">
              <div className="parse-result-header warning">
                <span>⚠ 额外列（将被忽略）</span>
              </div>
              <div className="extra-columns-info">
                <p>以下列未被识别，导入时将被忽略：</p>
                <ul>
                  {parseResult.extraColumns.map((col, i) => (
                    <li key={i}>{col}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {parseResult.validRows.length > 0 && (
            <div className="parse-success-section">
              <div className="parse-result-header success">
                <span>✓ 可导入记录</span>
                <span className="parse-count">{parseResult.validRows.length} 条</span>
              </div>
              <div className="parse-table-wrapper">
                <table className="parse-table">
                  <thead>
                    <tr>
                      <th style={{ width: "50px" }}>序号</th>
                      <th>患者编号</th>
                      <th>分类</th>
                      <th>类型</th>
                      <th>右眼处方摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.validRows.map((row) => (
                      <tr key={row.rowIndex}>
                        <td className="row-index">{row.rowIndex}</td>
                        <td className="mono">{row.record.patientNo}</td>
                        <td>{row.record.category || "—"}</td>
                        <td>
                          <span className={`type-badge type-${row.record.type}`}>
                            {row.record.type}
                          </span>
                        </td>
                        <td className="mono">{row.rightEyeSummary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parseResult.errorRows.length > 0 && (
            <div className="parse-error-section">
              <div className="parse-result-header error">
                <span>✕ 错误行（将被跳过）</span>
                <span className="parse-count">{parseResult.errorRows.length} 条</span>
              </div>
              <div className="parse-table-wrapper error-table">
                <table className="parse-table">
                  <thead>
                    <tr>
                      <th style={{ width: "50px" }}>行号</th>
                      <th>原始内容</th>
                      <th>错误信息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.errorRows.map((row) => (
                      <tr key={row.rowIndex} className="error-row">
                        <td className="row-index">{row.rowIndex}</td>
                        <td className="raw-text">{row.rowText}</td>
                        <td className="error-cell">
                          <ul>
                            {row.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parseResult.validRows.length === 0 && parseResult.errorRows.length === 0 && (
            <div className="empty-parse">
              <p>未解析到任何有效数据</p>
            </div>
          )}

          <div className="import-confirm-actions">
            <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
            {canConfirm && (
              <button
                type="button"
                className="primary-action"
                onClick={handleConfirm}
              >
                确认导入 {parseResult.validRows.length} 条记录
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PatientCard({
  patient,
  index,
  onEdit,
  onDelete,
  onSelect,
  onSync,
  onGenerateConflict,
  isSelected,
  canEdit,
  canDelete
}: {
  patient: SyncablePatient;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onSync?: () => void;
  onGenerateConflict?: () => void;
  isSelected: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const syncStatus = ((patient as any).syncStatus || "synced") as SyncStatus;
  const isSubmitting = (patient as any).isSubmitting;
  const submitCount = (patient as any).submitCount || 0;
  const syncColor = SYNC_STATUS_COLORS[syncStatus];
  const syncLabel = isSubmitting ? "同步中..." : SYNC_STATUS_LABELS[syncStatus];
  const syncIcon = isSubmitting ? "⟳" : SYNC_STATUS_ICONS[syncStatus];

  return (
    <article className={`patient-card patient-card-sync-${syncStatus} ${isSelected ? "patient-card-selected" : ""}`} onClick={onSelect}>
      <div className="patient-index" style={{ backgroundColor: syncColor + "20", color: syncColor }}>
        {syncIcon}
      </div>
      <div className="patient-info">
        <div className="patient-header">
          <h3>{patient.patientNo}</h3>
          <div className="patient-tags">
            <span 
              className="tag tag-sync-status"
              style={{ backgroundColor: syncColor + "15", color: syncColor, borderColor: syncColor + "40" }}
              title={`${syncLabel}${(patient as any).lastSyncedAt ? ` · 上次同步：${formatSyncTime((patient as any).lastSyncedAt)}` : ""}${submitCount > 0 ? ` · 已提交 ${submitCount} 次` : ""}`}
            >
              {syncIcon} {syncLabel}
              {submitCount > 1 && <span className="submit-count-inline"> ×{submitCount}</span>}
            </span>
            {patient.ageGroup && <span className="tag tag-primary">{patient.ageGroup}</span>}
            {patient.lensType && <span className="tag tag-accent">{patient.lensType}</span>}
          </div>
        </div>
        {patient.lastCheckDate && (
          <p className="patient-date">最近复查：{patient.lastCheckDate}</p>
        )}
        {patient.remark && <p className="patient-remark">{patient.remark}</p>}
        {(patient as any).syncError && (
          <p className="patient-sync-error" title={(patient as any).syncError}>
            ⚠️ 同步失败：{(patient as any).syncError}
          </p>
        )}
        {(canEdit || canDelete || onSync) && (
          <div className="patient-actions" onClick={e => e.stopPropagation()}>
            {onSync && syncStatus !== "synced" && !isSubmitting && (
              <button 
                className="text-btn sync-btn" 
                onClick={onSync}
                style={{ color: syncColor }}
              >
                {syncStatus === "conflict" ? "处理冲突" : syncStatus === "failed" ? "重试" : "同步"}
              </button>
            )}
            {isSubmitting && (
              <span className="text-btn submitting-indicator" style={{ color: syncColor }}>
                ⟳ 同步中...
              </span>
            )}
            {onGenerateConflict && syncStatus === "synced" && !isSubmitting && (
              <button 
                className="text-btn" 
                onClick={onGenerateConflict}
                title="模拟生成冲突（测试用）"
              >
                模拟冲突
              </button>
            )}
            {canEdit && <button className="text-btn" onClick={onEdit}>编辑</button>}
            {canDelete && <button className="text-btn danger" onClick={onDelete}>删除</button>}
          </div>
        )}
      </div>
    </article>
  );
}

function ReminderCard({
  reminder,
  index,
  isCustom,
  onCycleChange,
  onCycleReset,
  canEditCycle,
  onSync,
  onGenerateConflict,
  isSelected,
  onToggleSelect,
  selectionMode
}: {
  reminder: PatientReminder;
  index: number;
  isCustom: boolean;
  onCycleChange: (days: number) => void;
  onCycleReset: () => void;
  canEditCycle: boolean;
  onSync?: () => void;
  onGenerateConflict?: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
}) {
  const syncStatus = ((reminder as any).syncStatus || "synced") as SyncStatus;
  const isSubmitting = (reminder as any).isSubmitting;
  const submitCount = (reminder as any).submitCount || 0;
  const syncColor = SYNC_STATUS_COLORS[syncStatus];
  const syncIcon = isSubmitting ? "⟳" : SYNC_STATUS_ICONS[syncStatus];
  const syncLabel = isSubmitting ? "同步中..." : SYNC_STATUS_LABELS[syncStatus];

  const statusConfig = {
    overdue: { label: "已逾期", className: "status-danger", textClass: "text-danger", daysText: `逾期 ${Math.abs(reminder.daysUntilNext)} 天` },
    upcoming: { label: "即将到期", className: "status-watch", textClass: "text-watch", daysText: `还剩 ${reminder.daysUntilNext} 天` },
    normal: { label: "正常", className: "status-ok", textClass: "text-ok", daysText: `还剩 ${reminder.daysUntilNext} 天` },
  };

  const config = statusConfig[reminder.reminderStatus];
  const [editingCycle, setEditingCycle] = useState(false);
  const [cycleInput, setCycleInput] = useState(String(reminder.reminderCycle));

  useEffect(() => {
    setCycleInput(String(reminder.reminderCycle));
  }, [reminder.reminderCycle]);

  const handleSaveCycle = () => {
    const days = parseInt(cycleInput, 10);
    if (!isNaN(days) && days >= 1 && days <= 3650) {
      onCycleChange(days);
    } else {
      setCycleInput(String(reminder.reminderCycle));
    }
    setEditingCycle(false);
  };

  const handleCancelCycle = () => {
    setCycleInput(String(reminder.reminderCycle));
    setEditingCycle(false);
  };

  return (
    <article className={`reminder-card reminder-${reminder.reminderStatus} reminder-sync-${syncStatus} ${isSelected ? "reminder-selected" : ""} ${selectionMode ? "reminder-card-with-selection" : ""}`}>
      {selectionMode && (
        <div className="reminder-select-wrap" onClick={(e) => e.stopPropagation()}>
          <label className="reminder-select-label">
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={() => onToggleSelect && onToggleSelect()}
            />
          </label>
        </div>
      )}
      <div className={`reminder-index ${config.className}`} style={syncStatus !== "synced" ? { backgroundColor: syncColor + "20", color: syncColor } : undefined}>
        {syncStatus !== "synced" ? syncIcon : String(index + 1).padStart(2, "0")}
      </div>
      <div className="reminder-info">
        <div className="reminder-header">
          <h3>{reminder.patientNo}</h3>
          <div className="reminder-header-right">
            {(syncStatus !== "synced" || isSubmitting) && (
              <span
                className="tag tag-sync-status"
                style={{ backgroundColor: syncColor + "15", color: syncColor, borderColor: syncColor + "40" }}
                title={`${syncLabel}${(reminder as any).lastSyncedAt ? ` · 上次同步：${formatSyncTime((reminder as any).lastSyncedAt)}` : ""}${submitCount > 0 ? ` · 已提交 ${submitCount} 次` : ""}`}
              >
                {syncIcon} {syncLabel}
                {submitCount > 1 && <span className="submit-count-inline"> ×{submitCount}</span>}
              </span>
            )}
            <span className={`reminder-status ${config.textClass}`}>{config.label}</span>
          </div>
        </div>
        <div className="reminder-tags">
          {reminder.ageGroup && <span className="tag tag-primary">{reminder.ageGroup}</span>}
          {reminder.lensType && <span className="tag tag-accent">{reminder.lensType}</span>}
          {canEditCycle && editingCycle ? (
            <span className="tag tag-cycle tag-editing">
              <input
                type="number"
                min="1"
                max="3650"
                value={cycleInput}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCycleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveCycle();
                  if (e.key === "Escape") handleCancelCycle();
                  e.stopPropagation();
                }}
              />
              <span>天</span>
              <button className="cycle-btn cycle-ok" onClick={(e) => { e.stopPropagation(); handleSaveCycle(); }}>✓</button>
              <button className="cycle-btn cycle-cancel" onClick={(e) => { e.stopPropagation(); handleCancelCycle(); }}>✗</button>
            </span>
          ) : canEditCycle ? (
            <span className={`tag tag-cycle ${isCustom ? "cycle-custom" : ""}`} onClick={(e) => { e.stopPropagation(); setEditingCycle(true); }} title="点击修改复查周期">
              周期 {reminder.reminderCycle} 天{isCustom ? " · 自定义" : ""}
            </span>
          ) : (
            <span className="tag tag-cycle">
              周期 {reminder.reminderCycle} 天{isCustom ? " · 自定义" : ""}
            </span>
          )}
          {isCustom && !editingCycle && canEditCycle && (
            <button className="cycle-reset-btn" onClick={(e) => { e.stopPropagation(); onCycleReset(); }} title="恢复默认周期">
              重置
            </button>
          )}
        </div>
        <div className="reminder-dates">
          <p className="reminder-date">上次复查：{reminder.lastCheckDate}</p>
          <p className={`reminder-due ${config.textClass}`}>下次复查：{reminder.nextCheckDate} · {config.daysText}</p>
        </div>
        {reminder.remark && <p className="patient-remark">{reminder.remark}</p>}
        {(reminder as any).syncError && (
          <p className="patient-sync-error" title={(reminder as any).syncError}>
            ⚠️ 同步失败：{(reminder as any).syncError}
          </p>
        )}
        {(onSync && syncStatus !== "synced" && !isSubmitting) || (onGenerateConflict && syncStatus === "synced" && !isSubmitting) || isSubmitting ? (
          <div className="reminder-sync-actions" onClick={e => e.stopPropagation()}>
            {isSubmitting && (
              <span className="text-btn submitting-indicator" style={{ color: syncColor }}>
                ⟳ 同步中...
              </span>
            )}
            {onSync && syncStatus !== "synced" && !isSubmitting && (
              <button className="text-btn sync-btn" onClick={onSync} style={{ color: syncColor }}>
                {syncStatus === "conflict" ? "处理冲突" : syncStatus === "failed" ? "重试同步" : "立即同步"}
              </button>
            )}
            {onGenerateConflict && syncStatus === "synced" && !isSubmitting && (
              <button className="text-btn" onClick={onGenerateConflict} title="模拟生成冲突（测试用）">
                模拟冲突
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function RefractionDrawer({
  record,
  previousRecord,
  allRecords,
  open,
  onClose,
  onNavigate,
  canViewProfessionalParams = true,
  canViewDetailedRecords = true
}: {
  record: RefractionRecord | null;
  previousRecord: RefractionRecord | null;
  allRecords: RefractionRecord[];
  open: boolean;
  onClose: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
  canViewProfessionalParams?: boolean;
  canViewDetailedRecords?: boolean;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onNavigate) onNavigate("prev");
      if (e.key === "ArrowRight" && onNavigate) onNavigate("next");
    },
    [onClose, onNavigate]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  const patientRecords = useMemo(() => {
    if (!record) return [];
    return allRecords
      .filter(r => r.patientNo === record.patientNo)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
  }, [record, allRecords]);

  const currentIndex = useMemo(() => {
    if (!record || patientRecords.length === 0) return -1;
    return patientRecords.findIndex(r => r.id === record.id);
  }, [record, patientRecords]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < patientRecords.length - 1;

  const isChanged = useCallback((currentVal: any, prevVal: any): boolean => {
    if (!previousRecord) return false;
    return JSON.stringify(currentVal) !== JSON.stringify(prevVal);
  }, [previousRecord]);

  const getEyeChanged = useCallback((eyeKey: "rightEye" | "leftEye"): Set<string> => {
    const changed = new Set<string>();
    if (!previousRecord || !record) return changed;
    const curr = record[eyeKey];
    const prev = previousRecord[eyeKey];
    (Object.keys(curr) as (keyof EyeRefraction)[]).forEach(key => {
      if (curr[key] !== prev[key]) changed.add(key);
    });
    return changed;
  }, [previousRecord, record]);

  const rightEyeChanged = useMemo(() => getEyeChanged("rightEye"), [getEyeChanged]);
  const leftEyeChanged = useMemo(() => getEyeChanged("leftEye"), [getEyeChanged]);

  const curvatureChanged = useMemo(() => {
    const changed: { right: Set<string>; left: Set<string> } = { right: new Set(), left: new Set() };
    if (!previousRecord || !record) return changed;
    const sides: ("right" | "left")[] = ["right", "left"];
    sides.forEach(side => {
      const keys: ("horizontal" | "vertical")[] = ["horizontal", "vertical"];
      keys.forEach(key => {
        if (record.cornealCurvature[side][key] !== previousRecord.cornealCurvature[side][key]) {
          changed[side].add(key);
        }
      });
    });
    return changed;
  }, [previousRecord, record]);

  if (!open) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>验光记录详情</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {record ? (
          <>
            <div className="drawer-nav">
              <div className="drawer-nav-info">
                <span className="drawer-nav-count">
                  {patientRecords.length > 0
                    ? `第 ${currentIndex + 1} / ${patientRecords.length} 条`
                    : "共 0 条"
                  }
                </span>
                {patientRecords.length <= 1 && (
                  <span className="drawer-nav-empty-hint">该患者暂无其他历史记录</span>
                )}
              </div>
              <div className="drawer-nav-buttons">
                <button
                  className="drawer-nav-btn"
                  disabled={!hasPrev}
                  onClick={() => onNavigate && onNavigate("prev")}
                  title="上一条 (←)"
                >
                  ← 上一条
                </button>
                <button
                  className="drawer-nav-btn"
                  disabled={!hasNext}
                  onClick={() => onNavigate && onNavigate("next")}
                  title="下一条 (→)"
                >
                  下一条 →
                </button>
              </div>
            </div>

            {patientRecords.length <= 1 && (
              <div className="drawer-empty-state-inline">
                <span className="empty-state-icon">📋</span>
                <div className="empty-state-content">
                  <p className="empty-state-title">暂无同患者其他历史记录</p>
                  <p className="empty-state-desc">该患者目前仅有这一条验光记录，无法切换对比。</p>
                </div>
              </div>
            )}

            <div className="drawer-body">
              <section className="drawer-section">
                <h3>患者基础信息</h3>
                <div className="drawer-info-grid">
                  <div className="drawer-info-item">
                    <span className="drawer-label">患者编号</span>
                    <span className="drawer-value">{record.patientNo}</span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">姓名</span>
                    <span className="drawer-value">{record.patientName}</span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">年龄段</span>
                    <span className="drawer-value">{record.ageGroup}</span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">性别</span>
                    <span className="drawer-value">{record.gender}</span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">检查日期</span>
                    <span className={`drawer-value ${isChanged(record.examDate, previousRecord?.examDate) ? "changed-highlight" : ""}`}>
                      {record.examDate}
                      {isChanged(record.examDate, previousRecord?.examDate) && (
                        <span className="change-indicator" title={`上次: ${previousRecord?.examDate}`}>●</span>
                      )}
                    </span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">类型</span>
                    <span className={`drawer-value ${isChanged(record.type, previousRecord?.type) ? "changed-highlight" : ""}`}>
                      {record.type}
                      {isChanged(record.type, previousRecord?.type) && (
                        <span className="change-indicator" title={`上次: ${previousRecord?.type}`}>●</span>
                      )}
                    </span>
                  </div>
                </div>
              </section>

              {canViewDetailedRecords && (
                <>
                  <section className="drawer-section">
                    <h3>屈光参数</h3>
                    <div className="drawer-eye-tables">
                      <div className="drawer-eye-block">
                        <p className="drawer-eye-title">右眼 (OD)</p>
                        <div className="drawer-param-grid">
                          <div className={`drawer-param-item ${rightEyeChanged.has("nakedVision") ? "changed-row" : ""}`}>
                            <span className="drawer-label">裸眼视力</span>
                            <span className="drawer-value">
                              {record.rightEye.nakedVision}
                              {rightEyeChanged.has("nakedVision") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.nakedVision}`}>
                                  {formatDiff(parseFloat(record.rightEye.nakedVision) - parseFloat(previousRecord?.rightEye.nakedVision || "0"))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("correctedVision") ? "changed-row" : ""}`}>
                            <span className="drawer-label">矫正视力</span>
                            <span className="drawer-value">
                              {record.rightEye.correctedVision}
                              {rightEyeChanged.has("correctedVision") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.correctedVision}`}>
                                  {formatDiff(parseFloat(record.rightEye.correctedVision) - parseFloat(previousRecord?.rightEye.correctedVision || "0"))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("sphere") ? "changed-row" : ""}`}>
                            <span className="drawer-label">球镜</span>
                            <span className="drawer-value">
                              {record.rightEye.sphere}D
                              {rightEyeChanged.has("sphere") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.sphere}D`}>
                                  {formatDiff(parseFloat(record.rightEye.sphere) - parseFloat(previousRecord?.rightEye.sphere || "0"), "D")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("cylinder") ? "changed-row" : ""}`}>
                            <span className="drawer-label">柱镜</span>
                            <span className="drawer-value">
                              {record.rightEye.cylinder}D
                              {rightEyeChanged.has("cylinder") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.cylinder}D`}>
                                  {formatDiff(parseFloat(record.rightEye.cylinder) - parseFloat(previousRecord?.rightEye.cylinder || "0"), "D")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("axis") ? "changed-row" : ""}`}>
                            <span className="drawer-label">轴位</span>
                            <span className="drawer-value">
                              {record.rightEye.axis}°
                              {rightEyeChanged.has("axis") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.axis}°`}>
                                  {formatDiff(parseFloat(record.rightEye.axis) - parseFloat(previousRecord?.rightEye.axis || "0"), "°", 0)}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("add") ? "changed-row" : ""}`}>
                            <span className="drawer-label">ADD</span>
                            <span className="drawer-value">
                              {record.rightEye.add ? record.rightEye.add + "D" : "—"}
                              {rightEyeChanged.has("add") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.add ? previousRecord.rightEye.add + "D" : "—"}`}>
                                  {formatDiff(
                                    (parseFloat(record.rightEye.add || "0") || 0) -
                                      (parseFloat(previousRecord?.rightEye.add || "0") || 0),
                                    "D"
                                  )}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="drawer-eye-block">
                        <p className="drawer-eye-title">左眼 (OS)</p>
                        <div className="drawer-param-grid">
                          <div className={`drawer-param-item ${leftEyeChanged.has("nakedVision") ? "changed-row" : ""}`}>
                            <span className="drawer-label">裸眼视力</span>
                            <span className="drawer-value">
                              {record.leftEye.nakedVision}
                              {leftEyeChanged.has("nakedVision") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.nakedVision}`}>
                                  {formatDiff(parseFloat(record.leftEye.nakedVision) - parseFloat(previousRecord?.leftEye.nakedVision || "0"))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("correctedVision") ? "changed-row" : ""}`}>
                            <span className="drawer-label">矫正视力</span>
                            <span className="drawer-value">
                              {record.leftEye.correctedVision}
                              {leftEyeChanged.has("correctedVision") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.correctedVision}`}>
                                  {formatDiff(parseFloat(record.leftEye.correctedVision) - parseFloat(previousRecord?.leftEye.correctedVision || "0"))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("sphere") ? "changed-row" : ""}`}>
                            <span className="drawer-label">球镜</span>
                            <span className="drawer-value">
                              {record.leftEye.sphere}D
                              {leftEyeChanged.has("sphere") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.sphere}D`}>
                                  {formatDiff(parseFloat(record.leftEye.sphere) - parseFloat(previousRecord?.leftEye.sphere || "0"), "D")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("cylinder") ? "changed-row" : ""}`}>
                            <span className="drawer-label">柱镜</span>
                            <span className="drawer-value">
                              {record.leftEye.cylinder}D
                              {leftEyeChanged.has("cylinder") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.cylinder}D`}>
                                  {formatDiff(parseFloat(record.leftEye.cylinder) - parseFloat(previousRecord?.leftEye.cylinder || "0"), "D")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("axis") ? "changed-row" : ""}`}>
                            <span className="drawer-label">轴位</span>
                            <span className="drawer-value">
                              {record.leftEye.axis}°
                              {leftEyeChanged.has("axis") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.axis}°`}>
                                  {formatDiff(parseFloat(record.leftEye.axis) - parseFloat(previousRecord?.leftEye.axis || "0"), "°", 0)}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("add") ? "changed-row" : ""}`}>
                            <span className="drawer-label">ADD</span>
                            <span className="drawer-value">
                              {record.leftEye.add ? record.leftEye.add + "D" : "—"}
                              {leftEyeChanged.has("add") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.add ? previousRecord.leftEye.add + "D" : "—"}`}>
                                  {formatDiff(
                                    (parseFloat(record.leftEye.add || "0") || 0) -
                                      (parseFloat(previousRecord?.leftEye.add || "0") || 0),
                                    "D"
                                  )}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="drawer-section">
                    <h3>瞳距</h3>
                    <div className="drawer-info-grid">
                      <div className="drawer-info-item">
                        <span className="drawer-label">瞳距 (PD)</span>
                        <span className={`drawer-value drawer-value-lg ${isChanged(record.pd, previousRecord?.pd) ? "changed-highlight" : ""}`}>
                          {record.pd}mm
                          {isChanged(record.pd, previousRecord?.pd) && (
                            <span className="change-indicator-lg" title={`上次: ${previousRecord?.pd}mm`}>●</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {!canViewDetailedRecords && (
                <section className="drawer-section">
                  <div className="param-restricted-hint">
                    <span className="param-restricted-icon">🔒</span>
                    <p className="param-restricted-text">屈光参数、轴位和瞳距需验光师或复查医生权限查看</p>
                  </div>
                </section>
              )}

              {canViewProfessionalParams && (
                <section className="drawer-section">
                  <h3>角膜曲率</h3>
                  <div className="drawer-eye-tables">
                    <div className="drawer-eye-block">
                      <p className="drawer-eye-title">右眼 (OD)</p>
                      <div className="drawer-param-grid">
                        <div className={`drawer-param-item ${curvatureChanged.right.has("horizontal") ? "changed-row" : ""}`}>
                          <span className="drawer-label">水平曲率</span>
                          <span className="drawer-value">
                            {record.cornealCurvature.right.horizontal}D
                            {curvatureChanged.right.has("horizontal") && (
                              <span className="change-diff" title={`上次: ${previousRecord?.cornealCurvature.right.horizontal}D`}>
                                {formatDiff(
                                  parseFloat(record.cornealCurvature.right.horizontal) -
                                    parseFloat(previousRecord?.cornealCurvature.right.horizontal || "0"),
                                  "D"
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className={`drawer-param-item ${curvatureChanged.right.has("vertical") ? "changed-row" : ""}`}>
                          <span className="drawer-label">垂直曲率</span>
                          <span className="drawer-value">
                            {record.cornealCurvature.right.vertical}D
                            {curvatureChanged.right.has("vertical") && (
                              <span className="change-diff" title={`上次: ${previousRecord?.cornealCurvature.right.vertical}D`}>
                                {formatDiff(
                                  parseFloat(record.cornealCurvature.right.vertical) -
                                    parseFloat(previousRecord?.cornealCurvature.right.vertical || "0"),
                                  "D"
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="drawer-eye-block">
                      <p className="drawer-eye-title">左眼 (OS)</p>
                      <div className="drawer-param-grid">
                        <div className={`drawer-param-item ${curvatureChanged.left.has("horizontal") ? "changed-row" : ""}`}>
                          <span className="drawer-label">水平曲率</span>
                          <span className="drawer-value">
                            {record.cornealCurvature.left.horizontal}D
                            {curvatureChanged.left.has("horizontal") && (
                              <span className="change-diff" title={`上次: ${previousRecord?.cornealCurvature.left.horizontal}D`}>
                                {formatDiff(
                                  parseFloat(record.cornealCurvature.left.horizontal) -
                                    parseFloat(previousRecord?.cornealCurvature.left.horizontal || "0"),
                                  "D"
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className={`drawer-param-item ${curvatureChanged.left.has("vertical") ? "changed-row" : ""}`}>
                          <span className="drawer-label">垂直曲率</span>
                          <span className="drawer-value">
                            {record.cornealCurvature.left.vertical}D
                            {curvatureChanged.left.has("vertical") && (
                              <span className="change-diff" title={`上次: ${previousRecord?.cornealCurvature.left.vertical}D`}>
                                {formatDiff(
                                  parseFloat(record.cornealCurvature.left.vertical) -
                                    parseFloat(previousRecord?.cornealCurvature.left.vertical || "0"),
                                  "D"
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {!canViewProfessionalParams && (
                <section className="drawer-section">
                  <div className="param-restricted-hint">
                    <span className="param-restricted-icon">🔒</span>
                    <p className="param-restricted-text">角膜曲率等专业参数需验光师或复查医生权限查看</p>
                  </div>
                </section>
              )}

              <section className="drawer-section">
                <h3>验配建议</h3>
                <p className={`drawer-recommendation ${!canViewDetailedRecords ? "recommendation-summary" : ""}`}>
                  {canViewDetailedRecords
                    ? record.recommendation
                    : getVisibleRecordSummary(record, false)}
                </p>
                {!canViewDetailedRecords && (
                  <p className="param-restricted-text" style={{ marginTop: "8px", fontSize: "12px" }}>
                    详细医疗建议需验光师或复查医生权限查看
                  </p>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="drawer-empty">
            <p>暂无验光记录数据</p>
            <p className="empty-hint">请选择一条近期记录查看详情</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function formatDiff(diff: number, unit: string = "", decimals: number = 2): string {
  if (diff === 0) return "—";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(decimals)}${unit}`;
}

function LensRecommendationForm({
  onGenerate,
  disabled
}: {
  onGenerate: (result: LensRecommendationResult) => void;
  disabled?: boolean;
}) {
  const [formData, setFormData] = useState<LensRecommendationInput>({
    ageGroup: "",
    isReview: false,
    lensType: "",
    rightSphere: "",
    leftSphere: "",
    rightCylinder: "",
    leftCylinder: "",
    cylinderChange: "",
  });

  const handleFieldChange = (field: keyof LensRecommendationInput, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ageGroup || !formData.lensType) return;
    const result = generateLensRecommendation(formData);
    onGenerate(result);
  };

  const canGenerate = formData.ageGroup && formData.lensType && !disabled;

  return (
    <form className="recommendation-form" onSubmit={handleGenerate}>
      <div className="form-section">
        <div className="form-section-title">基础信息</div>
        <div className="form-row">
          <label>
            <span>年龄段 *</span>
            <select
              value={formData.ageGroup}
              onChange={e => handleFieldChange("ageGroup", e.target.value)}
              disabled={disabled}
            >
              <option value="">请选择</option>
              {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label>
            <span>用镜类型 *</span>
            <select
              value={formData.lensType}
              onChange={e => handleFieldChange("lensType", e.target.value)}
              disabled={disabled}
            >
              <option value="">请选择</option>
              {lensTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={formData.isReview}
            onChange={e => handleFieldChange("isReview", e.target.checked)}
            disabled={disabled}
          />
          <span>为复查患者（非初次配镜）</span>
        </label>
      </div>

      <div className="form-section">
        <div className="form-section-title">屈光参数</div>
        <div className="eyes-row">
          <div className="eye-block">
            <div className="eye-block-title">右眼 (OD)</div>
            <div className="eye-fields-grid">
              <label>
                <span>球镜 (DS)</span>
                <input
                  type="text"
                  placeholder="如 -2.75"
                  value={formData.rightSphere}
                  onChange={e => handleFieldChange("rightSphere", cleanNumber(e.target.value, true))}
                  disabled={disabled}
                />
              </label>
              <label>
                <span>柱镜 (DC)</span>
                <input
                  type="text"
                  placeholder="如 -0.50"
                  value={formData.rightCylinder}
                  onChange={e => handleFieldChange("rightCylinder", cleanNumber(e.target.value, true))}
                  disabled={disabled}
                />
              </label>
            </div>
          </div>
          <div className="eye-block">
            <div className="eye-block-title">左眼 (OS)</div>
            <div className="eye-fields-grid">
              <label>
                <span>球镜 (DS)</span>
                <input
                  type="text"
                  placeholder="如 -2.50"
                  value={formData.leftSphere}
                  onChange={e => handleFieldChange("leftSphere", cleanNumber(e.target.value, true))}
                  disabled={disabled}
                />
              </label>
              <label>
                <span>柱镜 (DC)</span>
                <input
                  type="text"
                  placeholder="如 -0.75"
                  value={formData.leftCylinder}
                  onChange={e => handleFieldChange("leftCylinder", cleanNumber(e.target.value, true))}
                  disabled={disabled}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">变化情况</div>
        <label>
          <span>散光变化量 (DC)</span>
          <input
            type="text"
            placeholder="与上次相比的散光变化，如 0.50"
            value={formData.cylinderChange}
            onChange={e => handleFieldChange("cylinderChange", cleanNumber(e.target.value, true))}
            disabled={disabled}
          />
          <em className="field-hint">可选项，已知上次度数可填写以评估变化幅度</em>
        </label>
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="primary-action"
          disabled={!canGenerate}
        >
          生成配镜建议
        </button>
      </div>
    </form>
  );
}

function LensRecommendationResultDisplay({
  result,
  onReset
}: {
  result: LensRecommendationResult;
  onReset: () => void;
}) {
  const config = lensCategoryConfig[result.category];

  return (
    <div className={`recommendation-result ${config.className}`}>
      <div className="recommendation-header">
        <div className="recommendation-icon">{config.icon}</div>
        <div>
          <div className="recommendation-category">{result.categoryLabel}</div>
          <h3>{result.primaryAdvice}</h3>
        </div>
      </div>

      {result.doctorConfirmationRequired && (
        <div className="recommendation-warning">
          <div className="warning-icon">⚠️</div>
          <div>
            <strong>需要医生确认</strong>
            <ul>
              {result.confirmationReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="recommendation-section">
        <h4>详细建议</h4>
        <ul className="recommendation-list">
          {result.detailedAdvice.map((advice, i) => (
            <li key={i}>{advice}</li>
          ))}
        </ul>
      </div>

      <div className="recommendation-meta">
        <div className="meta-item">
          <span className="meta-label">建议复查周期</span>
          <span className="meta-value">{result.reviewCycle}</span>
        </div>
      </div>

      <div className="recommendation-disclaimers">
        <p className="disclaimer-title">温馨提示</p>
        {result.disclaimers.map((d, i) => (
          <p key={i} className="disclaimer-text">• {d}</p>
        ))}
      </div>

      <div className="recommendation-actions">
        <button className="ghost-btn" onClick={onReset}>重新生成</button>
      </div>
    </div>
  );
}

function DiffBadge({ diff, changed, unit, decimals }: { diff: number; changed: boolean; unit?: string; decimals?: number }) {
  if (!changed) {
    return <span className="diff-badge diff-stable">—</span>;
  }
  const isIncrease = diff > 0;
  const text = formatDiff(diff, unit || "", decimals);
  return (
    <span className={`diff-badge ${isIncrease ? "diff-increase" : "diff-decrease"}`}>
      {text}
    </span>
  );
}

function ComparisonCard({
  comparison,
  index,
  onClick,
  canViewProfessionalParams = true
}: {
  comparison: PrescriptionComparisonResult;
  index: number;
  onClick: () => void;
  canViewProfessionalParams?: boolean;
}) {
  const config = categoryConfig[comparison.category];

  return (
    <article className={`comparison-card ${config.className} record-clickable`} onClick={onClick}>
      <div className="comparison-index">{String(index + 1).padStart(2, "0")}</div>
      <div className="comparison-info">
        <div className="comparison-header">
          <h3>{comparison.patientNo} · {comparison.patientName}</h3>
          <span className={`comparison-status ${config.dotClass}`}>{config.label}</span>
        </div>
        <p className="comparison-dates">
          {comparison.prevRecord.examDate} → {comparison.currRecord.examDate}
          <span className="comparison-days"> · 间隔 {comparison.daysBetween} 天</span>
        </p>
        <div className="comparison-summary">
          <span className="summary-item">
            <span className="summary-label">球镜</span>
            <DiffBadge
              diff={Math.abs(comparison.rightEye.sphere.diff) >= Math.abs(comparison.leftEye.sphere.diff)
                ? comparison.rightEye.sphere.diff
                : comparison.leftEye.sphere.diff}
              changed={comparison.rightEye.sphere.changed || comparison.leftEye.sphere.changed}
              unit="D"
            />
          </span>
          <span className="summary-item">
            <span className="summary-label">柱镜</span>
            <DiffBadge
              diff={Math.abs(comparison.rightEye.cylinder.diff) >= Math.abs(comparison.leftEye.cylinder.diff)
                ? comparison.rightEye.cylinder.diff
                : comparison.leftEye.cylinder.diff}
              changed={comparison.rightEye.cylinder.changed || comparison.leftEye.cylinder.changed}
              unit="D"
            />
          </span>
          <span className="summary-item">
            <span className="summary-label">轴位</span>
            <DiffBadge
              diff={Math.abs(comparison.rightEye.axis.diff) >= Math.abs(comparison.leftEye.axis.diff)
                ? comparison.rightEye.axis.diff
                : comparison.leftEye.axis.diff}
              changed={comparison.rightEye.axis.changed || comparison.leftEye.axis.changed}
              unit="°"
              decimals={0}
            />
          </span>
          <span className="summary-item">
            <span className="summary-label">矫正视力</span>
            <DiffBadge
              diff={Math.abs(comparison.rightEye.correctedVision.diff) >= Math.abs(comparison.leftEye.correctedVision.diff)
                ? comparison.rightEye.correctedVision.diff
                : comparison.leftEye.correctedVision.diff}
              changed={comparison.rightEye.correctedVision.changed || comparison.leftEye.correctedVision.changed}
            />
          </span>
          {canViewProfessionalParams && (
            <span className="summary-item">
              <span className="summary-label">角膜曲率</span>
              <DiffBadge
                diff={Math.max(
                  Math.abs(comparison.cornealCurvature.right.horizontal.diff),
                  Math.abs(comparison.cornealCurvature.right.vertical.diff),
                  Math.abs(comparison.cornealCurvature.left.horizontal.diff),
                  Math.abs(comparison.cornealCurvature.left.vertical.diff)
                ) * (
                  Math.abs(comparison.cornealCurvature.right.horizontal.diff) >=
                  Math.max(
                    Math.abs(comparison.cornealCurvature.right.vertical.diff),
                    Math.abs(comparison.cornealCurvature.left.horizontal.diff),
                    Math.abs(comparison.cornealCurvature.left.vertical.diff)
                  )
                    ? Math.sign(comparison.cornealCurvature.right.horizontal.diff)
                    : Math.abs(comparison.cornealCurvature.right.vertical.diff) >=
                      Math.max(
                        Math.abs(comparison.cornealCurvature.left.horizontal.diff),
                        Math.abs(comparison.cornealCurvature.left.vertical.diff)
                      )
                    ? Math.sign(comparison.cornealCurvature.right.vertical.diff)
                    : Math.abs(comparison.cornealCurvature.left.horizontal.diff) >=
                      Math.abs(comparison.cornealCurvature.left.vertical.diff)
                    ? Math.sign(comparison.cornealCurvature.left.horizontal.diff)
                    : Math.sign(comparison.cornealCurvature.left.vertical.diff)
                )}
                changed={
                  comparison.cornealCurvature.right.horizontal.changed ||
                  comparison.cornealCurvature.right.vertical.changed ||
                  comparison.cornealCurvature.left.horizontal.changed ||
                  comparison.cornealCurvature.left.vertical.changed
                }
                unit="D"
              />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function ComparisonDrawer({
  comparison,
  open,
  onClose,
  canViewProfessionalParams = true,
  canViewDetailedRecords = true
}: {
  comparison: PrescriptionComparisonResult | null;
  open: boolean;
  onClose: () => void;
  canViewProfessionalParams?: boolean;
  canViewDetailedRecords?: boolean;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open || !comparison) return null;

  const config = categoryConfig[comparison.category];

  const ParamRow = ({ label, prev, curr, diff, changed, unit, decimals }: {
    label: string;
    prev: string;
    curr: string;
    diff: number;
    changed: boolean;
    unit?: string;
    decimals?: number;
  }) => (
    <div className="compare-param-row">
      <span className="compare-param-label">{label}</span>
      <span className="compare-param-prev">{prev}{unit || ""}</span>
      <span className="compare-param-arrow">→</span>
      <span className="compare-param-curr">{curr}{unit || ""}</span>
      <DiffBadge diff={diff} changed={changed} unit={unit} decimals={decimals} />
    </div>
  );

  const EyeCompareBlock = ({ eye, title }: { eye: EyeComparison; title: string }) => (
    <div className="drawer-eye-block">
      <p className="drawer-eye-title">{title}</p>
      <div className="compare-params">
        <ParamRow
          label="球镜"
          prev={eye.sphere.prev}
          curr={eye.sphere.curr}
          diff={eye.sphere.diff}
          changed={eye.sphere.changed}
          unit="D"
        />
        <ParamRow
          label="柱镜"
          prev={eye.cylinder.prev}
          curr={eye.cylinder.curr}
          diff={eye.cylinder.diff}
          changed={eye.cylinder.changed}
          unit="D"
        />
        <ParamRow
          label="轴位"
          prev={eye.axis.prev}
          curr={eye.axis.curr}
          diff={eye.axis.diff}
          changed={eye.axis.changed}
          unit="°"
          decimals={0}
        />
        <ParamRow
          label="矫正视力"
          prev={eye.correctedVision.prev}
          curr={eye.correctedVision.curr}
          diff={eye.correctedVision.diff}
          changed={eye.correctedVision.changed}
        />
      </div>
    </div>
  );

  const CurvatureCompareBlock = ({ curv, title }: { curv: CurvatureComparison; title: string }) => (
    <div className="drawer-eye-block">
      <p className="drawer-eye-title">{title}</p>
      <div className="compare-params">
        <ParamRow
          label="水平曲率"
          prev={curv.horizontal.prev}
          curr={curv.horizontal.curr}
          diff={curv.horizontal.diff}
          changed={curv.horizontal.changed}
          unit="D"
        />
        <ParamRow
          label="垂直曲率"
          prev={curv.vertical.prev}
          curr={curv.vertical.curr}
          diff={curv.vertical.diff}
          changed={curv.vertical.changed}
          unit="D"
        />
      </div>
    </div>
  );

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer-panel drawer-wide" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>处方对比详情</h2>
            <p className="drawer-subtitle">
              <span className={`comparison-status ${config.dotClass}`}>{config.label}</span>
              <span className="ml-8">{comparison.daysBetween} 天变化</span>
            </p>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">
          <section className="drawer-section">
            <h3>患者信息</h3>
            <div className="drawer-info-grid">
              <div className="drawer-info-item">
                <span className="drawer-label">患者编号</span>
                <span className="drawer-value">{comparison.patientNo}</span>
              </div>
              <div className="drawer-info-item">
                <span className="drawer-label">姓名</span>
                <span className="drawer-value">{comparison.patientName}</span>
              </div>
              <div className="drawer-info-item">
                <span className="drawer-label">上次检查</span>
                <span className="drawer-value">{comparison.prevRecord.examDate}</span>
              </div>
              <div className="drawer-info-item">
                <span className="drawer-label">本次检查</span>
                <span className="drawer-value">{comparison.currRecord.examDate}</span>
              </div>
            </div>
          </section>

          <section className="drawer-section">
            <h3>屈光参数对比</h3>
            <div className="drawer-eye-tables">
              <EyeCompareBlock eye={comparison.rightEye} title="右眼 (OD)" />
              <EyeCompareBlock eye={comparison.leftEye} title="左眼 (OS)" />
            </div>
          </section>

          {canViewProfessionalParams && (
            <section className="drawer-section">
              <h3>角膜曲率对比</h3>
              <div className="drawer-eye-tables">
                <CurvatureCompareBlock curv={comparison.cornealCurvature.right} title="右眼 (OD)" />
                <CurvatureCompareBlock curv={comparison.cornealCurvature.left} title="左眼 (OS)" />
              </div>
            </section>
          )}

          {!canViewProfessionalParams && (
            <section className="drawer-section">
              <div className="param-restricted-hint">
                <span className="param-restricted-icon">🔒</span>
                <p className="param-restricted-text">角膜曲率等专业参数需验光师或复查医生权限查看</p>
              </div>
            </section>
          )}

          <section className="drawer-section">
            <h3>上次验配建议</h3>
            <p className={`drawer-recommendation ${!canViewDetailedRecords ? "recommendation-summary" : ""}`}>
              {canViewDetailedRecords
                ? comparison.prevRecord.recommendation
                : (comparison.prevRecord.summary || comparison.prevRecord.category + " · " + comparison.prevRecord.type)}
            </p>
            {!canViewDetailedRecords && (
              <p className="param-restricted-text" style={{ marginTop: "8px", fontSize: "12px" }}>
                详细医疗建议需验光师或复查医生权限查看
              </p>
            )}
          </section>

          <section className="drawer-section">
            <h3>本次验配建议</h3>
            <p className={`drawer-recommendation ${!canViewDetailedRecords ? "recommendation-summary" : ""}`}>
              {canViewDetailedRecords
                ? comparison.currRecord.recommendation
                : (comparison.currRecord.summary || comparison.currRecord.category + " · " + comparison.currRecord.type)}
            </p>
            {!canViewDetailedRecords && (
              <p className="param-restricted-text" style={{ marginTop: "8px", fontSize: "12px" }}>
                详细医疗建议需验光师或复查医生权限查看
              </p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function generatePrescriptionExportText(record: RefractionRecord, patient?: PatientProfile): string {
  const lines: string[] = [];
  lines.push("========================================");
  lines.push("          眼科验光处方摘要");
  lines.push("========================================");
  lines.push("");
  lines.push(`患者编号: ${record.patientNo}`);
  lines.push(`患者姓名: ${record.patientName}`);
  lines.push(`年龄段: ${record.ageGroup}`);
  lines.push(`性别: ${record.gender}`);
  lines.push(`检查日期: ${record.examDate}`);
  lines.push(`类型: ${record.type}`);
  lines.push(`分类: ${record.category || "-"}`);
  if (patient) {
    lines.push(`用镜类型: ${patient.lensType || "-"}`);
  }
  lines.push("");
  lines.push("----------------------------------------");
  lines.push("                屈光参数");
  lines.push("----------------------------------------");
  lines.push("");
  lines.push("          右眼 (OD)        左眼 (OS)");
  lines.push(`裸眼视力:  ${record.rightEye.nakedVision.padEnd(15)}${record.leftEye.nakedVision}`);
  lines.push(`矫正视力:  ${record.rightEye.correctedVision.padEnd(15)}${record.leftEye.correctedVision}`);
  lines.push(`球镜(DS):  ${record.rightEye.sphere.padEnd(15)}${record.leftEye.sphere}`);
  lines.push(`柱镜(DC):  ${record.rightEye.cylinder.padEnd(15)}${record.leftEye.cylinder}`);
  lines.push(`轴位(°):   ${record.rightEye.axis.padEnd(15)}${record.leftEye.axis}`);
  lines.push(`ADD(D):    ${(record.rightEye.add || "-").padEnd(15)}${record.leftEye.add || "-"}`);
  lines.push("");
  lines.push(`瞳距 (PD): ${record.pd} mm`);
  lines.push("");
  lines.push("----------------------------------------");
  lines.push("                角膜曲率");
  lines.push("----------------------------------------");
  lines.push("");
  lines.push("          右眼 (OD)        左眼 (OS)");
  lines.push(`水平(D):   ${(record.cornealCurvature.right.horizontal || "-").padEnd(15)}${record.cornealCurvature.left.horizontal || "-"}`);
  lines.push(`垂直(D):   ${(record.cornealCurvature.right.vertical || "-").padEnd(15)}${record.cornealCurvature.left.vertical || "-"}`);
  lines.push("");
  lines.push("----------------------------------------");
  lines.push("                处方摘要");
  lines.push("----------------------------------------");
  lines.push("");
  lines.push(record.summary);
  lines.push("");
  lines.push("----------------------------------------");
  lines.push("                验配建议");
  lines.push("----------------------------------------");
  lines.push("");
  lines.push(record.recommendation || "无");
  lines.push("");
  lines.push("========================================");
  lines.push(`生成时间: ${formatLocalDate(new Date())}`);
  lines.push("========================================");
  return lines.join("\n");
}

function generateRecordsExportCSV(records: RefractionRecord[], patients: PatientProfile[]): string {
  const header = [
    "患者编号",
    "患者姓名",
    "年龄段",
    "性别",
    "检查日期",
    "类型",
    "分类",
    "右眼裸眼视力",
    "右眼矫正视力",
    "右眼球镜",
    "右眼柱镜",
    "右眼轴位",
    "右眼ADD",
    "左眼裸眼视力",
    "左眼矫正视力",
    "左眼球镜",
    "左眼柱镜",
    "左眼轴位",
    "左眼ADD",
    "瞳距",
    "右眼角膜水平曲率",
    "右眼角膜垂直曲率",
    "左眼角膜水平曲率",
    "左眼角膜垂直曲率",
    "处方摘要",
    "验配建议"
  ].join(",");

  const rows = records.map(record => {
    const patient = patients.find(p => p.patientNo === record.patientNo);
    return [
      record.patientNo,
      record.patientName,
      record.ageGroup,
      record.gender,
      record.examDate,
      record.type,
      record.category,
      record.rightEye.nakedVision,
      record.rightEye.correctedVision,
      record.rightEye.sphere,
      record.rightEye.cylinder,
      record.rightEye.axis,
      record.rightEye.add,
      record.leftEye.nakedVision,
      record.leftEye.correctedVision,
      record.leftEye.sphere,
      record.leftEye.cylinder,
      record.leftEye.axis,
      record.leftEye.add,
      record.pd,
      record.cornealCurvature.right.horizontal,
      record.cornealCurvature.right.vertical,
      record.cornealCurvature.left.horizontal,
      record.cornealCurvature.left.vertical,
      `"${record.summary.replace(/"/g, '""')}"`,
      `"${(record.recommendation || "").replace(/"/g, '""')}"`
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

function RecordSyncIndicator({
  record,
  onSync,
  onGenerateConflict
}: {
  record: SyncableRecord;
  onSync?: () => void;
  onGenerateConflict?: () => void;
}) {
  const syncStatus = ((record as any).syncStatus || "synced") as SyncStatus;
  const isSubmitting = (record as any).isSubmitting;
  const submitCount = (record as any).submitCount || 0;
  if (syncStatus === "synced" && !onGenerateConflict && !isSubmitting) return null;

  const syncColor = SYNC_STATUS_COLORS[syncStatus];
  const syncIcon = isSubmitting ? "⟳" : SYNC_STATUS_ICONS[syncStatus];
  const syncLabel = isSubmitting ? "同步中..." : SYNC_STATUS_LABELS[syncStatus];

  return (
    <div className={`record-sync-row ${isSubmitting ? "submitting" : ""}`} onClick={e => e.stopPropagation()}>
      <span
        className="tag tag-sync-status"
        style={{ backgroundColor: syncColor + "15", color: syncColor, borderColor: syncColor + "40" }}
        title={`${syncLabel}${(record as any).lastSyncedAt ? ` · 上次同步：${formatSyncTime((record as any).lastSyncedAt)}` : ""}${(record as any).syncError ? ` · 错误：${(record as any).syncError}` : ""}${submitCount > 0 ? ` · 已提交 ${submitCount} 次` : ""}`}
      >
        {syncIcon} {syncLabel}
      </span>
      {submitCount > 1 && (
        <span className="submit-count-badge" title="重复提交次数">
          ×{submitCount}
        </span>
      )}
      {onSync && syncStatus !== "synced" && !isSubmitting && (
        <button className="text-btn sync-btn" onClick={onSync} style={{ color: syncColor, fontSize: "12px" }}>
          {syncStatus === "conflict" ? "处理冲突" : syncStatus === "failed" ? "重试" : "同步"}
        </button>
      )}
      {onGenerateConflict && syncStatus === "synced" && !isSubmitting && (
        <button className="text-btn" onClick={onGenerateConflict} style={{ fontSize: "12px" }} title="模拟冲突">
          模拟冲突
        </button>
      )}
    </div>
  );
}

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

  const switchStep = useCallback((step: WorkflowStep) => {
    if (showPrescriptionForm && draftSyncRef.current && step !== "initial-exam") {
      const data = draftSyncRef.current;
      const hasContent = data.patientNo.trim() || data.patientName.trim() ||
        data.rightEye.sphere.trim() || data.leftEye.sphere.trim() ||
        data.rightEye.cylinder.trim() || data.leftEye.cylinder.trim();
      if (hasContent && dbSupported && dbReady) {
        saveDraft(draftKeyRef.current, data).catch(() => {});
      }
    }
    setCurrentStep(step);
  }, [showPrescriptionForm, dbSupported, dbReady]);
  const [patientFilter, setPatientFilter] = useState<string>("");
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>("");
  const [lensTypeFilter, setLensTypeFilter] = useState<string>("");
  const [reminderStatusFilter, setReminderStatusFilter] = useState<string>("");
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictEntity, setConflictEntity] = useState<{ type: EntityType; entity: any } | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      patientFormSubmitRef.current = handleAddRef.current;
      patientFormDataRef.current = emptyForm;
      setPatientFormDirty(false);
    } else if (editingId) {
      const target = patients.find(p => p.id === editingId);
      if (target) {
        patientFormSubmitRef.current = handleEditRef.current;
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
                return markConflict(syncable, serverData, "update-update");
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
                return markConflict(syncable, serverData, "update-update");
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
    } catch (err) {
      console.error("清空数据失败:", err);
    }
  };

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

  const showSyncMessage = useCallback((msg: string, duration = 3000) => {
    setSyncMessage(msg);
    setTimeout(() => setSyncMessage(null), duration);
  }, []);

  const handleSyncAll = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: 0 });

    try {
      const pendingPatients = patients.filter(p => p.syncStatus === "pending" || p.syncStatus === "failed");
      const pendingRecords = records.filter(r => r.syncStatus === "pending" || r.syncStatus === "failed");
      const total = pendingPatients.length + pendingRecords.length;
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
              updatedPatients[idx] = markConflict(submittedEntity, result.data, "update-update");
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
              updatedRecords[idx] = markConflict(submittedEntity, result.data, "update-update");
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
  }, [isSyncing, patients, records, syncConfig, showSyncMessage]);

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
          updatedList[updatedIdx] = markConflict(submittingEntity, result.data, "update-update");
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
  }, [patients, records, syncConfig, isSyncing, showSyncMessage]);

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
  }, [patients, records, showSyncMessage, handleSyncAll]);

  const handleResolveConflict = useCallback((type: EntityType, id: string, keepLocal: boolean) => {
    const list = type === "patient" ? patients : records;
    const setList = type === "patient" ? setPatients : setRecords;
    
    const updatedList = list.map(entity => {
      if (entity.id !== id) return entity;
      if (keepLocal) {
        return resolveConflictKeepLocal(entity);
      } else {
        return resolveConflictKeepServer(entity);
      }
    });
    
    setList(updatedList as any);
    setShowConflictModal(false);
    setConflictEntity(null);
    showSyncMessage(keepLocal ? "已保留本地版本，待重新同步" : "已采用服务端版本");
  }, [patients, records, showSyncMessage]);

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
      e.id === id ? markConflict(e, modifiedData, "update-update") : e
    );
    setList(updatedList as any);
    showSyncMessage("已模拟生成服务端冲突");
  }, [patients, records, showSyncMessage]);

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
    setShowConflictModal(true);
  }, []);

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
    if (!patients.find(p => p.patientNo === data.patientNo)) {
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
    setSelectedPatientNo(prev => prev === patientNo ? null : patientNo);
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
                    onCycleChange={(days) => handleSetCustomCycle(reminder.patientNo, days)}
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
                    onCycleChange={(days) => handleSetCustomCycle(reminder.patientNo, days)}
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
                    onCycleChange={(days) => handleSetCustomCycle(reminder.patientNo, days)}
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
                        {patient.patientNo} · {patient.patientName}
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
        {filteredPatients.map((patient, index) => (
          editingId === patient.id ? null : (
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
              onGenerateConflict={() => handleGenerateConflict("patient", patient.id)}
              isSelected={selectedPatientNo === patient.patientNo}
              canEdit={permission.canEditPatientProfile}
              canDelete={permission.canEditPatientProfile}
            />
          )
        ))}
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
                      {patient.patientNo} · {patient.patientName}
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
          {(["patient-profile", "initial-exam", "recheck-compare", "prescription-summary", "export"] as WorkflowStep[]).map((step, idx) => (
            <div key={step} className={`workflow-flow-step ${step === currentStep ? "step-active" : "step-done"}`}>
              <span className="workflow-flow-icon">{STEP_ICONS[step]}</span>
              <span className="workflow-flow-label">{STEP_LABELS[step]}</span>
              {idx < 4 && <span className="workflow-flow-arrow">→</span>}
            </div>
          ))}
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
        {workflowSteps.map((step) => (
          <button
            key={step}
            className={`workflow-nav-item ${currentStep === step ? "workflow-nav-active" : ""}`}
            onClick={() => switchStep(step)}
          >
            <span className="workflow-nav-icon">{STEP_ICONS[step]}</span>
            <span className="workflow-nav-label">{STEP_LABELS[step]}</span>
          </button>
        ))}
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

        return (
          <div className="modal-overlay" onClick={() => setShowConflictModal(false)}>
            <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>处理数据冲突</h3>
                <button className="modal-close" onClick={() => setShowConflictModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="conflict-warning">
                  <div className="conflict-warning-icon">⚠️</div>
                  <div className="conflict-warning-text">
                    <strong>检测到数据冲突</strong>
                    <p>该记录的本地版本与服务端版本不一致，请选择保留哪个版本。</p>
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

                {changedFields.length > 0 && (
                  <div className="conflict-diff-section">
                    <h4 className="conflict-diff-title">变更字段（{changedFields.length} 处差异）</h4>
                    <div className="conflict-diff-table">
                      <div className="conflict-diff-header">
                        <span className="diff-col-label">字段</span>
                        <span className="diff-col-local">本地值</span>
                        <span className="diff-col-server">服务端值</span>
                      </div>
                      {changedFields.map(diff => (
                        <div key={diff.field} className="conflict-diff-row diff-changed">
                          <span className="diff-col-label">{diff.label}</span>
                          <span className="diff-col-local diff-highlight-local">{String(diff.localValue)}</span>
                          <span className="diff-col-server diff-highlight-server">{String(diff.serverValue)}</span>
                        </div>
                      ))}
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
                  <p><strong>差异说明：</strong></p>
                  <ul>
                    <li>红色高亮为本地修改的字段值</li>
                    <li>蓝色高亮为服务端更新的字段值</li>
                    <li>选择"保留本地版本"后，本地值将重新排队等待同步到服务端</li>
                    <li>选择"采用服务端版本"后，本地修改将被服务端值覆盖</li>
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
                  采用服务端版本
                </button>
                <button 
                  className="primary-action"
                  onClick={() => handleResolveConflict(conflictEntity.type, conflictEntity.entity.id, true)}
                >
                  保留本地版本
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
