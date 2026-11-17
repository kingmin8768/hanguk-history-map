# Bundled basemap provenance

`land.geojson` contains Natural Earth **1:50m land polygons**, in WGS84 longitude/latitude.
Natural Earth data is public domain. Attribution: **Made with Natural Earth**.
See [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/).

- Upstream repository: https://github.com/nvkelso/natural-earth-vector
- Upstream file: `geojson/ne_50m_land.geojson`
- Pinned source commit: `693f11422f4e08d2da4566b854dda53eb7c39fb3` (`v4.1.0 geojsons`, 2020-12-13)
- Final download URL: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/693f11422f4e08d2da4566b854dda53eb7c39fb3/geojson/ne_50m_land.geojson
- Source bytes: 1,636,166
- Source SHA-256: `e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b`
- Retention bounding box: `[116, 29, 141, 48]` (west, south, east, north)
- Output: 42 features, 42 polygons, 265,548 bytes
- Output SHA-256: `6ffbc8cce6723d5d08dbcb5e5b31c9bcc14062767d1e295ba2c1d661f032aa6f`

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
