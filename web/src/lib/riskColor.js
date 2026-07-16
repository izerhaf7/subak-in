export function riskColor(skor) {
  const s = Math.max(0, Math.min(100, skor));
  if (s < 25) return "#a3e2b2";
  if (s < 50) return "#fcd34d";
  if (s < 75) return "#f97316";
  return "#be123c";
}
