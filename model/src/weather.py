"""Summarize bmkg_prakiraan_cuaca.csv (already-scraped cache, 6 sentra
kabupaten only) into the weather.json badge + a small risk_modifier used by
risk.py. This REPLACES any live BMKG call - contract's non-negotiable
requirement is zero live calls during demo, so this only ever reads the cache
CSV, never hits an API.

risk_modifier logic (contract: "hujan tinggi 3 hari ke depan -> risk +0.1,
panen tertahan -> menumpuk saat cuaca membaik"): rain volume over the cached
3-day window pushes risk up (harvest gets delayed, then stacks up once
weather clears); a clearly dry window is a mild favorable signal.
"""
from datetime import datetime, timezone, timedelta
import pandas as pd

from aliases import DATA_RAW

WIB = timezone(timedelta(hours=7))


def _risk_modifier(total_rain_mm: float, rain_days: int) -> float:
    if rain_days >= 2 or total_rain_mm > 15:
        return 0.1
    if total_rain_mm < 1.0:
        return -0.1
    return 0.0


def build_weather(ra) -> dict:
    df = pd.read_csv(DATA_RAW / "bmkg" / "bmkg_prakiraan_cuaca.csv", parse_dates=["datetime"])
    df["region_id"] = df["kabupaten"].map(ra.from_bmkg)
    df["tanggal"] = df["datetime"].dt.date

    per_kabupaten = []
    for region_id, sub in df.groupby("region_id"):
        lokasi_sampel = sub["kecamatan"].iloc[0]
        daily = sub.groupby("tanggal").agg(
            curah_hujan_mm=("curah_hujan_mm", "sum"),
            suhu_c=("suhu_c", "mean"),
            cuaca=("cuaca", lambda s: s.mode().iloc[0]),
        ).reset_index().sort_values("tanggal")

        ringkas_3hari = []
        for _, row in daily.head(3).iterrows():
            ringkas_3hari.append({
                "tanggal": str(row["tanggal"]),
                "kondisi": row["cuaca"],
                "suhu_c": round(float(row["suhu_c"])),
                "hujan_flag": bool(row["curah_hujan_mm"] > 0.5),
            })

        total_rain = float(daily.head(3)["curah_hujan_mm"].sum())
        rain_days = int((daily.head(3)["curah_hujan_mm"] > 0.5).sum())

        per_kabupaten.append({
            "id": region_id,
            "lokasi_sampel": lokasi_sampel,
            "ringkas_3hari": ringkas_3hari,
            "risk_modifier": _risk_modifier(total_rain, rain_days),
        })

    return {
        "sumber": "BMKG (cache scrape, bukan live)",
        "diambil_pada": datetime.now(WIB).isoformat(timespec="seconds"),
        "per_kabupaten": per_kabupaten,
    }


def weather_modifier_lookup(weather_json: dict) -> dict:
    """region_id -> risk_modifier, for risk.py to consume without re-parsing CSV."""
    return {k["id"]: k["risk_modifier"] for k in weather_json["per_kabupaten"]}
