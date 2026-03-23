export function getTrustMeta(score) {
  if (score >= 100) {
    return {
      label: "100% (PIB Verified)",
      decision: "Auto publish",
      tone: "green"
    };
  }

  if (score >= 80) {
    return {
      label: "80% (Multi-source)",
      decision: "Review",
      tone: "yellow"
    };
  }

  return {
    label: "60% (Low trust)",
    decision: "Reject",
    tone: "red"
  };
}
