import type { SyncableRecord, SyncStatus } from "../../sync";
import { SYNC_STATUS_COLORS, SYNC_STATUS_ICONS, SYNC_STATUS_LABELS, formatSyncTime } from "../../sync";

export function RecordSyncIndicator({
  record,
  onSync,
  onViewError,
  onGenerateConflict
}: {
  record: SyncableRecord;
  onSync?: () => void;
  onViewError?: () => void;
  onGenerateConflict?: () => void;
}) {
  const syncStatus = ((record as any).syncStatus || "synced") as SyncStatus;
  const isSubmitting = (record as any).isSubmitting;
  const submitCount = (record as any).submitCount || 0;
  const syncError = (record as any).syncError;
  if (syncStatus === "synced" && !onGenerateConflict && !isSubmitting) return null;

  const syncColor = SYNC_STATUS_COLORS[syncStatus];
  const syncIcon = isSubmitting ? "⟳" : SYNC_STATUS_ICONS[syncStatus];
  const syncLabel = isSubmitting ? "同步中..." : SYNC_STATUS_LABELS[syncStatus];

  return (
    <div className={`record-sync-row ${isSubmitting ? "submitting" : ""}`} onClick={e => e.stopPropagation()}>
      <span
        className="tag tag-sync-status"
        style={{ backgroundColor: syncColor + "15", color: syncColor, borderColor: syncColor + "40" }}
        title={`${syncLabel}${(record as any).lastSyncedAt ? ` · 上次同步：${formatSyncTime((record as any).lastSyncedAt)}` : ""}${syncError ? ` · 错误：${syncError}` : ""}${submitCount > 0 ? ` · 已提交 ${submitCount} 次` : ""}`}
      >
        {syncIcon} {syncLabel}
      </span>
      {submitCount > 1 && (
        <span className="submit-count-badge" title="重复提交次数">
          ×{submitCount}
        </span>
      )}
      {onSync && syncStatus !== "synced" && !isSubmitting && (
        <button className="text-btn sync-btn" onClick={onSync} style={{ color: syncColor, fontSize: "12px" }}>
          {syncStatus === "conflict" ? "处理冲突" : syncStatus === "failed" ? "重试同步" : "立即同步"}
        </button>
      )}
      {onViewError && syncStatus === "failed" && !isSubmitting && (
        <button className="text-btn view-error-btn" onClick={onViewError} style={{ fontSize: "12px" }}>
          查看错误
        </button>
      )}
      {onGenerateConflict && syncStatus === "synced" && !isSubmitting && (
        <button className="text-btn" onClick={onGenerateConflict} style={{ fontSize: "12px" }} title="模拟冲突">
          模拟冲突
        </button>
      )}
    </div>
  );
}
