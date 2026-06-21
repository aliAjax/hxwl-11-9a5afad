import type { UserRole, WorkflowStep } from "../../types";
import { STEP_LABELS, STEP_ICONS } from "../../types";
import type { StepInfo } from "../../db";

export interface WorkflowFlowStepsProps {
  selectedPatientNo: string | null;
  currentRole: UserRole;
  currentStep: WorkflowStep;
  selectedPatientStepDetails?: Record<string, StepInfo>;
  computeStepInfo: (step: WorkflowStep, patientNo: string | null, role: UserRole) => StepInfo;
  onStepChange?: (step: WorkflowStep) => void;
  onBackToDashboard?: () => void;
}

export function WorkflowFlowSteps({
  selectedPatientNo,
  currentRole,
  currentStep,
  selectedPatientStepDetails = {},
  computeStepInfo,
  onStepChange,
  onBackToDashboard,
}: WorkflowFlowStepsProps) {
  return (
    <>
      <div className="workflow-flow-summary">
        <h3 className="workflow-section-title">验光流程闭环完成</h3>
        <div className="workflow-flow-steps">
          {(["patient-profile", "initial-exam", "recheck-compare", "prescription-summary", "export"] as WorkflowStep[]).map((step, idx) => {
            const stepInfo = selectedPatientStepDetails[step] || computeStepInfo(step, selectedPatientNo, currentRole);
            const isBlocked = stepInfo.status === "blocked";
            const isCompleted = stepInfo.status === "completed";
            const isCurrent = step === currentStep;
            let stepClass = "";
            if (isCurrent) stepClass = "step-active";
            else if (isCompleted) stepClass = "step-done";
            else if (isBlocked) stepClass = "step-blocked";

            const stepStatusIcon = isBlocked ? "🔒" : isCompleted ? "✓" : "";
            return (
              <div
                key={step}
                className={`workflow-flow-step ${stepClass}`}
                title={stepInfo.blockDetail || (isCompleted ? "已完成" : isCurrent ? "当前步骤" : "待完成")}
              >
                <span className="workflow-flow-icon">
                  {STEP_ICONS[step]}
                  {stepStatusIcon && <span className="step-status-badge">{stepStatusIcon}</span>}
                </span>
                <span className="workflow-flow-label">{STEP_LABELS[step]}</span>
                {idx < 4 && <span className="workflow-flow-arrow">→</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="workflow-next-step">
        <button className="ghost-btn" onClick={() => onStepChange && onStepChange("prescription-summary")}>
          ← 返回处方摘要
        </button>
        <button
          className="primary-action"
          onClick={() => {
            onBackToDashboard && onBackToDashboard();
          }}
        >
          🏠 返回工作台首页
        </button>
      </div>
    </>
  );
}
