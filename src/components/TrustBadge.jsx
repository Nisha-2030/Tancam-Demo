import { getTrustMeta } from "../utils/trust";

export function TrustBadge({ score }) {
  const meta = getTrustMeta(score);

  return (
    <div className="trust-wrap">
      <span className={`trust-chip trust-${meta.tone}`}>{meta.label}</span>
      <span className={`decision-pill decision-${meta.tone}`}>{meta.decision}</span>
    </div>
  );
}
