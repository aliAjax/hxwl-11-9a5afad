import React from "react";
import type { SyncablePatient, SyncableRecord, SyncStats, SyncConfig } from "../../sync";
import { SYNC_STATUS_ICONS } from "../../sync";

export interface SyncPanelProps {
  open: boolean;
  onClose: () => void;
  overallSyncStats: SyncStats;
  patientSyncStats: SyncStats;
  recordSyncStats: SyncStats;
  isSyncing: boolean;
  syncProgress: { current: number; total: number };
  syncConfig: SyncConfig;
  hasPendingSync: boolean;
  patients: SyncablePatient[];
  records: SyncableRecord[];
  onSyncAll: () => void;
  onRetryFailed: () => void;
  onUpdateSyncConfig: (config: Partial<SyncConfig>) => void;
  onOpenConflict: (type: "patient" | "record", entity: any) => void;
  onOpenSyncError: (type: "patient" | "record", entity: any) => void;
  onSyncEntity: (type: "patient" | "record", id: string) => void;
}

export const SyncPanel: React.FC<SyncPanelProps> = ({
  open,
  onClose,
  overallSyncStats,
  patientSyncStats,
  recordSyncStats,
  isSyncing,
  syncProgress,
  syncConfig,
  hasPendingSync,
  patients,
  records,
  onSyncAll,
  onRetryFailed,
  onUpdateSyncConfig,
  onOpenConflict,
  onOpenSyncError,
  onSyncEntity,
}) => {
  if (!open) return null;

  return (
    <div className="sync-panel-overlay" onClick={onClose}>
      <div className="sync-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sync-panel-header">
          <h3>同步管理</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="sync-panel-body">
          <div className="sync-stats-section">
            <h4>同步状态概览</h4>
            <div className="sync-stats-grid">
              <div className="sync-stat-card synced">
                <div className="sync-stat-icon">{SYNC_STATUS_ICONS.synced}</div>
                <div className="sync-stat-info">
                  <div className="sync-stat-value">{overallSyncStats.synced}</div>
                  <div className="sync-stat-label">已同步</div>
                </div>
              </div>
              <div className="sync-stat-card pending">
                <div className="sync-stat-icon">{SYNC_STATUS_ICONS.pending}</div>
                <div className="sync-stat-info">
                  <div className="sync-stat-value">{overallSyncStats.pending}</div>
                  <div className="sync-stat-label">待同步</div>
                </div>
              </div>
              <div className="sync-stat-card conflict">
                <div className="sync-stat-icon">{SYNC_STATUS_ICONS.conflict}</div>
                <div className="sync-stat-info">
                  <div className="sync-stat-value">{overallSyncStats.conflict}</div>
                  <div className="sync-stat-label">冲突</div>
                </div>
              </div>
              <div className="sync-stat-card failed">
                <div className="sync-stat-icon">{SYNC_STATUS_ICONS.failed}</div>
                <div className="sync-stat-info">
                  <div className="sync-stat-value">{overallSyncStats.failed}</div>
                  <div className="sync-stat-label">失败</div>
                </div>
              </div>
            </div>
            <div className="sync-detail-stats">
              <div className="sync-detail-row">
                <span>患者档案</span>
                <span>已同步 {patientSyncStats.synced} / 待同步 {patientSyncStats.pending} / 冲突 {patientSyncStats.conflict} / 失败 {patientSyncStats.failed}</span>
              </div>
              <div className="sync-detail-row">
                <span>验光记录</span>
                <span>已同步 {recordSyncStats.synced} / 待同步 {recordSyncStats.pending} / 冲突 {recordSyncStats.conflict} / 失败 {recordSyncStats.failed}</span>
              </div>
            </div>
          </div>

          {isSyncing && (
            <div className="sync-progress-section">
              <h4>同步进度</h4>
              <div className="sync-progress-bar">
                <div 
                  className="sync-progress-fill"
                  style={{ width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total * 100) : 0}%` }}
                ></div>
              </div>
              <p className="sync-progress-text">{syncProgress.current} / {syncProgress.total}</p>
            </div>
          )}

          <div className="sync-actions-section">
            <h4>同步操作</h4>
            <div className="sync-actions-grid">
              <button 
                className="sync-action-btn primary"
                onClick={onSyncAll}
                disabled={isSyncing || (!hasPendingSync && overallSyncStats.conflict === 0)}
              >
                {isSyncing ? "同步中..." : "立即同步"}
              </button>
              <button 
                className="sync-action-btn secondary"
                onClick={onRetryFailed}
                disabled={isSyncing || overallSyncStats.failed === 0}
              >
                重试失败项
              </button>
            </div>
          </div>

          <div className="sync-config-section">
            <h4>模拟同步参数</h4>
            <div className="sync-config-form">
              <div className="sync-config-item">
                <label>基础延迟 (ms)</label>
                <input 
                  type="range" 
                  min="100" 
                  max="3000" 
                  step="100"
                  value={syncConfig.baseDelay}
                  onChange={(e) => onUpdateSyncConfig({ baseDelay: Number(e.target.value) })}
                />
                <span className="sync-config-value">{syncConfig.baseDelay}ms</span>
              </div>
              <div className="sync-config-item">
                <label>失败率</label>
                <input 
                  type="range" 
                  min="0" 
                  max="0.5" 
                  step="0.05"
                  value={syncConfig.failureRate}
                  onChange={(e) => onUpdateSyncConfig({ failureRate: Number(e.target.value) })}
                />
                <span className="sync-config-value">{Math.round(syncConfig.failureRate * 100)}%</span>
              </div>
              <div className="sync-config-item">
                <label>冲突率</label>
                <input 
                  type="range" 
                  min="0" 
                  max="0.3" 
                  step="0.05"
                  value={syncConfig.conflictRate}
                  onChange={(e) => onUpdateSyncConfig({ conflictRate: Number(e.target.value) })}
                />
                <span className="sync-config-value">{Math.round(syncConfig.conflictRate * 100)}%</span>
              </div>
              <div className="sync-config-item">
                <label>重复提交检测率</label>
                <input 
                  type="range" 
                  min="0" 
                  max="0.5" 
                  step="0.05"
                  value={syncConfig.duplicateSubmissionRate}
                  onChange={(e) => onUpdateSyncConfig({ duplicateSubmissionRate: Number(e.target.value) })}
                />
                <span className="sync-config-value">{Math.round(syncConfig.duplicateSubmissionRate * 100)}%</span>
              </div>
            </div>
            <p className="sync-config-hint">
              💡 以上参数用于模拟网络环境，方便测试各种同步场景。重复提交检测：多次重试时触发。
            </p>
          </div>

          <div className="sync-conflict-section">
            <h4>冲突记录</h4>
            {overallSyncStats.conflict === 0 ? (
              <p className="sync-empty-text">暂无冲突记录</p>
            ) : (
              <div className="sync-conflict-list">
                {patients.filter(p => p.syncStatus === "conflict").map(patient => (
                  <div key={patient.id} className="sync-conflict-item">
                    <div className="sync-conflict-info">
                      <span className="sync-conflict-type">患者档案</span>
                      <span className="sync-conflict-name">{patient.patientNo} · {patient.ageGroup}</span>
                    </div>
                    <button 
                      className="sync-conflict-btn"
                      onClick={() => onOpenConflict("patient", patient)}
                    >
                      处理冲突
                    </button>
                  </div>
                ))}
                {records.filter(r => r.syncStatus === "conflict").map(record => (
                  <div key={record.id} className="sync-conflict-item">
                    <div className="sync-conflict-info">
                      <span className="sync-conflict-type">验光记录</span>
                      <span className="sync-conflict-name">{record.patientNo} · {record.examDate}</span>
                    </div>
                    <button 
                      className="sync-conflict-btn"
                      onClick={() => onOpenConflict("record", record)}
                    >
                      处理冲突
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sync-failed-section">
            <h4>同步失败记录</h4>
            {overallSyncStats.failed === 0 ? (
              <p className="sync-empty-text">暂无失败记录</p>
            ) : (
              <div className="sync-failed-list">
                {patients.filter(p => p.syncStatus === "failed").map(patient => (
                  <div key={patient.id} className="sync-failed-item">
                    <div className="sync-failed-info">
                      <span className="sync-failed-type">患者档案</span>
                      <span className="sync-failed-name">{patient.patientNo}</span>
                      <p className="sync-failed-error" title={(patient as any).syncError}>
                        {(patient as any).syncError || "未知错误"}
                      </p>
                    </div>
                    <div className="sync-failed-actions">
                      <button 
                        className="text-btn"
                        onClick={() => onOpenSyncError("patient", patient)}
                      >
                        查看详情
                      </button>
                      <button 
                        className="sync-conflict-btn"
                        onClick={() => onSyncEntity("patient", patient.id)}
                        disabled={(patient as any).isSubmitting}
                      >
                        {(patient as any).isSubmitting ? "同步中..." : "重试"}
                      </button>
                    </div>
                  </div>
                ))}
                {records.filter(r => r.syncStatus === "failed").map(record => (
                  <div key={record.id} className="sync-failed-item">
                    <div className="sync-failed-info">
                      <span className="sync-failed-type">验光记录</span>
                      <span className="sync-failed-name">{record.patientNo} · {record.examDate}</span>
                      <p className="sync-failed-error" title={(record as any).syncError}>
                        {(record as any).syncError || "未知错误"}
                      </p>
                    </div>
                    <div className="sync-failed-actions">
                      <button 
                        className="text-btn"
                        onClick={() => onOpenSyncError("record", record)}
                      >
                        查看详情
                      </button>
                      <button 
                        className="sync-conflict-btn"
                        onClick={() => onSyncEntity("record", record.id)}
                        disabled={(record as any).isSubmitting}
                      >
                        {(record as any).isSubmitting ? "同步中..." : "重试"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncPanel;
