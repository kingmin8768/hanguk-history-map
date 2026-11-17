#!/usr/bin/env python3
"""Rebuild the bundled Natural Earth land layer using only Python's stdlib."""

import hashlib
import json
from pathlib import Path
import urllib.request


SOURCE_COMMIT = "693f11422f4e08d2da4566b854dda53eb7c39fb3"
SOURCE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    f"{SOURCE_COMMIT}/geojson/ne_50m_land.geojson"
)
SOURCE_SHA256 = "e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b"
VIEW_BBOX = (116, 29, 141, 48)  # west, south, east, north; WGS84 lon/lat
ASSET_DIR = Path(__file__).resolve().parents[1] / "dist" / "assets"


def overlaps_view(polygon):
    """Retain whole polygons whose outer-ring bounds overlap the map view."""
    ring = polygon[0]
    west = min(point[0] for point in ring)
    east = max(point[0] for point in ring)
    south = min(point[1] for point in ring)
    north = max(point[1] for point in ring)
    return (
        east >= VIEW_BBOX[0]
        and west <= VIEW_BBOX[2]
        and north >= VIEW_BBOX[1]
        and south <= VIEW_BBOX[3]
    )


def select_land(source):
    features = []
    for feature in source["features"]:
        geometry = feature["geometry"]
        geometry_type = geometry["type"]
        if geometry_type == "Polygon":
            polygons = [geometry["coordinates"]]
        elif geometry_type == "MultiPolygon":
            polygons = geometry["coordinates"]
        else:
            raise ValueError(f"Unexpected source geometry: {geometry_type}")

        selected = [polygon for polygon in polygons if overlaps_view(polygon)]
        if not selected:
            continue

        # Keep every retained position and ring, without clipping or simplifying.
        # Source bbox fields would be stale after filtering a MultiPolygon.
        retained = {key: value for key, value in feature.items() if key != "bbox"}
        retained_geometry = {
            key: value for key, value in geometry.items() if key != "bbox"
        }
        retained_geometry["coordinates"] = (
            selected[0] if geometry_type == "Polygon" else selected
        )
        retained["geometry"] = retained_geometry
        features.append(retained)

    return {"type": "FeatureCollection", "features": features}


def main():
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
        source_bytes = response.read()
        final_url = response.geturl()

    source_hash = hashlib.sha256(source_bytes).hexdigest()
    if source_hash != SOURCE_SHA256:
        raise ValueError(f"Source SHA-256 mismatch: {source_hash}")

    land = select_land(json.loads(source_bytes))
    output_bytes = (
        json.dumps(land, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")
    output_hash = hashlib.sha256(output_bytes).hexdigest()
    polygon_count = sum(
        1 if feature["geometry"]["type"] == "Polygon"
        else len(feature["geometry"]["coordinates"])
        for feature in land["features"]
    )
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    (ASSET_DIR / "land.geojson").write_bytes(output_bytes)

    readme = f"""# Bundled basemap provenance

`land.geojson` contains Natural Earth **1:50m land polygons**, in WGS84 longitude/latitude.
Natural Earth data is public domain. Attribution: **Made with Natural Earth**.
See [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/).

- Upstream repository: https://github.com/nvkelso/natural-earth-vector
- Upstream file: `geojson/ne_50m_land.geojson`
- Pinned source commit: `{SOURCE_COMMIT}` (`v4.1.0 geojsons`, 2020-12-13)
- Final download URL: {final_url}
- Source bytes: {len(source_bytes):,}
- Source SHA-256: `{source_hash}`
- Retention bounding box: `[116, 29, 141, 48]` (west, south, east, north)
- Output: {len(land['features'])} features, {polygon_count} polygons, {len(output_bytes):,} bytes
- Output SHA-256: `{output_hash}`

The generator retains each polygon whose outer-ring bounding box intersects the view.
It preserves the source coordinates and all rings exactly, without further simplification,
clipping, rounding or redrawing. Large polygons can extend outside the view; the map's
SVG clips them at display time. Feature properties and geometry types are retained;
any source bounding-box metadata is removed after filtering. JSON is serialized compactly.

Rebuild from the project root with:

```sh
python3 scripts/fetch-basemap.py
```

The generator uses only the Python standard library, downloads the immutable source,
verifies its SHA-256, and recreates this README and the asset deterministically.
The application reads the bundled local asset and needs no runtime basemap download.
"""
    (ASSET_DIR / "README.md").write_text(readme, encoding="utf-8")
    print(json.dumps({
        "asset": str(ASSET_DIR / "land.geojson"),
        "bytes": len(output_bytes),
        "features": len(land["features"]),
        "polygons": polygon_count,
        "sha256": output_hash,
        "source_url": final_url,
    }, indent=2))


if __name__ == "__main__":
    main()
