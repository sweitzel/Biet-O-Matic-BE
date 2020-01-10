/*
 * background.js - Mainly for setup of event listeners
 * ===================================================
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

import browser from "webextension-polyfill";

class BomBackground {
  constructor() {
    this.registerEvents();
  }

  /*
   * register events:
   * - browserAction clicked
   * - extension update available
   */
  registerEvents() {
    /*
     * Activate or Open the Overview tab when extension action is clicked
     *   This calls the openBomTab with tabs.tab as parameter.
     *   If the browser action is clicked from the overview or eBay tab, then
     */
    browser.browserAction.onClicked.addListener(this.browserActionClickedHandler);

    //runtime extension install listener
    browser.runtime.onInstalled.addListener(this.runtimeOnInstalledHandler);
  }

  /*
   * Activate the BE overview window, when the Browser Action button is clicked
   * - when the button is clicked from an ebay tab or the overview page, will simply toggle the window autoBid
   * - when clicked from ebay tab, then the overview page gets activated
   */
  async browserActionClickedHandler(tab) {
     // query tab for specified or current window with extension URL
    let tabs = await browser.tabs.query({
      windowId: (tab && 'windowId' in tab) ? tab.windowId : browser.windows.WINDOW_ID_CURRENT,
      url: browser.runtime.getURL('*')
    });
    for (let i = 0; i < tabs.length; i++) {
      if (i > 0) {
        await browser.tabs.remove(tabs[i].id);
        console.debug("Closed additional BOM instance (tab=%d)", tabs[i].id);
        continue;
      }
      // if open, ensure it is pinned (user might have accidentally un-pinned it)
      const params = {};
      params.pinned = true;
      // do not activate BOM overview tab if the current tab is an ebay tab - this could cause confusion
      if (tab != null && tab.url.startsWith(browser.runtime.getURL("")) === false && /^https?:\/\/.*\.ebay\.(de|com)\/itm/.test(tab.url) === false) {
        params.highlighted = true;
        params.active = true;
      }
      // autoDiscardable not supported by all browsers, so we check it exists
      if ('autoDiscardable' in tabs[i]) {
        params.autoDiscardable = false;
      }
      await browser.tabs.update(tabs[i].id, params)
        .then(console.debug("openBomTab(): tab with id %d updated, params=%s", tabs[i].id, JSON.stringify(params)))
        .catch(e => console.warn(`openBomTab() failed to update tab err=${e.message}`));
    }
    // if no BOM tab is open, create one
    if (tabs.length === 0) {
      await browser.tabs.create({
        url: browser.runtime.getURL(BomBackground.getPopupFileName()),
        windowId: (tab && 'windowId' in tab) ? tab.windowId : browser.windows.WINDOW_ID_CURRENT,
        pinned: true,
        index: 0
      });
    }
  }

  /*
   * called after update was executed
   * - open popup if the window had autoBidEnabled
   */
  async runtimeOnInstalledHandler(details) {
    try {
      console.log("onInstalled Listener called details=%s", JSON.stringify(details));
      const manifest = browser.runtime.getManifest();
      if (details.reason === "install") {
        console.info("Biet-O-Matic: Initially installed (version %s)");
      } else if (details.reason === "update") {
        if (details.previousVersion !== manifest.version) {
          console.info('Biet-O-Matic: Updated from version %s to %s!', details.previousVersion, manifest.version);
        }
      }
      // check if the current window has autoBid enabled (recently)
      let autoBidEnabledForThisWindow = await BomBackground.checkAutoBidEnabledForThisWindow();
      if (autoBidEnabledForThisWindow) {
        // open the popup
        console.info("Biet-O-Matic: Opening Popup after update, autoBid was enabled before");
        await browser.tabs.create({
          url: browser.runtime.getURL(BomBackground.getPopupFileName()),
          windowId: browser.windows.WINDOW_ID_CURRENT,
          pinned: true,
          index: 0
        });
      }
    } catch (e) {
      console.error(`Biet-O-Matic: runtimeOnInstalledHandler() Internal Error: ${e.message}`);
    }
  }

  // check if the autoBid is enabled for this window
  static async checkAutoBidEnabledForThisWindow() {
    const currentWindow = await browser.windows.getCurrent({populate: false});
    const result = await browser.storage.sync.get('SETTINGS');
    if (Object.keys(result).length === 1 && result.hasOwnProperty('SETTINGS')) {
      const settingsInfo = result.SETTINGS;
      if (settingsInfo.hasOwnProperty('autoBid')) {
        const autoBid = settingsInfo.autoBid;
        // same window id?
        let id = autoBid.id.split(':')[1];
        if (autoBid.id.split(':')[1] !== currentWindow.id.toString()) {
          console.debug("Biet-O-Matic: checkAutoBidEnabledForThisWindow() autoBid for different id: stored=%s, ours=%s",
            autoBid.id.split(':')[1], currentWindow.id);
        } else if ((Date.now() - autoBid.timestamp) > 5*60*1000) {
          // entry not older than 5 minutes
          console.debug("Biet-O-Matic: checkAutoBidEnabledForThisWindow() autoBid too old (%ss)",
            (Date.now() - autoBid.timestamp) / 1000);
        } else {
          console.debug("Biet-O-Matic: checkAutoBidEnabledForThisWindow() autoBid age is ok (%ss)",
            (Date.now() - autoBid.timestamp) / 1000);
          return true;
        }
      }
    }
    return false;
  }

  static getPopupFileName() {
    if (browser.i18n.getMessage('filePopup') !== "") {
      return browser.i18n.getMessage('filePopup');
    } else {
      return "popup.en.html";
    }
  }

}


let bom = new BomBackground();