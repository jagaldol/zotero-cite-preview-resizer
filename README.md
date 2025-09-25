# Zotero Cite Preview Resizer

![Zotero 7+](https://img.shields.io/badge/Zotero-7%2B-blue) ![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-brightgreen)

![Zotero Cite Preview Resizer](assets/zotero-cite-preview-resizer.png)

Resize the hover preview that appears when you inspect citations inside the Zotero PDF reader. The plugin widens the default cite preview, keeps large figures readable, and lets you drag the corner to make the popup as big as you need.

## Features

- Enlarged cite/annotation preview popups (default 800 x 500 px) so reference pages and figures are legible at a glance.
- Drag-resizable preview window with sensible min/max limits and scrollbars for oversized content.
- Applies to every Zotero Reader tab (PDF, EPUB, snapshots) and updates automatically when new reader windows open.
- Preferences pane to set your own default width and height, applied instantly the next time a popup opens.
- Media-aware styling that keeps embedded images, figures, and SVGs stretched to the popup width without distortion.
- English and Korean localization out of the box.

## Compatibility

The add-on targets Zotero 7 (Beta or newer). Earlier Zotero versions do not expose the reader APIs used to inject the popup styling.

## Installation

1. Download the latest `.xpi` package from the [Releases](https://github.com/jagaldol/zotero-cite-preview-resizer/releases) page.
2. In Zotero, open `Tools > Plugins`.

   ![Open Tools ▸ Plugins menu](assets/tool-plugins.png)

3. Click the gear button ▸ `Install Plugin From File...` and choose the downloaded `.xpi`.

   ![Select Install Plugin From File in the Plugins Manager](assets/install-plugin-from-file.png)

4. Restart Zotero if prompted. The plugin will enable itself automatically.

## Usage

1. Open a PDF (or other reader-supported item) inside Zotero.
2. Hover over an in-text citation, note link, or reference marker to display the preview popup.
3. Drag the lower-right corner to resize; the popup remembers the size for that session and stays within 95% of the reader viewport.
4. To make the larger size the default, adjust the preferences described below.

## Preferences

Find the "Preview Resizer" pane under `Edit > Preferences` (Windows/Linux) or `Zotero > Preferences` (macOS).

![Preview Resizer preference pane with width and height fields](assets/preferences.png)

- **Popup width (px):** Starting width for every preview popup.
- **Popup height (px):** Starting height for every preview popup.

Changes take effect the next time you open a preview. You can still resize individual popups on the fly with drag-and-drop.

## Development

This repository uses the [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit) scaffold.

```sh
npm install
npm run start    # Launches a Zotero dev profile with hot reload
npm run build    # Produces the distributable add-on and runs type checks
npm test         # Executes scaffold integration tests
npm run lint:check
```

The default development profile requires Zotero 7 Beta to be installed locally. See `zotero-plugin.config.ts` for profile options and bundle paths.

## Support & Feedback

- Report bugs or request features via [GitHub Issues](https://github.com/jagaldol/zotero-cite-preview-resizer/issues).
- Pull requests are welcome; please run `npm run lint:check` before submitting.

## License

This project is distributed under the terms of the [GNU AGPL v3 or later](LICENSE).

Credits to the Zotero team and the zotero-plugin-toolkit authors for their excellent developer tooling.
