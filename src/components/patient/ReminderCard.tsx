import { useState, useEffect } from "react";
import type { PatientReminder } from "../../types";
import type { SyncStatus } from "../../sync";
import { SYNC_STATUS_COLORS, SYNC_STATUS_LABELS, SYNC_STATUS_ICONS, formatSyncTime } from "../../sync";

export function ReminderCard({
  reminder,
  index,
  isCustom,
  onCycleChange,
  onCycleReset,
  canEditCycle,
  onSync,
  onGenerateConflict,
  isSelected,
  onToggleSelect,
  selectionMode
}: {
  reminder: PatientReminder;
  index: number;
  isCustom: boolean;
  onCycleChange: (days: number) => void;
  onCycleReset: () => void;
  canEditCycle: boolean;
  onSync?: () => void;
  onGenerateConflict?: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
}) {
  const syncStatus = ((reminder as any).syncStatus || "synced") as SyncStatus;
  const isSubmitting = (reminder as any).isSubmitting;
  const submitCount = (reminder as any).submitCount || 0;
  const syncColor = SYNC_STATUS_COLORS[syncStatus];
  const syncIcon = isSubmitting ? "⟳" : SYNC_STATUS_ICONS[syncStatus];
  const syncLabel = isSubmitting ? "同步中..." : SYNC_STATUS_LABELS[syncStatus];

  const statusConfig = {
    overdue: { label: "已逾期", className: "status-danger", textClass: "text-danger", daysText: `逾期 ${Math.abs(reminder.daysUntilNext)} 天` },
    upcoming: { label: "即将到期", className: "status-watch", textClass: "text-watch", daysText: `还剩 ${reminder.daysUntilNext} 天` },
    normal: { label: "正常", className: "status-ok", textClass: "text-ok", daysText: `还剩 ${reminder.daysUntilNext} 天` },
  };

  const config = statusConfig[reminder.reminderStatus];
  const [editingCycle, setEditingCycle] = useState(false);
  const [cycleInput, setCycleInput] = useState(String(reminder.reminderCycle));

  useEffect(() => {
    setCycleInput(String(reminder.reminderCycle));
  }, [reminder.reminderCycle]);

  const handleSaveCycle = () => {
    const days = parseInt(cycleInput, 10);
    if (!isNaN(days) && days >= 1 && days <= 3650) {
      onCycleChange(days);
    } else {
      setCycleInput(String(reminder.reminderCycle));
    }
    setEditingCycle(false);
  };

  const handleCancelCycle = () => {
    setCycleInput(String(reminder.reminderCycle));
    setEditingCycle(false);
  };

  return (
    <article className={`reminder-card reminder-${reminder.reminderStatus} reminder-sync-${syncStatus} ${isSelected ? "reminder-selected" : ""} ${selectionMode ? "reminder-card-with-selection" : ""}`}>
      {selectionMode && (
        <div className="reminder-select-wrap" onClick={(e) => e.stopPropagation()}>
          <label className="reminder-select-label">
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={() => onToggleSelect && onToggleSelect()}
            />
          </label>
        </div>
      )}
      <div className={`reminder-index ${config.className}`} style={syncStatus !== "synced" ? { backgroundColor: syncColor + "20", color: syncColor } : undefined}>
        {syncStatus !== "synced" ? syncIcon : String(index + 1).padStart(2, "0")}
      </div>
      <div className="reminder-info">
        <div className="reminder-header">
          <h3>{reminder.patientNo}</h3>
          <div className="reminder-header-right">
            {(syncStatus !== "synced" || isSubmitting) && (
              <span
                className="tag tag-sync-status"
                style={{ backgroundColor: syncColor + "15", color: syncColor, borderColor: syncColor + "40" }}
                title={`${syncLabel}${(reminder as any).lastSyncedAt ? ` · 上次同步：${formatSyncTime((reminder as any).lastSyncedAt)}` : ""}${submitCount > 0 ? ` · 已提交 ${submitCount} 次` : ""}`}
              >
                {syncIcon} {syncLabel}
                {submitCount > 1 && <span className="submit-count-inline"> ×{submitCount}</span>}
              </span>
            )}
            <span className={`reminder-status ${config.textClass}`}>{config.label}</span>
          </div>
        </div>
        <div className="reminder-tags">
          {reminder.ageGroup && <span className="tag tag-primary">{reminder.ageGroup}</span>}
          {reminder.lensType && <span className="tag tag-accent">{reminder.lensType}</span>}
          {canEditCycle && editingCycle ? (
            <span className="tag tag-cycle tag-editing">
              <input
                type="number"
                min="1"
                max="3650"
                value={cycleInput}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCycleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveCycle();
                  if (e.key === "Escape") handleCancelCycle();
                  e.stopPropagation();
                }}
              />
              <span>天</span>
              <button className="cycle-btn cycle-ok" onClick={(e) => { e.stopPropagation(); handleSaveCycle(); }}>✓</button>
              <button className="cycle-btn cycle-cancel" onClick={(e) => { e.stopPropagation(); handleCancelCycle(); }}>✗</button>
            </span>
          ) : canEditCycle ? (
            <span className={`tag tag-cycle ${isCustom ? "cycle-custom" : ""}`} onClick={(e) => { e.stopPropagation(); setEditingCycle(true); }} title="点击修改复查周期">
              周期 {reminder.reminderCycle} 天{isCustom ? " · 自定义" : ""}
            </span>
          ) : (
            <span className="tag tag-cycle">
              周期 {reminder.reminderCycle} 天{isCustom ? " · 自定义" : ""}
            </span>
          )}
          {isCustom && !editingCycle && canEditCycle && (
            <button className="cycle-reset-btn" onClick={(e) => { e.stopPropagation(); onCycleReset(); }} title="恢复默认周期">
              重置
            </button>
          )}
        </div>
        <div className="reminder-dates">
          <p className="reminder-date">上次复查：{reminder.lastCheckDate}</p>
          <p className={`reminder-due ${config.textClass}`}>下次复查：{reminder.nextCheckDate} · {config.daysText}</p>
        </div>
        {reminder.remark && <p className="patient-remark">{reminder.remark}</p>}
        {(reminder as any).syncError && (
          <p className="patient-sync-error" title={(reminder as any).syncError}>
            ⚠️ 同步失败：{(reminder as any).syncError}
          </p>
        )}
        {(onSync && syncStatus !== "synced" && !isSubmitting) || (onGenerateConflict && syncStatus === "synced" && !isSubmitting) || isSubmitting ? (
          <div className="reminder-sync-actions" onClick={e => e.stopPropagation()}>
            {isSubmitting && (
              <span className="text-btn submitting-indicator" style={{ color: syncColor }}>
                ⟳ 同步中...
              </span>
            )}
            {onSync && syncStatus !== "synced" && !isSubmitting && (
              <button className="text-btn sync-btn" onClick={onSync} style={{ color: syncColor }}>
                {syncStatus === "conflict" ? "处理冲突" : syncStatus === "failed" ? "重试同步" : "立即同步"}
              </button>
            )}
            {onGenerateConflict && syncStatus === "synced" && !isSubmitting && (
              <button className="text-btn" onClick={onGenerateConflict} title="模拟生成冲突（测试用）">
                模拟冲突
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
