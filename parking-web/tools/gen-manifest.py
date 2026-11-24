#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-manifest.py — יוצר manifest.json מתוך תיקיית תמונות (סימולציית מצלמת IoT)
עבור לוח הבקרה של שומר החניון.

שימוש:
    python tools/gen-manifest.py "C:/parking/camera-drop/images" [-o "C:/parking/camera-drop/api/manifest.json"]

פלט: מערך JSON, מהחדש לישן, UTF-8 (ללא BOM):
    [ { "file": "car_2026-11-16_10-15-01.jpg", "ts": "2026-11-16T10:15:01" }, ... ]
"""
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".svg", ".bmp"}

# תבניות חותמת-זמן בשם הקובץ: *_YYYY-MM-DD_HH-MM-SS.* או *_YYYYMMDD_HHMMSS.*
PATTERNS = (
    re.compile(r"(20\d{2})[-.](\d{2})[-.](\d{2})[_-](\d{2})[-.](\d{2})[-.](\d{2})"),
    re.compile(r"(20\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})"),
)


def ts_from_name(name: str):
    for pat in PATTERNS:
        m = pat.search(name)
        if m:
            y, mo, d, h, mi, s = (int(g) for g in m.groups())
            try:
                return datetime(y, mo, d, h, mi, s)
            except ValueError:
                continue
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("images_dir")
    ap.add_argument("-o", "--out", default="")
    args = ap.parse_args()

    images_dir = Path(args.images_dir)
    if not images_dir.is_dir():
        print(f"תיקיית התמונות לא נמצאה: {images_dir}", file=sys.stderr)
        return 1
    out_file = Path(args.out) if args.out else images_dir / "manifest.json"

    items = []
    for f in images_dir.iterdir():
        if not f.is_file() or f.suffix.lower() not in EXTS:
            continue
        ts = ts_from_name(f.name) or datetime.fromtimestamp(f.stat().st_mtime)
        items.append({"file": f.name, "ts": ts.strftime("%Y-%m-%dT%H:%M:%S")})

    items.sort(key=lambda x: x["ts"], reverse=True)

    with open(out_file, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=2)

    print(f"נוצרו {len(items)} רשומות בקובץ {out_file}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
