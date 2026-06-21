import { useState, useMemo, useCallback, useRef } from "react";
import type { UserRole, WorkflowStep, RolePermission } from "../../types";
import type { WorkflowStepProgress, StepInfo } from "../../types";
import { ROLE_PERMISSIONS, STEP_LABELS } from "../../types";
import type { SyncablePatient, SyncStatus } from "../../sync";
import { SYNC_STATUS_COLORS, SYNC_STATUS_LABELS, SYNC_STATUS_ICONS, formatSyncTime } from "../../sync";
import { STEP_PERMISSION_MAP } from "../../types/workflow";

export function PatientCard({
  patient,
  index,
  onEdit,
  onDelete,
  onSelect,
  onSync,
  onViewError,
  onGenerateConflict,
  isSelected,
  canEdit,
  canDelete,
  workflowProgress,
  role,
  computedStepDetails
}: {
  patient: SyncablePatient;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onSync?: () => void;
  onViewError?: () => void;
  onGenerateConflict?: () => void;
  isSelected: boolean;
  canEdit: boolean;
  canDelete: boolean;
  workflowProgress?: WorkflowStepProgress | null;
  role?: UserRole;
  computedStepDetails?: Record<WorkflowStep, StepInfo>;
}) {
  const syncStatus = ((patient as any).syncStatus || "synced") as SyncStatus;
  const isSubmitting = (patient as any).isSubmitting;
  const submitCount = (patient as any).submitCount || 0;
  const syncError = (patient as any).syncError;
  const syncColor = SYNC_STATUS_COLORS[syncStatus];
  const syncLabel = isSubmitting ? "同步中..." : SYNC_STATUS_LABELS[syncStatus];
  const syncIcon = isSubmitting ? "⟳" : SYNC_STATUS_ICONS[syncStatus];

  const progressSteps: WorkflowStep[] = ["patient-profile", "initial-exam", "recheck-compare", "prescription-summary", "export"];
  const progressLabels: Record<WorkflowStep, string> = {
    "dashboard": "总览",
    "patient-profile": "建档",
    "initial-exam": "验光",
    "recheck-compare": "复查",
    "prescription-summary": "处方",
    "export": "导出"
  };

  const computeMiniStepInfo = (step: WorkflowStep): { status: string; blockReason?: string; blockDetail?: string } => {
    if (computedStepDetails && computedStepDetails[step]) {
      const s = computedStepDetails[step];
      return { status: s.status, blockReason: s.blockReason, blockDetail: s.blockDetail };
    }
    if (!role) return { status: "unknown" };
    const rolePerm = ROLE_PERMISSIONS[role];
    const permKey = STEP_PERMISSION_MAP[step];
    if (!rolePerm[permKey]) return { status: "blocked", blockReason: "permission", blockDetail: "无权限" };
    if (workflowProgress?.stepDetails?.[step]) {
      const s = workflowProgress.stepDetails[step];
      return { status: s.status, blockReason: s.blockReason, blockDetail: s.blockDetail };
    }
    if (step === "patient-profile") return { status: "completed" };
    return { status: "not-started" };
  };

  const completedCount = progressSteps.filter(s => {
    const info = computeMiniStepInfo(s);
    return info.status === "completed" || info.status === "current";
  }).length;
  const totalVisibleSteps = progressSteps.filter(s => {
    const info = computeMiniStepInfo(s);
    return info.status !== "blocked" || info.blockReason !== "permission";
  }).length;

  return (
    <article className={`patient-card patient-card-sync-${syncStatus} ${isSelected ? "patient-card-selected" : ""}`} onClick={onSelect}>
      <div className="patient-index" style={{ backgroundColor: syncColor + "20", color: syncColor }}>
        {syncIcon}
      </div>
      <div className="patient-info">
        <div className="patient-header">
          <h3>{patient.patientNo}</h3>
          <div className="patient-tags">
            <span 
              className="tag tag-sync-status"
              style={{ backgroundColor: syncColor + "15", color: syncColor, borderColor: syncColor + "40" }}
              title={`${syncLabel}${(patient as any).lastSyncedAt ? ` · 上次同步：${formatSyncTime((patient as any).lastSyncedAt)}` : ""}${submitCount > 0 ? ` · 已提交 ${submitCount} 次` : ""}`}
            >
              {syncIcon} {syncLabel}
              {submitCount > 1 && <span className="submit-count-inline"> ×{submitCount}</span>}
            </span>
            {patient.ageGroup && <span className="tag tag-primary">{patient.ageGroup}</span>}
            {patient.lensType && <span className="tag tag-accent">{patient.lensType}</span>}
          </div>
        </div>
        {patient.lastCheckDate && (
          <p className="patient-date">最近复查：{patient.lastCheckDate}</p>
        )}
        {patient.remark && <p className="patient-remark">{patient.remark}</p>}
        {role && (
          <div className="patient-progress">
            <div className="patient-progress-header" title={`已完成 ${completedCount}/${totalVisibleSteps} 个步骤${workflowProgress?.lastUpdatedAt ? ` · 最后更新：${formatSyncTime(workflowProgress.lastUpdatedAt)}` : ""}`}>
              <span className="patient-progress-title">
                📋 任务进度
                {workflowProgress?.currentStep && workflowProgress.currentStep !== "dashboard" && (
                  <span className="patient-progress-last-step">
                    · 上次：{STEP_LABELS[workflowProgress.currentStep as WorkflowStep]}
                  </span>
                )}
              </span>
              <span className="patient-progress-count">{completedCount}/{totalVisibleSteps}</span>
            </div>
            <div className="patient-progress-bar" title={`已完成 ${completedCount}/${totalVisibleSteps} 个步骤`}>
              <div
                className="patient-progress-fill"
                style={{
                  width: `${totalVisibleSteps > 0 ? (completedCount / totalVisibleSteps) * 100 : 0}%`,
                  backgroundColor: completedCount === totalVisibleSteps ? "var(--accent)" : "var(--primary)"
                }}
              />
            </div>
            <div className="patient-progress-mini-steps">
              {progressSteps.map((step) => {
                const info = computeMiniStepInfo(step);
                let stepClass = "mini-step";
                let stepIcon = "";
                let stepTitle = progressLabels[step];
                if (info.status === "completed") {
                  stepClass += " mini-step-completed";
                  stepIcon = "✓";
                } else if (info.status === "current") {
                  stepClass += " mini-step-current";
                  stepIcon = "●";
                } else if (info.status === "blocked") {
                  stepClass += " mini-step-blocked";
                  stepIcon = "🔒";
                  stepTitle += ` · ${info.blockDetail || info.blockReason || "不可用"}`;
                } else {
                  stepClass += " mini-step-pending";
                  stepIcon = "○";
                }
                return (
                  <span
                    key={step}
                    className={stepClass}
                    title={stepTitle}
                  >
                    {stepIcon}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {syncError && (
          <p 
            className="patient-sync-error" 
            onClick={e => { e.stopPropagation(); onViewError?.(); }}
            title="点击查看错误详情"
          >
            ⚠️ 同步失败：{syncError}
            <span className="view-error-link">查看详情 →</span>
          </p>
        )}
        {(canEdit || canDelete || onSync || onViewError) && (
          <div className="patient-actions" onClick={e => e.stopPropagation()}>
            {onSync && syncStatus !== "synced" && !isSubmitting && (
              <button 
                className="text-btn sync-btn" 
                onClick={onSync}
                style={{ color: syncColor }}
              >
                {syncStatus === "conflict" ? "处理冲突" : syncStatus === "failed" ? "重试同步" : "立即同步"}
              </button>
            )}
            {onViewError && syncStatus === "failed" && !isSubmitting && (
              <button 
                className="text-btn view-error-btn" 
                onClick={onViewError}
              >
                查看错误
              </button>
            )}
            {isSubmitting && (
              <span className="text-btn submitting-indicator" style={{ color: syncColor }}>
                ⟳ 同步中...
              </span>
            )}
            {onGenerateConflict && syncStatus === "synced" && !isSubmitting && (
              <button 
                className="text-btn" 
                onClick={onGenerateConflict}
                title="模拟生成冲突（测试用）"
              >
                模拟冲突
              </button>
            )}
            {canEdit && <button className="text-btn" onClick={onEdit}>编辑</button>}
            {canDelete && <button className="text-btn danger" onClick={onDelete}>删除</button>}
          </div>
        )}
      </div>
    </article>
  );
}
