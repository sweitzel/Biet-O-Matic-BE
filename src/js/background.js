/*
 * background.js - Mainly for setup of event listeners
 * ===================================================
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

import browser from "webextension-polyfill";
import BomStorage from "./BomStorage.js";

class BomBackground {
  constructor() {
    // object of popup tabs, key is the windowId, value the tab object
    this.popupTab = {};
    // read options from sync storage (irrespective of user storage selection)
    browser.storage.sync.get({enableLocalMode: false}).then((options) => {
      this.storage = new BomStorage(options.enableLocalMode);
      this.registerEvents();
    });
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
    browser.browserAction.onClicked.addListener(tab => {
      this.browserActionClickedHandler(tab)
        .then()
        .catch(e => {console.log("Biet-O-Matic: BrowserActionClicked error: %s", e)});
    });

    // handle browser close / restart
    browser.windows.onRemoved.addListener(this.windowsOnRemovedHandler);

    //runtime extension install listener
    browser.runtime.onInstalled.addListener(this.runtimeOnInstalledHandler);
  }

  /*
   * Return existing popup tab
   * - scans for "zombie" popup tab if needed
   * - closes duplicate popup tabs
   * - returns null if no popup tab yet
   */
  async getPopupTab(windowId) {
    function wait(ms) {
      return new Promise(function(resolve, reject) {
        setTimeout(resolve, ms, 'TIMED_OUT');
      });
    }
    let result = null;
    if (this.popupTab.hasOwnProperty(windowId)) {
      const tab = this.popupTab[windowId];
      if (tab != null) {
        // check if popup responds to ping (might be closed in the meanwhile)
        try {
          const tabInfo = await browser.tabs.get(tab.id);
          result = tab;
          console.debug("Biet-O-Matic: Checking tab %s succeeded", tab.id);
        } catch (e) {
          console.debug("Biet-O-Matic: Checking tab %s failed: %s", tab.id, e);
          this.popupTab[windowId] = null;
        }
      }
    }
    // find "zombie" popup tab
    const tabs = await browser.tabs.query({windowId: windowId});
    for (const iTab of tabs) {
      try {
        const promise1 = browser.tabs.sendMessage(iTab.id, {action: "pingPopup"});
        const promise2 = wait(300);
        const response = await Promise.race([promise1, promise2]);
        if (response === "pong") {
          console.debug("Biet-O-Matic: Pinging tab %s succeeded", iTab.id);
          if (this.popupTab.hasOwnProperty(windowId) && this.popupTab[windowId] != null) {
            // close duplicate popup tab
            if (this.popupTab[windowId].id !== iTab.id) {
              console.log("Biet-O-Matic: Closing duplicate tab %d", iTab.id);
              browser.tabs.remove(iTab.id);
            } else {
              // this is the open tab, nothing to do
            }
          } else {
            // the zombie should be reused as popup tab
            this.popupTab[windowId] = iTab;
            result = iTab;
          }
        }
      } catch (e) {
        console.debug("Biet-O-Matic: Pinging tab %s failed: %s", iTab.id, e.message);
      }
    }
    return result;
  }

  async browserActionClickedHandler(tab) {
    try {
      console.log("browserActionClickedHandler called from tab=%O", tab);
      let popupTab = await this.getPopupTab(tab.windowId);
      if (popupTab == null) {
        console.info("Biet-O-Matic: browserActionClickedHandler() no open tabs, creating new.");
        popupTab = await browser.tabs.create({
          url: browser.runtime.getURL(BomBackground.getPopupFileName()),
          windowId: tab.windowId,
          pinned: true,
          index: 0
        });
        // autoDiscardable not supported by all browsers, so we check it exists
        if ('autoDiscardable' in tab) {
          await browser.tabs.update(popupTab.id, {autoDiscardable: false})
            .catch(e => console.warn("openBomTab() failed to update new tab err: " + e));
        }
      } else {
        // if open, ensure it is pinned (user might have accidentally un-pinned it)
        const params = {};
        params.pinned = true;
        // do not activate BOM overview tab if the current tab is an ebay tab - this could cause confusion
        if (tab.url.startsWith(browser.runtime.getURL("")) === false && /^https?:\/\/.*\.ebay\.(de|com)\/itm/.test(tab.url) === false) {
          params.highlighted = true;
          params.active = true;
        }
        // autoDiscardable not supported by all browsers, so we check it exists
        if ('autoDiscardable' in tab) {
          params.autoDiscardable = false;
        }
        await browser.tabs.update(popupTab.id, params)
          .then(console.debug("openBomTab(): tab with id %s updated, params=%s", popupTab.id, JSON.stringify(params)))
          .catch(e => console.warn("openBomTab() failed to update existing tab err: " + e));
      }
    } catch (e) {
      console.error("Biet-O-Matic: browserActionClickedHandler() Internal Error: " + e);
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
      // check if any of the currently open browser windows has/had autoBid enabled recently
      const windowList = await browser.windows.getAll({populate: false, windowTypes: ['normal']});
      for (const window of windowList) {
        const autoBidEnabledForThisWindow = await BomBackground.checkAutoBidEnabledForWindow(window);
        if (autoBidEnabledForThisWindow) {
          // open the popup
          console.info("Biet-O-Matic: Opening Popup after update, autoBid was enabled before in window(%d)", window.id);
          await browser.tabs.create({
            url: browser.runtime.getURL(BomBackground.getPopupFileName()),
            windowId: window.id,
            pinned: true,
            index: 0
          });
        }
      }
    } catch (e) {
      console.error("Biet-O-Matic: runtimeOnInstalledHandler() Internal Error: " + e);
    }
  }

  /*
   * Check if the autoBid was enabled for one of the opened browser windows
   * This will be used to reload BE popup after extension update.
   */
  static async checkAutoBidEnabledForWindow(window) {
    const result = await browser.storage.sync.get('SETTINGS');
    if (Object.keys(result).length === 1 && result.hasOwnProperty('SETTINGS')) {
      const settingsInfo = result.SETTINGS;
      if (settingsInfo.hasOwnProperty('autoBid')) {
        const autoBid = settingsInfo.autoBid;
        // same window id?
        let id = autoBid.id.split(':')[1];
        if (autoBid.id.split(':')[1] !== window.id.toString()) {
          console.debug("Biet-O-Matic: checkAutoBidEnabledForThisWindow(%d) Skipping; autoBid for different id: stored=%s",
            window.id, autoBid.id.split(':')[1]);
        } else if ((Date.now() - autoBid.timestamp) > 5 * 60 * 1000) {
          // entry not older than 5 minutes
          console.debug("Biet-O-Matic: checkAutoBidEnabledForThisWindow(%d) Skipping; autoBid too old (%ss)",
            window.id, (Date.now() - autoBid.timestamp) / 1000);
        } else {
          console.debug("Biet-O-Matic: checkAutoBidEnabledForThisWindow(%d) Using; autoBid age is ok (%ss)",
            window.id, (Date.now() - autoBid.timestamp) / 1000);
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

  /*
   * handle browser close, remove autoBid state from sync storage if active for this window
   * - however this doesnt seem to be called in Chrome when the browser is restarting
   */
  async windowsOnRemovedHandler(windowId) {
    try  {
      const checkId = `${browser.runtime.id}:${windowId}`;
      // check if closed window is the global active autoBid window
      let result = await browser.storage.sync.get('SETTINGS');
      if (Object.keys(result).length === 1 && result.hasOwnProperty('SETTINGS')) {
        const settingsInfo = result.SETTINGS;
        if (settingsInfo.hasOwnProperty('autoBid')) {
          if (settingsInfo.autoBid.id === checkId) {
            // remove autoBid info from sync area
            console.log("Biet-O-Matic: autoBid active browser window closed, removed sync info: checkId=%s", windowId, checkId);
            delete settingsInfo.autoBid;
            browser.storage.sync.set({'SETTINGS': settingsInfo});
          }
        }
      }
    } catch (e) {
      console.error("Biet-O-Matic: windowsOnRemovedHandler() Internal Error: " + e);
    }
  }

}

const bom = new BomBackground();