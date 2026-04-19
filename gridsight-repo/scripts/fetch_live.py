"""Pull NWS + EIA + NREL once and cache to live.json for offline frontend use.

Usage:
    export EIA_API_KEY=...   # optional
    export NREL_API_KEY=...  # optional
    python scripts/fetch_live.py --output ../public/live.json
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

PHOENIX_LAT, PHOENIX_LON = 33.4484, -112.074
NWS_POINT = f"https://api.weather.gov/points/{PHOENIX_LAT},{PHOENIX_LON}"
HEADERS = {"User-Agent": "GridSight.AI hackathon (contact: gridsight@example.com)"}


def c_to_f(c: float) -> int:
    return round(c * 9 / 5 + 32)


def nws_high() -> float | None:
    try:
        pj = requests.get(NWS_POINT, headers=HEADERS, timeout=10).json()
        fc = requests.get(pj["properties"]["forecast"], headers=HEADERS, timeout=10).json()
        for p in fc["properties"]["periods"]:
            if p["isDaytime"]:
                return c_to_f(p["temperature"]) if p["temperatureUnit"] == "C" else p["temperature"]
    except Exception as e:
        print(f"[nws] failed: {e}")
    return None


def eia_demand() -> float | None:
    key = os.getenv("EIA_API_KEY")
    if not key:
        return None
    try:
        r = requests.get(
            "https://api.eia.gov/v2/electricity/rto/region-data/data/",
            params={
                "api_key": key,
                "frequency": "hourly",
                "data[0]": "value",
                "facets[respondent][]": "AZPS",
                "facets[type][]": "D",
                "sort[0][column]": "period",
                "sort[0][direction]": "desc",
                "length": 1,
            },
            timeout=15,
        ).json()
        return float(r["response"]["data"][0]["value"])
    except Exception as e:
        print(f"[eia] failed: {e}")
        return None


def nrel_ghi() -> float | None:
    key = os.getenv("NREL_API_KEY")
    if not key:
        return None
    try:
        r = requests.get(
            "https://developer.nrel.gov/api/solar/solar_resource/v1.json",
            params={"api_key": key, "lat": PHOENIX_LAT, "lon": PHOENIX_LON},
            timeout=15,
        ).json()
        month = ["january", "february", "march", "april", "may", "june",
                 "july", "august", "september", "october", "november", "december"][
            datetime.now().month - 1
        ]
        avg_dni = r["outputs"]["avg_dni"]["monthly"][month]
        return round((avg_dni * 1000) / 6)
    except Exception as e:
        print(f"[nrel] failed: {e}")
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=str(Path(__file__).resolve().parents[2] / "public" / "live.json"))
    args = ap.parse_args()

    payload = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "peak_temp_f": nws_high(),
        "current_demand_mw": eia_demand(),
        "solar_ghi": nrel_ghi(),
        "keys_used": {"eia": bool(os.getenv("EIA_API_KEY")), "nrel": bool(os.getenv("NREL_API_KEY"))},
    }
    if payload["peak_temp_f"] is None:
        payload["peak_temp_f"] = 108
        payload["note"] = "NWS unreachable — wrote seasonal baseline 108°F"

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))
    print(f"[fetch_live] wrote {out}: {payload}")


if __name__ == "__main__":
    main()
