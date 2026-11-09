# Project Instructions

## Git workflow

- After completing and verifying changes, follow `skills/git-push/SKILL.md` to commit and push them to the configured upstream.

## Viewer Launch

- Always preview and test the data center visibility viewer in Google Chrome.
- Start the local server from the project root with `python3 run_server.py --no-browser`, then open Chrome with `open -a "Google Chrome" http://127.0.0.1:8765/`.
- If port `8765` is unavailable, start the server with an alternate port, for example `python3 run_server.py --port 8899 --no-browser`, then open that localhost URL in Google Chrome.
- Do not open `web/index.html` directly with a `file://` URL. Terrain requests require the local Python server.

## Project Context

This repository contains the editable source files for a county-level data center visibility study and visual impact analysis. The tool is intended to help people around the county assess what they may see from different points near the proposed data center.

The core purpose is to model terrain-aware and vegetation-aware sight lines near residential areas. The analysis should help identify multiple viewing locations close to homes and demonstrate where intervening terrain and vegetation block or reduce off-site views of the data center.

## Modeling Priorities

- Treat residential-area viewpoints as high-priority test locations.
- Favor workflows that compare multiple nearby sight lines rather than relying on a single observer point.
- Preserve clear distinctions between modeled terrain blockage, vegetation screening, and unmodeled assumptions.
- Keep limitations visible in the UI and documentation. The viewer should not imply survey-grade accuracy unless the underlying data and validation support it.
- When adding or changing visibility behavior, make sure unloaded or missing elevation data is never interpreted as a clear line of sight.

## Data Center Assumptions

- Use `48.3819679, -103.4400307` as the data center center.
- Model the building as `870 x 1,400 ft` and `55 ft` tall.
- Assume the building sits on leveled ground using the standard pad assumption: the terrain elevation at the data center center is the finished pad elevation, and the roof is uniformly 55 ft above that pad across the full footprint.

## Residential Properties

Track residential properties as data, not as hard-coded single-house UI. The current known residential property coordinates are:

- `48.3500379, -103.4757342`
- `48.3878324, -103.3817375`
- `48.3576053, -103.3996261`

When adding or revising property-related behavior:

- Keep these coordinates in a central list that can be extended.
- Show each residential property with a small, recognizable residential-property icon on the map.
- Do not make the navigation or primary status area focus on only one house unless the user explicitly selects that property.
- Support comparing visibility from multiple residential properties and nearby viewpoints.

## UI Design Rules

- Keep the interface visually simple and low-text. Prefer direct map interaction, clear labels, compact legends, and progressive disclosure over long explanatory panels.
- The first screen should make the task obvious: residential properties, the data center footprint, terrain/vegetation screening, and visibility results.
- Use small icons for residential properties instead of large text-heavy callouts.
- Use plain, short labels such as "Visible", "Partly screened", "Blocked", and "Not evaluated".
- Move detailed assumptions, limitations, and methods into expandable sections or secondary help surfaces.
- Avoid a navbar or sidebar that reads like a report. The UI should function like a visual assessment tool first.
- Keep controls task-oriented: choose property, choose viewpoint, recalculate, export, toggle terrain/vegetation/results.
- Make text scannable for nontechnical county residents. Avoid jargon in primary UI copy.
- Preserve a visible but compact statement that results are modeled and preliminary.

## Source Layout

- `web/index.html`: viewer markup and controls.
- `web/styles.css`: viewer styling and layout.
- `web/app.js`: map behavior, terrain sampling, contour rendering, viewshed logic, visibility classification, perspective/profile rendering, and KML export.
- `run_server.py`: local static server and terrain-tile proxy/cache.
- `data/`: source and generated KML overlays.
- `terrain_cache/`: cached terrain tiles used by the local server.
- `legacy/`: reference copy of the earlier single-file viewer.
