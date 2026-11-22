Switzerland canton boundaries: Federal Office of Topography swisstopo, distributed by geoBoundaries gbOpen.

- Dataset: CHE ADM1, 2022, 26 cantons
- Source: https://www.geoboundaries.org/api/current/gbOpen/CHE/ADM1/
- Download: https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/CHE/ADM1/geoBoundaries-CHE-ADM1_simplified.geojson
- License recorded by geoBoundaries: Federal Office of Topography swisstopo License
- License source: https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices

Geometry is served locally; no third-party map tiles or API keys are required. The displayed station location uses the first available ICON coordinate pair in the sample CSV.

Postal-code boundary lines: Federal Office of Topography swisstopo, Official directory of towns and cities.

- Dataset: `ch.swisstopo-vd.ortschaftenverzeichnis_plz`, AMTOVZ ZIP layer, 1 November 2026
- Source catalog: https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo-vd.ortschaftenverzeichnis_plz
- Product information: https://www.swisstopo.admin.ch/en/official-directory-of-towns-and-cities
- Geometry: transformed from LV95 to WGS84 and simplified to a boundaries-only local GeoJSON asset
- Grid-point PLZ lookup and isolated-point clipping polygons: official GeoAdmin identify service
- License source: https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices

Major lake areas: Federal Office of Topography swisstopo, swissTLMRegio.

- Dataset: swissTLMRegio 2025, Hydrography / Lake
- Source catalog: https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swisstlmregio
- Product information: https://www.swisstopo.admin.ch/en/landscape-model-swisstlmregio
- Selection: the 31 lake polygons of at least 3 km² that intersect Switzerland
- Border lakes: full source geometry is retained, including portions outside Switzerland
- Geometry: transformed from LV95 to WGS84 and served locally as one MultiPolygon
- License source: https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices
