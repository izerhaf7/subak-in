export function riskColor(skor) {
  const s = Math.max(0, Math.min(100, skor));
  if (s < 25) return "#cc9685";
  if (s < 50) return "#ad644e";
  if (s < 75) return "#8a3f28";
  return "#56200f";
}
