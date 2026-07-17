// Direct port of model/src/supply.py's convolve_single_cohort — see that
// file's docstring. Ported so the F3 (Simulasi Tanam) sliders can recompute
// the supply curve in-browser without a round-trip to Python; supplyMath.test.js
// verifies this port against simulasi.json's test_vector.
export function convolveSingleCohort(cohortHa, kernel, mulaiPanenHari, produktivitasTonPerHa, weeksOut) {
  const mulaiPanenMinggu = Math.round(mulaiPanenHari / 7);
  const out = new Array(weeksOut).fill(0);
  for (const [mingguRelatif, ha] of cohortHa) {
    const harvestStart = mingguRelatif + mulaiPanenMinggu;
    kernel.forEach((w, k) => {
      const weekIdx = harvestStart + k;
      if (weekIdx >= 0 && weekIdx < weeksOut) {
        out[weekIdx] += ha * w * produktivitasTonPerHa;
      }
    });
  }
  return out;
}

// Piecewise-linear interpolation over simulasi.json's elastisitas_display.lookup
// (rasio pasokan/permintaan -> harga_rp). Clamps at the table's edges rather
// than extrapolating past the last measured price point.
export function interpolateHarga(rasio, lookup) {
  const sorted = [...lookup].sort((a, b) => a.rasio - b.rasio);
  if (rasio <= sorted[0].rasio) return sorted[0].harga_rp;
  const last = sorted[sorted.length - 1];
  if (rasio >= last.rasio) return last.harga_rp;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (rasio >= a.rasio && rasio <= b.rasio) {
      const t = (rasio - a.rasio) / (b.rasio - a.rasio);
      return a.harga_rp + t * (b.harga_rp - a.harga_rp);
    }
  }
  return last.harga_rp;
}

// Sums each sentra's shifted supply curve into one province-wide weekly
// tonnage curve — the flattening (or spiking) the F3 slider argument hinges
// on only shows up in the aggregate, not any single kabupaten's own curve.
// `geserById` shifts a kabupaten's entire kohort_tanam later by that many
// weeks (0 = unshifted); shift is clamped to that kabupaten's own
// geser_maks_minggu by the caller (the slider itself), not here.
export function aggregateSupplyCurve(kabupatenList, kernel, mulaiPanenHari, geserById, weeksOut) {
  const total = new Array(weeksOut).fill(0);
  for (const k of kabupatenList) {
    const shift = geserById[k.id] ?? 0;
    const cohortHa = k.kohort_tanam.map((c) => [c.minggu_relatif + shift, c.luas_ha]);
    const curve = convolveSingleCohort(cohortHa, kernel, mulaiPanenHari, k.produktivitas_ton_per_ha, weeksOut);
    curve.forEach((v, i) => { total[i] += v; });
  }
  return total;
}

// Combines the province-wide before/after supply delta + interpolateHarga
// into the exact summary HasilSimulasiPanel.jsx shows on screen. Extracted
// here (rather than left inline in the component) so reportBuilder.js can
// produce the identical numbers for the PDF report without duplicating the
// math.
//
// `pasokanProvinsiBaseline` is the REAL province-wide curve (all 27
// kabupaten, precomputed by the backend) - not a re-sum of just the sentra
// list, which would understate it. "Sesudah" is derived from that baseline
// by swapping out each shifted sentra's own unshifted contribution
// (`k.pasokan_baseline_ton`) for its shifted one, leaving every other
// kabupaten's contribution (including non-sentra ones already baked into
// the baseline) untouched.
export function summarizeSimulationImpact(pasokanProvinsiBaseline, kabupatenList, geserById, permintaanProvinsiMingguanTon, lookup, weeksOut) {
  const sebelum = pasokanProvinsiBaseline;
  const sesudah = [...sebelum];
  for (const k of kabupatenList) {
    const shift = geserById[k.id] || 0;
    if (shift === 0) continue;

    const oldCurve = k.pasokan_baseline_ton || new Array(weeksOut).fill(0);
    for (let i = 0; i < weeksOut; i++) {
      sesudah[i] -= oldCurve[i];
      if (i >= shift) {
        sesudah[i] += oldCurve[i - shift];
      }
    }
  }

  const chartData = sebelum.map((ton, i) => {
    const tonSesudah = sesudah[i];
    const rasioSebelum = ton / permintaanProvinsiMingguanTon;
    const rasioSesudah = tonSesudah / permintaanProvinsiMingguanTon;
    return {
      minggu: `M${i}`,
      hargaSebelum: Math.round(interpolateHarga(rasioSebelum, lookup)),
      hargaSesudah: Math.round(interpolateHarga(rasioSesudah, lookup)),
    };
  });

  const puncakSebelum = Math.max(...sebelum);
  const puncakSesudah = Math.max(...sesudah);
  const penurunanPuncakPct = puncakSebelum > 0 ? Math.round((1 - puncakSesudah / puncakSebelum) * 100) : 0;
  const minHargaSebelum = Math.min(...chartData.map((d) => d.hargaSebelum));
  const minHargaSesudah = Math.min(...chartData.map((d) => d.hargaSesudah));

  return { chartData, penurunanPuncakPct, minHargaSebelum, minHargaSesudah };
}
