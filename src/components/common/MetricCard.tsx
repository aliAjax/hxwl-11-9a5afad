const statusColors = ["status-ok", "status-watch", "status-danger"];

export function MetricCard({ label, value, index, statusClass }: { label: string; value: string; index: number; statusClass?: string }) {
  const colorClass = statusClass || statusColors[index % statusColors.length];
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={colorClass} />
    </article>
  );
}
