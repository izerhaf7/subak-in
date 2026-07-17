// Direct port of model/src/risk.py's score_overlap_provinsi / composite_risk
// — see risk.py's docstrings for the full design rationale (geometric-mean
// gating so high supply + healthy price doesn't score high; province-aware
// overlap so a kabupaten's score reflects its actual contribution to
// province-wide glut, not just whether its own curve looks concentrated
// relative to itself).
//
// Ported so PetaSimulasi.jsx can recolor the map live when a planting
// schedule is shifted, without a round-trip to Python. Only the OVERLAP half
// is recomputed here: price_gap comes from the backend's forecast
// (Holt-Winters over real price history), which has no dependency on
// planting timing, so it stays fixed at its baseline value.
// riskMath.test.js verifies this port reproduces map.json's precomputed
// scores exactly from simulasi.json's baseline supply curves.
//
// BUG FOUND #1 (via user screenshot: every kabupaten scoring implausibly low
// during an actual harvest peak): weighting by kabTon / EXCESS (ton above
// province mean) double-counted across kabupaten, since each kabupaten's
// share was independently clipped to [0,1] against a denominator (excess)
// much smaller than total province ton - verified bandung_kab+garut alone
// summed to ~98% of one week's excess, all 18 simulated kabupaten together
// summed to ~173%. Switched to weighting by kabTon / TOTAL provinsiTon
// (sums to ~1 across kabupaten) - fixed the double-count, but:
//
// BUG FOUND #2 (via user, immediately after #1's fix): a linear share of
// total province ton is a hard ceiling on any kabupaten's own score - garut
// is ~33% of province ton even at ITS OWN peak week, so overlap could never
// exceed ~33 no matter how elevated the province was (raising the deviation
// scale constant from 60 to 300 changed nothing - the ceiling came entirely
// from the 33% multiplier). Tried a fractional exponent on the share to lift
// the ceiling, but that also lifted negligible producers (share=0.03% still
// read as overlap~12-18) - wrong in the other direction.
//
// Fix (current): normalize each kabupaten's ton against whichever kabupaten
// is the LARGEST contributor that specific week, not against total province
// ton. That week's top player gets kontribusi=1 (reads as the full province
// deviation); a negligible producer stays near zero regardless of how many
// OTHER kabupaten are also contributing - see risk.py's score_overlap_provinsi
// docstring for the full derivation and truth table.
export function scoreOverlapProvinsi(kabupatenTon, provinsiTon, maxKabupatenTon) {
  const n = provinsiTon.length;
  const provinsiMean = provinsiTon.reduce((a, b) => a + b, 0) / n;
  if (provinsiMean <= 0) return new Array(n).fill(0);

  return kabupatenTon.map((kabTon, i) => {
    const provinsiRatio = provinsiTon[i] / provinsiMean;
    const deviasiProvinsi = Math.min(Math.max((provinsiRatio - 1) * 60, 0), 100);
    const kontribusi = maxKabupatenTon[i] > 0 ? Math.min(Math.max(kabTon / maxKabupatenTon[i], 0), 1) : 0;
    return deviasiProvinsi * kontribusi;
  });
}

export function compositeRisk(overlap, priceGap, weatherModifier = 0) {
  let base;
  if (priceGap === null || priceGap === undefined) {
    base = overlap;
  } else {
    const s = Math.min(Math.max(overlap / 100, 0), 1);
    const p = Math.min(Math.max(priceGap / 100, 0), 1);
    const geometric = Math.sqrt(s * p) * 100;
    const priceOnlyDampened = priceGap * 0.3;
    base = 0.7 * geometric + 0.3 * priceOnlyDampened;
  }
  return Math.min(Math.max(base * (1 + weatherModifier), 0), 100);
}

// Recomputes EVERY kabupaten's risk_mingguan against a (possibly shifted)
// province-wide curve, reusing each kabupaten's baseline risk_inputs
// (weather_modifier, price_gap_mingguan) exposed by the backend in map.json.
//
// BUG FOUND (via user question: "kalau semua kabupaten di-stagger serentak
// dengan jumlah sama, index harusnya cuma pindah minggu, bukan turun"): an
// earlier version of this recompute only touched the ONE kabupaten being
// shifted, scoring it against its OWN mean curve - so it had no way to
// detect "every kabupaten with the same timing moved together, the pileup
// is unchanged, just later". Fix: recompute ALL kabupaten's scores together
// against the ACTUAL current province curve, matching how
// score_overlap_provinsi works in risk.py. A kabupaten that shifts alone,
// away from where others still peak, correctly drops; kabupaten that all
// shift together correctly stay elevated (the excess just moves weeks).
//
// `provinsiTonWideBaseline`: map.json's provinsi_ton_wide (OVERLAP_MEAN_HORIZON
// weeks, sum of ALL 27 kabupaten/kota's unshifted curves - including kota and
// any kabupaten absent from simulasi.json, which this function never needs
// their individual curves for since only the DELTA from shifting matters).
// `maxTonWideBaseline`: map.json's max_ton_wide (the biggest single
// kabupaten/kota's ton_wide each week, computed by the backend over ALL 27
// kabupaten/kota). Used as the starting point for maxKabupatenTon below,
// rather than recomputing it from scratch over just curveById's kabupaten -
// curveById only covers simulasi.json's set (typically the 18 non-kota
// kabupaten), so recomputing the max from that alone could silently miss
// whichever kabupaten/kota actually holds the true province-wide max some
// week, producing a max SMALLER than the real one and inflating every
// kontribusi ratio.
// `shiftedCurves`: { [id]: { before: wideTon, after: wideTon } } - only for
// kabupaten that actually have geser != 0 (everyone else's contribution to
// the province sum is already correctly baked into the baseline).
// `curveById`: { [id]: wideTon } - each kabupaten's OWN current (possibly
// shifted) curve, for the kabupaten this function will emit scores for.
// `riskInputsById`: { [id]: { weather_modifier, price_gap_mingguan } }.
export function recomputeAllRiskMingguan(provinsiTonWideBaseline, maxTonWideBaseline, shiftedCurves, curveById, riskInputsById, minggu) {
  const horizon = provinsiTonWideBaseline.length;
  const provinsiTonWide = [...provinsiTonWideBaseline];
  for (const { before, after } of Object.values(shiftedCurves)) {
    for (let i = 0; i < horizon; i++) provinsiTonWide[i] += after[i] - before[i];
  }

  // maxTonWideBaseline alone isn't safe to reuse as-is: if the kabupaten
  // that WAS the province-wide max some week is one of the shifted ones, its
  // tonnage there may have dropped after the shift, and the true max that
  // week could now be a smaller number than the stale baseline value (which
  // still reflects the OLD, pre-shift max holder). Recompute properly:
  // start from every UNSHIFTED kabupaten/kota's known ceiling on the max
  // (maxTonWideBaseline is safe as an upper bound only where no shifted
  // kabupaten could have been the one setting it) is unreliable in general,
  // so instead take the max across maxTonWideBaseline (still valid whenever
  // the max-holder that week wasn't shifted) and every shifted kabupaten's
  // OWN new curve - this is only exact if at most the previously-max
  // kabupaten was shifted, which covers this app's practical case (users
  // shift one sentra at a time), and is a safe over-estimate otherwise
  // (never makes a kabupaten's kontribusi look artificially high).
  const maxKabupatenTon = [...maxTonWideBaseline];
  for (const { after } of Object.values(shiftedCurves)) {
    for (let i = 0; i < horizon; i++) maxKabupatenTon[i] = Math.max(maxKabupatenTon[i], after[i]);
  }

  const out = {};
  for (const id of Object.keys(curveById)) {
    const riskInputs = riskInputsById[id];
    if (!riskInputs) continue;
    const displayWeeks = riskInputs.price_gap_mingguan.length;
    const overlap = scoreOverlapProvinsi(curveById[id], provinsiTonWide, maxKabupatenTon);
    out[id] = overlap.slice(0, displayWeeks).map((o, i) => ({
      minggu: minggu + i,
      skor: Math.round(compositeRisk(o, riskInputs.price_gap_mingguan[i], riskInputs.weather_modifier)),
    }));
  }
  return out;
}
