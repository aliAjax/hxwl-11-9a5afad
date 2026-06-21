import {
  parseSafeNumber,
  validateSphere,
  validateCylinder,
  validateAxis,
  validatePd,
} from "./validation";

export interface CsvFieldMapping {
  key: string;
  required: boolean;
  label: string;
  aliases: string[];
}

export const CSV_FIELD_MAPPINGS: CsvFieldMapping[] = [
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

export const CSV_REQUIRED_LABELS = CSV_FIELD_MAPPINGS.filter(f => f.required).map(f => f.label);

export const ageGroups = ["儿童", "青少年", "成人", "中老年"];

export function matchHeaderToField(headerName: string): CsvFieldMapping | null {
  const trimmed = headerName.trim();
  for (const mapping of CSV_FIELD_MAPPINGS) {
    if (mapping.aliases.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
      return mapping;
    }
  }
  return null;
}

export interface HeaderMappingResult {
  mapping: Record<string, number>;
  missingRequired: string[];
  extraColumns: string[];
}

export function buildHeaderMapping(headerFields: string[]): HeaderMappingResult {
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

export function parseCsvLine(line: string): string[] {
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

export function formatRightEyeSummary(sphere: string, cylinder: string, axis: string): string {
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

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface EyeRefraction {
  nakedVision: string;
  correctedVision: string;
  sphere: string;
  cylinder: string;
  axis: string;
  add: string;
}

export interface ParsedRecordRow {
  record: {
    patientNo: string;
    patientName: string;
    category: string;
    type: string;
    ageGroup: string;
    gender: string;
    examDate: string;
    rightEye: EyeRefraction;
    leftEye: EyeRefraction;
    pd: string;
    cornealCurvature: {
      right: { horizontal: string; vertical: string };
      left: { horizontal: string; vertical: string };
    };
    recommendation: string;
    summary: string;
  };
  rightEyeSummary: string;
  rowIndex: number;
}

export interface ParseErrorRow {
  rowIndex: number;
  rowText: string;
  errors: string[];
}

export interface CsvParseResult {
  validRows: ParsedRecordRow[];
  errorRows: ParseErrorRow[];
  missingRequired: string[];
  extraColumns: string[];
  headerMapping: Record<string, number>;
}

function getField(fields: string[], mapping: Record<string, number>, key: string): string | undefined {
  const idx = mapping[key];
  if (idx === undefined || idx >= fields.length) return undefined;
  return fields[idx];
}

export function validateAndBuildRecord(fields: string[], rowIndex: number, mapping: Record<string, number>): { record?: ParsedRecordRow; errors?: string[] } {
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

export function parseCsvText(csvText: string): CsvParseResult {
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
