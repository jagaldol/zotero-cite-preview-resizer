import { registerPrefsScripts } from "./modules/preferenceScript";
import { getPref } from "./utils/prefs";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  // Register a minimal Preferences pane without using examples
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: addon.data.config.addonName,
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
        .view-popup.preview-popup, .view-popup.preview-popup .inner {\n\
          width: ${width}px !important;\n\
          max-width: 95vw; max-height: ${height}px; overflow: auto; box-sizing: border-box;\n\
        }\n\
        .view-popup.preview-popup img, .view-popup.preview-popup .inner img {\n\
          width: 100% !important; height: auto !important; display: block;\n\
        }`;
      if (!style) {
        style = doc.createElement("style");
        style.id = styleId;
        style.textContent = css;
        doc.documentElement.appendChild(style);
      } else if (style.textContent !== css) {
        style.textContent = css;
      }
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
  // Ensure stylesheet is loaded
  try {
    const doc = win.document;
    const existed = doc.querySelector(
      `link[href="chrome://${addon.data.config.addonRef}/content/zoteroPane.css"]`,
    );
    if (!existed) {
      const styles = ztoolkit.UI.createElement(doc, "link", {
        properties: {
          type: "text/css",
          rel: "stylesheet",
          href: `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
        },
      });
      doc.documentElement?.appendChild(styles);
    }
  } catch (e) {
    Zotero.debug?.(`Failed to inject stylesheet: ${e}`);
  }

  // Apply popup sizing CSS variables to this window
  try {
    const doc = win.document;
    const width = getPref("popupWidth");
    const height = getPref("popupHeight");
    doc.documentElement?.style.setProperty("--addon-popup-width", `${width}px`);
    doc.documentElement?.style.setProperty(
      "--addon-popup-height",
      `${height}px`,
    );
  } catch (e) {
    Zotero.debug?.(`Failed to apply popup size: ${e}`);
  }

  // Directly resize preview popup (.view-popup.preview-popup[ .inner]) if present
  try {
    const doc = win.document;
    const applySize = () => {
      const width = getPref("popupWidth");
      const height = getPref("popupHeight");
      const innerList = doc.querySelectorAll<HTMLElement>(
        ".view-popup.preview-popup .inner:not(.__addonSized)",
      );
      const containerList = doc.querySelectorAll<HTMLElement>(
        ".view-popup.preview-popup:not(.__addonSized)",
      );
      // Prefer sizing inner; fallback to container when no inner exists
      const targets = innerList.length ? innerList : containerList;
      targets.forEach((el) => {
        el.style.setProperty("width", `${width}px`, "important");
        // Do not force height; keep natural image height with scroll
        el.classList.add("__addonSized");
      });
    };
    applySize();
    const mo = new win.MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          applySize();
        } else if (m.type === "attributes") {
          const t = m.target as HTMLElement;
          if (t.matches && t.matches(".view-popup.preview-popup .inner")) {
            applySize();
          }
        }
      }
    });
    mo.observe(doc, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    // store observer to shut down later
    (addon.data as any).__popupMO = (addon.data as any).__popupMO || new Map();
    (addon.data as any).__popupMO.set(win, mo);
  } catch (e) {
    Zotero.debug?.(`Failed to observe preview popup: ${e}`);
  }
}

async function onMainWindowUnload(win: Window): Promise<void> {
  try {
    const mo = (addon.data as any).__popupMO?.get?.(win);
    mo?.disconnect?.();
    (addon.data as any).__popupMO?.delete?.(win);
  } catch {}
}

function onShutdown(): void {
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // Minimal: no notify handling
  return;
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  // Minimal: no shortcuts registered
}

function onDialogEvents(type: string) {
  // Minimal: no dialog helpers
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
