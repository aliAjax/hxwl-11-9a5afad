import type { PrescriptionComparisonResult } from "../../types";
import { CATEGORY_CONFIG as categoryConfig } from "../../types";
import { DiffBadge } from "./DiffBadge";

export function ComparisonCard({
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
