import { config } from "../../package.json";
import { getString } from "../utils/locale";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      // Minimal preferences: no table rendering
      columns: [],
      rows: [],
    };
  } else {
    addon.data.prefs.window = _window;
  }
  // Nothing else to bind in minimal UI
}

// Minimal UI: no table rendering
async function updatePrefsUI() {}

function bindPrefEvents() {}
