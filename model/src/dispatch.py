"""Pre-compute absorber matching per kabupaten (contract v2 decision: matching
is locked as an M1 pre-compute, browser only renders `matches_per_kabupaten`).
Sederhana - hardcoded weights, no ML, per the brief.

# ASUMSI: absorbers.csv names real organizations (named pasar induk
# wholesale markets, a named cooperative, named processors/retailers/food
# bank) - the 3 rows with no confirmed real match were dropped rather than
# left as fabricated placeholders. kapasitas_ton/harga_tawar_rp for every
# row remain illustrative estimates, not confirmed operational figures -
# nobody has actually contacted these organizations to ask their real
# buying capacity/price. selisih_vs_pasar
# uses cabai_rawit's current-week forecast price where available, falling back
# to the full production-cost floor (ongkos_petik+biaya_produksi) for
# kabupaten with no price series - documented, not hidden.
"""
import json
import math
import numpy as np
import pandas as pd

from aliases import DATA_CURATED


# ASUMSI: 80km dipilih sebagai batas jarak "realistis buat panen darurat" -
# angkutan hasil panen segar (cabai/bawang) dalam sehari di jalan Jawa Barat,
# bukan hasil kalibrasi/sitasi. Sebelum ada batas ini, kabupaten yang jauh
# dari SEMUA absorber (mis. Bogor, 27 kabupaten cuma ada 12 absorber yang
# mengelompok di selatan/tengah) tetap dipaksa dapat "top-5 terdekat" walau
# jaraknya 150-200km - jelas bukan opsi darurat yang masuk akal.
MAX_JARAK_ABSORBER_KM = 80


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_absorbers() -> pd.DataFrame:
    return pd.read_csv(DATA_CURATED / "absorbers.csv")


def match_score(jarak_km: float, kapasitas_ton: float, harga_tawar_rp: float,
                 max_harga_tawar_rp: float) -> float:
    """0-100, hardcoded weights: 40% proximity, 30% offer price, 30% capacity."""
    jarak_score = max(0.0, 100 - jarak_km * 2)
    harga_score = 100 * harga_tawar_rp / max_harga_tawar_rp if max_harga_tawar_rp else 0
    kapasitas_score = min(100.0, kapasitas_ton * 10)
    return round(0.4 * jarak_score + 0.3 * harga_score + 0.3 * kapasitas_score)


def build_absorbers_json(ra, harga_referensi_per_kabupaten: dict = None) -> dict:
    """harga_referensi_per_kabupaten: {region_id: current cabai_rawit price rp/kg}
    for computing selisih_vs_pasar; falls back to the production-cost floor
    (price_thresholds.cabai_rawit) when a kabupaten has no price series."""
    absorbers = load_absorbers()
    max_harga_tawar = absorbers["harga_tawar_rp"].max()

    with open(DATA_CURATED / "price_thresholds.json", encoding="utf-8") as f:
        thresholds = json.load(f)
    fallback_ref = (thresholds["cabai_rawit"]["ongkos_petik_rp"]
                     + thresholds["cabai_rawit"]["biaya_produksi_rp"])
    harga_referensi_per_kabupaten = harga_referensi_per_kabupaten or {}

    kabupaten_centroid = []
    matches_per_kabupaten = {}
    for region_id in ra.all_ids():
        lat, lng = ra.centroid(region_id)
        kabupaten_centroid.append({"id": region_id, "lat": lat, "lng": lng})

        harga_pasar = harga_referensi_per_kabupaten.get(region_id, fallback_ref)
        rows = []
        for _, a in absorbers.iterrows():
            jarak = haversine_km(lat, lng, a["lat"], a["lng"])
            if jarak > MAX_JARAK_ABSORBER_KM:
                continue
            score = match_score(jarak, a["kapasitas_ton"], a["harga_tawar_rp"], max_harga_tawar)
            selisih = a["harga_tawar_rp"] - harga_pasar
            uplift_juta = (selisih * a["kapasitas_ton"] * 1000) / 1_000_000
            rows.append({
                "absorber_id": a["id"],
                "jarak_km": round(jarak, 1),
                "skor": score,
                "selisih_vs_pasar_rp_per_kg": round(selisih),
                "estimasi_uplift_juta": round(uplift_juta, 1),
            })
        rows.sort(key=lambda r: r["skor"], reverse=True)
        matches_per_kabupaten[region_id] = rows[:5]  # top-5 closest/best-fit only

    absorbers_out = absorbers.to_dict(orient="records")
    return {
        "absorbers": absorbers_out,
        "kabupaten_centroid": kabupaten_centroid,
        "matches_per_kabupaten": matches_per_kabupaten,
    }
