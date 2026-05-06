/* global document, MutationObserver */

(() => {
  const ADDON_REF = "zoterocitepreviewresizer";
  const ROOT_ID = `${ADDON_REF}-prefs`;
  const DISABLE_PREVIEW_ID = `zotero-prefpane-${ADDON_REF}-disablePreview`;
  const RELATED_CONTROL_IDS = [
    `zotero-prefpane-${ADDON_REF}-lockPopupSize`,
    `zotero-prefpane-${ADDON_REF}-popupWidth`,
    `zotero-prefpane-${ADDON_REF}-popupHeight`,
  ];

  function init() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.resizePrefsBound === "true") {
      return Boolean(root);
    }

    const disablePreview = document.getElementById(DISABLE_PREVIEW_ID);
    if (!disablePreview) {
      return false;
    }

    root.dataset.resizePrefsBound = "true";

    const updateRelatedControls = () => {
      const disabled = Boolean(disablePreview.checked);
      root.toggleAttribute("data-preview-disabled", disabled);

      for (const id of RELATED_CONTROL_IDS) {
        const control = document.getElementById(id);
        if (!control) {
          continue;
        }

        control.disabled = disabled;
        if (disabled) {
          control.setAttribute("disabled", "true");
        } else {
          control.removeAttribute("disabled");
        }

        const row = control.closest(".size-pref") || control;
        row.toggleAttribute("data-disabled-by-preview", disabled);
      }
    };

    disablePreview.addEventListener("command", updateRelatedControls);
    disablePreview.addEventListener("change", updateRelatedControls);
    disablePreview.addEventListener(
      "syncfrompreference",
      updateRelatedControls,
    );
    disablePreview.addEventListener("synctopreference", updateRelatedControls);
    updateRelatedControls();
    return true;
  }

  if (init()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (init()) {
      observer.disconnect();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
