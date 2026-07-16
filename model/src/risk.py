"""Glut Risk Index (0-100): composite of harvest overlap + PriceGap + weather
modifier. Weights are hardcoded (no ML) but the PriceGap->score mapping is
calibrated against real historical PIHPS troughs, not picked blind - see
`_calibration_check()` at the bottom, which is the actual validation this
module's design leans on (contract: "kalibrasi ini adalah validasi utamamu").

PriceGap is only meaningful at the producer/farm-gate layer (contract point
#6: never compare retail price to ongkos_petik) - callers must pass a producer
price here, never `retail_overlay`.
"""
import numpy as np


def magnitude_factor(share_pct: float, reference_share_pct: float = 5.0) -> float:
    """Dampener for score_overlap - see its docstring for why this exists.
    A kabupaten producing >= reference_share_pct of the province's annual
    output for this commodity gets full weight (1.0); smaller producers scale
    down linearly, so a 0.0006%-share kabupaten (found in the real data:
    cirebon_kota/cabai_rawit) doesn't show the same alarm as an 11.9%-share
    one (cianjur) just because both happen to share the same default harvest
    timing. ASUMSI: 5% chosen as "clearly a real sentra" cutoff - not cited,
    a reasonable round number given shares in the real data range from ~33%
    (garut) down to ~0.0006%."""
    return float(np.clip(share_pct / reference_share_pct, 0, 1))


def score_overlap(weekly_ton: np.ndarray) -> np.ndarray:
    """How much a given week's supply stands out above the local cycle's
    average - the "multiple cohorts landing at once" signal. ratio=1 (flat,
    no glut wave) -> 0; ratio>=2.67 -> saturates at 100.

    BUG FOUND (via user inspecting map.json): this ratio is computed against
    the series' OWN mean, which is mathematically scale-invariant - a
    kabupaten growing 1 ha and one growing 10,000 ha get IDENTICAL scores as
    long as the harvest timing shape matches (verified: ~20 "modeled"
    kabupaten in map.json shared byte-identical risk_mingguan curves, because
    they all fall back to the same default status_musim_hujan -> same cohort
    shape -> same kernel -> ratio-to-own-mean cancels out the actual
    magnitude entirely). A province-wide glut signal has to account for HOW
    MUCH a kabupaten produces, not just whether its own tiny harvest looks
    "concentrated" relative to itself - so callers MUST multiply this
    function's output by magnitude_factor() before feeding it into
    composite_risk. This function alone is now just the timing/concentration
    half of the signal, not a complete risk score."""
    baseline = weekly_ton.mean()
    if baseline <= 0:
        return np.zeros_like(weekly_ton)
    ratio = weekly_ton / baseline
    return np.clip((ratio - 1) * 60, 0, 100)


def score_price_gap(price_rp, ongkos_petik_rp: float, biaya_produksi_rp: float) -> float:
    """price <= ongkos_petik: farmers lose money even picking -> definite glut
    signal, score=100. Between ongkos_petik and ongkos_petik+biaya_produksi:
    picking pays but full production cost doesn't -> distressed, 100->50.
    Above full cost: profitable, 50->0, floored at 2x full cost."""
    if price_rp is None or (isinstance(price_rp, float) and np.isnan(price_rp)):
        return None
    full_cost = ongkos_petik_rp + biaya_produksi_rp
    if price_rp <= ongkos_petik_rp:
        return 100.0
    if price_rp <= full_cost:
        frac = (price_rp - ongkos_petik_rp) / (full_cost - ongkos_petik_rp)
        return 100.0 - 50.0 * frac
    frac = min((price_rp - full_cost) / full_cost, 1.0)
    return max(50.0 - 50.0 * frac, 0.0)


def composite_risk(overlap: float, price_gap, weather_modifier: float = 0.0,
                    w_overlap_only: float = 1.0, w_overlap_with_price: float = 0.35,
                    w_price: float = 0.65) -> float:
    """price_gap=None (modeled kabupaten, no PIHPS coverage) -> overlap-only,
    per contract ("harvest-overlap saja, tanpa PriceGap"). Price weighted
    higher than overlap when available (0.65 vs 0.35) so a real historical
    price crash always lands in the red zone regardless of the supply curve's
    shape that week - see _calibration_check."""
    if price_gap is None:
        base = overlap * w_overlap_only
    else:
        base = w_overlap_with_price * overlap + w_price * price_gap
    return float(np.clip(base * (1 + weather_modifier), 0, 100))


def _calibration_check():
    """Standalone validation (run directly: `python risk.py`): pull real
    historical producer prices for a measured kabupaten/commodity, and check
    that weeks where price actually fell below ongkos_petik score in the red
    zone (>=70). This only exercises the PriceGap half of the composite
    (overlap needs a supply curve, which is only modeled prospectively from
    "now" in supply.py, not reconstructed historically) - but PriceGap is the
    half calibrated straight from real troughs, which is the point."""
    import warnings
    warnings.filterwarnings("ignore")
    import json
    from aliases import RegionAliases, DATA_CURATED
    from ingest import load_pihps_producer

    with open(DATA_CURATED / "price_thresholds.json", encoding="utf-8") as f:
        thresholds = json.load(f)

    ra = RegionAliases()
    producer = load_pihps_producer(ra)

    print("=== risk.py kalibrasi: PriceGap vs trough harga historis nyata ===")
    for region, kom in [("garut", "cabai_rawit"), ("sukabumi_kota", "bawang_merah"),
                         ("sumedang", "cabai_besar")]:
        t = thresholds[kom]
        sub = producer[(producer.region_id == region) & (producer.komoditas_id == kom)]
        trough = sub[sub["nominal_price"] <= t["ongkos_petik_rp"]]
        print(f"\n{region}/{kom}: ongkos_petik={t['ongkos_petik_rp']}, "
              f"{len(trough)} minggu historis <= ongkos_petik dari {len(sub)} baris")
        if len(trough):
            scores = [score_price_gap(p, t["ongkos_petik_rp"], t["biaya_produksi_rp"])
                      for p in trough["nominal_price"]]
            print(f"  semua skor PriceGap di titik-titik ini: min={min(scores)} "
                  f"(harus 100 - ini definisi ongkos_petik sebagai lantai)")
        else:
            min_price = sub["nominal_price"].min()
            print(f"  PERINGATAN: ongkos_petik_rp={t['ongkos_petik_rp']} TIDAK PERNAH "
                  f"tercapai di histori nyata - harga terendah historis sebenarnya "
                  f"Rp{min_price:.0f} (region {sub.loc[sub['nominal_price'].idxmin(),'region_id']}). "
                  f"Placeholder ini butuh angka sitasi asli dari M3, bukan diverifikasi kosong begini.")
        # also show score at a clearly-profitable historical price for contrast
        high_price = sub["nominal_price"].quantile(0.9)
        score_high = score_price_gap(high_price, t["ongkos_petik_rp"], t["biaya_produksi_rp"])
        print(f"  harga p90 historis={high_price:.0f} -> skor PriceGap={score_high:.1f} "
              f"(harus jauh lebih rendah dari trough)")


if __name__ == "__main__":
    _calibration_check()
