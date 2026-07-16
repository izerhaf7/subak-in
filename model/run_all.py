"""Entry point: `python run_all.py` regenerates every JSON in
web/public/data/. Ties together aliases -> ingest -> seasonality/forecast ->
supply -> risk -> dispatch/weather -> export, in that dependency order.

Run from anywhere (paths are resolved from aliases.ROOT_DIR, not cwd).
"""
import sys
import warnings
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
# statsmodels ValueWarning (no freq on date index) / ConvergenceWarning (a few
# HW fits during rolling backtest don't fully converge) - inspected, harmless
# to the reported MAPE/forecast, just noisy.
warnings.simplefilter("ignore", category=UserWarning)
warnings.simplefilter("ignore", category=FutureWarning)
from statsmodels.tools.sm_exceptions import ConvergenceWarning, ValueWarning
warnings.simplefilter("ignore", category=ConvergenceWarning)
warnings.simplefilter("ignore", category=ValueWarning)

import numpy as np
import pandas as pd

from aliases import RegionAliases, WEB_DATA
import ingest
import seasonality
import forecast
import supply
import risk
import dispatch
import weather
import export

WIB = timezone(timedelta(hours=7))
FORECAST_HORIZON = 16   # covers map.json / pasokan_mingguan's 16-week window
DISPLAY_FORECAST = 12   # kabupaten/*.json's shorter displayed price forecast
HISTORIS_WEEKS = 52
DEFAULT_ZOM_STATUS = "transisi_sebelum_cutoff"  # ASUMSI fallback for the 21 kabupaten with no BMKG onset row

# Kota bukan wilayah analisis produksi (peta menampilkannya "tidak
# dianalisis"); data eceran kota justru dipakai sebagai sumber proxy untuk
# kabupaten pasangannya lewat KOTA_PROXY.
KOTA_IDS = {"bogor_kota", "sukabumi_kota", "bandung_kota", "cirebon_kota",
            "bekasi_kota", "depok", "cimahi", "tasikmalaya_kota", "banjar"}
KOTA_PROXY = {"bogor_kab": "bogor_kota", "bekasi_kab": "bekasi_kota",
              "bandung_kab": "bandung_kota", "sukabumi_kab": "sukabumi_kota",
              "tasikmalaya_kab": "tasikmalaya_kota", "cirebon_kab": "cirebon_kota"}


def iso_week_labels(start: pd.Timestamp, n: int) -> list:
    return [seasonality.iso_week_label(start + pd.Timedelta(weeks=i)) for i in range(n)]


def keyakinan_from_mape(mape_pct):
    if mape_pct is None:
        return None
    if mape_pct < 15:
        return "tinggi"
    if mape_pct < 30:
        return "sedang"
    return "rendah"


def main():
    print("=== Panen Radar: run_all.py ===")
    ra = RegionAliases()

    print("\n[1/6] ingest...")
    producer = ingest.load_pihps_producer(ra)
    retail = ingest.load_pihps_retail_overlay(ra)
    coverage = ingest.load_pihps_coverage(ra)
    bps = ingest.load_bps_production(ra)
    bps_allocated = supply.allocate_cabai_luas(bps)
    unit_lahan = ingest.load_bps_unit_lahan(ra)
    zom = ingest.load_bmkg_zom(ra)
    zom_status = dict(zip(zom["region_id"], zom["status_musim_hujan"]))
    print(f"  producer={len(producer)} retail={len(retail)} coverage={len(coverage)} "
          f"bps={len(bps_allocated)} unit_lahan={len(unit_lahan)}")

    print("\n[2/6] weather (cache, zero live calls)...")
    weather_json = weather.build_weather(ra)
    weather_mod = weather.weather_modifier_lookup(weather_json)
    export.write_json("weather.json", weather_json)

    coverage_lookup = {(r["region_id"], r["komoditas_id"]): r["status_data"]
                        for r in coverage.to_dict(orient="records")}
    weekly_producer = seasonality.to_weekly(producer, group_cols=["region_id", "komoditas_id"])
    weekly_retail = seasonality.to_weekly(retail, group_cols=["region_id", "komoditas_id"])

    # --- Rasio transmisi eceran -> produsen, untuk proxy kabupaten buta ------
    # Dihitung dari wilayah yang punya KEDUA seri (produsen & eceran) pada
    # komoditas yang sama; dipakai sebagai rentang (p25-p75), bukan angka
    # tunggal, karena rasio ini melebar saat pasar bergejolak (harga eceran
    # "lengket" saat harga produsen jatuh).
    ratio_stats = {}
    for komoditas_id in export.KOMODITAS_IDS:
        ratios = []
        prod_k = weekly_producer[weekly_producer.komoditas_id == komoditas_id]
        ret_k = weekly_retail[weekly_retail.komoditas_id == komoditas_id]
        for rid in prod_k.region_id.unique():
            p = prod_k[prod_k.region_id == rid][["date", "nominal_price"]]
            r = ret_k[ret_k.region_id == rid][["date", "nominal_price"]]
            if not len(r):
                continue
            m = p.merge(r, on="date", suffixes=("_p", "_r")).dropna()
            m = m[m["nominal_price_r"] > 0]
            ratios.extend((m["nominal_price_p"] / m["nominal_price_r"]).tolist())
        if len(ratios) >= 30:
            ratio_stats[komoditas_id] = {
                "p25": float(np.percentile(ratios, 25)),
                "p50": float(np.percentile(ratios, 50)),
                "p75": float(np.percentile(ratios, 75)),
                "n": len(ratios),
            }
    print(f"  rasio transmisi tersedia untuk: {list(ratio_stats.keys())}")

    now = datetime.now(WIB)
    minggu_berjalan = now.isocalendar().week
    # anchor "now" to the most recent Monday actually present in the price data,
    # so week 0's forecast starts right after real history ends (not a gap).
    last_real_date = weekly_producer["date"].max()
    label_minggu = iso_week_labels(last_real_date + pd.Timedelta(weeks=1), FORECAST_HORIZON)

    print(f"\n[3/6] forecasting per (region x komoditas)... minggu_berjalan={minggu_berjalan}")
    forecast_cache = {}  # (region_id, komoditas_id) -> dict
    for region_id in ra.all_ids():
        for komoditas_id in export.KOMODITAS_IDS:
            status_data = coverage_lookup.get((region_id, komoditas_id), "modeled")
            entry = {"status_data": status_data, "historis": [], "forecast_16": None,
                      "forecast_start": None, "mape_pct": None, "keyakinan": None, "retail_overlay": []}

            if status_data in ("measured", "measured_stale"):
                sub = weekly_producer[
                    (weekly_producer.region_id == region_id) & (weekly_producer.komoditas_id == komoditas_id)
                ].set_index("date")["nominal_price"].asfreq("W-MON")

                entry["historis"] = [
                    {"minggu": seasonality.iso_week_label(d), "rp": round(v)}
                    for d, v in sub.tail(HISTORIS_WEEKS).dropna().items()
                ]

                retail_sub = retail[(retail.region_id == region_id) & (retail.komoditas_id == komoditas_id)]
                if len(retail_sub):
                    retail_weekly = seasonality.to_weekly(retail_sub, group_cols=["region_id", "komoditas_id"])
                    retail_weekly = retail_weekly.set_index("date")["nominal_price"].tail(HISTORIS_WEEKS)
                    entry["retail_overlay"] = [
                        {"minggu": seasonality.iso_week_label(d), "rp": round(v)}
                        for d, v in retail_weekly.dropna().items()
                    ]

                # measured_stale = PIHPS stopped collecting this series years
                # ago (bandung_kota/{bawang_merah,cabai_besar}: last real point
                # 2020). Forecasting "the next 16 weeks" from data that old and
                # labeling it as if it projects TODAY's market would be
                # dishonest - the contract's own UI treatment for stale data is
                # a "data berhenti [tahun]" tooltip, not a live projection.
                # Bug this fixes: run_all.py used to label every region's
                # forecast weeks off one GLOBAL last-date (~2026), which for a
                # 2020-frozen series meant a model trained on 2018-2020 data
                # got mislabeled as a 2026 forecast AND extrapolated 6 "years"
                # of steps past its own data -> drove point forecasts negative
                # (bandung_kota/cabai_besar). Found via pressure test.
                if status_data == "measured_stale":
                    forecast_cache[(region_id, komoditas_id)] = entry
                    continue

                series_last_date = sub.dropna().index.max()
                mape = forecast.rolling_backtest_mape(sub)
                point, lo, hi = forecast.forecast_with_interval(sub, horizon=FORECAST_HORIZON)

                # Contract point #4: Tier-2 never gets a confidence claim, even
                # though cabai_besar/keriting DOES show measured_active status
                # in several kabupaten in the real coverage_manifest - the
                # scraper's own README labels tier2_producer_prices.csv
                # "(modeled)", i.e. the team doesn't trust this tier's
                # farm-gate quality regardless of what the API reports.
                # ASUMSI/flagged: following the explicit instruction over the
                # raw coverage signal here.
                if export.KOMODITAS_TIER[komoditas_id] == 2:
                    mape, keyakinan = None, None
                else:
                    keyakinan = keyakinan_from_mape(mape)

                entry["forecast_16"] = point
                entry["forecast_16_lo"] = lo
                entry["forecast_16_hi"] = hi
                entry["forecast_start"] = series_last_date  # per-series anchor, NOT the global last_real_date
                entry["mape_pct"] = _r1(mape)
                entry["keyakinan"] = keyakinan

            forecast_cache[(region_id, komoditas_id)] = entry
    print("  done.")

    print("\n[4/6] supply + risk per (region x komoditas)...")
    supply_cache = {}
    risk_cache = {}
    for region_id in ra.all_ids():
        status_musim = zom_status.get(region_id, DEFAULT_ZOM_STATUS)
        w_mod = weather_mod.get(region_id, 0.0)
        for komoditas_id in export.KOMODITAS_IDS:
            ton, luas_ha, produktivitas, tahun_sumber = supply.supply_weekly_ton(
                bps_allocated, region_id, komoditas_id, status_musim, weeks_out=FORECAST_HORIZON
            )
            supply_cache[(region_id, komoditas_id)] = {
                "ton": ton, "luas_ha": luas_ha, "produktivitas": produktivitas, "tahun_sumber": tahun_sumber,
            }

            if ton is None:
                risk_cache[(region_id, komoditas_id)] = None
                continue

            overlap = risk.score_overlap(ton)
            fc = forecast_cache[(region_id, komoditas_id)]
            price_series = fc["forecast_16"]
            thresholds = export.json.load(open(export.DATA_CURATED / "price_thresholds.json", encoding="utf-8"))[komoditas_id]

            weekly_scores = []
            for i in range(FORECAST_HORIZON):
                price_gap = None
                if price_series is not None:
                    price_gap = risk.score_price_gap(
                        price_series[i], thresholds["ongkos_petik_rp"], thresholds["biaya_produksi_rp"]
                    )
                weekly_scores.append(risk.composite_risk(overlap[i], price_gap, w_mod))
            risk_cache[(region_id, komoditas_id)] = weekly_scores
    print("  done.")

    print("\n[5/6] writing map.json (+ per-commodity siblings) and kabupaten/*.json...")
    unit_lahan_lookup = dict(zip(unit_lahan["region_id"], unit_lahan["estimasi_unit_lahan_cabai_bawang"]))

    for komoditas_id in export.KOMODITAS_IDS:
        region_rows = []
        for region_id in ra.all_ids():
            scores = risk_cache[(region_id, komoditas_id)]
            status_data = coverage_lookup.get((region_id, komoditas_id), "modeled")
            if scores is None:
                risk_mingguan = [{"minggu": minggu_berjalan + i, "skor": 0} for i in range(FORECAST_HORIZON)]
                kpi = {"risk_puncak": 0, "minggu_puncak": minggu_berjalan, "harga_proyeksi_puncak_rp": None}
            else:
                risk_mingguan = [{"minggu": minggu_berjalan + i, "skor": round(s)} for i, s in enumerate(scores)]
                peak_i = int(np.argmax(scores))
                fc = forecast_cache[(region_id, komoditas_id)]
                harga_puncak = None
                if fc["forecast_16"] is not None:
                    harga_puncak = round(fc["forecast_16"][peak_i])
                kpi = {
                    "risk_puncak": round(max(scores)),
                    "minggu_puncak": minggu_berjalan + peak_i,
                    "harga_proyeksi_puncak_rp": harga_puncak,
                }
            region_rows.append({
                "id": region_id,
                "nama": ra.nama_resmi(region_id),
                "status_data": status_data,
                "risk_mingguan": risk_mingguan,
                "kpi": kpi,
                "estimasi_unit_lahan": unit_lahan_lookup.get(region_id),
            })
        filename = "map.json" if komoditas_id == "cabai_rawit" else f"map_{komoditas_id}.json"
        export.write_json(filename, export.build_map(komoditas_id, region_rows))

    for region_id in ra.all_ids():
        written_for_region = []
        for komoditas_id in export.KOMODITAS_IDS:
            fc = forecast_cache[(region_id, komoditas_id)]
            if fc["status_data"] not in ("measured", "measured_stale"):
                continue
            sc = supply_cache[(region_id, komoditas_id)]
            pasokan_mingguan = []
            if sc["ton"] is not None:
                pasokan_mingguan = [
                    {"minggu": seasonality.iso_week_label(last_real_date + pd.Timedelta(weeks=i + 1)), "ton": round(t, 1)}
                    for i, t in enumerate(sc["ton"])
                ]
            forecast_arr = []
            if fc["forecast_16"] is not None:
                for i in range(DISPLAY_FORECAST):
                    forecast_arr.append({
                        "minggu": seasonality.iso_week_label(fc["forecast_start"] + pd.Timedelta(weeks=i + 1)),
                        "rp": round(fc["forecast_16"][i]),
                        "lo": round(fc["forecast_16_lo"][i]),
                        "hi": round(fc["forecast_16_hi"][i]),
                    })
            detail = export.build_kabupaten_detail(
                region_id, ra.nama_resmi(region_id), fc["status_data"],
                fc["historis"], forecast_arr, fc["mape_pct"], fc["keyakinan"],
                pasokan_mingguan, fc["retail_overlay"] or None,
            )
            export.write_json(f"kabupaten/{region_id}__{komoditas_id}.json", detail)
            written_for_region.append((komoditas_id, detail))

        # Proxy eceran untuk kabupaten buta: kalau kabupaten ini modeled untuk
        # sebuah komoditas TAPI ada seri eceran (milik sendiri, atau dari kota
        # pasangannya via KOTA_PROXY), tulis file detail berisi sinyal eceran +
        # rentang estimasi produsen (eceran x rasio p25-p75). Kota sendiri
        # bukan target (di peta kota ditampilkan sebagai "tidak dianalisis").
        if region_id not in KOTA_IDS:
            for komoditas_id in export.KOMODITAS_IDS:
                status = coverage_lookup.get((region_id, komoditas_id), "modeled")
                if status in ("measured", "measured_stale"):
                    continue
                rs = ratio_stats.get(komoditas_id)
                if rs is None:
                    continue
                sumber_id = None
                for cand in (region_id, KOTA_PROXY.get(region_id)):
                    if cand is None:
                        continue
                    sub = weekly_retail[
                        (weekly_retail.region_id == cand) & (weekly_retail.komoditas_id == komoditas_id)
                    ]
                    if len(sub):
                        sumber_id = cand
                        retail_series = sub.set_index("date")["nominal_price"].tail(HISTORIS_WEEKS).dropna()
                        break
                if sumber_id is None or len(retail_series) < 8:
                    continue
                detail = {
                    "id": region_id,
                    "nama": ra.nama_resmi(region_id),
                    "status_data": "modeled",
                    "harga": {"historis": [], "forecast": [], "mape_pct": None, "keyakinan": None},
                    "retail_overlay": [
                        {"minggu": seasonality.iso_week_label(d), "rp": round(v)}
                        for d, v in retail_series.items()
                    ],
                    "proxy_eceran": {
                        "sumber_id": sumber_id,
                        "sumber_nama": ra.nama_resmi(sumber_id),
                        "rasio": {k: round(v, 3) for k, v in rs.items() if k != "n"},
                        "n_rasio": rs["n"],
                        "band": [
                            {"minggu": seasonality.iso_week_label(d),
                             "rp_lo": round(v * rs["p25"]), "rp_hi": round(v * rs["p75"])}
                            for d, v in retail_series.items()
                        ],
                        "catatan": ("Estimasi tidak langsung: rentang harga produsen p25-p75 dari "
                                     "rasio transmisi eceran->produsen. BUKAN harga terukur."),
                    },
                }
                export.write_json(f"kabupaten/{region_id}__{komoditas_id}.json", detail)
                written_for_region.append((komoditas_id, detail))

        if written_for_region:
            # literal-contract-compliant default: prefer cabai_rawit, else first available
            written_for_region.sort(key=lambda kv: 0 if kv[0] == "cabai_rawit" else 1)
            export.write_json(f"kabupaten/{region_id}.json", written_for_region[0][1])

    print("\n[6/6] writing simulasi.json, absorbers.json, meta.json...")
    simulasi_rows = []
    for region_id in export.SENTRA_SIMULASI:
        status = zom_status.get(region_id, DEFAULT_ZOM_STATUS)
        luas_ha, produktivitas, tahun = supply.latest_luas_dan_produktivitas(bps_allocated, region_id, "cabai_rawit")
        if luas_ha is None:
            continue
        cohort = supply.build_cohort_ha(luas_ha, "cabai_rawit", status)
        simulasi_rows.append({
            "id": region_id,
            "nama": ra.nama_resmi(region_id),
            "status_musim_hujan": status,
            "kohort_tanam": [{"minggu_relatif": w, "luas_ha": round(ha, 1)} for w, ha in cohort],
            "geser_maks_minggu": supply.GESER_MAKS_MINGGU[status],
            # 6dp, not the usual display-rounded 2dp: this value feeds the JS
            # port's convolution directly, and test_vector's
            # expected_kurva_pasokan_ton was computed from the unrounded
            # produktivitas - rounding to 2dp here made the frontend port
            # unable to reproduce it exactly (~0.1-0.4 ton drift by the tail
            # of the curve). 6dp closes that gap to well under display
            # precision.
            "produktivitas_ton_per_ha": round(produktivitas, 6),
        })

    # permintaan_mingguan_ton: ASUMSI - no real consumption dataset, so demand
    # is proxied as the sentra's own average weekly production (i.e. assume
    # rough historical supply/demand equilibrium as the reference baseline the
    # simulasi screen perturbs away from).
    total_annual_ton = 0
    for region_id in export.SENTRA_SIMULASI:
        sub = bps_allocated[(bps_allocated.region_id == region_id) & (bps_allocated.komoditas_id == "cabai_rawit")]
        if len(sub):
            total_annual_ton += sub.sort_values("tahun").iloc[-1]["produksi_ton"]
    permintaan_mingguan_ton = round(total_annual_ton / 52, 1)

    test_input_kohort = {"garut": [900, 400, 0, 0]}
    garut_luas, garut_prod, _ = supply.latest_luas_dan_produktivitas(bps_allocated, "garut", "cabai_rawit")
    test_cohort = [(i, ha) for i, ha in enumerate(test_input_kohort["garut"]) if ha > 0]
    expected_curve = supply.convolve_single_cohort(test_cohort, "cabai_rawit", garut_prod, weeks_out=24)

    simulasi_json = export.build_simulasi(
        "cabai_rawit", simulasi_rows, permintaan_mingguan_ton,
        lookup=[{"rasio": 1.0, "harga_rp": 25000}, {"rasio": 1.5, "harga_rp": 12000}, {"rasio": 2.0, "harga_rp": 6000}],
        test_vector={
            "input_kohort": test_input_kohort,
            "expected_kurva_pasokan_ton": [round(v, 2) for v in expected_curve],
        },
    )
    export.write_json("simulasi.json", simulasi_json)

    # absorbers.json: selisih_vs_pasar uses each kabupaten's current-week (i=0)
    # cabai_rawit forecast price where available.
    harga_referensi = {}
    for region_id in ra.all_ids():
        fc = forecast_cache[(region_id, "cabai_rawit")]
        if fc["forecast_16"] is not None:
            harga_referensi[region_id] = fc["forecast_16"][0]
    absorbers_json = dispatch.build_absorbers_json(ra, harga_referensi)
    export.write_json("absorbers.json", absorbers_json)

    catatan_coverage = _build_catatan_coverage(bps_allocated, coverage_lookup, ra)
    estimasi_unit_lahan_total = round(unit_lahan["estimasi_unit_lahan_cabai_bawang"].sum())
    meta_json = export.build_meta(minggu_berjalan, label_minggu, estimasi_unit_lahan_total, catatan_coverage)
    export.write_json("meta.json", meta_json)

    print("\n=== selesai. Semua JSON ditulis ke web/public/data/ ===")


def _r1(x):
    return None if x is None else round(float(x), 1)


def _build_catatan_coverage(bps_allocated, coverage_lookup, ra) -> dict:
    """Computed (not hardcoded) from real 2024 BPS shares + PIHPS coverage -
    verifies the contract's own "~44% Kab. Bandung / ~35% measured" bawang
    merah claim against the actual data (matched: 43.8% / 35.5%, see
    conversation notes) rather than copying the contract's example text."""
    notes = {}
    for komoditas_id in ["bawang_merah", "cabai_rawit", "cabai_besar"]:
        sub = bps_allocated[bps_allocated.komoditas_id == komoditas_id]
        latest_year = sub["tahun"].max()
        latest = sub[sub["tahun"] == latest_year]
        total = latest["produksi_ton"].sum()
        if total <= 0:
            continue
        latest = latest.assign(share=100 * latest["produksi_ton"] / total).sort_values("share", ascending=False)
        top = latest.iloc[0]
        measured_ids = [rid for rid in latest["region_id"] if coverage_lookup.get((rid, komoditas_id)) in
                        ("measured", "measured_stale")]
        measured_share = latest[latest.region_id.isin(measured_ids)]["share"].sum()
        top_measured = coverage_lookup.get((top["region_id"], komoditas_id)) in ("measured", "measured_stale")
        if not top_measured:
            notes[komoditas_id] = (
                f"PIHPS produsen menangkap ~{measured_share:.0f}% produksi provinsi ({latest_year}); "
                f"{ra.nama_resmi(top['region_id'])} (#1, ~{top['share']:.0f}%) NOL coverage - "
                "blind spot ditampilkan eksplisit"
            )
    return notes


if __name__ == "__main__":
    main()
