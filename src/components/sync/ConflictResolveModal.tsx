import React from "react";
import {
  computeFieldDiffs,
  type FieldDiff,
  type FieldChoice,
  type FieldResolution,
  type MergeHistoryItem,
} from "../../sync";

interface ConflictResolveModalProps {
  open: boolean;
  onClose: () => void;
  conflictEntity: {
    type: "patient" | "record";
    entity: any;
  } | null;
  fieldResolutions: Record<string, "local" | "server">;
  setFieldResolutions: React.Dispatch<React.SetStateAction<Record<string, "local" | "server">>>;
  onResolveConflict: (type: "patient" | "record", id: string, keepLocal: boolean, resolutions?: any[]) => void;
}

const ConflictResolveModal: React.FC<ConflictResolveModalProps> = ({
  open,
  onClose,
  conflictEntity,
  fieldResolutions,
  setFieldResolutions,
  onResolveConflict,
}) => {
  if (!open || !conflictEntity) return null;

  const fieldDiffs = computeFieldDiffs(
    conflictEntity.type,
    conflictEntity.entity,
    conflictEntity.entity.conflictData?.serverData
  );
  const changedFields = fieldDiffs.filter((d) => d.isDifferent);
  const unchangedFields = fieldDiffs.filter((d) => !d.isDifferent);
  const mergeHistory: MergeHistoryItem[] = conflictEntity.entity.conflictData?.mergeHistory || [];

  const handleFieldChoiceChange = (field: string, choice: FieldChoice) => {
    setFieldResolutions((prev) => ({
      ...prev,
      [field]: choice,
    }));
  };

  const handleSelectAllLocal = () => {
    const allLocal: Record<string, FieldChoice> = {};
    changedFields.forEach((diff) => {
      allLocal[diff.field] = "local";
    });
    setFieldResolutions(allLocal);
  };

  const handleSelectAllServer = () => {
    const allServer: Record<string, FieldChoice> = {};
    changedFields.forEach((diff) => {
      allServer[diff.field] = "server";
    });
    setFieldResolutions(allServer);
  };

  const handleToggleAll = () => {
    const toggled: Record<string, FieldChoice> = {};
    changedFields.forEach((diff) => {
      const current = fieldResolutions[diff.field] || "local";
      toggled[diff.field] = current === "local" ? "server" : "local";
    });
    setFieldResolutions(toggled);
  };

  const handleMerge = () => {
    const resolutions: FieldResolution[] = changedFields.map((diff) => ({
      field: diff.field,
      choice: fieldResolutions[diff.field] || "local",
    }));
    onResolveConflict(conflictEntity.type, conflictEntity.entity.id, true, resolutions);
  };

  const localCount = Object.values(fieldResolutions).filter((c) => c === "local").length;
  const serverCount = Object.values(fieldResolutions).filter((c) => c === "server").length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-xl conflict-merge-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>字段级冲突合并</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="conflict-warning">
            <div className="conflict-warning-icon">⚠️</div>
            <div className="conflict-warning-text">
              <strong>检测到数据冲突</strong>
              <p>该记录的本地版本与服务端版本不一致。请逐项选择保留哪一侧的值，或使用快捷操作批量选择。</p>
            </div>
          </div>

          <div className="conflict-meta-row">
            <span className="conflict-meta-item">
              <span className="conflict-version-badge local-badge">本地</span>
              v{conflictEntity.entity.localVersion}
            </span>
            <span className="conflict-meta-sep">→</span>
            <span className="conflict-meta-item">
              <span className="conflict-version-badge server-badge">服务端</span>
              v{conflictEntity.entity.conflictData?.serverData?.serverVersion || "?"}
            </span>
            <span className="conflict-meta-item conflict-type-label">
              冲突类型：
              {conflictEntity.entity.conflictData?.conflictType === "update-update"
                ? "双方更新"
                : conflictEntity.entity.conflictData?.conflictType === "update-delete"
                ? "本地更新/服务端删除"
                : "本地删除/服务端更新"}
            </span>
          </div>

          {mergeHistory.length > 0 && (
            <div className="merge-history-section">
              <div
                className="merge-history-header"
                onClick={() => {
                  const details = document.querySelector(".merge-history-details") as HTMLDetailsElement;
                  if (details) details.open = !details.open;
                }}
              >
                <span className="merge-history-icon">📋</span>
                <span>历史合并记录（{mergeHistory.length} 次）</span>
                <span className="merge-history-toggle">▼</span>
              </div>
              <details className="merge-history-details">
                <summary style={{ display: "none" }}></summary>
                <div className="merge-history-list">
                  {mergeHistory.map((history, idx) => (
                    <div key={idx} className="merge-history-item">
                      <div className="merge-history-time">
                        {new Date(history.mergeTimestamp).toLocaleString("zh-CN")}
                      </div>
                      <div className="merge-history-version">
                        服务端版本: v{history.serverVersionAtMerge}
                      </div>
                      <div className="merge-history-resolutions">
                        {history.resolutions.map((r, ridx) => (
                          <span key={ridx} className={`merge-resolution-tag ${r.choice}`}>
                            {r.field}: {r.choice === "local" ? "本地" : "服务端"}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {changedFields.length > 0 && (
            <div className="conflict-diff-section">
              <div className="conflict-diff-header-row">
                <h4 className="conflict-diff-title">变更字段（{changedFields.length} 处差异）</h4>
                <div className="conflict-bulk-actions">
                  <button className="bulk-action-btn" onClick={handleSelectAllLocal}>
                    全选本地
                  </button>
                  <button className="bulk-action-btn" onClick={handleSelectAllServer}>
                    全选服务端
                  </button>
                  <button className="bulk-action-btn" onClick={handleToggleAll}>
                    反选
                  </button>
                </div>
              </div>

              <div className="conflict-merge-summary">
                <span className="merge-summary-item local">
                  保留本地: <strong>{localCount}</strong> 项
                </span>
                <span className="merge-summary-item server">
                  采用服务端: <strong>{serverCount}</strong> 项
                </span>
                <span className="merge-summary-item pending">
                  未选择: <strong>{changedFields.length - localCount - serverCount}</strong> 项
                </span>
              </div>

              <div className="conflict-merge-table">
                <div className="conflict-merge-header">
                  <span className="merge-col-field">字段</span>
                  <span className="merge-col-choice">选择</span>
                  <span className="merge-col-local">本地值</span>
                  <span className="merge-col-server">服务端值</span>
                </div>
                {changedFields.map((diff) => {
                  const choice = fieldResolutions[diff.field] || "local";
                  return (
                    <div key={diff.field} className={`conflict-merge-row merge-choice-${choice}`}>
                      <span className="merge-col-field">{diff.label}</span>
                      <span className="merge-col-choice">
                        <div className="choice-toggle-group">
                          <button
                            className={`choice-toggle ${choice === "local" ? "active local" : ""}`}
                            onClick={() => handleFieldChoiceChange(diff.field, "local")}
                            title="保留本地值"
                          >
                            本地
                          </button>
                          <button
                            className={`choice-toggle ${choice === "server" ? "active server" : ""}`}
                            onClick={() => handleFieldChoiceChange(diff.field, "server")}
                            title="采用服务端值"
                          >
                            服务端
                          </button>
                        </div>
                      </span>
                      <span className={`merge-col-local ${choice === "local" ? "selected" : ""}`}>
                        {String(diff.localValue)}
                      </span>
                      <span className={`merge-col-server ${choice === "server" ? "selected" : ""}`}>
                        {String(diff.serverValue)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {unchangedFields.length > 0 && (
            <details className="conflict-unchanged-section">
              <summary>未变更字段（{unchangedFields.length} 处一致）</summary>
              <div className="conflict-diff-table">
                <div className="conflict-diff-header">
                  <span className="diff-col-label">字段</span>
                  <span className="diff-col-local">本地值</span>
                  <span className="diff-col-server">服务端值</span>
                </div>
                {unchangedFields.map((diff) => (
                  <div key={diff.field} className="conflict-diff-row diff-unchanged">
                    <span className="diff-col-label">{diff.label}</span>
                    <span className="diff-col-local">{String(diff.localValue)}</span>
                    <span className="diff-col-server">{String(diff.serverValue)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="conflict-diff-hint">
            <p><strong>合并说明：</strong></p>
            <ul>
              <li><span className="choice-indicator local">本地</span> 选中时，该字段将保留本地修改的值</li>
              <li><span className="choice-indicator server">服务端</span> 选中时，该字段将采用服务端更新的值</li>
              <li>确认合并后，系统将按照您的选择组合生成最终记录</li>
              <li>合并后的记录将重新进入待同步状态，等待同步到服务端</li>
              <li>如再次同步时遇到新的冲突，历史合并记录会被保留供参考</li>
            </ul>
          </div>
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            稍后处理
          </button>
          <button
            className="secondary-btn"
            onClick={() => onResolveConflict(conflictEntity.type, conflictEntity.entity.id, false)}
          >
            全部采用服务端
          </button>
          <button
            className="secondary-btn"
            onClick={() => onResolveConflict(conflictEntity.type, conflictEntity.entity.id, true)}
          >
            全部保留本地
          </button>
          <button className="primary-action merge-confirm-btn" onClick={handleMerge}>
            ✓ 确认字段级合并
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConflictResolveModal;
