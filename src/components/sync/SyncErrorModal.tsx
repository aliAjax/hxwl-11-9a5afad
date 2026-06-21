import React from "react";
import { formatSyncTime } from "../../sync";

interface SyncErrorModalProps {
  open: boolean;
  onClose: () => void;
  syncErrorEntity: {
    type: "patient" | "record";
    entity: any;
  } | null;
  onOpenConflict: (type: "patient" | "record", entity: any) => void;
  onSyncEntity: (type: "patient" | "record", id: string) => void;
}

const SyncErrorModal: React.FC<SyncErrorModalProps> = ({
  open,
  onClose,
  syncErrorEntity,
  onOpenConflict,
  onSyncEntity,
}) => {
  if (!open || !syncErrorEntity) return null;

  const entity = syncErrorEntity.entity;
  const entityType = syncErrorEntity.type;
  const typeLabel = entityType === "patient" ? "患者档案" : "验光记录";
  const entityName = entityType === "patient"
    ? entity.patientNo
    : `${entity.patientNo} · ${entity.examDate}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>同步错误详情</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="sync-error-warning">
            <div className="sync-error-icon">✕</div>
            <div className="sync-error-text">
              <strong>同步失败</strong>
              <p>{typeLabel}「{entityName}」最近一次同步遇到错误</p>
            </div>
          </div>

          <div className="sync-error-details">
            <div className="sync-error-detail-row">
              <span className="sync-error-detail-label">错误信息</span>
              <span className="sync-error-detail-value error-text">
                {entity.syncError || "未知错误"}
              </span>
            </div>
            <div className="sync-error-detail-row">
              <span className="sync-error-detail-label">提交次数</span>
              <span className="sync-error-detail-value">
                {entity.submitCount || 0} 次
              </span>
            </div>
            <div className="sync-error-detail-row">
              <span className="sync-error-detail-label">最后尝试时间</span>
              <span className="sync-error-detail-value">
                {entity.lastSyncAttempt ? formatSyncTime(entity.lastSyncAttempt) : "—"}
              </span>
            </div>
            <div className="sync-error-detail-row">
              <span className="sync-error-detail-label">上次成功同步</span>
              <span className="sync-error-detail-value">
                {entity.lastSyncedAt ? formatSyncTime(entity.lastSyncedAt) : "从未同步"}
              </span>
            </div>
            <div className="sync-error-detail-row">
              <span className="sync-error-detail-label">本地版本</span>
              <span className="sync-error-detail-value">
                v{entity.localVersion || 1}
              </span>
            </div>
          </div>

          <div className="sync-error-hint">
            <p><strong>常见原因与解决方案：</strong></p>
            <ul>
              <li><strong>网络超时：</strong>请检查网络连接后点击"重试同步"</li>
              <li><strong>服务器错误：</strong>服务器暂时不可用，请稍后再试</li>
              <li><strong>重复提交：</strong>请等待几秒后再重试，避免频繁提交</li>
              <li><strong>数据冲突：</strong>服务端数据有更新，需处理冲突后再同步</li>
            </ul>
          </div>
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            关闭
          </button>
          <button
            className="primary-action"
            onClick={() => {
              onClose();
              if (entity.syncStatus === "conflict") {
                onOpenConflict(entityType, entity);
              } else {
                onSyncEntity(entityType, entity.id);
              }
            }}
          >
            {entity.syncStatus === "conflict" ? "处理冲突" : "重试同步"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyncErrorModal;
