import type { RolePermission } from "./role";

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

export const STEP_PERMISSION_MAP: Record<WorkflowStep, keyof RolePermission> = {
  "dashboard": "canViewPatientProfile",
  "patient-profile": "canViewPatientProfile",
  "initial-exam": "canViewInitialExam",
  "recheck-compare": "canViewRecheckCompare",
  "prescription-summary": "canViewPrescriptionSummary",
  "export": "canExport",
};
