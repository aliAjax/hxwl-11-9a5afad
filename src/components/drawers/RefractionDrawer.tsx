import React, { useCallback, useEffect, useMemo } from "react";
import type { RefractionRecord, EyeRefraction } from "../../types";
import { formatDiff, getVisibleRecordSummary } from "../../utils";

export function RefractionDrawer({
  record,
  previousRecord,
  allRecords,
  open,
  onClose,
  onNavigate,
  canViewProfessionalParams = true,
  canViewDetailedRecords = true
}: {
  record: RefractionRecord | null;
  previousRecord: RefractionRecord | null;
  allRecords: RefractionRecord[];
  open: boolean;
  onClose: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
  canViewProfessionalParams?: boolean;
  canViewDetailedRecords?: boolean;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onNavigate) onNavigate("prev");
      if (e.key === "ArrowRight" && onNavigate) onNavigate("next");
    },
    [onClose, onNavigate]
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

  const patientRecords = useMemo(() => {
    if (!record) return [];
    return allRecords
      .filter(r => r.patientNo === record.patientNo)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
  }, [record, allRecords]);

  const currentIndex = useMemo(() => {
    if (!record || patientRecords.length === 0) return -1;
    return patientRecords.findIndex(r => r.id === record.id);
  }, [record, patientRecords]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < patientRecords.length - 1;

  const isChanged = useCallback((currentVal: any, prevVal: any): boolean => {
    if (!previousRecord) return false;
    return JSON.stringify(currentVal) !== JSON.stringify(prevVal);
  }, [previousRecord]);

  const getEyeChanged = useCallback((eyeKey: "rightEye" | "leftEye"): Set<string> => {
    const changed = new Set<string>();
    if (!previousRecord || !record) return changed;
    const curr = record[eyeKey];
    const prev = previousRecord[eyeKey];
    (Object.keys(curr) as (keyof EyeRefraction)[]).forEach(key => {
      if (curr[key] !== prev[key]) changed.add(key);
    });
    return changed;
  }, [previousRecord, record]);

  const rightEyeChanged = useMemo(() => getEyeChanged("rightEye"), [getEyeChanged]);
  const leftEyeChanged = useMemo(() => getEyeChanged("leftEye"), [getEyeChanged]);

  const curvatureChanged = useMemo(() => {
    const changed: { right: Set<string>; left: Set<string> } = { right: new Set(), left: new Set() };
    if (!previousRecord || !record) return changed;
    const sides: ("right" | "left")[] = ["right", "left"];
    sides.forEach(side => {
      const keys: ("horizontal" | "vertical")[] = ["horizontal", "vertical"];
      keys.forEach(key => {
        if (record.cornealCurvature[side][key] !== previousRecord.cornealCurvature[side][key]) {
          changed[side].add(key);
        }
      });
    });
    return changed;
  }, [previousRecord, record]);

  if (!open) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>验光记录详情</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {record ? (
          <>
            <div className="drawer-nav">
              <div className="drawer-nav-info">
                <span className="drawer-nav-count">
                  {patientRecords.length > 0
                    ? `第 ${currentIndex + 1} / ${patientRecords.length} 条`
                    : "共 0 条"
                  }
                </span>
                {patientRecords.length <= 1 && (
                  <span className="drawer-nav-empty-hint">该患者暂无其他历史记录</span>
                )}
              </div>
              <div className="drawer-nav-buttons">
                <button
                  className="drawer-nav-btn"
                  disabled={!hasPrev}
                  onClick={() => onNavigate && onNavigate("prev")}
                  title="上一条 (←)"
                >
                  ← 上一条
                </button>
                <button
                  className="drawer-nav-btn"
                  disabled={!hasNext}
                  onClick={() => onNavigate && onNavigate("next")}
                  title="下一条 (→)"
                >
                  下一条 →
                </button>
              </div>
            </div>

            {patientRecords.length <= 1 && (
              <div className="drawer-empty-state-inline">
                <span className="empty-state-icon">📋</span>
                <div className="empty-state-content">
                  <p className="empty-state-title">暂无同患者其他历史记录</p>
                  <p className="empty-state-desc">该患者目前仅有这一条验光记录，无法切换对比。</p>
                </div>
              </div>
            )}

            <div className="drawer-body">
              <section className="drawer-section">
                <h3>患者基础信息</h3>
                <div className="drawer-info-grid">
                  <div className="drawer-info-item">
                    <span className="drawer-label">患者编号</span>
                    <span className="drawer-value">{record.patientNo}</span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">姓名</span>
                    <span className="drawer-value">{record.patientName}</span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">年龄段</span>
                    <span className="drawer-value">{record.ageGroup}</span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">性别</span>
                    <span className="drawer-value">{record.gender}</span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">检查日期</span>
                    <span className={`drawer-value ${isChanged(record.examDate, previousRecord?.examDate) ? "changed-highlight" : ""}`}>
                      {record.examDate}
                      {isChanged(record.examDate, previousRecord?.examDate) && (
                        <span className="change-indicator" title={`上次: ${previousRecord?.examDate}`}>●</span>
                      )}
                    </span>
                  </div>
                  <div className="drawer-info-item">
                    <span className="drawer-label">类型</span>
                    <span className={`drawer-value ${isChanged(record.type, previousRecord?.type) ? "changed-highlight" : ""}`}>
                      {record.type}
                      {isChanged(record.type, previousRecord?.type) && (
                        <span className="change-indicator" title={`上次: ${previousRecord?.type}`}>●</span>
                      )}
                    </span>
                  </div>
                </div>
              </section>

              {canViewDetailedRecords && (
                <>
                  <section className="drawer-section">
                    <h3>屈光参数</h3>
                    <div className="drawer-eye-tables">
                      <div className="drawer-eye-block">
                        <p className="drawer-eye-title">右眼 (OD)</p>
                        <div className="drawer-param-grid">
                          <div className={`drawer-param-item ${rightEyeChanged.has("nakedVision") ? "changed-row" : ""}`}>
                            <span className="drawer-label">裸眼视力</span>
                            <span className="drawer-value">
                              {record.rightEye.nakedVision}
                              {rightEyeChanged.has("nakedVision") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.nakedVision}`}>
                                  {formatDiff(parseFloat(record.rightEye.nakedVision) - parseFloat(previousRecord?.rightEye.nakedVision || "0"))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("correctedVision") ? "changed-row" : ""}`}>
                            <span className="drawer-label">矫正视力</span>
                            <span className="drawer-value">
                              {record.rightEye.correctedVision}
                              {rightEyeChanged.has("correctedVision") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.correctedVision}`}>
                                  {formatDiff(parseFloat(record.rightEye.correctedVision) - parseFloat(previousRecord?.rightEye.correctedVision || "0"))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("sphere") ? "changed-row" : ""}`}>
                            <span className="drawer-label">球镜</span>
                            <span className="drawer-value">
                              {record.rightEye.sphere}D
                              {rightEyeChanged.has("sphere") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.sphere}D`}>
                                  {formatDiff(parseFloat(record.rightEye.sphere) - parseFloat(previousRecord?.rightEye.sphere || "0"), "D")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("cylinder") ? "changed-row" : ""}`}>
                            <span className="drawer-label">柱镜</span>
                            <span className="drawer-value">
                              {record.rightEye.cylinder}D
                              {rightEyeChanged.has("cylinder") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.cylinder}D`}>
                                  {formatDiff(parseFloat(record.rightEye.cylinder) - parseFloat(previousRecord?.rightEye.cylinder || "0"), "D")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("axis") ? "changed-row" : ""}`}>
                            <span className="drawer-label">轴位</span>
                            <span className="drawer-value">
                              {record.rightEye.axis}°
                              {rightEyeChanged.has("axis") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.axis}°`}>
                                  {formatDiff(parseFloat(record.rightEye.axis) - parseFloat(previousRecord?.rightEye.axis || "0"), "°", 0)}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${rightEyeChanged.has("add") ? "changed-row" : ""}`}>
                            <span className="drawer-label">ADD</span>
                            <span className="drawer-value">
                              {record.rightEye.add ? record.rightEye.add + "D" : "—"}
                              {rightEyeChanged.has("add") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.rightEye.add ? previousRecord.rightEye.add + "D" : "—"}`}>
                                  {formatDiff(
                                    (parseFloat(record.rightEye.add || "0") || 0) -
                                      (parseFloat(previousRecord?.rightEye.add || "0") || 0),
                                    "D"
                                  )}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="drawer-eye-block">
                        <p className="drawer-eye-title">左眼 (OS)</p>
                        <div className="drawer-param-grid">
                          <div className={`drawer-param-item ${leftEyeChanged.has("nakedVision") ? "changed-row" : ""}`}>
                            <span className="drawer-label">裸眼视力</span>
                            <span className="drawer-value">
                              {record.leftEye.nakedVision}
                              {leftEyeChanged.has("nakedVision") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.nakedVision}`}>
                                  {formatDiff(parseFloat(record.leftEye.nakedVision) - parseFloat(previousRecord?.leftEye.nakedVision || "0"))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("correctedVision") ? "changed-row" : ""}`}>
                            <span className="drawer-label">矫正视力</span>
                            <span className="drawer-value">
                              {record.leftEye.correctedVision}
                              {leftEyeChanged.has("correctedVision") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.correctedVision}`}>
                                  {formatDiff(parseFloat(record.leftEye.correctedVision) - parseFloat(previousRecord?.leftEye.correctedVision || "0"))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("sphere") ? "changed-row" : ""}`}>
                            <span className="drawer-label">球镜</span>
                            <span className="drawer-value">
                              {record.leftEye.sphere}D
                              {leftEyeChanged.has("sphere") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.sphere}D`}>
                                  {formatDiff(parseFloat(record.leftEye.sphere) - parseFloat(previousRecord?.leftEye.sphere || "0"), "D")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("cylinder") ? "changed-row" : ""}`}>
                            <span className="drawer-label">柱镜</span>
                            <span className="drawer-value">
                              {record.leftEye.cylinder}D
                              {leftEyeChanged.has("cylinder") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.cylinder}D`}>
                                  {formatDiff(parseFloat(record.leftEye.cylinder) - parseFloat(previousRecord?.leftEye.cylinder || "0"), "D")}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("axis") ? "changed-row" : ""}`}>
                            <span className="drawer-label">轴位</span>
                            <span className="drawer-value">
                              {record.leftEye.axis}°
                              {leftEyeChanged.has("axis") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.axis}°`}>
                                  {formatDiff(parseFloat(record.leftEye.axis) - parseFloat(previousRecord?.leftEye.axis || "0"), "°", 0)}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className={`drawer-param-item ${leftEyeChanged.has("add") ? "changed-row" : ""}`}>
                            <span className="drawer-label">ADD</span>
                            <span className="drawer-value">
                              {record.leftEye.add ? record.leftEye.add + "D" : "—"}
                              {leftEyeChanged.has("add") && (
                                <span className="change-diff" title={`上次: ${previousRecord?.leftEye.add ? previousRecord.leftEye.add + "D" : "—"}`}>
                                  {formatDiff(
                                    (parseFloat(record.leftEye.add || "0") || 0) -
                                      (parseFloat(previousRecord?.leftEye.add || "0") || 0),
                                    "D"
                                  )}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="drawer-section">
                    <h3>瞳距</h3>
                    <div className="drawer-info-grid">
                      <div className="drawer-info-item">
                        <span className="drawer-label">瞳距 (PD)</span>
                        <span className={`drawer-value drawer-value-lg ${isChanged(record.pd, previousRecord?.pd) ? "changed-highlight" : ""}`}>
                          {record.pd}mm
                          {isChanged(record.pd, previousRecord?.pd) && (
                            <span className="change-indicator-lg" title={`上次: ${previousRecord?.pd}mm`}>●</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {!canViewDetailedRecords && (
                <section className="drawer-section">
                  <div className="param-restricted-hint">
                    <span className="param-restricted-icon">🔒</span>
                    <p className="param-restricted-text">屈光参数、轴位和瞳距需验光师或复查医生权限查看</p>
                  </div>
                </section>
              )}

              {canViewProfessionalParams && (
                <section className="drawer-section">
                  <h3>角膜曲率</h3>
                  <div className="drawer-eye-tables">
                    <div className="drawer-eye-block">
                      <p className="drawer-eye-title">右眼 (OD)</p>
                      <div className="drawer-param-grid">
                        <div className={`drawer-param-item ${curvatureChanged.right.has("horizontal") ? "changed-row" : ""}`}>
                          <span className="drawer-label">水平曲率</span>
                          <span className="drawer-value">
                            {record.cornealCurvature.right.horizontal}D
                            {curvatureChanged.right.has("horizontal") && (
                              <span className="change-diff" title={`上次: ${previousRecord?.cornealCurvature.right.horizontal}D`}>
                                {formatDiff(
                                  parseFloat(record.cornealCurvature.right.horizontal) -
                                    parseFloat(previousRecord?.cornealCurvature.right.horizontal || "0"),
                                  "D"
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className={`drawer-param-item ${curvatureChanged.right.has("vertical") ? "changed-row" : ""}`}>
                          <span className="drawer-label">垂直曲率</span>
                          <span className="drawer-value">
                            {record.cornealCurvature.right.vertical}D
                            {curvatureChanged.right.has("vertical") && (
                              <span className="change-diff" title={`上次: ${previousRecord?.cornealCurvature.right.vertical}D`}>
                                {formatDiff(
                                  parseFloat(record.cornealCurvature.right.vertical) -
                                    parseFloat(previousRecord?.cornealCurvature.right.vertical || "0"),
                                  "D"
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="drawer-eye-block">
                      <p className="drawer-eye-title">左眼 (OS)</p>
                      <div className="drawer-param-grid">
                        <div className={`drawer-param-item ${curvatureChanged.left.has("horizontal") ? "changed-row" : ""}`}>
                          <span className="drawer-label">水平曲率</span>
                          <span className="drawer-value">
                            {record.cornealCurvature.left.horizontal}D
                            {curvatureChanged.left.has("horizontal") && (
                              <span className="change-diff" title={`上次: ${previousRecord?.cornealCurvature.left.horizontal}D`}>
                                {formatDiff(
                                  parseFloat(record.cornealCurvature.left.horizontal) -
                                    parseFloat(previousRecord?.cornealCurvature.left.horizontal || "0"),
                                  "D"
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className={`drawer-param-item ${curvatureChanged.left.has("vertical") ? "changed-row" : ""}`}>
                          <span className="drawer-label">垂直曲率</span>
                          <span className="drawer-value">
                            {record.cornealCurvature.left.vertical}D
                            {curvatureChanged.left.has("vertical") && (
                              <span className="change-diff" title={`上次: ${previousRecord?.cornealCurvature.left.vertical}D`}>
                                {formatDiff(
                                  parseFloat(record.cornealCurvature.left.vertical) -
                                    parseFloat(previousRecord?.cornealCurvature.left.vertical || "0"),
                                  "D"
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
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
                <h3>验配建议</h3>
                <p className={`drawer-recommendation ${!canViewDetailedRecords ? "recommendation-summary" : ""}`}>
                  {canViewDetailedRecords
                    ? record.recommendation
                    : getVisibleRecordSummary(record, false)}
                </p>
                {!canViewDetailedRecords && (
                  <p className="param-restricted-text" style={{ marginTop: "8px", fontSize: "12px" }}>
                    详细医疗建议需验光师或复查医生权限查看
                  </p>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="drawer-empty">
            <p>暂无验光记录数据</p>
            <p className="empty-hint">请选择一条近期记录查看详情</p>
          </div>
        )}
      </aside>
    </div>
  );
}
