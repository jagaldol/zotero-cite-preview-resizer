import { registerPrefsScripts } from "./modules/preferenceScript";
import { getPref } from "./utils/prefs";
import { initLocale, getString } from "./utils/locale";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  // Initialize localization before using getString
  initLocale();

  // Register a minimal Preferences pane without using examples
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    // Use localized title for the pane label
    label: getString("pref-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Inject sizing into Reader documents when available
  try {
    const injectIntoReader = (doc: Document) => {
      const width = getPref("popupWidth");
      const height = getPref("popupHeight");
      const styleId = "__addon_popup_style";
      let style = doc.getElementById(styleId) as HTMLStyleElement | null;
      const css = `
        /* Resizable popup container: start from prefs, allow drag-resize */\n\
        .view-popup.preview-popup {\n\
          width: var(--addon-popup-width, ${width}px);\n\
          height: var(--addon-popup-height, ${height}px);\n\
          resize: both;\n\
          max-width: 95vw;\n\
          max-height: 95vh;\n\
          min-width: 240px;\n\
          min-height: 120px;\n\
          padding: 0;\n\
          overflow: auto; /* enable vertical scroll when content taller */\n\
          box-sizing: border-box;\n\
        }\n\
        /* Inner spans container width, natural height for scrolling */\n\
        .view-popup.preview-popup .inner {\n\
          width: 100%;\n\
          height: auto;\n\
          max-height: 100%;\n\
          padding: 0;\n\
          margin: 0;\n\
          overflow: auto;\n\
          box-sizing: border-box;\n\
          display: block;\n\
        }\n\
        /* Media: fill width, keep aspect ratio; overflow scrolls vertically */\n\
        .view-popup.preview-popup > img,\n\
        .view-popup.preview-popup > picture,\n\
        .view-popup.preview-popup > canvas,\n\
        .view-popup.preview-popup > svg,\n\
        .view-popup.preview-popup .inner > img,\n\
        .view-popup.preview-popup .inner > picture,\n\
        .view-popup.preview-popup .inner > canvas,\n\
        .view-popup.preview-popup .inner > svg {\n\
          width: 100% !important;\n\
          height: auto !important;\n\
          max-width: 100% !important;\n\
          display: block;\n\
        }`;
      if (!style) {
        style = doc.createElement("style");
        style.id = styleId;
        style.textContent = css;
        doc.documentElement?.appendChild(style);
      } else if (style.textContent !== css) {
        style.textContent = css;
      }
      // Apply CSS variables to the reader document element
      const rootEl = doc.documentElement as HTMLElement | null;
      rootEl?.style.setProperty("--addon-popup-width", `${width}px`);
      rootEl?.style.setProperty("--addon-popup-height", `${height}px`);
    };

    // Use Reader event to gain access to the reader's document
    // RenderToolbar fires reliably for PDF/EPUB/Snapshot
    Zotero.Reader.registerEventListener(
      "renderToolbar",
      ({ doc }) => injectIntoReader(doc),
      addon.data.config.addonID,
    );
  } catch (e) {
    Zotero.debug?.(`Failed to register Reader injector: ${e}`);
  }

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Apply popup sizing CSS variables to this window
  try {
    const doc = win.document;
    const width = getPref("popupWidth");
    const height = getPref("popupHeight");
    const rootEl = doc.documentElement as HTMLElement | null;
    rootEl?.style.setProperty("--addon-popup-width", `${width}px`);
    rootEl?.style.setProperty("--addon-popup-height", `${height}px`);
  } catch (e) {
    Zotero.debug?.(`Failed to apply popup size: ${e}`);
  }
}

function onShutdown(): void {
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

// Minimal stubs to satisfy template references
async function onNotify(
  _event: string,
  _type: string,
  _ids: Array<string | number>,
  _extraData: { [key: string]: any },
) {
  return;
}

function onShortcuts(_type: string) {}

function onDialogEvents(_type: string) {}
/** Preference UI events */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onNotify,
  onShortcuts,
  onDialogEvents,
  onPrefsEvent,
};
