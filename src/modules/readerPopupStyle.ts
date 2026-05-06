import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";

type PluginPrefKey = Parameters<typeof getPref>[0];

const POPUP_PREF_KEYS: PluginPrefKey[] = [
  "disablePreview",
  "lockPopupSize",
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
const RESIZE_HANDLE_HITBOX = 18;
const SIZE_CHANGE_TOLERANCE = 2;

type PendingPopupResize = {
  popup: HTMLElement;
  width: number;
  height: number;
};

type PopupWatcher = {
  observer: MutationObserver;
  pendingResize?: PendingPopupResize;
  onMouseDown: (event: MouseEvent) => void;
  onMouseUp: () => void;
  onBlur: () => void;
};

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
const popupWatchers = new Map<Document, PopupWatcher>();
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

  for (const [doc, watcher] of popupWatchers) {
    unregisterPopupWatcher(doc, watcher);
  }
  popupWatchers.clear();
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

  if (!root || !win || popupWatchers.has(doc)) {
    return;
  }

  const watcher: PopupWatcher = {
    observer: new win.MutationObserver((mutations: MutationRecord[]) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes) as Node[]) {
          if (node.nodeType === 1 && containsPreviewPopup(node as Element)) {
            syncPopupElements(doc, false);
            return;
          }
        }
      }
    }),
    onMouseDown: (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const popup = findTargetPreviewPopup(win, event.target);
      if (!popup || !isNearResizeHandle(popup, event)) {
        return;
      }

      const { width, height } = readElementDimensions(popup);
      watcher.pendingResize = { popup, width, height };
    },
    onMouseUp: () => {
      const pendingResize = watcher.pendingResize;
      watcher.pendingResize = undefined;

      if (!pendingResize || getPref("lockPopupSize")) {
        return;
      }

      persistPopupDimensionsIfChanged(pendingResize);
    },
    onBlur: () => {
      watcher.pendingResize = undefined;
    },
  };

  watcher.observer.observe(root, { childList: true, subtree: true });
  doc.addEventListener("mousedown", watcher.onMouseDown, true);
  win.addEventListener("mouseup", watcher.onMouseUp, true);
  win.addEventListener("blur", watcher.onBlur, true);
  popupWatchers.set(doc, watcher);
}

function unregisterPopupWatcher(doc: Document, watcher: PopupWatcher) {
  watcher.observer.disconnect();
  doc.removeEventListener("mousedown", watcher.onMouseDown, true);
  doc.defaultView?.removeEventListener("mouseup", watcher.onMouseUp, true);
  doc.defaultView?.removeEventListener("blur", watcher.onBlur, true);
}

function findTargetPreviewPopup(win: Window, target: EventTarget | null) {
  if (!target || !(target instanceof win.Element)) {
    return undefined;
  }

  const targetElement = target as Element;
  return targetElement.closest(
    ".view-popup.preview-popup",
  ) as HTMLElement | null;
}

function readElementDimensions(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function isNearResizeHandle(popup: HTMLElement, event: MouseEvent) {
  const rect = popup.getBoundingClientRect();
  const win = popup.ownerDocument?.defaultView;
  let isRTL = false;

  if (win) {
    isRTL = win.getComputedStyle(popup)?.direction === "rtl";
  }
  const nearInlineEnd = isRTL
    ? event.clientX >= rect.left &&
      event.clientX <= rect.left + RESIZE_HANDLE_HITBOX
    : event.clientX <= rect.right &&
      event.clientX >= rect.right - RESIZE_HANDLE_HITBOX;
  const nearBlockEnd =
    event.clientY <= rect.bottom &&
    event.clientY >= rect.bottom - RESIZE_HANDLE_HITBOX;

  return nearInlineEnd && nearBlockEnd;
}

function persistPopupDimensionsIfChanged(pendingResize: PendingPopupResize) {
  const { popup, width: startWidth, height: startHeight } = pendingResize;
  if (!popup.isConnected) {
    return;
  }

  const { width: currentWidth, height: currentHeight } =
    readElementDimensions(popup);
  if (
    Math.abs(currentWidth - startWidth) < SIZE_CHANGE_TOLERANCE &&
    Math.abs(currentHeight - startHeight) < SIZE_CHANGE_TOLERANCE
  ) {
    return;
  }

  const width = clampPopupWidth(currentWidth);
  const height = clampPopupHeight(currentHeight);
  const dimensions = getPopupDimensions();

  if (width !== dimensions.width) {
    setPref("popupWidth", width);
  }

  if (height !== dimensions.height) {
    setPref("popupHeight", height);
  }
}

function clampPopupWidth(width: number) {
  if (!Number.isFinite(width)) {
    return DEFAULT_POPUP_WIDTH;
  }

  return Math.max(MIN_POPUP_WIDTH, width);
}

function clampPopupHeight(height: number) {
  if (!Number.isFinite(height)) {
    return DEFAULT_POPUP_HEIGHT;
  }

  return Math.max(MIN_POPUP_HEIGHT, height);
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
  const watcher = popupWatchers.get(doc);
  if (watcher) {
    unregisterPopupWatcher(doc, watcher);
  }
  popupWatchers.delete(doc);
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
