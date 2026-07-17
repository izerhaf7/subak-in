"""Builds every JSON in the web/public/data/ contract. This module only
ASSEMBLES dicts from already-computed results (forecasts, supply curves, risk
scores) - run_all.py does the actual computation loop and calls these builders,
then writes the files. Kept separate so the JSON *shape* lives in one place.

# ASUMSI (extensions beyond the literal contract, both flagged to the user):
# 1. map.json's contract shows ONE flat file with a single komoditas_id - but
#    the pitch's central blind-spot narrative (Kab. Bandung / bawang_merah) and
#    the general need to switch commodities on the choropleth both require
#    per-commodity data. So: map.json = cabai_rawit (matches the contract's own
#    example verbatim), plus map_bawang_merah.json / map_cabai_besar.json as
#    same-schema siblings.
# 2. kabupaten/{id}.json is likewise contract'd as commodity-agnostic, but its
#    content (harga curves) is inherently per-commodity. Writes both a bare
#    kabupaten/{id}.json (best-measured commodity for that kabupaten, for a
#    literal-contract-compliant default) AND kabupaten/{id}__{komoditas_id}.json
#    siblings for every commodity that has a forecast, so the frontend can
#    switch commodity per kabupaten too.
"""
import json
from pathlib import Path

import numpy as np

from aliases import WEB_DATA, DATA_CURATED

KOMODITAS_IDS = ["cabai_rawit", "bawang_merah", "cabai_besar"]
KOMODITAS_NAMA = {"cabai_rawit": "Cabai Rawit", "bawang_merah": "Bawang Merah", "cabai_besar": "Cabai Besar"}
KOMODITAS_TIER = {"cabai_rawit": 1, "bawang_merah": 1, "cabai_besar": 2}
KOMODITAS_SUMBER_HARGA = {"cabai_rawit": "pihps_produsen", "bawang_merah": "pihps_produsen", "cabai_besar": None}


def _round_or_none(x, ndigits=0):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return round(float(x), ndigits) if ndigits else round(float(x))


def write_json(relative_path: str, data: dict):
    path = WEB_DATA / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  wrote {relative_path}")


def build_meta(minggu_berjalan: int, label_minggu: list, estimasi_unit_lahan_total: int,
                catatan_coverage: dict) -> dict:
    with open(DATA_CURATED / "crop_constants.json", encoding="utf-8") as f:
        crop_constants = json.load(f)
    with open(DATA_CURATED / "price_thresholds.json", encoding="utf-8") as f:
        price_thresholds = json.load(f)

    komoditas = []
    for kid in KOMODITAS_IDS:
        cc = crop_constants[kid]
        pt = price_thresholds[kid]
        komoditas.append({
            "id": kid,
            "nama": KOMODITAS_NAMA[kid],
            "tier": KOMODITAS_TIER[kid],
            "sumber_harga": KOMODITAS_SUMBER_HARGA[kid],
            "ongkos_petik_rp": pt["ongkos_petik_rp"],
            "biaya_produksi_rp": pt["biaya_produksi_rp"],
            "sitasi_ambang": pt["sitasi_ambang"],
            "kernel_panen": {
                "semai_hari": cc["semai_hari"],
                "mulai_panen_hari": cc["mulai_panen_hari"],
                "panjang_panen_minggu": cc["panjang_panen_minggu"],
                "bobot_mingguan": cc["bobot_mingguan"],
                "sitasi": cc["sitasi"],
            },
        })

    from datetime import datetime, timezone, timedelta
    WIB = timezone(timedelta(hours=7))
    return {
        "generated_at": datetime.now(WIB).isoformat(timespec="seconds"),
        "provinsi": "Jawa Barat",
        "minggu_berjalan": minggu_berjalan,
        "label_minggu": label_minggu,
        "komoditas": komoditas,
        "estimasi_unit_lahan_total": estimasi_unit_lahan_total,
        "catatan_coverage": catatan_coverage,
        "_catatan_unit_lahan": (
            "estimasi_unit_lahan_total hanya menjumlahkan 8 kabupaten yang punya "
            "estimasi di bps_estimasi_unit_lahan.csv (proxy Sensus Pertanian 2023), "
            "BUKAN seluruh 27 kabupaten/kota - kabupaten lain null di map.json."
        ),
    }


def build_map(komoditas_id: str, region_rows: list, provinsi_ton_wide: list = None,
              max_ton_wide: list = None) -> dict:
    """region_rows: list of dicts with keys id, nama, status_data, risk_mingguan
    (list of {minggu, skor}), kpi (dict), estimasi_unit_lahan.

    provinsi_ton_wide: the OVERLAP_MEAN_HORIZON-week province-wide supply
    curve (sum of every kabupaten's own wide curve) that risk.py's
    score_overlap_provinsi() scored every kabupaten's risk_mingguan against.

    max_ton_wide: per week, the LARGEST single kabupaten's ton_wide that week
    - score_overlap_provinsi normalizes every kabupaten's own contribution
    against this (not against provinsi_ton_wide directly) so the top
    contributor in a given week can read as genuinely high-risk instead of
    being capped at its raw percentage share of the province total.

    Both exposed so the frontend's live risk recompute (shifting a
    kabupaten's planting schedule in Simulasi Tanam) can rebuild the SAME
    province reference the backend used, instead of re-deriving risk from a
    kabupaten-only view that has no way to detect province-wide effects."""
    out = {"komoditas_id": komoditas_id, "kabupaten": region_rows}
    if provinsi_ton_wide is not None:
        out["provinsi_ton_wide"] = [round(float(t), 1) for t in provinsi_ton_wide]
    if max_ton_wide is not None:
        out["max_ton_wide"] = [round(float(t), 1) for t in max_ton_wide]
    return out


def build_kabupaten_detail(region_id: str, nama: str, status_data: str,
                            historis: list, forecast: list, mape_pct, keyakinan,
                            pasokan_mingguan: list, retail_overlay: list = None) -> dict:
    out = {
        "id": region_id,
        "nama": nama,
        "status_data": status_data,
        "harga": {
            "historis": historis,
            "forecast": forecast,
            "mape_pct": mape_pct,
            "keyakinan": keyakinan,
        },
        "pasokan_mingguan": pasokan_mingguan,
    }
    if retail_overlay:
        out["retail_overlay"] = retail_overlay
    return out


def build_simulasi(komoditas_id: str, kabupaten_rows: list, permintaan_mingguan_ton: float,
                    lookup: list, test_vector: dict,
                    pasokan_provinsi_baseline: list = None,
                    permintaan_provinsi_mingguan_ton: float = None) -> dict:
    """Builds simulasi.json.

    pasokan_provinsi_baseline: 16-week supply curve summed across ALL 27
    kabupaten at their default planting timing. Used by the frontend to show
    the provincial aggregate supply curve and compute the effect of staggering
    one kabupaten's planting window: subtract the kabupaten's pasokan_baseline_ton
    from the provincial baseline, add the shifted curve, compare to demand.

    permintaan_provinsi_mingguan_ton: provincial weekly demand proxy (total
    annual production / 52), for the aggregate supply vs demand chart.

    Each kabupaten entry in kabupaten_rows must have a pasokan_baseline_ton
    field (list of 16 weekly ton values) so the frontend can perform the
    subtraction without re-running the convolution in Python. Each entry also
    carries jendela_tanam/jendela_panen ({mulai_iso, akhir_iso}) - computed by
    supply.jendela_tanam()/jendela_panen() in run_all.py - so the frontend
    timeline can render planting/harvest window bands without recomputing the
    kernel-peak-offset arithmetic client-side.
    """
    out = {
        "komoditas_id": komoditas_id,
        "kabupaten": kabupaten_rows,
        "permintaan_mingguan_ton": permintaan_mingguan_ton,
        "elastisitas_display": {
            "keterangan": "harga = f(rasio pasokan/permintaan); frontend interpolasi dari lookup",
            "lookup": lookup,
        },
        "test_vector": test_vector,
        "catatan_alokasi_luas": (
            "luas per varian = estimasi proporsional dari rasio produksi "
            "(BPS hanya publish luas gabungan)"
        ),
    }
    if pasokan_provinsi_baseline is not None:
        out["pasokan_provinsi_baseline"] = {
            "ton_per_minggu": pasokan_provinsi_baseline,
            "catatan": (
                "jumlah supply model 27 kabupaten Jabar pada jadwal tanam baseline. "
                "Frontend: untuk simulasi staggering satu kabupaten, hitung "
                "pasokan_provinsi_baseline - kabupaten.pasokan_baseline_ton + "
                "convolve_single_cohort(kohort_digeser) agar agregat provinsi ikut berubah."
            ),
        }
    if permintaan_provinsi_mingguan_ton is not None:
        out["permintaan_provinsi_mingguan_ton"] = permintaan_provinsi_mingguan_ton
        out["_catatan_permintaan_provinsi"] = (
            "proxy: total produksi tahunan cabai_rawit seluruh 27 kab (BPS tahun terbaru) / 52. "
            "ASUMSI rough equilibrium — tidak ada dataset konsumsi per-kabupaten."
        )
    return out
