import type { FieldError } from "../validation";

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

export interface PatientReminder extends PatientProfile {
  reminderStatus: ReminderStatus;
  nextCheckDate: string;
  daysUntilNext: number;
  reminderCycle: number;
}

export interface PrescriptionErrors {
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
