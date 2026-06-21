import type { RefractionRecord, PatientProfile } from "../types/patient";
import { formatLocalDate } from "../csvParsers";

export function generatePrescriptionExportText(record: RefractionRecord, patient?: PatientProfile): string {
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

export function generateRecordsExportCSV(records: RefractionRecord[], patients: PatientProfile[]): string {
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

export function formatDiff(diff: number, unit: string = "", decimals: number = 2): string {
  if (diff === 0) return "—";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(decimals)}${unit}`;
}
