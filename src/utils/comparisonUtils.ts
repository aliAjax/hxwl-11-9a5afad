import type { RefractionRecord, EyeRefraction, EyeCurvature } from "../types/patient";
import type {
  EyeComparison,
  CurvatureComparison,
  PrescriptionComparisonResult,
  ComparisonCategory,
  ComparisonBaselineConfig,
} from "../types/comparison";
import { CATEGORY_CONFIG } from "../types/comparison";
import {
  SPHERE_CHANGE_THRESHOLD,
  CYLINDER_CHANGE_THRESHOLD,
  AXIS_CHANGE_THRESHOLD,
  VISION_CHANGE_THRESHOLD,
  CURVATURE_CHANGE_THRESHOLD,
  DAY_IN_MS,
} from "../constants";
import { parseSafeNumber } from "../validation";
import { parseLocalDate } from "./dateUtils";

export function compareNumber(
  prev: string,
  curr: string,
  threshold: number
): { prev: string; curr: string; diff: number; changed: boolean } {
  const prevNum = parseSafeNumber(prev);
  const currNum = parseSafeNumber(curr);
  if (prevNum === null || currNum === null) {
    return { prev, curr, diff: 0, changed: false };
  }
  const diff = currNum - prevNum;
  return { prev, curr, diff, changed: Math.abs(diff) >= threshold };
}

export function compareEyeRefraction(prev: EyeRefraction, curr: EyeRefraction): EyeComparison {
  return {
    sphere: compareNumber(prev.sphere, curr.sphere, SPHERE_CHANGE_THRESHOLD),
    cylinder: compareNumber(prev.cylinder, curr.cylinder, CYLINDER_CHANGE_THRESHOLD),
    axis: compareNumber(prev.axis, curr.axis, AXIS_CHANGE_THRESHOLD),
    correctedVision: compareNumber(prev.correctedVision, curr.correctedVision, VISION_CHANGE_THRESHOLD),
  };
}

export function compareCurvature(prev: EyeCurvature, curr: EyeCurvature): CurvatureComparison {
  return {
    horizontal: compareNumber(prev.horizontal, curr.horizontal, CURVATURE_CHANGE_THRESHOLD),
    vertical: compareNumber(prev.vertical, curr.vertical, CURVATURE_CHANGE_THRESHOLD),
  };
}

export function classifyComparison(result: {
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

export function comparePrescriptions(
  prevRecord: RefractionRecord,
  currRecord: RefractionRecord
): PrescriptionComparisonResult {
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
    categoryLabel: CATEGORY_CONFIG[category].label,
    daysBetween,
  };
}

export function getPatientRecords(records: RefractionRecord[], patientNo: string): RefractionRecord[] {
  return records
    .filter((r) => r.patientNo === patientNo)
    .sort((a, b) => parseLocalDate(a.examDate).getTime() - parseLocalDate(b.examDate).getTime());
}

export function getAllComparisons(records: RefractionRecord[]): PrescriptionComparisonResult[] {
  const patientNos = [...new Set(records.map((r) => r.patientNo))];
  const results: PrescriptionComparisonResult[] = [];

  for (const patientNo of patientNos) {
    const patientRecords = getPatientRecords(records, patientNo);
    for (let i = 1; i < patientRecords.length; i++) {
      results.push(comparePrescriptions(patientRecords[i - 1], patientRecords[i]));
    }
  }

  return results.sort(
    (a, b) => parseLocalDate(b.currRecord.examDate).getTime() - parseLocalDate(a.currRecord.examDate).getTime()
  );
}

export function getLatestTwoComparisons(records: RefractionRecord[]): PrescriptionComparisonResult[] {
  const patientNos = [...new Set(records.map((r) => r.patientNo))];
  const results: PrescriptionComparisonResult[] = [];

  for (const patientNo of patientNos) {
    const patientRecords = getPatientRecords(records, patientNo);
    if (patientRecords.length >= 2) {
      const lastTwo = patientRecords.slice(-2);
      results.push(comparePrescriptions(lastTwo[0], lastTwo[1]));
    }
  }

  return results.sort(
    (a, b) => parseLocalDate(b.currRecord.examDate).getTime() - parseLocalDate(a.currRecord.examDate).getTime()
  );
}

export function getFirstToCurrentComparisons(records: RefractionRecord[]): PrescriptionComparisonResult[] {
  const patientNos = [...new Set(records.map((r) => r.patientNo))];
  const results: PrescriptionComparisonResult[] = [];

  for (const patientNo of patientNos) {
    const patientRecords = getPatientRecords(records, patientNo);
    if (patientRecords.length >= 2) {
      results.push(comparePrescriptions(patientRecords[0], patientRecords[patientRecords.length - 1]));
    }
  }

  return results.sort(
    (a, b) => parseLocalDate(b.currRecord.examDate).getTime() - parseLocalDate(a.currRecord.examDate).getTime()
  );
}

export function getCustomComparison(
  records: RefractionRecord[],
  recordIds: [string, string]
): PrescriptionComparisonResult | null {
  const record1 = records.find((r) => r.id === recordIds[0]);
  const record2 = records.find((r) => r.id === recordIds[1]);
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

export function getComparisonsByBaseline(
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

export function getVisibleRecordSummary(record: RefractionRecord, canViewDetailedRecords: boolean): string {
  if (canViewDetailedRecords) {
    return [record.category, record.type, record.summary].filter(Boolean).join(" · ");
  }
  return [record.category, record.type, `检查日期 ${record.examDate}`].filter(Boolean).join(" · ");
}
