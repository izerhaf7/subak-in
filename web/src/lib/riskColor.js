export function riskColor(skor) {
  const s = Math.max(0, Math.min(100, skor));
  if (s < 25) return "#a3e2b2";
  if (s < 50) return "#fcd34d";
  if (s < 75) return "#f97316";
  return "#be123c";
}

// riskColor's low-risk tone (#a3e2b2) is deliberately pastel for map fills
// and small swatches on a light background - as BODY TEXT (e.g. a KPI
// card's headline value) it fails contrast, reading as barely-there grey.
// This variant darkens the low/mid tones for anywhere the color labels text
// rather than a shape; high/critical stay as-is since those are already
// dark enough to read.
export function riskTextColor(skor) {
  const s = Math.max(0, Math.min(100, skor));
  if (s < 25) return "#1f7a37";
  if (s < 50) return "#92720a";
  if (s < 75) return "#f97316";
  return "#be123c";
}
