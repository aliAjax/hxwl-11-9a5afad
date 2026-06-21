import type { EyeRefraction, CornealCurvature } from "./patient";
import type { RefractionRecord } from "./patient";

export interface PrescriptionFormData {
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

export const EMPTY_EYE: EyeRefraction = {
  nakedVision: "",
  correctedVision: "",
  sphere: "",
  cylinder: "",
  axis: "",
  add: ""
};

export const EMPTY_CURVATURE = { horizontal: "", vertical: "" };

export const EMPTY_PRESCRIPTION_FORM: PrescriptionFormData = {
  patientNo: "",
  patientName: "",
  ageGroup: "",
  gender: "",
  examDate: "",
  category: "",
  type: "初配",
  rightEye: { ...EMPTY_EYE },
  leftEye: { ...EMPTY_EYE },
  pd: "",
  cornealCurvature: { right: { ...EMPTY_CURVATURE }, left: { ...EMPTY_CURVATURE } },
  recommendation: ""
};

export const EMPTY_PATIENT_FORM = {
  patientNo: "",
  ageGroup: "",
  lensType: "",
  lastCheckDate: "",
  remark: ""
};

export const CATEGORIES = ["儿童近视", "青少年近视", "成人近视", "远视", "散光", "老花", "渐进片", "角膜塑形镜", "其他"];
export const EXAM_TYPES = ["初配", "复查", "换镜", "体检"];
export const GENDERS = ["男", "女"];
export const LENS_TYPES = ["单光镜", "渐进片", "角膜塑形镜", "散光镜", "老花镜"];
