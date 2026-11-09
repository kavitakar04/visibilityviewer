# UI Audit

Started: 2026-11-08

## Scope

This audit reviews the current data center visibility viewer against the project direction:

- Make the interface easier for county residents to understand.
- Reduce explanatory text in the first view.
- Represent residential properties as small map icons.
- Track residential properties from an extendable coordinate list.
- Support comparison across multiple residential viewpoints and nearby sight lines.

## Current Status

- The viewer runs from the local Python server and was opened in Google Chrome at `http://127.0.0.1:8899/`.
- The server health endpoint returned ready status.
- Terrain tiles loaded successfully for the current local run.
- The data center center has been updated to `48.3819679, -103.4400307`.
- The building model now assumes a 55 ft building on a leveled pad at the data center center elevation.

## High Priority Findings

### 1. The UI still centers one residence

The first sidebar panel is labeled "Residence -> data center" and exposes "View from house" as a primary action. In code, the app still uses a single `H` constant, one `housePin`, one `houseViewshed`, and one `updateHouse` flow.

Relevant files:

- `web/index.html`: single-residence panel.
- `web/app.js`: `H`, `housePin`, `updateHouse`, `updateHouseViewshed`, `goHouse`, and KML export.

Recommended change:

- Replace `H` with a `RESIDENTIAL_PROPERTIES` array using the known coordinates.
- Render one small residential icon per property.
- Replace the single-house sidebar with a compact "Properties" selector or map-only selection state.
- Compute selected-property visibility only after a property is selected.

### 2. There is too much text in the first view

The header, sidebar, map banner, legend, assumptions panel, limitations panel, and two bottom cards all show explanatory text at once. This makes the viewer feel like a technical report instead of a map assessment tool.

Relevant files:

- `web/index.html`: dense copy in header, sidebar sections, map banner, view cards.
- `web/styles.css`: fixed 326 px sidebar makes text a dominant first-screen element.

Recommended change:

- Keep only a compact title, status pill, map legend, property selector, and core actions visible.
- Move methods, limitations, tile-source text, and detailed assumptions into collapsible "Details" panels.
- Shorten statuses to "Visible", "Partly screened", "Blocked", and "Not evaluated".

### 3. Residential properties are not stored as extendable data

The project instructions list three residential coordinates, but the application source has only one hard-coded house coordinate.

Known residential property coordinates:

- `48.3500379, -103.4757342`
- `48.3878324, -103.3817375`
- `48.3576053, -103.3996261`

Recommended change:

- Add a central data structure in `web/app.js`, for example:

```js
const RESIDENTIAL_PROPERTIES = [
  { id: 'res-1', label: 'Residence 1', lat: 48.3500379, lon: -103.4757342 },
  { id: 'res-2', label: 'Residence 2', lat: 48.3878324, lon: -103.3817375 },
  { id: 'res-3', label: 'Residence 3', lat: 48.3576053, lon: -103.3996261 }
];
```

### 4. The map does not yet communicate vegetation screening

The project goal includes terrain and vegetation. The UI currently communicates terrain-only analysis and explicitly says trees are not modeled. That limitation is correct for the current model, but the interface does not show whether vegetation is unavailable, pending, or intentionally disabled.

Recommended change:

- Add a compact layer/status item for vegetation, such as "Vegetation: not loaded" or "Vegetation screen: off".
- Keep terrain-only limitations in details, not as a dominant first-screen paragraph.
- Do not imply vegetation screening is modeled until data and logic exist.

## Medium Priority Findings

### 5. Technical terms appear in primary UI

Primary UI copy includes "DEM", "KML", "terrain raster", "contour segments", "roof points", "tile zoom", "earth curvature/refraction", and provider names. These are useful for technical users but too prominent for county residents.

Recommended change:

- Replace primary labels with plain terms.
- Keep technical terms in an expandable methods section.
- Rename "Export result KML" to "Export map file" with format details in a tooltip or details panel.

### 6. The legend mixes different concepts

The legend currently explains roof visibility, house ground viewshed shading, contour lines, rings, and interaction instructions in one panel.

Recommended change:

- Split into a compact visual legend and a separate "What this means" details panel.
- Use the same short status names everywhere.
- Avoid explaining two measurement types in the main legend unless both are visible and selected.

### 7. Controls are not ordered by user task

The current control order starts from technical model settings: bearing, eye height, terrain detail, contour spacing. A resident's task is likely: choose a property, see if the data center is visible, inspect nearby sight lines.

Recommended change:

- Primary controls: property selector, nearby viewpoint mode, recalculate, export.
- Secondary controls: bearing, eye height, terrain detail, contours.
- Hide secondary controls behind "Advanced".

### 8. Bottom panels may compete with the map

The modeled eye-level view and terrain profile are valuable, but they take a large portion of the screen and include more explanatory text. On smaller screens, they may make the map feel secondary.

Recommended change:

- Keep bottom panels, but make them collapsible or tabbed.
- Default to the map plus one selected result summary.
- Show profile/perspective when a property or viewpoint is selected.

## Suggested First Redesign Pass

1. Add the residential property data list and render three small home icons.
2. Replace the single-house sidebar panel with a compact selected-property summary.
3. Collapse methods, limitations, and data-source text.
4. Simplify the legend to four status rows.
5. Move advanced settings behind an "Advanced" disclosure.
6. Rename one-house code paths to property-based code paths.
7. Keep the map as the dominant first-screen element.

## Verification Notes

- `node --check web/app.js` passed.
- `python3 -m py_compile run_server.py` passed.
- Local server health check passed on port `8899`.
- Browser automation was unavailable in this session, so the first audit pass is based on Chrome launch, server logs, and source review.
