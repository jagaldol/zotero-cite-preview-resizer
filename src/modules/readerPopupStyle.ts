import { config } from "../../package.json";
import { getPref } from "../utils/prefs";

type PluginPrefKey = Parameters<typeof getPref>[0];

const POPUP_PREF_KEYS: PluginPrefKey[] = [
  "disablePreview",
  "popupWidth",
  "popupHeight",
];
const STYLE_ID = "__addon_popup_style";
const DISABLE_PREVIEW_ATTR = "data-addon-disable-preview";

const POPUP_CSS = `
:root[${DISABLE_PREVIEW_ATTR}="true"] .view-popup.preview-popup {
  display: none !important;
}

.view-popup.preview-popup {
  width: var(--addon-popup-width, 800px);
  height: var(--addon-popup-height, 500px);
  resize: both;
  max-width: 95vw;
  max-height: 95vh;
  min-width: 240px;
  min-height: 120px;
  padding: 0;
  overflow: auto;
  box-sizing: border-box;
}

.view-popup.preview-popup .inner {
  width: 100%;
  height: auto;
  max-height: 100%;
  padding: 0;
  margin: 0;
  overflow: auto;
  box-sizing: border-box;
  display: block;
}

.view-popup.preview-popup > img,
.view-popup.preview-popup > picture,
.view-popup.preview-popup > canvas,
.view-popup.preview-popup > svg,
.view-popup.preview-popup .inner > img,
.view-popup.preview-popup .inner > picture,
.view-popup.preview-popup .inner > canvas,
.view-popup.preview-popup .inner > svg {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  display: block;
}
`;

const readerDocs = new Set<Document>();
const prefObserverIDs: symbol[] = [];
let readerToolbarHandler:
  | _ZoteroTypes.Reader.EventHandler<"renderToolbar">
  | undefined;

export function registerReaderPopupStyle() {
  if (!readerToolbarHandler) {
    readerToolbarHandler = ({ doc }) => {
      readerDocs.add(doc);
      applyPopupPrefs(doc);
    };
    Zotero.Reader.registerEventListener(
      "renderToolbar",
      readerToolbarHandler,
      config.addonID,
    );
  }

  if (!prefObserverIDs.length) {
    for (const key of POPUP_PREF_KEYS) {
      prefObserverIDs.push(
        Zotero.Prefs.registerObserver(
          `${config.prefsPrefix}.${key}`,
          refreshReaderDocs,
          true,
        ),
      );
    }
  }
}

export function unregisterReaderPopupStyle() {
  for (const id of prefObserverIDs.splice(0)) {
    Zotero.Prefs.unregisterObserver(id);
  }

  if (readerToolbarHandler) {
    Zotero.Reader.unregisterEventListener(
      "renderToolbar",
      readerToolbarHandler,
    );
    readerToolbarHandler = undefined;
  }

  readerDocs.clear();
}

function refreshReaderDocs() {
  for (const doc of Array.from(readerDocs)) {
    if (!isUsableDocument(doc)) {
      readerDocs.delete(doc);
      continue;
    }

    try {
      applyPopupPrefs(doc);
    } catch (e) {
      readerDocs.delete(doc);
      Zotero.debug?.(`Failed to refresh popup style: ${e}`);
    }
  }
}

function applyPopupPrefs(doc: Document) {
  const root = doc.documentElement as HTMLElement | null;
  if (!root) {
    return;
  }

  ensurePopupStyle(doc);
  root.style.setProperty("--addon-popup-width", `${getPref("popupWidth")}px`);
  root.style.setProperty("--addon-popup-height", `${getPref("popupHeight")}px`);

  if (getPref("disablePreview")) {
    root.setAttribute(DISABLE_PREVIEW_ATTR, "true");
  } else {
    root.removeAttribute(DISABLE_PREVIEW_ATTR);
  }
}

function ensurePopupStyle(doc: Document) {
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!style) {
    style = doc.createElement("style");
    style.id = STYLE_ID;
    doc.documentElement?.appendChild(style);
  }

  if (style.textContent !== POPUP_CSS) {
    style.textContent = POPUP_CSS;
  }
}

function isUsableDocument(doc: Document) {
  return Boolean(
    doc.documentElement && doc.defaultView && !doc.defaultView.closed,
  );
}
