import { formatDiff } from "../../utils";

export function DiffBadge({ diff, changed, unit, decimals }: { diff: number; changed: boolean; unit?: string; decimals?: number }) {
  if (!changed) {
    return <span className="diff-badge diff-stable">—</span>;
  }
  const isIncrease = diff > 0;
  const text = formatDiff(diff, unit || "", decimals);
  return (
    <span className={`diff-badge ${isIncrease ? "diff-increase" : "diff-decrease"}`}>
      {text}
    </span>
  );
}
