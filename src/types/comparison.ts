import type { RefractionRecord, EyeRefraction, EyeCurvature } from "./patient";

export type ComparisonCategory = "myopia-progress" | "astigmatism-change" | "stable";

export type ComparisonBaselineType = "latest-two" | "first-to-current" | "custom";

export interface ComparisonBaselineConfig {
  type: ComparisonBaselineType;
  customRecordIds?: [string, string];
}

export interface EyeComparison {
  sphere: { prev: string; curr: string; diff: number; changed: boolean };
  cylinder: { prev: string; curr: string; diff: number; changed: boolean };
  axis: { prev: string; curr: string; diff: number; changed: boolean };
  correctedVision: { prev: string; curr: string; diff: number; changed: boolean };
}

export interface CurvatureComparison {
  horizontal: { prev: string; curr: string; diff: number; changed: boolean };
  vertical: { prev: string; curr: string; diff: number; changed: boolean };
}

export interface PrescriptionComparisonResult {
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

export const CATEGORY_CONFIG: Record<ComparisonCategory, { label: string; className: string; dotClass: string }> = {
  "myopia-progress": { label: "近视进展", className: "cat-progress", dotClass: "dot-progress" },
  "astigmatism-change": { label: "散光变化", className: "cat-astigmatism", dotClass: "dot-astigmatism" },
  "stable": { label: "处方稳定", className: "cat-stable", dotClass: "dot-stable" },
};

export type LensCategory = "children-myopia" | "progressive" | "ortho-k" | "adult-regular";

export interface LensRecommendationInput {
  ageGroup: string;
  isReview: boolean;
  lensType: string;
  rightSphere: string;
  leftSphere: string;
  rightCylinder: string;
  leftCylinder: string;
  cylinderChange: string;
}

export interface LensRecommendationResult {
  category: LensCategory;
  categoryLabel: string;
  primaryAdvice: string;
  detailedAdvice: string[];
  doctorConfirmationRequired: boolean;
  confirmationReasons: string[];
  reviewCycle: string;
  disclaimers: string[];
}

export const LENS_CATEGORY_CONFIG: Record<LensCategory, { label: string; className: string; icon: string }> = {
  "children-myopia": { label: "儿童近视防控", className: "rec-children", icon: "👶" },
  "progressive": { label: "渐进片验配", className: "rec-progressive", icon: "📏" },
  "ortho-k": { label: "角膜塑形镜", className: "rec-orthok", icon: "💎" },
  "adult-regular": { label: "成人普通配镜", className: "rec-adult", icon: "👓" },
};
