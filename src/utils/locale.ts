import { config } from "../../package.json";
import type { FluentMessageId } from "../../typings/i10n";

export function initLocale() {
  const l10n = new (
    typeof Localization === "undefined"
      ? ztoolkit.getGlobal("Localization")
      : Localization
  )([`${config.addonRef}-preferences.ftl`], true);
  addon.data.locale = {
    current: l10n,
  };
}

export function getString(localeString: FluentMessageId) {
  const messageID = `${config.addonRef}-${localeString}`;
  const pattern = addon.data.locale?.current.formatMessagesSync([
    { id: messageID },
  ])[0];
  return pattern?.value || messageID;
}
