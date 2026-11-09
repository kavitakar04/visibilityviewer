# Data Center Terrain Visibility Explorer — source code

This is the complete editable source for the web-based terrain visibility explorer.

## Run locally (macOS or Linux)

1. Unzip this entire folder.
2. Open Terminal and `cd` into the extracted `Data_Center_Visibility_Source` directory.
3. Run `python3 run_server.py`.
4. Open **http://127.0.0.1:8765/** if it does not open automatically.
5. Keep the Terminal open while using the map. Press Ctrl+C to stop.

On Windows, use `py run_server.py` instead of `python3 run_server.py`.
No Python packages need to be installed (Python 3.9+ recommended). The web map requires internet access for Leaflet, map imagery, and the first-time elevation raster downloads. The server caches elevation tiles in `terrain_cache/` so they can be reused.

**Do not double-click `web/index.html`**: its terrain requests go through the local Python server. Opening the file directly (`file://`) will not work.

## Embed on Squarespace

For step-by-step instructions for an existing page and a list of configurable defaults, see [SQUARESPACE_GUIDE.md](SQUARESPACE_GUIDE.md).

The viewer must first be hosted at a public **HTTPS** address. Squarespace cannot run the Python terrain proxy, and a localhost address is only visible on your own computer. The included `Dockerfile` packages the viewer and proxy for a container host. It listens on `0.0.0.0` and the host's `PORT` environment variable (8080 by default); the health check is `/api/health`. Deploy the container on a provider that supplies HTTPS and allows outbound requests to the terrain providers. The example container runs as a non-root user and keeps its cache in `/tmp`, which may be cleared on restart. A host may need to set a writable `TERRAIN_CACHE_DIR` for a persistent cache. Do not publish the local development server directly to the internet; use a managed HTTPS proxy with request limits and monitoring. The terrain API is restricted to the study area and the viewer's two supported zoom levels, but hosting still incurs bandwidth and provider usage. Check provider terms and attribution before public use.

Once deployed:

1. Open the HTTPS viewer URL directly and verify the map, terrain results, property selection, and export. Confirm your hosting provider does not send `X-Frame-Options` or a Content Security Policy that blocks your Squarespace site from framing it.
2. Copy [squarespace-embed.html](squarespace-embed.html) and replace **both** instances of `https://YOUR-VIEWER-HOST/` with the deployed viewer's HTTPS URL.
3. In the Squarespace page editor, add a **Code** block, set its mode to **HTML**, turn off **Display Source**, and paste the snippet. Resize the block as needed; the iframe height can be adjusted from 800px. The link below the iframe provides a full-page option, especially useful on phones.
4. Save and test the published page on desktop and mobile. Some custom code is hidden while editing; use Squarespace's safe preview or a private browser window.

Squarespace states that iframe code in Code blocks requires a Core, Plus, Advanced, or eligible legacy plan. See [Squarespace's Code block instructions](https://support.squarespace.com/hc/en-us/articles/206543167-Add-custom-code-to-a-page-with-code-blocks). The iframe shares the visitor's browser with external map, Leaflet, and terrain providers; review their terms and your site's privacy disclosures before publishing.

## Source tree

- `web/index.html`: interface markup
- `web/styles.css`: appearance and layout
- `web/app.js`: map, distance rings, terrain sampling, contour lines, ground viewshed, building visibility, simulated perspective and KML export
- `web/project-owner-parcels.geojson`: Williams County GIS boundaries matched by parcel ID to the supplied owner parcel list (65 of 65 IDs); ownership and boundaries should be independently verified.
- `run_server.py`: localhost web server with terrain-tile proxy, provider fallback, and disk cache (Python standard library only)
- `data/original_data_center_visibility.kml`: original source point coordinates
- `data/building_and_distance_rings.kml`: example Google Earth overlay
- `legacy/original_explorer.html`: unmodified earlier single-file HTML, provided for reference (has the elevation progress bug)

## Model details and limitations

Current analysis coordinates:
- Data-center center: 48.3819679, -103.4400307
- Original reference residence: 48.38730774425814, -103.3823943867013

The preliminary Bakken AI Phase 1 site plan C-101 (2026-05-09) depicts six halls in two rows of three, each labeled 280,000 square feet. A subsequent specification image provides 700 × 400 ft halls, 50 ft roof height and 62 ft cooler tops; six 190 × 280 ft engine halls with 43 ft roofs and 75 ft stacks; 68 ft ventilation outlets and 59 ft radiators; and a 500 × 700 ft outdoor substation yard. The model uses the specified hall and engine dimensions and heights, placing each cooler and stack at its building center as a placeholder. Hall spacing and engine locations are estimated from the plan, not surveyed coordinates. The building bearing is fixed at 0° as specified. The existing center and a common level pad at the center elevation remain assumptions. Ventilation outlets, radiators and substation equipment are not separately modeled because their locations and dimensions are unavailable. The drawing is preliminary and its scale labels conflict, so placement and dimensions require verification against engineering plans.

Default eye height is 5.5 feet, adjustable in the interface. Ring distances are 0.5, 1, 1.5, 2, and 3 miles. The analysis samples nine roof locations per data and engine hall, plus one cooler and one stack top per respective building (120 targets). It estimates whether terrain interrupts sight lines; sampled equipment points do not represent complete equipment geometry. The profile targets the DH-2 roof center. It provides 20-foot contour lines by default and approximates earth curvature/refraction.

**It is a preliminary terrain-only model.** Trees, adjacent structures, window orientation, indoor vantage points, haze, and engineering-grade ground elevations are *not* modeled. The perspective view is a geometric simulation, not a photo. Contours and roof visibility only appear after real elevation tiles load; never interpret unloaded data as a clear sightline. Results have **not been field-verified**.

The colored rings and points report whether terrain clears all, some, or none of the checked roof and equipment locations. They do not measure the visible area of building faces. The blue owner land area shows the connected group of parcels from the supplied list; separate parcels are omitted. It is not a visibility result. Parcel geometry is from the Williams County GIS ParcelsForWebMap service and is not a survey or proof of current ownership.

## Where terrain data comes from

- Primary: Mapterhorn Terrarium-encoded WebP at `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` (512-pixel tiles)
- Fallback: Amazon Open Data Mapzen Terrarium PNG at `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (256-pixel tiles)
- Both decode heights with `R*256 + G + B/256 - 32768` meters.

The two providers may have different effective underlying terrain resolution. Display sampling density is *not* equivalent to elevation accuracy. Attribution and provider licensing should be verified before redistribution.

The Leaflet JavaScript and CSS library is loaded from public CDNs at run time. Map basemaps use Esri tile servers. These external dependencies are not copied or claimed as part of the application's original source code. All application source code and the local server are in this package.

## Troubleshooting

- **"Terrain unavailable":** Check the Terminal output for upstream network failures. Verify internet access and try **Recalculate**. If one provider is down the server will try the other.
- **Blank map:** Allow access to unpkg.com or jsdelivr.net (Leaflet) and server.arcgisonline.com (background map); ensure you opened the local `http://127.0.0.1:8765/` address rather than a file.
- **Port already in use:** Run `python3 run_server.py --port 8899`, then visit `http://127.0.0.1:8899/`.
- **Terrain request diagnostics:** Visit `http://127.0.0.1:8765/api/health` for local-server status. This verifies the local server, not public tile availability.
- **Offline use:** Previously downloaded elevation tiles are cached, but a fully offline map needs Leaflet and base-map tiles bundled separately.

## Modifying it

Change the constants `C`, `H`, and `RADII` near the top of `web/app.js`; modify defaults in `web/index.html`. The terrain sampling class and viewshed logic are in `web/app.js`.

## Repair notes

- Corrected a progress indicator exception that occurred when the DOM progress bar was replaced.
- Added a same-origin Python proxy and fallback source to avoid browser file/CORS restrictions.
- Supported both 512px Mapterhorn and 256px AWS terrain-tile dimensions.
- Missing elevation samples are no longer assumed to imply a clear line of sight.

This package was statically validated (Python and JavaScript syntax), but external live elevation providers cannot be tested from the creation environment. If elevation remains unavailable, the server should now give a more informative provider error.


### Site video reference

`IMG_8634.mov` is a 34.07-second, 1280 × 720, 30 fps iPhone video. Its embedded QuickTime metadata records 2026-11-08 14:07:57 -0600 and location 48.3846, -103.4507 (altitude 648.843 m; reported horizontal accuracy 3.50 m). The coordinate is rounded in the embedded metadata, so the accuracy value does not establish the precision of the displayed point. The map shows this location as an approximate field reference. Camera orientation, exact position, lens calibration, and which frame faces the facility have not been verified; do not use the video as a georeferenced panorama or photo simulation without field calibration. The footage may help document existing terrain, vegetation, and landmarks.
