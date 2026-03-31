export function getTrustMeta(score) {
  if (!Number.isFinite(score) || score <= 0) {
    return {
      label: "Not Scored",
      decision: "Pending verification",
      tone: "slate",
    };
  }

  if (score >= 100) {
    return {
      label: "100% (PIB Verified)",
      decision: "Auto publish",
      tone: "green",
    };
  }

  if (score >= 80) {
    return {
      label: "80% (Multi-source)",
      decision: "Review",
      tone: "amber",
    };
  }

  return {
    label: "60% (Low trust)",
    decision: "Reject",
    tone: "rose",
  };
}
