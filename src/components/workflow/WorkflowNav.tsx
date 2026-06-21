import type { UserRole, WorkflowStep } from "../../types";
import { STEP_LABELS, STEP_ICONS } from "../../types";
import type { StepInfo } from "../../db";

export interface WorkflowNavProps {
  workflowSteps: WorkflowStep[];
  currentStep: WorkflowStep;
  selectedPatientNo: string | null;
  currentRole: UserRole;
  selectedPatientStepDetails?: Record<string, StepInfo>;
  computeStepInfo: (step: WorkflowStep, patientNo: string | null, role: UserRole) => StepInfo;
  onStepChange: (step: WorkflowStep) => void;
}

export function WorkflowNav({
  workflowSteps,
  currentStep,
  selectedPatientNo,
  currentRole,
  selectedPatientStepDetails = {},
  computeStepInfo,
  onStepChange,
}: WorkflowNavProps) {
  return (
    <nav className="workflow-nav">
      {workflowSteps.map((step) => {
        const stepInfo = selectedPatientStepDetails[step] || computeStepInfo(step, selectedPatientNo, currentRole);
        const isBlocked = stepInfo.status === "blocked";
        const isCompleted = stepInfo.status === "completed" && currentStep !== step;
        const isCurrent = currentStep === step;
        let statusClass = "";
        if (isCurrent) statusClass = "workflow-nav-active";
        else if (isCompleted) statusClass = "workflow-nav-completed";
        else if (isBlocked) statusClass = "workflow-nav-blocked";

        const statusIcon = isBlocked ? "🔒" : isCompleted ? "✅" : "";

        return (
          <button
            key={step}
            className={`workflow-nav-item ${statusClass}`}
            onClick={() => !isBlocked && onStepChange(step)}
            disabled={isBlocked}
            title={stepInfo.blockDetail || (isCompleted ? "已完成" : isCurrent ? "当前步骤" : "")}
          >
            <span className="workflow-nav-icon">
              {STEP_ICONS[step]}
              {statusIcon && <span className="workflow-nav-status">{statusIcon}</span>}
            </span>
            <span className="workflow-nav-label">{STEP_LABELS[step]}</span>
          </button>
        );
      })}
    </nav>
  );
}
