import { useCallback, useEffect } from "react";
import type { PrescriptionComparisonResult, EyeComparison, CurvatureComparison } from "../../types";
import { CATEGORY_CONFIG as categoryConfig } from "../../types";
import { DiffBadge } from "./DiffBadge";
import { formatDiff } from "../../utils";

export function ComparisonDrawer({
  comparison,
  open,
  onClose,
  canViewProfessionalParams = true,
  canViewDetailedRecords = true
}: {
  comparison: PrescriptionComparisonResult | null;
  open: boolean;
  onClose: () => void;
  canViewProfessionalParams?: boolean;
  canViewDetailedRecords?: boolean;
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

          {canViewProfessionalParams && (
            <section className="drawer-section">
              <h3>角膜曲率对比</h3>
              <div className="drawer-eye-tables">
                <CurvatureCompareBlock curv={comparison.cornealCurvature.right} title="右眼 (OD)" />
                <CurvatureCompareBlock curv={comparison.cornealCurvature.left} title="左眼 (OS)" />
              </div>
            </section>
          )}

          {!canViewProfessionalParams && (
            <section className="drawer-section">
              <div className="param-restricted-hint">
                <span className="param-restricted-icon">🔒</span>
                <p className="param-restricted-text">角膜曲率等专业参数需验光师或复查医生权限查看</p>
              </div>
            </section>
          )}

          <section className="drawer-section">
            <h3>上次验配建议</h3>
            <p className={`drawer-recommendation ${!canViewDetailedRecords ? "recommendation-summary" : ""}`}>
              {canViewDetailedRecords
                ? comparison.prevRecord.recommendation
                : (comparison.prevRecord.summary || comparison.prevRecord.category + " · " + comparison.prevRecord.type)}
            </p>
            {!canViewDetailedRecords && (
              <p className="param-restricted-text" style={{ marginTop: "8px", fontSize: "12px" }}>
                详细医疗建议需验光师或复查医生权限查看
              </p>
            )}
          </section>

          <section className="drawer-section">
            <h3>本次验配建议</h3>
            <p className={`drawer-recommendation ${!canViewDetailedRecords ? "recommendation-summary" : ""}`}>
              {canViewDetailedRecords
                ? comparison.currRecord.recommendation
                : (comparison.currRecord.summary || comparison.currRecord.category + " · " + comparison.currRecord.type)}
            </p>
            {!canViewDetailedRecords && (
              <p className="param-restricted-text" style={{ marginTop: "8px", fontSize: "12px" }}>
                详细医疗建议需验光师或复查医生权限查看
              </p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
