# Adding the visibility viewer to your existing Squarespace page

The viewer can sit inside a section of your existing page. You do not need to replace the page or rebuild it. It must first be hosted at a public HTTPS address; it cannot run from this folder, `localhost`, or Squarespace's Code block alone.

## 1. Publish the viewer

Give the viewer source and `Dockerfile` to whoever manages your web hosting, or deploy the container to a managed host that supports Python containers and HTTPS. The container serves both the files in `web/` and the `/api/terrain/` endpoint used for elevation. Its health endpoint is `/api/health`.

The deployment must allow outbound access to the elevation providers. Configure a writable terrain cache (the included Dockerfile uses temporary storage), and use persistent storage if the host supports it and you want the cache to survive restarts. Check the hosting and map providers' terms, attribution and expected costs. A static-file host alone will not run the existing terrain proxy.

Visit the public viewer URL directly and confirm that the map loads, elevation finishes loading, property results appear, driving view works and exports work. Check `/api/health` too, but note that it confirms the server is running, not that elevation tiles are available. A missing elevation result must remain not evaluated.

Allow the Squarespace page to frame the viewer. The hosting service must not send an `X-Frame-Options` header that blocks it; if using a Content Security Policy, `frame-ancestors` must allow the exact Squarespace page origin. Configure this on the viewer's host, including any proxy in front of it.

## 2. Put it on your existing page

1. In Squarespace, open **Pages**, find your existing main page, and choose **Edit**. Add the viewer where you want it on that page; a full-width section gives the map more room.
2. Add a **Code** block in that section. Set its mode to **HTML** and leave **Display Source** off.
3. Open `squarespace-embed.html` from this project and copy the entire snippet into the block.
4. Replace **both** instances of `https://YOUR-VIEWER-HOST/` with your actual deployed viewer URL. The first is the embedded viewer; the second is the link that opens it in a new tab. Keep the `https://` and trailing slash.
5. Start with the included `height:800px`. Increase or decrease it if the viewer is cramped or leaves excessive space. Keep the full-screen link, especially for mobile visitors.
6. Save and preview, then test the published page on a computer and phone. Try the driving view, map controls and exports. Squarespace may hide custom code while you are logged in; use **Preview in Safe Mode** or a private browser window.

The iframe inside a Code block requires a Squarespace Core, Plus, Advanced, or eligible legacy plan. See [Squarespace's Code block instructions](https://support.squarespace.com/hc/en-us/articles/206543167-Add-custom-code-to-a-page-with-code-blocks). If you have a Basic plan, check the plan's current capabilities before relying on an iframe; a normal link to the hosted viewer is an alternative.

## 3. Choose what visitors see by default

Yes: the viewer's starting state can be customized. The Squarespace page controls **where** the viewer appears; the viewer source controls what opens and which layers are initially enabled. The existing embed snippet does not yet provide switches or URL parameters for these settings. Changes to the source must be deployed again; visitors can then change available controls during their session.

| Item | Current default | How to change it |
| --- | --- | --- |
| Map background | Topo map | In `web/app.js`, change `topo.addTo(map)` to `sat.addTo(map)` for satellite. |
| Terrain contours, residences, visibility rings, sample points, sightline, building footprint | On | In `web/app.js`, remove `.addTo(map)` from the appropriate layer's initialization to start it off. Keep the layer in `L.control.layers` so visitors can turn it back on. |
| Berger property | On | Remove `.addTo(map)` from the `ownerParcels` initialization; leave it in the layer control. |
| County roads | Off | Add `.addTo(map)` to `const driveLayer=L.layerGroup()` to start them on. Opening and closing Driving view also changes road and other layer visibility, so test this interaction. |
| Driving view, property list, site video, Advanced, Analysis | Closed | Add the `open` attribute to the matching `<details>` element in `web/index.html`, for example `<details open><summary>Advanced</summary>`. Remove it to start closed. Opening Driving view also changes map layers and route markers. |
| Terrain detail | Higher detail | In `web/index.html`, move `selected` to the desired option in `#res` and update `#resolutionOut` to match. Higher detail may take longer to load. |
| Driving playback | Visualization (2.5×) | Move `selected` between the options in `#driveSpeed` in `web/index.html`. |
| Day/night | Daytime | Set the desired selected option in both `#viewTime` and `#driveTime` in `web/index.html`; these controls are synchronized when changed. |

These are shared defaults for all visitors to that deployed viewer, not per-page settings in Squarespace. To use different defaults on different pages, the viewer would need a configuration feature or separate deployments. Hiding a control is different from turning a layer off: a hidden control cannot be used to restore it, and it should not hide the preliminary-results notice or modeling limitations.

## Troubleshooting

- **Blank embed, but the viewer URL opens:** check the Code block plan, HTTPS URL, frame headers, and Squarespace Safe Mode. Test the actual published page, not just the editor.
- **Map visible, but terrain unavailable:** check the hosted `/api/health`, host logs, outbound access, and the terrain providers. The health endpoint alone does not verify terrain.
- **Map is too small:** use a wider section, raise the iframe height, and retain the full-screen link. Mobile layouts may need a different height.
- **Changes do not appear:** redeploy the modified viewer, then reload the page; if necessary check the host's cache. Squarespace's iframe snippet will continue to point to the existing deployment URL.
