import { config } from "../../package.json";
import { getPref } from "../utils/prefs";

type PluginPrefKey = Parameters<typeof getPref>[0];

const POPUP_PREF_KEYS: PluginPrefKey[] = [
  "disablePreview",
  "popupWidth",
  "popupHeight",
];
const DEFAULT_POPUP_WIDTH = 800;
const DEFAULT_POPUP_HEIGHT = 500;
const MIN_POPUP_WIDTH = 240;
const MIN_POPUP_HEIGHT = 120;
const STYLE_ID = "__addon_popup_style";
const DISABLE_PREVIEW_ATTR = "data-addon-disable-preview";
const MANAGED_POPUP_ATTR = "data-addon-popup-sized";

const POPUP_CSS = `
:root[${DISABLE_PREVIEW_ATTR}="true"] .view-popup.preview-popup {
  display: none !important;
}

.view-popup.preview-popup {
  width: var(--addon-popup-width, ${DEFAULT_POPUP_WIDTH}px);
  height: var(--addon-popup-height, ${DEFAULT_POPUP_HEIGHT}px);
  resize: both;
  max-width: 95vw;
  max-height: 95vh;
  min-width: ${MIN_POPUP_WIDTH}px;
  min-height: ${MIN_POPUP_HEIGHT}px;
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

.view-popup.preview-popup .inner > * {
  max-width: 100%;
  box-sizing: border-box;
}

.view-popup.preview-popup figure {
  max-width: 100%;
  margin: 0;
}

.view-popup.preview-popup img,
.view-popup.preview-popup picture,
.view-popup.preview-popup canvas,
.view-popup.preview-popup svg,
.view-popup.preview-popup video {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  display: block;
}

.view-popup.preview-popup iframe,
.view-popup.preview-popup object,
.view-popup.preview-popup embed {
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: none !important;
  border: 0;
  border-radius: inherit;
  flex: 1 1 auto;
}

.view-popup.preview-popup table {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
}

.view-popup.preview-popup pre,
.view-popup.preview-popup code {
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
`;

const readerDocs = new Set<Document>();
const popupObservers = new Map<Document, MutationObserver>();
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
          applyPrefsToReaders,
          true,
        ),
      );
    }
  }

  applyPrefsToReaders();
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

  for (const observer of popupObservers.values()) {
    observer.disconnect();
  }
  popupObservers.clear();
  readerDocs.clear();
}

function applyPrefsToReaders() {
  collectOpenReaderDocs();

  for (const doc of Array.from(readerDocs)) {
    if (!isUsableDocument(doc)) {
      forgetReaderDoc(doc);
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
  observePopupChanges(doc);

  const { width, height } = getPopupDimensions();
  root.style.setProperty("--addon-popup-width", `${width}px`);
  root.style.setProperty("--addon-popup-height", `${height}px`);

  if (getPref("disablePreview")) {
    root.setAttribute(DISABLE_PREVIEW_ATTR, "true");
  } else {
    root.removeAttribute(DISABLE_PREVIEW_ATTR);
  }

  syncPopupElements(doc, true);
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

function collectOpenReaderDocs() {
  for (const reader of Zotero.Reader._readers ?? []) {
    const doc = reader._iframeWindow?.document;
    if (doc && isUsableDocument(doc)) {
      readerDocs.add(doc);
    }
  }
}

function observePopupChanges(doc: Document) {
  const root = doc.documentElement;
  const win = doc.defaultView;

  if (!root || !win || popupObservers.has(doc)) {
    return;
  }

  const observer = new win.MutationObserver((mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes) as Node[]) {
        if (node.nodeType === 1 && containsPreviewPopup(node as Element)) {
          syncPopupElements(doc, false);
          return;
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  popupObservers.set(doc, observer);
}

function syncPopupElements(doc: Document, force: boolean) {
  const dimensions = getPopupDimensions();
  const width = `${dimensions.width}px`;
  const height = `${dimensions.height}px`;

  const popups = Array.from(
    doc.querySelectorAll(".view-popup.preview-popup"),
  ) as HTMLElement[];

  for (const popup of popups) {
    if (!force && popup.getAttribute(MANAGED_POPUP_ATTR) === "true") {
      continue;
    }

    popup.style.width = width;
    popup.style.height = height;
    popup.setAttribute(MANAGED_POPUP_ATTR, "true");
  }
}

function containsPreviewPopup(node: Element) {
  return (
    node.matches(".view-popup.preview-popup") ||
    Boolean(node.querySelector(".view-popup.preview-popup"))
  );
}

function forgetReaderDoc(doc: Document) {
  popupObservers.get(doc)?.disconnect();
  popupObservers.delete(doc);
  readerDocs.delete(doc);
}

function getPopupDimensions() {
  return {
    width: readNumberPref("popupWidth", DEFAULT_POPUP_WIDTH, MIN_POPUP_WIDTH),
    height: readNumberPref(
      "popupHeight",
      DEFAULT_POPUP_HEIGHT,
      MIN_POPUP_HEIGHT,
    ),
  };
}

function readNumberPref(
  key: Extract<PluginPrefKey, "popupWidth" | "popupHeight">,
  fallback: number,
  min: number,
) {
  const value = Number(getPref(key));
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, value);
}
