# Serverless Browser-Based Sentinel-2 Explorer — Full Implementation Plan

## 0. User Experience Principles

The application must be designed for **non-expert end users**. The following principles apply to all technical implementation steps:
- **No jargon in the primary UI:** Translate remote-sensing terms into plain language (e.g., "Vegetation Health" instead of NDVI, "Image Quality" instead of SCL).
- **Sensible defaults:** Guide users through a workflow ("Where?", "What do you want to know?") rather than requiring up-front technical configuration. Raw controls should be hidden behind an "Advanced" toggle.
- **Interpretive layers:** Raw data (statistics, cloud cover percentages) must be accompanied by plain-English summaries and visual indicators (e.g., traffic-light quality indicators). Raw data remains available but is not the primary interface.
- **Mobile-first design:** The interface (map, chart, drawing tools) must be explicitly designed for small screens.

---

## 1. Project Objective

Build a **serverless, client-side geospatial analysis application** that allows users to discover, inspect, analyse and export Sentinel-2 imagery entirely from their browser.

The application should:

- Allow users to select a point, polygon or bounding box.
- Query public STAC APIs for suitable Sentinel-2 imagery.
- Render Sentinel-2 COGs directly on a MapLibre map.
- Read only the required raster windows using HTTP Range Requests.
- Perform raster calculations locally in the browser.
- Apply pixel-level cloud and quality masking.
- Generate historical spectral-index time series.
- Display spatial imagery and temporal statistics together.
- Cache metadata and computed results locally.
- Preserve data provenance.
- Require **no application server, database, API key or user account**.

The initial target use case is Sentinel-2 vegetation analysis, particularly NDVI, but the architecture should support arbitrary spectral indices and future raster analyses.

---

# 2. Core Architectural Principle

The application should follow this architecture:

```text
                    PUBLIC CLOUD DATA
                           │
             ┌─────────────┴─────────────┐
             │                           │
        STAC Catalog                COG Storage
             │                           │
             ▼                           ▼
       Scene discovery              HTTP Range
             │                           │
             └─────────────┬─────────────┘
                           │
                           ▼
                 BROWSER APPLICATION
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   Map rendering      Raster engine      Time-series
        │                  │                  │
    MapLibre            COG reader        Statistics
        │                  │                  │
        │             TypedArrays/WASM     Charts
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                    IndexedDB cache
```

The application itself has **no backend**.

External infrastructure is limited to public STAC APIs and cloud-hosted raster assets.

---

# 3. Design Goals

## 3.1 Primary goals

- Zero backend infrastructure.
- No API keys.
- No registration.
- No user data uploaded to a server.
- Browser-local processing.
- Efficient access to large COGs.
- Scientifically defensible Sentinel-2 analysis.
- Progressive processing for large datasets.
- Reproducible results.
- Clear data-quality information.

## 3.2 Secondary goals

- Support multiple STAC providers.
- Support multiple Sentinel-2 products.
- Support arbitrary spectral indices.
- Support point, polygon and area analysis.
- Support local caching.
- Support CSV/JSON/GeoJSON export.
- Eventually support more sophisticated statistical analysis through Pyodide/DuckDB-Wasm.

## 3.3 Engineering Risks

The following technical risks must be explicitly managed during implementation:

- **Missing reprojection library:** Transforming user AOIs into Sentinel's UTM-zone CRS requires an explicit reprojection tool (e.g., `proj4js`), which must be added to the technology stack.
- **Client-side performance on multi-scene time series:** Pulling and decoding numerous COG windows strictly in JS may cause bottlenecks on average hardware. **Real benchmarking must happen early in Phase 2/3**, not delayed until Phase 8.
- **Reliance on a single STAC provider:** Using only Earth Search (Element 84) creates a single point of failure without SLAs. A fallback strategy or clear error messaging for rate-limits/outages is required.
- **Multi-tile mosaicking:** Correctly extracting and assembling AOIs spanning multiple tile/UTM-zone boundaries is complex and must be explicitly scoped early.

---

# 4. Technology Stack

## 4.1 Core application

- TypeScript
- Vite
- MapLibre GL JS
- `proj4js` (or equivalent for handling required UTM CRS reprojections)
- HTML/CSS or React/Svelte if required

Avoid introducing a large framework unless it provides a genuine UI benefit.

---

## 4.2 STAC

Initial provider:

- Element 84 Earth Search STAC API

The application must **discover and validate collections and assets dynamically** rather than assuming collection IDs or asset names.

The STAC layer should support:

- `/collections`
- collection metadata
- `/search`
- GET search where appropriate
- POST search for complex geometries
- pagination
- spatial filtering
- temporal filtering
- cloud-cover filtering
- collection filtering

---

## 4.3 Raster access

Use:

- `geotiff.js`

for analytical raster extraction.

Use:

- `@geomatico/maplibre-cog-protocol`

for direct COG visualisation in MapLibre.

COGs should be accessed using HTTP Range Requests wherever supported.

---

## 4.4 Numerical processing

### Phase 1

Use:

- JavaScript/TypeScript
- TypedArrays

This is sufficient for:

- NDVI
- [ ] NDMI
- [ ] NBR
- basic statistics
- masking
- pixel arithmetic

### Phase 2

Add WASM where profiling demonstrates a benefit.

### Phase 3

Add Pyodide for advanced Python functionality such as:

- [ ] scipy
- [ ] statsmodels
- advanced time-series analysis
- custom Python algorithms

### Phase 4

Consider DuckDB-Wasm for:

- large analytical tables
- [ ] Arrow/Parquet
- complex filtering
- grouping
- joins
- multi-index analysis

Neither Pyodide nor DuckDB-Wasm should be a dependency of the initial NDVI implementation.

---

## 4.5 Charts

Use:

- Apache ECharts

or:

- Chart.js

ECharts is preferable if the application will eventually provide sophisticated interactive time-series exploration.

---

## 4.6 Browser storage

Use:

- IndexedDB

for local caching of:

- [ ] STAC metadata
- search results
- analysis configuration
- computed time-series observations
- potentially downloaded COG windows

The cache should have a configurable size/eviction policy.

---

# 5. User Workflow

The intended user workflow is a **guided, plain-language flow**, hiding technical complexity by default:

```text
1. "Where?"
   (User searches for an address/place or selects an area on the map)
        ↓
2. "What do you want to know?"
   (User selects a goal, e.g., "How healthy is my vegetation?", rather than configuring technical indices)
        ↓
3. Automated Discovery
   (System applies sensible defaults for dates, cloud thresholds, and fetches STAC imagery)
        ↓
4. Processing
   (Progressive processing with plain-language feedback)
        ↓
5. Plain-Language Results
   (Display interpretive traffic-light quality indicators and summaries alongside charts)
        ↓
6. Explore on Map
   (Click chart to see specific satellite imagery and read-outs)
        ↓
7. Export results (Advanced option)
```

---

# 6. Area of Interest

Support three selection modes.

## 6.1 Point

User clicks the map.

Use cases:

- vegetation at a specific location
- individual monitoring site
- field location
- pixel time series

This should be the cheapest and fastest analysis mode.

---

## 6.2 Polygon

User draws an arbitrary polygon.

This should be the primary area-analysis mode.

The polygon should be retained as the authoritative AOI.

---

## 6.3 Bounding box

Support bounding boxes as a convenience.

However:

> The bounding box should be used for STAC discovery, while the actual analysis should use the original polygon whenever available.

Architecture:

```text
User polygon
     │
     ├── bbox → STAC search
     │
     └── polygon → raster masking
```

---

## 6.4 Address/Place Search (Geocoding)

Non-expert users should not be expected to manually pan a raw map to find coordinates. Provide an **address/place-name search bar** powered by a geocoding API to easily fly the map to their desired location before they make a selection.

---

# 7. AOI Validation

Before analysis, evaluate the AOI internally for processing footprint, but translate these technical metrics (pixel counts, exact megabytes) into **plain-language user feedback**.

Example plain-language messaging:
- "Small area — should process in a few seconds."
- "Medium area — this might take a bit longer."
- "Large area — this may take a minute, want to continue?"

The user should receive a clear, friendly warning for very large analyses, giving them the option to cancel or proceed.

---

# 8. Resource Tiers

Do not use only an arbitrary maximum-area restriction.

Implement resource tiers.

## 8.1 Point analysis

Smallest workload.

Suitable for:

- full historical time series
- many spectral indices
- pixel-level charts

---

## 8.2 Small/medium polygon

Suitable for:

- [ ] median NDVI
- [ ] mean NDVI
- distributions
- time series

---

## 8.3 Large polygon

Use:

- chunked processing
- progressive results
- explicit user confirmation
- potentially reduced temporal resolution

---

## 8.4 Raster analysis

For users requesting a spatial raster rather than statistics:

- process only the selected date
- process progressively
- avoid retaining unnecessary historical arrays

---

# 9. STAC Discovery Layer

Create a dedicated STAC client.

Responsibilities:

```text
STACClient
├── getCatalog()
├── getCollections()
├── getCollection()
├── search()
├── paginate()
├── validateItem()
└── extractAssets()
```

Do not allow the UI to directly manipulate STAC URLs.

---

# 10. Collection Discovery

At startup:

1. Query the STAC API.
2. Discover available collections.
3. Identify Sentinel-2 collections.
4. Inspect collection metadata.
5. Verify:
   - product level
   - spatial reference
   - available bands
   - asset types
   - cloud metadata
   - temporal coverage

Do not assume:

```text
collection = Sentinel-2
```

or:

```text
B04 = fixed URL
B08 = fixed URL
```

The application should derive these from the STAC Item.

---

# 11. STAC Search

Search parameters should include:

- AOI bbox
- AOI geometry where supported
- start datetime
- end datetime
- Sentinel-2 collection
- cloud-cover threshold
- optional platform
- optional processing level

Example logical query:

```text
AOI
+
2020-01-01 → 2026-01-01
+
Sentinel-2 L2A
+
eo:cloud_cover < 30%
```

The cloud threshold should be configurable.

A default of 20–30% is reasonable as a **scene discovery filter**, but must never be treated as a pixel-level quality guarantee.

---

# 12. STAC Pagination

STAC searches may return many Items.

Implement pagination and progressive discovery.

Do not assume one search response contains all results.

The UI should display:

```text
Found 184 scenes
```

rather than immediately downloading all scene metadata indefinitely.

---

# 13. Scene Planning

Create a `ScenePlanner`.

Responsibilities:

1. Remove invalid Items.
2. Determine AOI coverage.
3. Group overlapping acquisitions.
4. Identify Sentinel tile coverage.
5. Select required assets.
6. Determine required bands.
7. Determine required raster windows.
8. Estimate processing cost.

Architecture:

```text
STAC Items
    ↓
ScenePlanner
    ↓
Observation groups
    ↓
Required tiles/assets
    ↓
Processing jobs
```

---

# 14. Temporal Observation Model

Internally retain:

```text
observation_id
datetime
item_id
tile
platform
collection
assets
cloud_cover
AOI coverage
```

Do not use only the calendar date.

Multiple Sentinel-2 acquisitions or tiles can contribute to one observation.

---

# 15. Multi-Tile AOIs

An AOI may cross Sentinel-2 tile boundaries.

Therefore:

```text
AOI
 ↓
STAC search
 ↓
multiple Items
 ↓
identify spatial coverage
 ↓
extract relevant raster windows
 ↓
mosaic where necessary
```

The analysis engine must not assume one STAC Item represents the complete AOI.

---

# 16. COG Rendering

After STAC discovery:

1. Select a visual asset.
2. Inspect its metadata.
3. Register the COG protocol.
4. Add it to MapLibre.
5. Render the imagery.

Initial milestone:

> Display one Sentinel-2 COG from one STAC Item on the map.

Do this before implementing analytics.

---

# 17. COG Extraction

For analysis:

```text
STAC Item
   ↓
asset URL
   ↓
GeoTIFF metadata
   ↓
CRS
   ↓
geotransform
   ↓
AOI → raster coordinates
   ↓
window calculation
   ↓
HTTP Range requests
   ↓
TypedArray
```

Never download the entire COG if only a small raster window is required.

---

# 18. Raster Window Calculation

The extractor should determine:

- raster CRS
- raster dimensions
- affine transform
- pixel size
- raster bounds
- AOI intersection

Then calculate the minimum required raster window.

The AOI should be transformed into the raster's coordinate reference system before calculating the pixel window.

---

# 19. Coordinate Reference Systems

This needs to be an explicit subsystem.

Handle:

```text
User map coordinates
        ↓
WGS84 / Web Mercator
        ↓
Sentinel raster CRS
        ↓
pixel coordinates
```

Do not assume the raster is in Web Mercator.

Sentinel-2 imagery is typically provided in UTM-based CRS zones.

---

# 20. Analysis Grid

Define a standard analysis grid.

For initial NDVI:

```text
Analysis grid = native 10 m Sentinel-2 grid
```

B4:

```text
10 m
```

B8:

```text
10 m
```

Therefore NDVI can be calculated without resampling those two bands.

For future indices involving 20 m or 60 m bands, define explicit resampling rules.

---

# 21. Raster Resampling

For continuous reflectance:

- nearest neighbour
- bilinear
- cubic

may be supported depending on the analysis.

For categorical data such as SCL:

> Use nearest-neighbour or an explicitly defined categorical strategy.

Never blindly bilinear-resample SCL classifications.

---

# 22. Pixel-Level Cloud Masking

This is mandatory for scientifically meaningful analysis.

Do not rely solely on:

```text
eo:cloud_cover
```

Use Sentinel-2 quality information such as SCL where available.

The processing pipeline should identify and exclude:

- cloud shadow
- clouds
- cirrus
- defective pixels
- saturated pixels where relevant
- nodata
- other unsuitable classes

Optional masks can include:

- snow/ice
- water
- user-selected classes

---

# 23. Cloud Probability

If a suitable cloud-probability asset is available, support it as an optional additional mask.

Allow configurable thresholds.

For example:

```text
Cloud probability < 40%
```

The user should eventually be able to configure the quality policy.

---

# 24. AOI Pixel Mask

After extracting raster data:

```text
Raster pixels
      ↓
AOI polygon mask
      ↓
valid pixels
```

Pixels inside the raster window but outside the user's polygon must not contribute to statistics.

---

# 25. Nodata Handling

Every analytical operation must account for:

- nodata
- NaN
- invalid reflectance
- missing bands
- masked pixels
- division by zero

For NDVI:

```text
denominator = NIR + Red
```

If:

```text
denominator == 0
```

return invalid rather than infinity/NaN contamination.

---

# 26. Spectral Index Engine

Do not hard-code NDVI into the entire application.

Create an expression-based index engine.

Example:

```text
NDVI
(B08 - B04) / (B08 + B04)

NDMI
(B08 - B11) / (B08 + B11)

NBR
(B08 - B12) / (B08 + B12)
```

Index definition:

```text
Index
├── name
├── description
├── required bands
├── expression
├── valid range
└── display metadata
```

This makes the system extensible.

---

# 27. Initial Supported Indices

Start with a tighter MVP focus to reduce the interpretation burden on non-expert users:

### Vegetation Health (NDVI)

Presented to the user as "Vegetation Health" rather than NDVI. This is the sole index for MVP v1.

### Future Indices (Hidden behind Advanced or framed by purpose)

Once a friendly framing is established for each, the following can be exposed:

- **Moisture Stress (NDMI)**
- **Fire/Burn Damage (NBR)**
- [ ] EVI, SAVI, NDWI, etc.

These should not be shown in the primary UI at launch.

---

# 28. Chunked Processing

Never assume the complete AOI fits comfortably in memory.

Process windows in chunks:

```text
AOI
 ↓
window 1
 ↓
B4 + B8 + SCL
 ↓
mask
 ↓
index
 ↓
statistics
 ↓
discard

window 2
 ↓
...
```

Memory usage is then determined primarily by:

```text
chunk size
```

rather than:

```text
AOI size
```

---

# 29. TypedArray Strategy

Use compact arrays where possible:

- `Uint16Array` for source reflectance
- `Uint8Array` for masks where appropriate
- `Float32Array` for calculated indices

Avoid unnecessary conversion to Float64.

---

# 30. Time-Series Processing

For every observation:

```text
1. Determine required assets
2. Extract raster windows
3. Align bands
4. Apply nodata mask
5. Apply SCL/cloud mask
6. Apply AOI mask
7. Calculate spectral index
8. Calculate statistics
9. Store quality metrics
10. Release raster arrays
```

Only retain the final observation statistics unless the user explicitly requests raster output.

---

# 31. Statistics

For each observation calculate at minimum:

- [ ] median
- [ ] mean
- standard deviation
- minimum
- maximum
- 10th percentile
- 25th percentile
- 75th percentile
- 90th percentile
- valid pixel count
- total AOI pixel count
- valid pixel fraction

The initial chart can use median NDVI.

For end users, this raw data must include an **interpretive layer**. A plain-English summary (e.g., "Vegetation is greener than usual for this time of year") should be displayed prominently alongside the chart, not hidden as raw data.

---

# 32. Quality Metrics

Every observation should contain:

```text
valid_fraction
valid_pixels
total_pixels
scene_cloud_cover
```

Translate these raw metrics into a **traffic-light quality indicator** for users:

Example UI Translation:

- **Good image quality (Green):** 95%+ valid pixels.
- **Fair image quality (Yellow):** 80-94% valid pixels.
- **Poor image quality (Red):** <80% valid pixels.

The raw percentages (e.g., "91% valid") can be available via hover/tooltip or export, but should not be the primary display.

---

# 33. Observation Quality Filtering

Allow the user to set:

```text
Minimum valid AOI:
80%
```

Then:

```text
valid_fraction < 0.80
```

can be excluded from the primary time series.

Retain excluded observations so users can inspect them.

---

# 34. Time-Series Model

Represent observations as:

```text
Observation
├── datetime
├── index
├── median
├── mean
├── std
├── quantiles
├── valid_fraction
├── item_ids
├── tile_ids
└── processing metadata
```

This model should be independent of the charting library.

---

# 35. Interactive Chart

Provide:

- date axis
- index value
- hover information
- valid-pixel percentage
- scene cloud cover
- ability to click a point

Clicking an observation should:

```text
Chart point
   ↓
identify STAC Item
   ↓
display corresponding imagery
   ↓
update map
```

---

# 36. Map ↔ Chart Synchronisation

The map and chart should be linked.

### Click map

Show:

- pixel/area time series

### Click chart

Show:

- corresponding satellite acquisition

### Change date

Update:

- map imagery
- quality information
- statistics

This should become a central UX feature.

---

# 37. Pixel Time-Series Mode

Add a fast analysis mode:

```text
Click map
   ↓
Sentinel pixel
   ↓
historical B4/B8
   ↓
NDVI
   ↓
time series
```

This is computationally cheap and should provide the quickest demonstration of the application.

---

# 38. Area Time-Series Mode

User draws polygon:

```text
Polygon
   ↓
historical imagery
   ↓
cloud masking
   ↓
NDVI
   ↓
median/mean
   ↓
time series
```

This is the primary analytical mode.

---

# 39. Spatial Raster Mode

User selects:

```text
Date
+
Index
```

The application calculates:

```text
NDVI raster
```

and displays it on the map.

This should be processed independently from the historical time-series engine.

---

# 40. Data Provenance

Every observation should retain provenance.

Example:

```json
{
  "datetime": "2026-01-15T22:34:12Z",
  "item_ids": ["..."],
  "collection": "...",
  "platform": "sentinel-2a",
  "cloud_cover": 8.4,
  "valid_fraction": 0.94,
  "bands": ["B04", "B08"],
  "index": "NDVI"
}
```

Provide a "View source/provenance" interface.

---

# 41. Reproducibility

Save the complete analysis configuration:

```text
AOI
date range
STAC API
collection
cloud threshold
quality mask
valid-pixel threshold
index
statistic
```

Allow this configuration to be exported as JSON.

A future user should be able to reproduce the analysis.

---

# 42. Browser Caching

Use IndexedDB to cache:

### STAC

- collections
- Item metadata
- search results

### Analysis

- completed observations
- processing metadata

### Optional raster cache

- recently accessed COG windows

Caching should be content-aware and bounded.

---

# 43. Avoid Uncontrolled Storage

Do not cache entire Sentinel scenes.

Use:

- LRU-style eviction
- maximum storage size
- expiration where appropriate

The browser should remain responsive.

---

# 44. Concurrency

Do not launch hundreds of simultaneous COG requests.

Implement a job queue:

```text
                 ┌── observation 1
                 ├── observation 2
Queue ───────────┼── observation 3
                 ├── observation 4
                 └── ...
```

Limit concurrency based on:

- browser capability
- network conditions
- server behaviour

---

# 45. Progressive Processing

Don't wait for every scene before showing results.

Display observations as they complete:

```text
Processing:
████████░░░░░░░░ 42%

Available observations:
36 / 84
```

The chart should update progressively.

---

# 46. Cancellation

Long-running analyses need a Cancel button.

Cancellation should stop:

- queued requests
- processing jobs
- unnecessary raster reads

Already completed observations can remain available.

---

# 47. Error Handling

Handle:

- STAC unavailable
- COG unavailable
- CORS failure
- missing asset
- malformed STAC Item
- unsupported CRS
- unsupported compression
- HTTP Range failure
- browser memory pressure
- insufficient valid pixels
- incomplete tile coverage
- network interruption

Errors should identify the affected observation rather than failing the entire analysis.

---

# 48. Network Diagnostics

During development, explicitly measure:

- number of requests
- Range requests
- response sizes
- HTTP 206 responses
- OPTIONS requests
- request latency
- cache effectiveness

Do not assume a particular CORS/OPTIONS behaviour.

Measure it in Chrome/Edge DevTools.

---

# 49. Performance Targets

Define practical targets.

For a small AOI:

```text
STAC discovery:       <2 s
First imagery:        <5 s
Point time series:    <10 s
Small AOI analysis:   <30 s
```

Exact targets should be refined through benchmarking.

---

# 50. Progressive User Feedback

Show meaningful stages:

```text
Finding imagery...
Found 83 observations

Checking coverage...
78 observations usable

Downloading raster windows...
32 / 78

Applying cloud masks...
32 / 78

Calculating NDVI...
32 / 78

Complete
```

Do not display a generic spinner for long-running analysis.

---

# 51. Export

Initial export formats:

### CSV

```text
date
index
median
mean
std
valid_fraction
cloud_cover
```

### JSON

Complete analysis including provenance.

### GeoJSON

For:

- AOI
- point selections
- summary results

### Optional future export

- GeoTIFF
- Cloud-Optimized GeoTIFF

Generated entirely in the browser.

---

# 52. Privacy Model

Explicitly communicate:

> Your selected locations and analysis are processed in your browser and are not uploaded to this application.

The application itself should never require:

- accounts
- cookies for analytics
- uploaded files
- backend processing

If third-party services are used, their network requests should be documented.

---

# 53. Security Model

Use:

- HTTPS
- strict Content Security Policy
- dependency auditing
- no arbitrary code execution
- no user-generated URLs executed as scripts
- validation of STAC responses

Treat external STAC metadata as untrusted input.

---

# 54. Application Architecture

Recommended structure:

```text
src/
├── app/
│   ├── state/
│   └── config/
│
├── stac/
│   ├── client.ts
│   ├── collections.ts
│   ├── search.ts
│   └── pagination.ts
│
├── scenes/
│   ├── planner.ts
│   ├── grouping.ts
│   └── coverage.ts
│
├── raster/
│   ├── cog.ts
│   ├── windows.ts
│   ├── crs.ts
│   ├── resampling.ts
│   └── masking.ts
│
├── analysis/
│   ├── expressions.ts
│   ├── indices.ts
│   ├── statistics.ts
│   ├── quality.ts
│   └── timeseries.ts
│
├── map/
│   ├── map.ts
│   ├── cog-layer.ts
│   └── aoi.ts
│
├── cache/
│   ├── indexeddb.ts
│   └── cache-policy.ts
│
├── ui/
│   ├── controls/
│   ├── chart/
│   └── dialogs/
│
└── export/
    ├── csv.ts
    ├── json.ts
    └── geojson.ts
```

---

# 55. Core Data Flow

The complete analytical pipeline should be:

```text
User AOI
   ↓
STAC search
   ↓
STAC Items
   ↓
Scene planner
   ↓
Coverage + temporal grouping
   ↓
Asset selection
   ↓
COG metadata
   ↓
AOI → raster window
   ↓
HTTP Range request
   ↓
TypedArrays
   ↓
Band alignment
   ↓
SCL/cloud mask
   ↓
Nodata mask
   ↓
AOI polygon mask
   ↓
Spectral expression
   ↓
Statistics
   ↓
Quality metrics
   ↓
Observation
   ↓
Time series
   ↓
Chart + map
```

---

# 56. Phase 1 — Minimal Technical Proof

Build only:

```text
MapLibre
+
STAC
+
one Sentinel Item
+
one visual COG
```

- [x] MapLibre
- [x] STAC (visual extraction)
- [x] one Sentinel Item
- [x] one visual COG

Success criterion:

> User can search an area and see Sentinel imagery directly from the COG.

No analytics yet.

---

# 57. Phase 2 — Raster Extraction

Implement:

- [ ] STAC asset discovery
- [ ] GeoTIFF metadata
- [ ] CRS handling
- [ ] AOI transformation
- [ ] raster window calculation
- [ ] HTTP Range access
- [ ] TypedArray extraction

Success criterion:

> User can select a small AOI and retrieve B4 pixels without downloading the complete scene.

---

# 58. Phase 3 — NDVI

Implement:

- [ ] B4
- [ ] B8
- [ ] nodata handling
- [ ] NDVI calculation
- [ ] median
- [ ] mean
- [ ] valid-pixel count

Success criterion:

> One Sentinel acquisition produces a scientifically sensible NDVI statistic.

---

# 59. Phase 4 — Cloud Masking

Add:

- [ ] SCL
- [ ] cloud mask
- [ ] shadow mask
- [ ] cirrus mask
- [ ] AOI mask
- [ ] valid fraction

Success criterion:

> Cloud-contaminated pixels are excluded and quality information is reported.

---

# 60. Phase 5 — Historical Time Series

Implement:

- [ ] STAC pagination
- [ ] observation grouping
- [ ] multi-tile handling
- [ ] repeated processing
- [ ] progressive chart updates
- [ ] observation quality filtering

Success criterion:

> User can generate a multi-year NDVI time series from Sentinel-2.

---

# 61. Phase 6 — Map/Chart Interaction

Implement:

- [ ] click chart → map date
- [ ] click map → time series
- [ ] date slider
- [ ] imagery layer
- [ ] quality indicators

Success criterion:

> User can move seamlessly between spatial and temporal views.

---

# 62. Phase 7 — Caching

Add IndexedDB caching for:

- [ ] STAC metadata
- [ ] analysis results
- [ ] optional raster windows

Success criterion:

> Repeating an analysis substantially reduces network traffic.

---

# 63. Phase 8 — Performance Optimisation

Benchmark:

- [ ] small AOI
- [ ] large AOI
- [ ] one scene
- [ ] 100 scenes
- [ ] multiple tiles
- [ ] poor cloud conditions
- [ ] slow network

Optimise:

- [ ] chunk size
- [ ] concurrency
- [ ] caching
- [ ] request scheduling
- [ ] memory usage

Only add WASM where benchmarks justify it.

---

# 64. Phase 9 — Additional Indices

Add:

- [ ] NDMI
- [ ] NBR
- [ ] EVI
- [ ] NDWI
- [ ] red-edge indices

Convert the analytical engine into a general spectral-expression system.

---

# 65. Phase 10 — Advanced Analytics

Only after the core system works:

### Pyodide

For:

- [ ] statistical models
- [ ] scipy
- [ ] statsmodels
- [ ] time-series analysis

### DuckDB-Wasm

For:

- [ ] Arrow
- [ ] Parquet
- [ ] large observation tables
- [ ] complex analytical queries

These should remain optional modules.

---

# 66. Testing Strategy

## Unit tests

Test:

- NDVI
- masking
- statistics
- coordinate conversion
- window calculations
- index expressions

---

## Integration tests

Test:

```text
STAC
 ↓
Item
 ↓
COG
 ↓
window
 ↓
analysis
```

---

## Scientific validation

Compare browser results against a trusted reference implementation such as:

```text
Python
+
rasterio
+
numpy
```

For identical input pixels, results should agree within expected floating-point tolerance.

---

# 67. Edge Cases

Explicitly test:

- AOI smaller than one pixel
- AOI larger than one tile
- AOI crossing UTM zones
- AOI crossing Sentinel tiles
- completely cloudy scene
- no valid pixels
- missing SCL
- missing band
- nodata edges
- date with multiple acquisitions
- duplicate STAC Items
- malformed assets
- network interruption
- browser tab suspension
- extremely large AOI

---

# 68. Scientific Validation Dataset

Create a small fixed test dataset containing:

- one clear scene
- one cloudy scene
- one partially cloudy scene
- AOI crossing a tile boundary
- AOI with irregular polygon
- known NDVI values

Use this dataset as a regression test suite.

---

# 69. Important Architectural Constraints

The application should never:

- download entire Sentinel scenes unnecessarily
- rely exclusively on scene-level cloud cover
- assume one STAC Item covers the AOI
- assume one raster CRS
- assume all bands have the same resolution
- assume the AOI is rectangular
- retain all historical raster arrays in memory
- require Pyodide for basic arithmetic
- require a backend for computation

---

# 70. Future Architecture

Once the core engine works, the application can evolve from:

> Sentinel-2 NDVI explorer

into:

> **Browser-native cloud geospatial analysis platform**

Potential future sources:

```text
Sentinel-2
Sentinel-1
Landsat
MODIS
Planetary/commercial STAC sources
User-provided COGs
```

Potential analyses:

```text
NDVI
NDMI
NBR
EVI
spectral signatures
change detection
seasonality
trend analysis
anomaly detection
time-series decomposition
land-cover classification
```

All while retaining:

```text
STAC
+
COG
+
browser
+
WASM
```

as the core architecture.

---

# 71. Recommended MVP

Do **not** attempt to build everything initially.

The first production-quality MVP should contain:

### User interface

- MapLibre map
- point/polygon AOI
- date range
- cloud threshold
- index selector

### Data

- Sentinel-2 L2A
- STAC discovery
- COG assets

### Analysis

- [ ] B4
- [ ] B8
- [ ] SCL
- NDVI
- [ ] median
- [ ] valid fraction

### Visualisation

- Sentinel imagery
- NDVI time series
- date selection
- [ ] quality indicators

### Export

- CSV
- JSON

### Architecture

- client-side only
- IndexedDB
- TypeScript
- geotiff.js
- MapLibre
- no Pyodide initially

---

# 72. Final Target Architecture

The finished system should look conceptually like this:

```text
                         USER
                          │
                ┌─────────┴─────────┐
                │                   │
             Map AOI             Settings
                │                   │
                └─────────┬─────────┘
                          │
                          ▼
                    STAC SEARCH
                          │
                          ▼
                    SCENE PLANNER
                          │
             ┌────────────┴────────────┐
             │                         │
       Visualisation              Analysis
             │                         │
             ▼                         ▼
         MapLibre                 COG Reader
             │                         │
             │                    Raster Windows
             │                         │
             │                    Band Alignment
             │                         │
             │                    Cloud/SCL Mask
             │                         │
             │                    AOI Mask
             │                         │
             │                   Index Expression
             │                         │
             │                     Statistics
             │                         │
             │                         │
             └────────────┬────────────┘
                          │
                          ▼
                   QUALITY CONTROL
                          │
                          ▼
                   TIME-SERIES STORE
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
            Chart       Map Layer    Export
              │
              ▼
         IndexedDB Cache
```

## Key implementation principle

The most important design decision is to separate the system into **four independent layers**:

```text
1. STAC discovery
2. COG/raster extraction
3. Raster analysis
4. Time-series/statistical presentation
```

That separation prevents the application becoming an NDVI-specific implementation and gives you a reusable **browser-native cloud-geospatial analysis engine**.

The MVP should prove those four layers with **one Sentinel-2 L2A product, B4/B8/SCL, NDVI, a polygon AOI and a time series** before adding Pyodide, DuckDB-Wasm or more sophisticated analytics.
