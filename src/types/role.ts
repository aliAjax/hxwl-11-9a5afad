import type { WorkflowStep } from "./workflow";

export type UserRole = "optometrist" | "advisor" | "review-doctor";

export const ROLE_LABELS: Record<UserRole, string> = {
  "optometrist": "验光师",
  "advisor": "门店顾问",
  "review-doctor": "复查医生"
};

export interface RoleConfig {
  label: string;
  defaultStep: WorkflowStep;
  primaryEntryPoints: WorkflowStep[];
  description: string;
  dashboardSections: DashboardSection[];
}

export type DashboardSection = "metrics" | "reminder" | "comparison" | "lens-recommendation" | "field-workspace";

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
