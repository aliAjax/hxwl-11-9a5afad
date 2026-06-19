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
  type AppData,
  type FilterState,
  type ReminderData,
} from "./db";

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

type UserRole = "optometrist" | "consultant" | "review-doctor";

interface RoleConfig {
  key: UserRole;
  label: string;
  description: string;
  permissions: {
    canCreatePatient: boolean;
    canEditPatient: boolean;
    canDeletePatient: boolean;
    canCreateRecord: boolean;
    canEditRecord: boolean;
    canViewComparison: boolean;
    canCreatePrescription: boolean;
    canExport: boolean;
    canViewReminders: boolean;
    canLensRecommendation: boolean;
    canImport: boolean;
  };
}

type WorkbenchStep = "patient" | "refraction" | "comparison" | "prescription" | "export";

interface WorkbenchState {
  activeStep: WorkbenchStep;
  selectedPatientId: string | null;
  selectedRecordId: string | null;
  isWorkbenchMode: boolean;
}

const roleConfigs: RoleConfig[] = [
  {
    key: "optometrist",
    label: "验光师",
    description: "负责患者验光、处方开具",
    permissions: {
      canCreatePatient: true,
      canEditPatient: true,
      canDeletePatient: false,
      canCreateRecord: true,
      canEditRecord: true,
      canViewComparison: true,
      canCreatePrescription: true,
      canExport: true,
      canViewReminders: true,
      canLensRecommendation: false,
      canImport: true,
    }
  },
  {
    key: "consultant",
    label: "门店顾问",
    description: "负责患者接待、配镜建议",
    permissions: {
      canCreatePatient: true,
      canEditPatient: true,
      canDeletePatient: false,
      canCreateRecord: false,
      canEditRecord: false,
      canViewComparison: true,
      canCreatePrescription: false,
      canExport: true,
      canViewReminders: true,
      canLensRecommendation: true,
      canImport: false,
    }
  },
  {
    key: "review-doctor",
    label: "复查医生",
    description: "负责复查诊断、对比分析",
    permissions: {
      canCreatePatient: false,
      canEditPatient: true,
      canDeletePatient: true,
      canCreateRecord: true,
      canEditRecord: true,
      canViewComparison: true,
      canCreatePrescription: true,
      canExport: true,
      canViewReminders: true,
      canLensRecommendation: false,
      canImport: true,
    }
  }
];

const workbenchSteps: { key: WorkbenchStep; label: string; description: string }[] = [
  { key: "patient", label: "患者建档", description: "创建或选择患者档案" },
  { key: "refraction", label: "初次验光", description: "录入验光检查数据" },
  { key: "comparison", label: "复查对比", description: "历史记录对比分析" },
  { key: "prescription", label: "处方摘要", description: "生成验光处方摘要" },
  { key: "export", label: "导出摘要", description: "导出验光数据报告" },
];

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
}

const CSV_FIXED_COLUMNS = [
  "患者编号",
  "患者姓名",
  "分类",
  "类型",
  "年龄段",
  "检查日期",
  "右眼球镜",
  "右眼柱镜",
  "右眼轴位",
  "左眼球镜",
  "左眼柱镜",
  "左眼轴位",
  "瞳距",
  "建议"
];

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

function validateAndBuildRecord(fields: string[], rowIndex: number): { record?: ParsedRecordRow; errors?: string[] } {
  const errors: string[] = [];

  if (fields.length < CSV_FIXED_COLUMNS.length) {
    errors.push(`字段数量不足：期望 ${CSV_FIXED_COLUMNS.length} 列，实际 ${fields.length} 列`);
  }

  const [
    patientNo,
    patientName,
    category,
    type,
    ageGroup,
    examDate,
    rightSphere,
    rightCylinder,
    rightAxis,
    leftSphere,
    leftCylinder,
    leftAxis,
    pd,
    recommendation
  ] = fields;

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
    return { validRows: [], errorRows: [] };
  }

  let startIndex = 0;
  const firstLineFields = parseCsvLine(lines[0]);
  const looksLikeHeader = firstLineFields.some(f => 
    ["患者编号", "patientNo", "编号", "姓名"].includes(f.trim())
  );
  if (looksLikeHeader) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const rowIndex = i - startIndex + 1;
    const fields = parseCsvLine(line);
    const result = validateAndBuildRecord(fields, rowIndex);

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

  return { validRows, errorRows };
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

function generatePrescriptionSummary(record: RefractionRecord, patient?: PatientProfile | null): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════");
  lines.push("           验光处方摘要");
  lines.push("═══════════════════════════════════════");
  lines.push("");

  lines.push(`患者编号：${record.patientNo}`);
  lines.push(`患者姓名：${record.patientName || "未填写"}`);
  lines.push(`年龄段：${record.ageGroup || "未填写"}`);
  lines.push(`性别：${record.gender || "未填写"}`);
  lines.push(`检查日期：${record.examDate}`);
  lines.push(`分类：${record.category || "未分类"}`);
  lines.push(`类型：${record.type || "初配"}`);
  lines.push("");

  lines.push("─────────────────────────────────────");
  lines.push("             屈光检查");
  lines.push("─────────────────────────────────────");
  lines.push("");

  lines.push("右眼：");
  lines.push(`  裸眼视力：${record.rightEye.nakedVision || "未检查"}`);
  lines.push(`  矫正视力：${record.rightEye.correctedVision || "未检查"}`);
  lines.push(`  球镜(SPH)：${record.rightEye.sphere || "0.00"}D`);
  lines.push(`  柱镜(CYL)：${record.rightEye.cylinder || "0.00"}D`);
  lines.push(`  轴位(AXIS)：${record.rightEye.axis || "0"}°`);
  if (record.rightEye.add) {
    lines.push(`  下加光(ADD)：${record.rightEye.add}D`);
  }
  lines.push("");

  lines.push("左眼：");
  lines.push(`  裸眼视力：${record.leftEye.nakedVision || "未检查"}`);
  lines.push(`  矫正视力：${record.leftEye.correctedVision || "未检查"}`);
  lines.push(`  球镜(SPH)：${record.leftEye.sphere || "0.00"}D`);
  lines.push(`  柱镜(CYL)：${record.leftEye.cylinder || "0.00"}D`);
  lines.push(`  轴位(AXIS)：${record.leftEye.axis || "0"}°`);
  if (record.leftEye.add) {
    lines.push(`  下加光(ADD)：${record.leftEye.add}D`);
  }
  lines.push("");

  lines.push(`瞳距(PD)：${record.pd || "未测量"}mm`);
  lines.push("");

  if (record.cornealCurvature.right.horizontal || record.cornealCurvature.left.horizontal) {
    lines.push("─────────────────────────────────────");
    lines.push("           角膜曲率");
    lines.push("─────────────────────────────────────");
    lines.push("");
    lines.push("右眼：");
    lines.push(`  水平曲率：${record.cornealCurvature.right.horizontal || "未测量"}D`);
    lines.push(`  垂直曲率：${record.cornealCurvature.right.vertical || "未测量"}D`);
    lines.push("左眼：");
    lines.push(`  水平曲率：${record.cornealCurvature.left.horizontal || "未测量"}D`);
    lines.push(`  垂直曲率：${record.cornealCurvature.left.vertical || "未测量"}D`);
    lines.push("");
  }

  lines.push("─────────────────────────────────────");
  lines.push("             医嘱建议");
  lines.push("─────────────────────────────────────");
  lines.push("");
  lines.push(record.recommendation || "暂无建议");
  lines.push("");

  if (patient) {
    lines.push("─────────────────────────────────────");
    lines.push("           患者备注");
    lines.push("─────────────────────────────────────");
    lines.push("");
    lines.push(`用镜类型：${patient.lensType || "未选择"}`);
    lines.push(`最近复查：${patient.lastCheckDate || "未记录"}`);
    if (patient.remark) {
      lines.push(`备注：${patient.remark}`);
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════");
  lines.push(`  生成时间：${formatLocalDate(new Date())}`);
  lines.push("═══════════════════════════════════════");

  return lines.join("\n");
}

function generatePatientRecordsSummary(patient: PatientProfile, patientRecords: RefractionRecord[]): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════");
  lines.push("         患者验光档案汇总");
  lines.push("═══════════════════════════════════════");
  lines.push("");

  lines.push(`患者编号：${patient.patientNo}`);
  lines.push(`年龄段：${patient.ageGroup}`);
  lines.push(`用镜类型：${patient.lensType}`);
  lines.push(`最近复查日期：${patient.lastCheckDate}`);
  if (patient.remark) {
    lines.push(`备注：${patient.remark}`);
  }
  lines.push("");

  lines.push(`验光记录总数：${patientRecords.length} 条`);
  lines.push("");

  patientRecords.forEach((record, index) => {
    lines.push(`── 第 ${index + 1} 条记录 ──`);
    lines.push(`日期：${record.examDate} | 类型：${record.type}`);
    lines.push(`摘要：${record.summary}`);
    lines.push("");
  });

  lines.push("═══════════════════════════════════════");
  lines.push(`  生成时间：${formatLocalDate(new Date())}`);
  lines.push("═══════════════════════════════════════");

  return lines.join("\n");
}

function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportToCsv(records: RefractionRecord[]): string {
  const headers = [
    "患者编号", "患者姓名", "分类", "类型", "年龄段", "性别", "检查日期",
    "右眼裸眼视力", "右眼矫正视力", "右眼球镜", "右眼柱镜", "右眼轴位", "右眼ADD",
    "左眼裸眼视力", "左眼矫正视力", "左眼球镜", "左眼柱镜", "左眼轴位", "左眼ADD",
    "瞳距", "右眼水平曲率", "右眼垂直曲率", "左眼水平曲率", "左眼垂直曲率",
    "摘要", "建议"
  ];

  const rows = records.map(record => [
    record.patientNo,
    record.patientName,
    record.category,
    record.type,
    record.ageGroup,
    record.gender,
    record.examDate,
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
    record.summary,
    record.recommendation
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

  return [headers.join(","), ...rows].join("\n");
}

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
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
  onCancel
}: {
  initialData?: Omit<PatientProfile, "id">;
  onSubmit: (data: Omit<PatientProfile, "id">) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<Omit<PatientProfile, "id">>(initialData || emptyForm);

  const handleChange = (field: keyof Omit<PatientProfile, "id">, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patientNo.trim()) return;
    onSubmit(formData);
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
          />
        </label>
        <label>
          <span>年龄段</span>
          <select
            value={formData.ageGroup}
            onChange={e => handleChange("ageGroup", e.target.value)}
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
        />
      </label>
      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
        <button type="submit" className="primary-action">
          {initialData ? "保存修改" : "新增档案"}
        </button>
      </div>
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

function PrescriptionForm({
  onSubmit,
  onCancel
}: {
  onSubmit: (record: Omit<RefractionRecord, "id" | "summary"> & { summary: string }) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<PrescriptionFormData>(emptyPrescriptionForm);
  const [errors, setErrors] = useState<PrescriptionErrors>({});

  const setField = <K extends keyof PrescriptionFormData>(field: K, value: PrescriptionFormData[K]) => {
    if (field === "pd") {
      value = cleanNumber(value as string, false) as PrescriptionFormData[K];
    }
    setFormData(prev => ({ ...prev, [field]: value }));
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
    setFormData(prev => ({
      ...prev,
      [eye]: { ...prev[eye], [field]: cleaned }
    }));
  };

  const setCurvatureField = (
    eye: "right" | "left",
    field: keyof EyeCurvature,
    value: string
  ) => {
    const cleaned = cleanNumber(value, false);
    setFormData(prev => ({
      ...prev,
      cornealCurvature: {
        ...prev.cornealCurvature,
        [eye]: { ...prev.cornealCurvature[eye], [field]: cleaned }
      }
    }));
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

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
    setFormData(emptyPrescriptionForm);
    setErrors({});
  };

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
            />
            {err.add && <em>{err.add.message}</em>}
          </label>
        </div>
      </div>
    );
  };

  return (
    <form className="prescription-form" onSubmit={handleSubmit}>
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
            />
            {errors.examDate && <em>{errors.examDate.message}</em>}
          </label>
          <label>
            <span>类型</span>
            <select
              value={formData.type}
              onChange={e => setField("type", e.target.value)}
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
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={() => { setFormData(emptyPrescriptionForm); setErrors({}); onCancel(); }}>取消</button>
        <button type="submit" className="primary-action">生成记录并加入列表</button>
      </div>
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
    const records = parseResult.validRows.map(row => row.record);
    onConfirm(records);
    setCsvText("");
    setParseResult(null);
    setHasParsed(false);
  };

  const sampleCsv = [
    CSV_FIXED_COLUMNS.join(","),
    "Patient-201,王小明,儿童近视,复查,儿童,2026-06-10,-2.50,-0.50,180,-2.25,-0.50,175,58,视力稳定，继续保持",
    "Patient-202,李小红,成人近视,初配,成人,2026-06-12,-3.00,-0.75,90,-2.75,-0.50,85,62,初次配镜",
    "Patient-203,张大爷,渐进片,初配,中老年,2026-06-08,+0.50,-0.75,90,+0.75,-1.00,85,63,ADD +1.50"
  ].join("\n");

  return (
    <div className="import-preview">
      <div className="import-section">
        <div className="form-section-title">粘贴CSV数据</div>
        <p className="import-hint">
          固定字段顺序：{CSV_FIXED_COLUMNS.join(" → ")}
        </p>
        <textarea
          className="import-textarea"
          placeholder={`请粘贴CSV格式的验光记录，每行一条记录。\n示例格式：\n${sampleCsv}`}
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

          {parseResult.validRows.length > 0 && (
            <div className="import-confirm-actions">
              <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
              <button
                type="button"
                className="primary-action"
                onClick={handleConfirm}
              >
                确认导入 {parseResult.validRows.length} 条记录
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PatientCard({
  patient,
  index,
  onEdit,
  onDelete
}: {
  patient: PatientProfile;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="patient-card">
      <div className="patient-index">{String(index + 1).padStart(2, "0")}</div>
      <div className="patient-info">
        <div className="patient-header">
          <h3>{patient.patientNo}</h3>
          <div className="patient-tags">
            {patient.ageGroup && <span className="tag tag-primary">{patient.ageGroup}</span>}
            {patient.lensType && <span className="tag tag-accent">{patient.lensType}</span>}
          </div>
        </div>
        {patient.lastCheckDate && (
          <p className="patient-date">最近复查：{patient.lastCheckDate}</p>
        )}
        {patient.remark && <p className="patient-remark">{patient.remark}</p>}
        <div className="patient-actions">
          <button className="text-btn" onClick={onEdit}>编辑</button>
          <button className="text-btn danger" onClick={onDelete}>删除</button>
        </div>
      </div>
    </article>
  );
}

function ReminderCard({
  reminder,
  index,
  isCustom,
  onCycleChange,
  onCycleReset
}: {
  reminder: PatientReminder;
  index: number;
  isCustom: boolean;
  onCycleChange: (days: number) => void;
  onCycleReset: () => void;
}) {
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
    <article className={`reminder-card reminder-${reminder.reminderStatus}`}>
      <div className={`reminder-index ${config.className}`}>{String(index + 1).padStart(2, "0")}</div>
      <div className="reminder-info">
        <div className="reminder-header">
          <h3>{reminder.patientNo}</h3>
          <span className={`reminder-status ${config.textClass}`}>{config.label}</span>
        </div>
        <div className="reminder-tags">
          {reminder.ageGroup && <span className="tag tag-primary">{reminder.ageGroup}</span>}
          {reminder.lensType && <span className="tag tag-accent">{reminder.lensType}</span>}
          {editingCycle ? (
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
          ) : (
            <span className={`tag tag-cycle ${isCustom ? "cycle-custom" : ""}`} onClick={(e) => { e.stopPropagation(); setEditingCycle(true); }} title="点击修改复查周期">
              周期 {reminder.reminderCycle} 天{isCustom ? " · 自定义" : ""}
            </span>
          )}
          {isCustom && !editingCycle && (
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
      </div>
    </article>
  );
}

function RefractionDrawer({
  record,
  open,
  onClose
}: {
  record: RefractionRecord | null;
  open: boolean;
  onClose: () => void;
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

  if (!open) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>验光记录详情</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {record ? (
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
                  <span className="drawer-value">{record.examDate}</span>
                </div>
                <div className="drawer-info-item">
                  <span className="drawer-label">类型</span>
                  <span className="drawer-value">{record.type}</span>
                </div>
              </div>
            </section>

            <section className="drawer-section">
              <h3>屈光参数</h3>
              <div className="drawer-eye-tables">
                <div className="drawer-eye-block">
                  <p className="drawer-eye-title">右眼 (OD)</p>
                  <div className="drawer-param-grid">
                    <div className="drawer-param-item">
                      <span className="drawer-label">裸眼视力</span>
                      <span className="drawer-value">{record.rightEye.nakedVision}</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">矫正视力</span>
                      <span className="drawer-value">{record.rightEye.correctedVision}</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">球镜</span>
                      <span className="drawer-value">{record.rightEye.sphere}D</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">柱镜</span>
                      <span className="drawer-value">{record.rightEye.cylinder}D</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">轴位</span>
                      <span className="drawer-value">{record.rightEye.axis}°</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">ADD</span>
                      <span className="drawer-value">{record.rightEye.add ? record.rightEye.add + "D" : "—"}</span>
                    </div>
                  </div>
                </div>
                <div className="drawer-eye-block">
                  <p className="drawer-eye-title">左眼 (OS)</p>
                  <div className="drawer-param-grid">
                    <div className="drawer-param-item">
                      <span className="drawer-label">裸眼视力</span>
                      <span className="drawer-value">{record.leftEye.nakedVision}</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">矫正视力</span>
                      <span className="drawer-value">{record.leftEye.correctedVision}</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">球镜</span>
                      <span className="drawer-value">{record.leftEye.sphere}D</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">柱镜</span>
                      <span className="drawer-value">{record.leftEye.cylinder}D</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">轴位</span>
                      <span className="drawer-value">{record.leftEye.axis}°</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">ADD</span>
                      <span className="drawer-value">{record.leftEye.add ? record.leftEye.add + "D" : "—"}</span>
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
                  <span className="drawer-value drawer-value-lg">{record.pd}mm</span>
                </div>
              </div>
            </section>

            <section className="drawer-section">
              <h3>角膜曲率</h3>
              <div className="drawer-eye-tables">
                <div className="drawer-eye-block">
                  <p className="drawer-eye-title">右眼 (OD)</p>
                  <div className="drawer-param-grid">
                    <div className="drawer-param-item">
                      <span className="drawer-label">水平曲率</span>
                      <span className="drawer-value">{record.cornealCurvature.right.horizontal}D</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">垂直曲率</span>
                      <span className="drawer-value">{record.cornealCurvature.right.vertical}D</span>
                    </div>
                  </div>
                </div>
                <div className="drawer-eye-block">
                  <p className="drawer-eye-title">左眼 (OS)</p>
                  <div className="drawer-param-grid">
                    <div className="drawer-param-item">
                      <span className="drawer-label">水平曲率</span>
                      <span className="drawer-value">{record.cornealCurvature.left.horizontal}D</span>
                    </div>
                    <div className="drawer-param-item">
                      <span className="drawer-label">垂直曲率</span>
                      <span className="drawer-value">{record.cornealCurvature.left.vertical}D</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="drawer-section">
              <h3>验配建议</h3>
              <p className="drawer-recommendation">{record.recommendation}</p>
            </section>
          </div>
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

function LensRecommendationForm({
  onGenerate
}: {
  onGenerate: (result: LensRecommendationResult) => void;
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

  const canGenerate = formData.ageGroup && formData.lensType;

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
                />
              </label>
              <label>
                <span>柱镜 (DC)</span>
                <input
                  type="text"
                  placeholder="如 -0.50"
                  value={formData.rightCylinder}
                  onChange={e => handleFieldChange("rightCylinder", cleanNumber(e.target.value, true))}
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
                />
              </label>
              <label>
                <span>柱镜 (DC)</span>
                <input
                  type="text"
                  placeholder="如 -0.75"
                  value={formData.leftCylinder}
                  onChange={e => handleFieldChange("leftCylinder", cleanNumber(e.target.value, true))}
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
  onClick
}: {
  comparison: PrescriptionComparisonResult;
  index: number;
  onClick: () => void;
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
        </div>
      </div>
    </article>
  );
}

function ComparisonDrawer({
  comparison,
  open,
  onClose
}: {
  comparison: PrescriptionComparisonResult | null;
  open: boolean;
  onClose: () => void;
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

          <section className="drawer-section">
            <h3>角膜曲率对比</h3>
            <div className="drawer-eye-tables">
              <CurvatureCompareBlock curv={comparison.cornealCurvature.right} title="右眼 (OD)" />
              <CurvatureCompareBlock curv={comparison.cornealCurvature.left} title="左眼 (OS)" />
            </div>
          </section>

          <section className="drawer-section">
            <h3>上次验配建议</h3>
            <p className="drawer-recommendation">{comparison.prevRecord.recommendation}</p>
          </section>

          <section className="drawer-section">
            <h3>本次验配建议</h3>
            <p className="drawer-recommendation">{comparison.currRecord.recommendation}</p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function RoleSwitcher({
  currentRole,
  onRoleChange,
  roleConfigs
}: {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  roleConfigs: RoleConfig[];
}) {
  return (
    <div className="role-switcher">
      <span className="role-switcher-label">当前角色：</span>
      <div className="role-tabs">
        {roleConfigs.map(config => (
          <button
            key={config.key}
            className={`role-tab ${currentRole === config.key ? "role-tab-active" : ""}`}
            onClick={() => onRoleChange(config.key)}
            title={config.description}
          >
            {config.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkbenchStepper({
  steps,
  activeStep,
  onStepClick,
  canAccessStep
}: {
  steps: { key: WorkbenchStep; label: string; description: string }[];
  activeStep: WorkbenchStep;
  onStepClick: (step: WorkbenchStep) => void;
  canAccessStep: (step: WorkbenchStep) => boolean;
}) {
  return (
    <div className="workbench-stepper">
      {steps.map((step, index) => {
        const isActive = activeStep === step.key;
        const isPast = steps.findIndex(s => s.key === activeStep) > index;
        const canAccess = canAccessStep(step.key);

        return (
          <div key={step.key} className="stepper-item-wrapper">
            <button
              className={`stepper-item ${isActive ? "stepper-active" : ""} ${isPast ? "stepper-past" : ""} ${!canAccess ? "stepper-disabled" : ""}`}
              onClick={() => canAccess && onStepClick(step.key)}
              disabled={!canAccess}
            >
              <span className="stepper-number">{index + 1}</span>
              <span className="stepper-label">{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <div className={`stepper-connector ${isPast ? "stepper-connector-past" : ""}`}></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WorkbenchPatientStep({
  patients,
  selectedPatientId,
  onSelectPatient,
  onAddPatient,
  canCreatePatient,
  showForm,
  onShowFormChange,
  editingId,
  onStartEdit,
  onCancelEdit,
  onAddSubmit,
  onEditSubmit,
  onDelete,
  canDeletePatient,
  canEditPatient,
  patientFilter,
  onPatientFilterChange,
}: {
  patients: PatientProfile[];
  selectedPatientId: string | null;
  onSelectPatient: (id: string) => void;
  onAddPatient: () => void;
  canCreatePatient: boolean;
  showForm: boolean;
  onShowFormChange: (show: boolean) => void;
  editingId: string | null;
  onStartEdit: (patient: PatientProfile) => void;
  onCancelEdit: () => void;
  onAddSubmit: (data: Omit<PatientProfile, "id">) => void;
  onEditSubmit: (data: Omit<PatientProfile, "id">) => void;
  onDelete: (id: string) => void;
  canDeletePatient: boolean;
  canEditPatient: boolean;
  patientFilter: string;
  onPatientFilterChange: (filter: string) => void;
}) {
  const filteredPatients = useMemo(() => {
    if (!patientFilter || patientFilter === "all") return patients;
    return patients.filter(p => p.ageGroup === patientFilter || p.lensType === patientFilter);
  }, [patients, patientFilter]);

  return (
    <div className="workbench-step-content">
      <div className="step-header">
        <div>
          <h2>患者建档</h2>
          <p className="step-description">创建或选择患者档案，进入后续验光流程</p>
        </div>
        {canCreatePatient && !showForm && !editingId && (
          <button className="primary-action" onClick={onAddPatient}>
            + 新增患者
          </button>
        )}
      </div>

      <div className="filter-bar">
        <span className="filter-label">筛选：</span>
        <div className="filter-chips">
          <button
            className={patientFilter === "all" ? "filter-chip-active" : ""}
            onClick={() => onPatientFilterChange("all")}
          >
            全部
          </button>
          {ageGroups.map(age => (
            <button
              key={age}
              className={patientFilter === age ? "filter-chip-active" : ""}
              onClick={() => onPatientFilterChange(age)}
            >
              {age}
            </button>
          ))}
          {lensTypes.slice(0, 2).map(type => (
            <button
              key={type}
              className={patientFilter === type ? "filter-chip-active" : ""}
              onClick={() => onPatientFilterChange(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <PatientForm
          key="workbench-add-form"
          onSubmit={(data) => {
            onAddSubmit(data);
            onShowFormChange(false);
          }}
          onCancel={() => onShowFormChange(false)}
        />
      )}

      {editingId && (
        <div className="editing-form">
          <p className="form-title">编辑档案</p>
          <PatientForm
            key={`workbench-edit-${editingId}`}
            initialData={(() => {
              const p = patients.find(p => p.id === editingId);
              return p ? {
                patientNo: p.patientNo,
                ageGroup: p.ageGroup,
                lensType: p.lensType,
                lastCheckDate: p.lastCheckDate,
                remark: p.remark
              } : undefined;
            })()}
            onSubmit={(data) => {
              onEditSubmit(data);
              onCancelEdit();
            }}
            onCancel={onCancelEdit}
          />
        </div>
      )}

      <div className="patient-grid">
        {filteredPatients.map((patient, index) => (
          <div
            key={patient.id}
            className={`patient-select-card ${selectedPatientId === patient.id ? "patient-selected" : ""}`}
            onClick={() => onSelectPatient(patient.id)}
          >
            <div className="patient-select-header">
              <div className="patient-select-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="patient-select-info">
                <h4>{patient.patientNo}</h4>
                <span className="patient-select-sub">{patient.ageGroup} · {patient.lensType}</span>
              </div>
            </div>
            <p className="patient-select-remark">{patient.remark || "暂无备注"}</p>
            <div className="patient-select-footer">
              <span>最近复查：{patient.lastCheckDate || "未记录"}</span>
              <div className="patient-select-actions" onClick={e => e.stopPropagation()}>
                {canEditPatient && !editingId && (
                  <button
                    className="ghost-btn small-btn"
                    onClick={() => onStartEdit(patient)}
                  >
                    编辑
                  </button>
                )}
                {canDeletePatient && (
                  <button
                    className="ghost-btn small-btn danger-btn"
                    onClick={() => onDelete(patient.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredPatients.length === 0 && (
          <div className="empty-state">
            <p>暂无患者档案</p>
            <p className="empty-hint">点击"新增患者"添加第一条记录</p>
          </div>
        )}
      </div>

      {selectedPatientId && (
        <div className="step-navigation">
          <div className="step-hint">
            ✓ 已选择患者，可进入下一步验光
          </div>
        </div>
      )}
    </div>
  );
}

function WorkbenchRefractionStep({
  patient,
  records,
  selectedRecordId,
  onSelectRecord,
  onAddRecord,
  canCreateRecord,
  showForm,
  onShowFormChange,
  onFormSubmit,
  onFormCancel,
  canViewComparison,
}: {
  patient: PatientProfile | null;
  records: RefractionRecord[];
  selectedRecordId: string | null;
  onSelectRecord: (id: string) => void;
  onAddRecord: () => void;
  canCreateRecord: boolean;
  showForm: boolean;
  onShowFormChange: (show: boolean) => void;
  onFormSubmit: (data: Omit<RefractionRecord, "id" | "summary"> & { summary: string }) => void;
  onFormCancel: () => void;
  canViewComparison: boolean;
}) {
  if (!patient) {
    return (
      <div className="workbench-step-content">
        <div className="empty-state large">
          <p>请先选择患者</p>
          <p className="empty-hint">返回"患者建档"步骤选择或创建患者档案</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workbench-step-content">
      <div className="step-header">
        <div>
          <h2>初次验光</h2>
          <p className="step-description">
            患者：{patient.patientNo} · {patient.ageGroup} · {patient.lensType}
          </p>
        </div>
        {canCreateRecord && !showForm && (
          <button className="primary-action" onClick={onAddRecord}>
            + 新增验光记录
          </button>
        )}
      </div>

      {showForm && (
        <PrescriptionForm
          key="workbench-prescription-form"
          initialData={{
            patientNo: patient.patientNo,
            patientName: "",
            category: patient.ageGroup || "",
            type: records.length === 0 ? "初配" : "复查",
            ageGroup: patient.ageGroup || "",
            gender: "",
            examDate: formatLocalDate(new Date()),
            rightEye: { nakedVision: "", correctedVision: "", sphere: "", cylinder: "", axis: "", add: "" },
            leftEye: { nakedVision: "", correctedVision: "", sphere: "", cylinder: "", axis: "", add: "" },
            pd: "",
            cornealCurvature: { right: { horizontal: "", vertical: "" }, left: { horizontal: "", vertical: "" } },
            recommendation: "",
            summary: ""
          }}
          onSubmit={(data) => {
            onFormSubmit(data);
            onShowFormChange(false);
          }}
          onCancel={() => onShowFormChange(false)}
        />
      )}

      <div className="field-preview-section">
        <h3>验光字段</h3>
        <div className="field-grid">
          {project.fields.map((field: string) => (
            <label key={field}>
              <span>{field}</span>
              <input placeholder={"填写" + field} readOnly />
            </label>
          ))}
        </div>
      </div>

      <div className="records-section">
        <div className="section-subheading">
          <h3>近期验光记录</h3>
          <span className="record-count">共 {records.length} 条</span>
        </div>
        <div className="record-list">
          {records.map((record, index) => (
            <article
              key={record.id}
              className={`record-card record-clickable ${selectedRecordId === record.id ? "record-selected" : ""}`}
              onClick={() => onSelectRecord(record.id)}
            >
              <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{record.patientNo} · {record.examDate} · {record.type}</h3>
                <p>{record.summary}</p>
              </div>
            </article>
          ))}
          {records.length === 0 && (
            <div className="empty-state small">
              <p>暂无验光记录</p>
              <p className="empty-hint">点击"新增验光记录"开始检查</p>
            </div>
          )}
        </div>
      </div>

      {selectedRecordId && (
        <div className="step-navigation">
          <div className="step-hint">
            ✓ 已选择记录，可进入下一步{canViewComparison ? "复查对比" : "查看处方"}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkbenchComparisonStep({
  patient,
  records,
  comparisons,
  selectedRecordId,
  onSelectRecord,
  canViewComparison,
}: {
  patient: PatientProfile | null;
  records: RefractionRecord[];
  comparisons: PrescriptionComparisonResult[];
  selectedRecordId: string | null;
  onSelectRecord: (id: string) => void;
  canViewComparison: boolean;
}) {
  const [filterCategory, setFilterCategory] = useState<ComparisonCategory | "all">("all");

  const filteredComparisons = useMemo(() => {
    if (filterCategory === "all") return comparisons;
    return comparisons.filter(c => c.category === filterCategory);
  }, [comparisons, filterCategory]);

  if (!patient) {
    return (
      <div className="workbench-step-content">
        <div className="empty-state large">
          <p>请先选择患者</p>
          <p className="empty-hint">返回"患者建档"步骤选择患者档案</p>
        </div>
      </div>
    );
  }

  if (!canViewComparison) {
    return (
      <div className="workbench-step-content">
        <div className="empty-state large">
          <p>暂无权限</p>
          <p className="empty-hint">您当前的角色无法查看复查对比数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workbench-step-content">
      <div className="step-header">
        <div>
          <h2>复查对比</h2>
          <p className="step-description">
            患者：{patient.patientNo} · 历史记录 {records.length} 条
          </p>
        </div>
      </div>

      <div className="comparison-filter-tabs">
        <button
          className={filterCategory === "all" ? "tab-active" : ""}
          onClick={() => setFilterCategory("all")}
        >
          全部 ({comparisons.length})
        </button>
        <button
          className={filterCategory === "myopia-progress" ? "tab-active tab-progress" : ""}
          onClick={() => setFilterCategory("myopia-progress")}
        >
          近视进展 ({comparisons.filter(c => c.category === "myopia-progress").length})
        </button>
        <button
          className={filterCategory === "astigmatism-change" ? "tab-active tab-astigmatism" : ""}
          onClick={() => setFilterCategory("astigmatism-change")}
        >
          散光变化 ({comparisons.filter(c => c.category === "astigmatism-change").length})
        </button>
        <button
          className={filterCategory === "stable" ? "tab-active tab-stable" : ""}
          onClick={() => setFilterCategory("stable")}
        >
          处方稳定 ({comparisons.filter(c => c.category === "stable").length})
        </button>
      </div>

      <div className="comparison-list">
        {filteredComparisons.length > 0 ? (
          filteredComparisons.map((comparison, index) => (
            <ComparisonCard
              key={`${comparison.prevRecord.id}-${comparison.currRecord.id}`}
              comparison={comparison}
              index={index}
              onClick={() => onSelectRecord(comparison.currRecord.id)}
            />
          ))
        ) : (
          <div className="empty-state">
            <p>暂无对比数据</p>
            <p className="empty-hint">同一患者需至少两条验光记录才能进行对比</p>
          </div>
        )}
      </div>

      <div className="records-section">
        <div className="section-subheading">
          <h3>所有验光记录</h3>
        </div>
        <div className="record-list compact">
          {records.map((record, index) => (
            <article
              key={record.id}
              className={`record-card record-clickable ${selectedRecordId === record.id ? "record-selected" : ""}`}
              onClick={() => onSelectRecord(record.id)}
            >
              <div className="record-index small">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{record.examDate} · {record.type}</h3>
                <p>{record.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      {selectedRecordId && (
        <div className="step-navigation">
          <div className="step-hint">
            ✓ 已选择记录，可进入下一步查看处方摘要
          </div>
        </div>
      )}
    </div>
  );
}

function WorkbenchPrescriptionStep({
  patient,
  record,
  records,
  onSelectRecord,
  canCreatePrescription,
}: {
  patient: PatientProfile | null;
  record: RefractionRecord | null;
  records: RefractionRecord[];
  onSelectRecord: (id: string) => void;
  canCreatePrescription: boolean;
}) {
  if (!patient) {
    return (
      <div className="workbench-step-content">
        <div className="empty-state large">
          <p>请先选择患者</p>
          <p className="empty-hint">返回"患者建档"步骤选择患者档案</p>
        </div>
      </div>
    );
  }

  if (!record && records.length > 0) {
    return (
      <div className="workbench-step-content">
        <div className="step-header">
          <div>
            <h2>处方摘要</h2>
            <p className="step-description">
              患者：{patient.patientNo} · 请选择要查看的记录
            </p>
          </div>
        </div>
        <div className="record-list">
          {records.map((rec, index) => (
            <article
              key={rec.id}
              className="record-card record-clickable"
              onClick={() => onSelectRecord(rec.id)}
            >
              <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{rec.examDate} · {rec.type}</h3>
                <p>{rec.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="workbench-step-content">
        <div className="empty-state large">
          <p>暂无验光记录</p>
          <p className="empty-hint">请先在"初次验光"步骤添加验光记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workbench-step-content">
      <div className="step-header">
        <div>
          <h2>处方摘要</h2>
          <p className="step-description">
            患者：{patient.patientNo} · {record.examDate} · {record.type}
          </p>
        </div>
        {records.length > 1 && (
          <select
            value={record.id}
            onChange={e => onSelectRecord(e.target.value)}
            className="record-select"
          >
            {records.map(r => (
              <option key={r.id} value={r.id}>
                {r.examDate} · {r.type}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="prescription-summary">
        <div className="summary-section">
          <h3>基本信息</h3>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">患者编号</span>
              <span className="summary-value">{record.patientNo}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">患者姓名</span>
              <span className="summary-value">{record.patientName || "未填写"}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">年龄段</span>
              <span className="summary-value">{record.ageGroup || "未填写"}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">性别</span>
              <span className="summary-value">{record.gender || "未填写"}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">检查日期</span>
              <span className="summary-value">{record.examDate}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">类型</span>
              <span className="summary-value">{record.type || "初配"}</span>
            </div>
          </div>
        </div>

        <div className="summary-section">
          <h3>屈光检查</h3>
          <div className="eye-compare-layout">
            <div className="eye-summary-block">
              <h4>右眼 (OD)</h4>
              <div className="eye-param-list">
                <div className="eye-param">
                  <span>裸眼视力</span>
                  <strong>{record.rightEye.nakedVision || "未检查"}</strong>
                </div>
                <div className="eye-param">
                  <span>矫正视力</span>
                  <strong>{record.rightEye.correctedVision || "未检查"}</strong>
                </div>
                <div className="eye-param">
                  <span>球镜 (SPH)</span>
                  <strong>{record.rightEye.sphere || "0.00"} D</strong>
                </div>
                <div className="eye-param">
                  <span>柱镜 (CYL)</span>
                  <strong>{record.rightEye.cylinder || "0.00"} D</strong>
                </div>
                <div className="eye-param">
                  <span>轴位 (AXIS)</span>
                  <strong>{record.rightEye.axis || "0"}°</strong>
                </div>
                {record.rightEye.add && (
                  <div className="eye-param">
                    <span>下加光 (ADD)</span>
                    <strong>{record.rightEye.add} D</strong>
                  </div>
                )}
              </div>
            </div>
            <div className="eye-summary-block">
              <h4>左眼 (OS)</h4>
              <div className="eye-param-list">
                <div className="eye-param">
                  <span>裸眼视力</span>
                  <strong>{record.leftEye.nakedVision || "未检查"}</strong>
                </div>
                <div className="eye-param">
                  <span>矫正视力</span>
                  <strong>{record.leftEye.correctedVision || "未检查"}</strong>
                </div>
                <div className="eye-param">
                  <span>球镜 (SPH)</span>
                  <strong>{record.leftEye.sphere || "0.00"} D</strong>
                </div>
                <div className="eye-param">
                  <span>柱镜 (CYL)</span>
                  <strong>{record.leftEye.cylinder || "0.00"} D</strong>
                </div>
                <div className="eye-param">
                  <span>轴位 (AXIS)</span>
                  <strong>{record.leftEye.axis || "0"}°</strong>
                </div>
                {record.leftEye.add && (
                  <div className="eye-param">
                    <span>下加光 (ADD)</span>
                    <strong>{record.leftEye.add} D</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="pd-row">
            <span className="summary-label">瞳距 (PD)</span>
            <strong className="pd-value">{record.pd || "未测量"} mm</strong>
          </div>
        </div>

        {(record.cornealCurvature.right.horizontal || record.cornealCurvature.left.horizontal) && (
          <div className="summary-section">
            <h3>角膜曲率</h3>
            <div className="eye-compare-layout">
              <div className="eye-summary-block">
                <h4>右眼 (OD)</h4>
                <div className="eye-param-list">
                  <div className="eye-param">
                    <span>水平曲率</span>
                    <strong>{record.cornealCurvature.right.horizontal || "未测量"} D</strong>
                  </div>
                  <div className="eye-param">
                    <span>垂直曲率</span>
                    <strong>{record.cornealCurvature.right.vertical || "未测量"} D</strong>
                  </div>
                </div>
              </div>
              <div className="eye-summary-block">
                <h4>左眼 (OS)</h4>
                <div className="eye-param-list">
                  <div className="eye-param">
                    <span>水平曲率</span>
                    <strong>{record.cornealCurvature.left.horizontal || "未测量"} D</strong>
                  </div>
                  <div className="eye-param">
                    <span>垂直曲率</span>
                    <strong>{record.cornealCurvature.left.vertical || "未测量"} D</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="summary-section">
          <h3>医嘱建议</h3>
          <p className="recommendation-text">{record.recommendation || "暂无建议"}</p>
        </div>
      </div>

      <div className="step-navigation">
        <div className="step-hint">
          ✓ 处方已生成，可进入下一步导出
        </div>
      </div>
    </div>
  );
}

function WorkbenchExportStep({
  patient,
  record,
  records,
  canExport,
  allRecords,
  selectedRecordId,
  onSelectRecord,
}: {
  patient: PatientProfile | null;
  record: RefractionRecord | null;
  records: RefractionRecord[];
  canExport: boolean;
  allRecords: RefractionRecord[];
  selectedRecordId: string | null;
  onSelectRecord: (id: string) => void;
}) {
  const [exportType, setExportType] = useState<"single" | "patient" | "all">("single");
  const [exportFormat, setExportFormat] = useState<"txt" | "csv">("txt");

  const handleExport = () => {
    if (!canExport) return;

    if (exportType === "single" && record) {
      const content = generatePrescriptionSummary(record, patient);
      const filename = `处方摘要_${record.patientNo}_${record.examDate}.${exportFormat === "txt" ? "txt" : "csv"}`;
      if (exportFormat === "txt") {
        downloadTextFile(content, filename);
      } else {
        const csvContent = exportToCsv([record]);
        downloadTextFile(csvContent, filename);
      }
    } else if (exportType === "patient" && patient) {
      if (exportFormat === "txt") {
        const content = generatePatientRecordsSummary(patient, records);
        const filename = `患者档案_${patient.patientNo}.txt`;
        downloadTextFile(content, filename);
      } else {
        const csvContent = exportToCsv(records);
        const filename = `患者记录_${patient.patientNo}.csv`;
        downloadTextFile(csvContent, filename);
      }
    } else if (exportType === "all") {
      if (exportFormat === "txt") {
        const summaryLines: string[] = [];
        summaryLines.push("═══════════════════════════════════════");
        summaryLines.push("         全部验光数据汇总");
        summaryLines.push("═══════════════════════════════════════");
        summaryLines.push("");
        summaryLines.push(`导出时间：${formatLocalDate(new Date())}`);
        summaryLines.push(`总记录数：${allRecords.length} 条`);
        summaryLines.push("");
        allRecords.forEach(r => {
          summaryLines.push(`${r.examDate} | ${r.patientNo} | ${r.type} | ${r.summary}`);
        });
        downloadTextFile(summaryLines.join("\n"), `全部验光数据_${formatLocalDate(new Date())}.txt`);
      } else {
        const csvContent = exportToCsv(allRecords);
        downloadTextFile(csvContent, `全部验光数据_${formatLocalDate(new Date())}.csv`);
      }
    }
  };

  if (!canExport) {
    return (
      <div className="workbench-step-content">
        <div className="empty-state large">
          <p>暂无权限</p>
          <p className="empty-hint">您当前的角色无法导出数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workbench-step-content">
      <div className="step-header">
        <div>
          <h2>导出摘要</h2>
          <p className="step-description">
            选择导出范围和格式，生成验光数据报告
          </p>
        </div>
      </div>

      <div className="export-options">
        <div className="export-option-group">
          <h3>导出范围</h3>
          <div className="export-type-options">
            <label className={`export-option ${exportType === "single" ? "export-option-selected" : ""}`}>
              <input
                type="radio"
                name="exportType"
                checked={exportType === "single"}
                onChange={() => setExportType("single")}
              />
              <div>
                <strong>单条处方</strong>
                <p>导出当前选中的单条验光处方摘要</p>
              </div>
            </label>
            <label className={`export-option ${exportType === "patient" ? "export-option-selected" : ""}`}>
              <input
                type="radio"
                name="exportType"
                checked={exportType === "patient"}
                onChange={() => setExportType("patient")}
              />
              <div>
                <strong>患者全部记录</strong>
                <p>导出当前患者的所有验光记录</p>
              </div>
            </label>
            <label className={`export-option ${exportType === "all" ? "export-option-selected" : ""}`}>
              <input
                type="radio"
                name="exportType"
                checked={exportType === "all"}
                onChange={() => setExportType("all")}
              />
              <div>
                <strong>全部数据</strong>
                <p>导出系统中所有验光记录</p>
              </div>
            </label>
          </div>
        </div>

        <div className="export-option-group">
          <h3>导出格式</h3>
          <div className="export-format-options">
            <button
              className={exportFormat === "txt" ? "format-btn-active" : ""}
              onClick={() => setExportFormat("txt")}
            >
              TXT 文本
            </button>
            <button
              className={exportFormat === "csv" ? "format-btn-active" : ""}
              onClick={() => setExportFormat("csv")}
            >
              CSV 表格
            </button>
          </div>
        </div>

        {exportType === "single" && records.length > 0 && (
          <div className="export-option-group">
            <h3>选择记录</h3>
            <select
              value={selectedRecordId || ""}
              onChange={e => onSelectRecord(e.target.value)}
              className="record-select"
            >
              {records.map(r => (
                <option key={r.id} value={r.id}>
                  {r.examDate} · {r.type} · {r.summary}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="export-action">
          <button className="primary-action large-btn" onClick={handleExport}>
            导出 {exportFormat === "txt" ? "文本" : "表格"} 文件
          </button>
        </div>
      </div>

      <div className="export-preview">
        <h3>预览说明</h3>
        <div className="preview-hint">
          <p>
            {exportType === "single" && "将导出当前选中的处方详细摘要，包含屈光检查、角膜曲率、医嘱建议等完整信息。"}
            {exportType === "patient" && `将导出${patient ? patient.patientNo : "该患者"}的全部验光记录汇总。`}
            {exportType === "all" && `将导出全部 ${allRecords.length} 条验光记录。`}
          </p>
          <p className="empty-hint">
            导出格式：{exportFormat === "txt" ? "纯文本格式，便于打印和阅读" : "CSV表格格式，可导入Excel等软件"}
          </p>
        </div>
      </div>
    </div>
  );
}

function OptometryWorkbench({
  currentRole,
  roleConfigs,
  onRoleChange,
  workbenchState,
  onToggleWorkbench,
  patients,
  records,
  reminders,
  comparisons,
  onSetStep,
  onNextStep,
  onPrevStep,
  onSelectPatient,
  onSelectRecord,
  selectedPatient,
  selectedPatientRecords,
  selectedWorkbenchRecord,
  patientComparisons,
  permissions,
  showPatientForm,
  onShowPatientFormChange,
  editingPatientId,
  onStartEditPatient,
  onCancelEditPatient,
  onAddPatient,
  onEditPatient,
  onDeletePatient,
  showPrescriptionForm,
  onShowPrescriptionFormChange,
  onPrescriptionSubmit,
  onPrescriptionCancel,
  allRecords,
  patientFilter,
  onPatientFilterChange,
  currentRoleConfig,
}: {
  currentRole: UserRole;
  roleConfigs: RoleConfig[];
  onRoleChange: (role: UserRole) => void;
  workbenchState: WorkbenchState;
  onToggleWorkbench: () => void;
  patients: PatientProfile[];
  records: RefractionRecord[];
  reminders: PatientReminder[];
  comparisons: PrescriptionComparisonResult[];
  onSetStep: (step: WorkbenchStep) => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  onSelectPatient: (id: string) => void;
  onSelectRecord: (id: string) => void;
  selectedPatient: PatientProfile | null;
  selectedPatientRecords: RefractionRecord[];
  selectedWorkbenchRecord: RefractionRecord | null;
  patientComparisons: PrescriptionComparisonResult[];
  permissions: RoleConfig["permissions"];
  showPatientForm: boolean;
  onShowPatientFormChange: (show: boolean) => void;
  editingPatientId: string | null;
  onStartEditPatient: (patient: PatientProfile) => void;
  onCancelEditPatient: () => void;
  onAddPatient: (data: Omit<PatientProfile, "id">) => void;
  onEditPatient: (data: Omit<PatientProfile, "id">) => void;
  onDeletePatient: (id: string) => void;
  showPrescriptionForm: boolean;
  onShowPrescriptionFormChange: (show: boolean) => void;
  onPrescriptionSubmit: (data: Omit<RefractionRecord, "id" | "summary"> & { summary: string }) => void;
  onPrescriptionCancel: () => void;
  allRecords: RefractionRecord[];
  patientFilter: string;
  onPatientFilterChange: (filter: string) => void;
  currentRoleConfig: RoleConfig;
}) {
  const canAccessStep = (step: WorkbenchStep): boolean => {
    switch (step) {
      case "patient":
        return true;
      case "refraction":
        return !!workbenchState.selectedPatientId;
      case "comparison":
        return !!workbenchState.selectedPatientId && permissions.canViewComparison;
      case "prescription":
        return !!workbenchState.selectedPatientId;
      case "export":
        return permissions.canExport;
      default:
        return false;
    }
  };

  const currentStepIndex = workbenchSteps.findIndex(s => s.key === workbenchState.activeStep);

  return (
    <div className="optometry-workbench">
      <div className="workbench-header">
        <div className="workbench-title">
          <h2>验光工作台</h2>
          <p>患者建档 → 初次验光 → 复查对比 → 处方摘要 → 导出摘要</p>
        </div>
        <div className="workbench-header-actions">
          <RoleSwitcher
            currentRole={currentRole}
            onRoleChange={onRoleChange}
            roleConfigs={roleConfigs}
          />
          <button className="ghost-btn" onClick={onToggleWorkbench}>
            退出工作台
          </button>
        </div>
      </div>

      <div className="workbench-body">
        <aside className="workbench-sidebar">
          <div className="sidebar-section">
            <h3>流程步骤</h3>
            <WorkbenchStepper
              steps={workbenchSteps}
              activeStep={workbenchState.activeStep}
              onStepClick={onSetStep}
              canAccessStep={canAccessStep}
            />
          </div>

          {selectedPatient && (
            <div className="sidebar-section">
              <h3>当前患者</h3>
              <div className="sidebar-patient-card">
                <h4>{selectedPatient.patientNo}</h4>
                <p>{selectedPatient.ageGroup} · {selectedPatient.lensType}</p>
                <p className="sidebar-patient-remark">{selectedPatient.remark || "暂无备注"}</p>
                <p className="sidebar-patient-meta">记录数：{selectedPatientRecords.length} 条</p>
              </div>
            </div>
          )}

          {permissions.canViewReminders && reminders.length > 0 && (
            <div className="sidebar-section">
              <h3>复查提醒</h3>
              <div className="sidebar-reminders">
                {reminders.slice(0, 5).map(reminder => (
                  <div key={reminder.id} className={`sidebar-reminder-item status-${reminder.reminderStatus}`}>
                    <span className="reminder-dot"></span>
                    <div>
                      <p>{reminder.patientNo}</p>
                      <span>{reminder.nextCheckDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sidebar-section">
            <h3>角色说明</h3>
            <div className="role-info-card">
              <p className="role-info-title">{currentRoleConfig.label}</p>
              <p className="role-info-desc">{currentRoleConfig.description}</p>
              <ul className="role-permissions-list">
                <li className={permissions.canCreatePatient ? "perm-yes" : "perm-no"}>
                  {permissions.canCreatePatient ? "✓" : "✗"} 创建患者档案
                </li>
                <li className={permissions.canCreateRecord ? "perm-yes" : "perm-no"}>
                  {permissions.canCreateRecord ? "✓" : "✗"} 录入验光记录
                </li>
                <li className={permissions.canViewComparison ? "perm-yes" : "perm-no"}>
                  {permissions.canViewComparison ? "✓" : "✗"} 查看复查对比
                </li>
                <li className={permissions.canCreatePrescription ? "perm-yes" : "perm-no"}>
                  {permissions.canCreatePrescription ? "✓" : "✗"} 开具处方
                </li>
                <li className={permissions.canExport ? "perm-yes" : "perm-no"}>
                  {permissions.canExport ? "✓" : "✗"} 导出数据
                </li>
                <li className={permissions.canLensRecommendation ? "perm-yes" : "perm-no"}>
                  {permissions.canLensRecommendation ? "✓" : "✗"} 配镜建议
                </li>
              </ul>
            </div>
          </div>
        </aside>

        <main className="workbench-main">
          {workbenchState.activeStep === "patient" && (
            <WorkbenchPatientStep
              patients={patients}
              selectedPatientId={workbenchState.selectedPatientId}
              onSelectPatient={onSelectPatient}
              onAddPatient={() => onShowPatientFormChange(true)}
              canCreatePatient={permissions.canCreatePatient}
              showForm={showPatientForm}
              onShowFormChange={onShowPatientFormChange}
              editingId={editingPatientId}
              onStartEdit={onStartEditPatient}
              onCancelEdit={onCancelEditPatient}
              onAddSubmit={onAddPatient}
              onEditSubmit={onEditPatient}
              onDelete={onDeletePatient}
              canDeletePatient={permissions.canDeletePatient}
              canEditPatient={permissions.canEditPatient}
              patientFilter={patientFilter}
              onPatientFilterChange={onPatientFilterChange}
            />
          )}

          {workbenchState.activeStep === "refraction" && (
            <WorkbenchRefractionStep
              patient={selectedPatient}
              records={selectedPatientRecords}
              selectedRecordId={workbenchState.selectedRecordId}
              onSelectRecord={onSelectRecord}
              onAddRecord={() => onShowPrescriptionFormChange(true)}
              canCreateRecord={permissions.canCreateRecord}
              showForm={showPrescriptionForm}
              onShowFormChange={onShowPrescriptionFormChange}
              onFormSubmit={onPrescriptionSubmit}
              onFormCancel={onPrescriptionCancel}
              canViewComparison={permissions.canViewComparison}
            />
          )}

          {workbenchState.activeStep === "comparison" && (
            <WorkbenchComparisonStep
              patient={selectedPatient}
              records={selectedPatientRecords}
              comparisons={patientComparisons}
              selectedRecordId={workbenchState.selectedRecordId}
              onSelectRecord={onSelectRecord}
              canViewComparison={permissions.canViewComparison}
            />
          )}

          {workbenchState.activeStep === "prescription" && (
            <WorkbenchPrescriptionStep
              patient={selectedPatient}
              record={selectedWorkbenchRecord}
              records={selectedPatientRecords}
              onSelectRecord={onSelectRecord}
              canCreatePrescription={permissions.canCreatePrescription}
            />
          )}

          {workbenchState.activeStep === "export" && (
            <WorkbenchExportStep
              patient={selectedPatient}
              record={selectedWorkbenchRecord}
              records={selectedPatientRecords}
              canExport={permissions.canExport}
              allRecords={allRecords}
              selectedRecordId={workbenchState.selectedRecordId}
              onSelectRecord={onSelectRecord}
            />
          )}

          <div className="workbench-footer-nav">
            <button
              className="ghost-btn"
              onClick={onPrevStep}
              disabled={currentStepIndex === 0}
            >
              ← 上一步
            </button>
            <span className="step-indicator">
              第 {currentStepIndex + 1} 步 / 共 {workbenchSteps.length} 步
            </span>
            <button
              className="primary-action"
              onClick={onNextStep}
              disabled={currentStepIndex === workbenchSteps.length - 1 || !canAccessStep(workbenchSteps[currentStepIndex + 1]?.key)}
            >
              下一步 →
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

function App() {
  const [dbSupported, setDbSupported] = useState<boolean | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [patients, setPatients] = useState<PatientProfile[]>(initialPatients);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [today] = useState(() => new Date());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<RefractionRecord | null>(null);
  const [records, setRecords] = useState<RefractionRecord[]>(refractionRecords);
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [comparisonDrawerOpen, setComparisonDrawerOpen] = useState(false);
  const [selectedComparison, setSelectedComparison] = useState<PrescriptionComparisonResult | null>(null);
  const [comparisonFilter, setComparisonFilter] = useState<ComparisonCategory | "all">("all");
  const [showLensRecommendation, setShowLensRecommendation] = useState(false);
  const [lensRecommendationResult, setLensRecommendationResult] = useState<LensRecommendationResult | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [customCycles, setCustomCycles] = useState<Record<string, number>>({});
  const [currentRole, setCurrentRole] = useState<UserRole>("optometrist");
  const [workbenchPatientFilter, setWorkbenchPatientFilter] = useState<string>("all");
  const [showWorkbenchPatientForm, setShowWorkbenchPatientForm] = useState(false);
  const [workbenchEditingPatientId, setWorkbenchEditingPatientId] = useState<string | null>(null);
  const [showWorkbenchPrescriptionForm, setShowWorkbenchPrescriptionForm] = useState(false);
  const [workbenchState, setWorkbenchState] = useState<WorkbenchState>({
    activeStep: "patient",
    selectedPatientId: null,
    selectedRecordId: null,
    isWorkbenchMode: false,
  });

  const currentRoleConfig = useMemo(() => {
    return roleConfigs.find(r => r.key === currentRole) || roleConfigs[0];
  }, [currentRole]);

  const selectedPatient = useMemo(() => {
    if (!workbenchState.selectedPatientId) return null;
    return patients.find(p => p.id === workbenchState.selectedPatientId) || null;
  }, [workbenchState.selectedPatientId, patients]);

  const selectedPatientRecords = useMemo(() => {
    if (!selectedPatient) return [];
    return records
      .filter(r => r.patientNo === selectedPatient.patientNo)
      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  }, [selectedPatient, records]);

  const selectedWorkbenchRecord = useMemo(() => {
    if (!workbenchState.selectedRecordId) return null;
    return records.find(r => r.id === workbenchState.selectedRecordId) || null;
  }, [workbenchState.selectedRecordId, records]);

  const patientComparisons = useMemo(() => {
    if (!selectedPatient) return [];
    return getAllComparisons(selectedPatientRecords);
  }, [selectedPatient, selectedPatientRecords]);

  const toggleWorkbenchMode = useCallback(() => {
    setWorkbenchState(prev => ({
      ...prev,
      isWorkbenchMode: !prev.isWorkbenchMode,
      activeStep: "patient",
      selectedPatientId: null,
      selectedRecordId: null,
    }));
  }, []);

  const setWorkbenchStep = useCallback((step: WorkbenchStep) => {
    setWorkbenchState(prev => ({ ...prev, activeStep: step }));
  }, []);

  const selectWorkbenchPatient = useCallback((patientId: string) => {
    setWorkbenchState(prev => ({
      ...prev,
      selectedPatientId: patientId,
      selectedRecordId: null,
    }));
  }, []);

  const selectWorkbenchRecord = useCallback((recordId: string) => {
    setWorkbenchState(prev => ({ ...prev, selectedRecordId: recordId }));
  }, []);

  const nextWorkbenchStep = useCallback(() => {
    const currentIndex = workbenchSteps.findIndex(s => s.key === workbenchState.activeStep);
    if (currentIndex < workbenchSteps.length - 1) {
      setWorkbenchState(prev => ({
        ...prev,
        activeStep: workbenchSteps[currentIndex + 1].key,
      }));
    }
  }, [workbenchState.activeStep]);

  const prevWorkbenchStep = useCallback(() => {
    const currentIndex = workbenchSteps.findIndex(s => s.key === workbenchState.activeStep);
    if (currentIndex > 0) {
      setWorkbenchState(prev => ({
        ...prev,
        activeStep: workbenchSteps[currentIndex - 1].key,
      }));
    }
  }, [workbenchState.activeStep]);

  const reminders = useMemo(() => {
    return patients
      .filter(p => p.lastCheckDate)
      .map(p => calculateReminder(p, today, customCycles[p.patientNo]))
      .sort((a, b) => a.daysUntilNext - b.daysUntilNext);
  }, [patients, today, customCycles]);

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
          if (persistedData.patients.length > 0) {
            setPatients(persistedData.patients);
          } else if (wasCleared) {
            setPatients([]);
          }
          if (persistedData.records.length > 0) {
            setRecords(persistedData.records);
          } else if (recordsPersisted || wasCleared) {
            setRecords([]);
          }
          if (persistedData.filters.comparisonFilter) {
            setComparisonFilter(persistedData.filters.comparisonFilter as ComparisonCategory | "all");
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
        filters: { comparisonFilter },
        reminders: reminderData,
      });
    }
  }, [patients, records, comparisonFilter, reminders, customCycles, isLoading, scheduleSave, dbSupported, dbReady]);

  const handleClearData = async () => {
    try {
      await clearAllData();
      await saveClearedFlag(true);
      setPatients([]);
      setRecords([]);
      setComparisonFilter("all");
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
    } catch (err) {
      console.error("清空数据失败:", err);
    }
  };

  const openDrawer = (record: RefractionRecord) => {
    setSelectedRecord(record);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  const openComparisonDrawer = (comparison: PrescriptionComparisonResult) => {
    setSelectedComparison(comparison);
    setComparisonDrawerOpen(true);
  };

  const closeComparisonDrawer = () => {
    setComparisonDrawerOpen(false);
  };

  const { overdue, upcoming, normal } = useMemo(() => {
    return {
      overdue: reminders.filter(r => r.reminderStatus === "overdue"),
      upcoming: reminders.filter(r => r.reminderStatus === "upcoming"),
      normal: reminders.filter(r => r.reminderStatus === "normal"),
    };
  }, [reminders]);

  const reminderCounts = {
    overdue: overdue.length,
    upcoming: upcoming.length,
    normal: normal.length,
  };

  const comparisons = useMemo(() => getAllComparisons(records), [records]);

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

  const metricLabels = [
    "患者总数",
    "近视进展",
    "散光变化",
    "处方稳定",
  ];

  const metricValues = [
    String(patients.length),
    String(myopiaProgress.length),
    String(astigmatismChange.length),
    String(stable.length),
  ];

  const handleAdd = (data: Omit<PatientProfile, "id">) => {
    const newPatient: PatientProfile = {
      ...data,
      id: `p-${Date.now()}`
    };
    setPatients(prev => [newPatient, ...prev]);
    setShowForm(false);
  };

  const handleEdit = (data: Omit<PatientProfile, "id">) => {
    if (!editingId) return;
    setPatients(prev =>
      prev.map(p => (p.id === editingId ? { ...p, ...data } : p))
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

  const openPrescriptionForm = () => {
    setShowPrescriptionForm(true);
  };

  const cancelPrescriptionForm = () => {
    setShowPrescriptionForm(false);
  };

  const handlePrescriptionSubmit = (data: Omit<RefractionRecord, "id" | "summary"> & { summary: string }) => {
    const newRecord: RefractionRecord = {
      id: `r-${Date.now()}`,
      ...data
    };
    setRecords(prev => [newRecord, ...prev]);
    setShowPrescriptionForm(false);
  };

  const openImportForm = () => {
    setShowImportForm(true);
    setShowPrescriptionForm(false);
  };

  const cancelImportForm = () => {
    setShowImportForm(false);
  };

  const handleImportSubmit = (recordsData: Array<Omit<RefractionRecord, "id" | "summary"> & { summary: string }>) => {
    const newRecords: RefractionRecord[] = recordsData.map((data, index) => ({
      id: `r-import-${Date.now()}-${index}`,
      ...data
    }));
    setRecords(prev => [...newRecords, ...prev]);
    setShowImportForm(false);
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

  const handleWorkbenchAddPatient = (data: Omit<PatientProfile, "id">) => {
    const newPatient: PatientProfile = {
      ...data,
      id: `p-${Date.now()}`
    };
    setPatients(prev => [newPatient, ...prev]);
    setShowWorkbenchPatientForm(false);
    setWorkbenchState(prev => ({ ...prev, selectedPatientId: newPatient.id }));
  };

  const handleWorkbenchEditPatient = (data: Omit<PatientProfile, "id">) => {
    if (!workbenchEditingPatientId) return;
    setPatients(prev =>
      prev.map(p => (p.id === workbenchEditingPatientId ? { ...p, ...data } : p))
    );
    setWorkbenchEditingPatientId(null);
  };

  const handleWorkbenchDeletePatient = (id: string) => {
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
    if (workbenchState.selectedPatientId === id) {
      setWorkbenchState(prev => ({ ...prev, selectedPatientId: null, selectedRecordId: null }));
    }
    if (workbenchEditingPatientId === id) {
      setWorkbenchEditingPatientId(null);
    }
  };

  const handleWorkbenchStartEditPatient = (patient: PatientProfile) => {
    setWorkbenchEditingPatientId(patient.id);
    setShowWorkbenchPatientForm(false);
  };

  const handleWorkbenchCancelEditPatient = () => {
    setWorkbenchEditingPatientId(null);
  };

  const handleWorkbenchPrescriptionSubmit = (data: Omit<RefractionRecord, "id" | "summary"> & { summary: string }) => {
    const newRecord: RefractionRecord = {
      id: `r-${Date.now()}`,
      ...data
    };
    setRecords(prev => [newRecord, ...prev]);
    setShowWorkbenchPrescriptionForm(false);
    setWorkbenchState(prev => ({ ...prev, selectedRecordId: newRecord.id }));
  };

  const handleWorkbenchPrescriptionCancel = () => {
    setShowWorkbenchPrescriptionForm(false);
  };

  const handleExportSummary = () => {
    if (!currentRoleConfig.permissions.canExport) return;
    const csvContent = exportToCsv(records);
    downloadTextFile(csvContent, `验光记录_${formatLocalDate(new Date())}.csv`);
  };

  const editingPatient = patients.find(p => p.id === editingId);
  const workbenchEditingPatient = patients.find(p => p.id === workbenchEditingPatientId);

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
        <div className="db-status-banner">
          <span className="status-dot online"></span>
          <span>本地数据已启用 · 刷新页面后数据将自动恢复</span>
        </div>
      )}

      {workbenchState.isWorkbenchMode ? (
        <OptometryWorkbench
          currentRole={currentRole}
          roleConfigs={roleConfigs}
          onRoleChange={setCurrentRole}
          workbenchState={workbenchState}
          onToggleWorkbench={toggleWorkbenchMode}
          patients={patients}
          records={records}
          reminders={reminders}
          comparisons={comparisons}
          onSetStep={setWorkbenchStep}
          onNextStep={nextWorkbenchStep}
          onPrevStep={prevWorkbenchStep}
          onSelectPatient={selectWorkbenchPatient}
          onSelectRecord={selectWorkbenchRecord}
          selectedPatient={selectedPatient}
          selectedPatientRecords={selectedPatientRecords}
          selectedWorkbenchRecord={selectedWorkbenchRecord}
          patientComparisons={patientComparisons}
          permissions={currentRoleConfig.permissions}
          showPatientForm={showWorkbenchPatientForm}
          onShowPatientFormChange={setShowWorkbenchPatientForm}
          editingPatientId={workbenchEditingPatientId}
          onStartEditPatient={handleWorkbenchStartEditPatient}
          onCancelEditPatient={handleWorkbenchCancelEditPatient}
          onAddPatient={handleWorkbenchAddPatient}
          onEditPatient={handleWorkbenchEditPatient}
          onDeletePatient={handleWorkbenchDeletePatient}
          showPrescriptionForm={showWorkbenchPrescriptionForm}
          onShowPrescriptionFormChange={setShowWorkbenchPrescriptionForm}
          onPrescriptionSubmit={handleWorkbenchPrescriptionSubmit}
          onPrescriptionCancel={handleWorkbenchPrescriptionCancel}
          allRecords={records}
          patientFilter={workbenchPatientFilter}
          onPatientFilterChange={setWorkbenchPatientFilter}
          currentRoleConfig={currentRoleConfig}
        />
      ) : (
        <>
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="hero-actions">
          <div className="role-switcher-hero">
            <span className="role-switcher-label">当前角色：</span>
            <div className="role-tabs">
              {roleConfigs.map(config => (
                <button
                  key={config.key}
                  className={`role-tab ${currentRole === config.key ? "role-tab-active" : ""}`}
                  onClick={() => setCurrentRole(config.key)}
                  title={config.description}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>
          <button className="primary-action workbench-entry-btn" onClick={toggleWorkbenchMode}>
            进入验光工作台 →
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        {metricLabels.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={metricValues[index]} index={index} />
        ))}
      </section>

      <section className="reminder-board panel">
        <div className="section-heading">
          <div>
            <p>复查管理</p>
            <h2>复查提醒看板</h2>
          </div>
          <span className="today-info">今日日期：{formatLocalDate(today)}</span>
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
                overdue.map((reminder, index) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    index={index}
                    isCustom={!!customCycles[reminder.patientNo]}
                    onCycleChange={(days) => handleSetCustomCycle(reminder.patientNo, days)}
                    onCycleReset={() => handleSetCustomCycle(reminder.patientNo, null)}
                  />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无逾期复查</p>
                </div>
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
                upcoming.map((reminder, index) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    index={index}
                    isCustom={!!customCycles[reminder.patientNo]}
                    onCycleChange={(days) => handleSetCustomCycle(reminder.patientNo, days)}
                    onCycleReset={() => handleSetCustomCycle(reminder.patientNo, null)}
                  />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无即将到期</p>
                </div>
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
                normal.map((reminder, index) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    index={index}
                    isCustom={!!customCycles[reminder.patientNo]}
                    onCycleChange={(days) => handleSetCustomCycle(reminder.patientNo, days)}
                    onCycleReset={() => handleSetCustomCycle(reminder.patientNo, null)}
                  />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无正常复查</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

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
        <div className="comparison-list">
          {filteredComparisons.length > 0 ? (
            filteredComparisons.map((comparison, index) => (
              <ComparisonCard
                key={`${comparison.prevRecord.id}-${comparison.currRecord.id}`}
                comparison={comparison}
                index={index}
                onClick={() => openComparisonDrawer(comparison)}
              />
            ))
          ) : (
            <div className="empty-state">
              <p>暂无对比数据</p>
              <p className="empty-hint">同一患者需至少两条验光记录才能进行对比</p>
            </div>
          )}
        </div>
      </section>

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

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            {project.filters.map((filter: string) => (
              <button key={filter}>{filter}</button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>记录字段</h2>
            </div>
            <button className="primary-action" onClick={openPrescriptionForm}>新增处方记录</button>
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

      <section className="two-column">
        <section className="records panel">
          <div className="section-heading">
            <div>
              <p>验光记录</p>
              <h2>近期记录</h2>
            </div>
            <div className="record-actions">
              {!showPrescriptionForm && !showImportForm && (
                <button className="primary-action" onClick={openPrescriptionForm}>+ 新增处方录入</button>
              )}
              {!showPrescriptionForm && !showImportForm && (
                <button onClick={openImportForm}>批量导入</button>
              )}
              <button>导出摘要</button>
            </div>
          </div>

          {showPrescriptionForm && (
            <PrescriptionForm
              onSubmit={handlePrescriptionSubmit}
              onCancel={cancelPrescriptionForm}
            />
          )}

          {showImportForm && (
            <ImportPreview
              onConfirm={handleImportSubmit}
              onCancel={cancelImportForm}
            />
          )}

          <div className="record-list">
            {records.map((record, index) => (
              <article
                key={record.id}
                className="record-card record-clickable"
                onClick={() => openDrawer(record)}
              >
                <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{record.patientNo} · {record.patientName} · {record.examDate}</h3>
                  <p>{[record.category, record.type, record.summary].filter(Boolean).join(" · ")}</p>
                </div>
              </article>
            ))}
            {records.length === 0 && (
              <div className="empty-state">
                <p>暂无验光记录</p>
                <p className="empty-hint">点击"新增处方录入"添加第一条记录</p>
              </div>
            )}
          </div>
        </section>

        <section className="patient-panel panel">
          <div className="section-heading">
            <div>
              <p>本地档案</p>
              <h2>患者档案</h2>
            </div>
            <div className="panel-actions">
              {dbSupported && (
                <button
                  className="ghost-btn danger-btn"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={isLoading}
                >
                  清空数据
                </button>
              )}
              {!showForm && !editingId && (
                <button className="primary-action" onClick={openAddForm}>+ 新增档案</button>
              )}
            </div>
          </div>

          {showForm && (
            <PatientForm
              key="add-form"
              onSubmit={handleAdd}
              onCancel={cancelAdd}
            />
          )}

          {editingPatient && !showForm && (
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
              />
            </div>
          )}

          <div className="patient-list">
            {patients.map((patient, index) => (
              editingId === patient.id ? null : (
                <PatientCard
                  key={patient.id}
                  patient={patient}
                  index={index}
                  onEdit={() => startEdit(patient)}
                  onDelete={() => handleDelete(patient.id)}
                />
              )
            ))}
            {patients.length === 0 && (
              <div className="empty-state">
                <p>暂无患者档案</p>
                <p className="empty-hint">点击"新增档案"添加第一条记录</p>
              </div>
            )}
          </div>
        </section>
      </section>

      <RefractionDrawer
        record={selectedRecord}
        open={drawerOpen}
        onClose={closeDrawer}
      />
      <ComparisonDrawer
        comparison={selectedComparison}
        open={comparisonDrawerOpen}
        onClose={closeComparisonDrawer}
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
        </>
      )}
    </main>
  );
}

export default App;
