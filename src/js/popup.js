/*
 * biet-o-matic.js - Ebay Article Overview (Extension Popup)
 * =======================================================
 * - Display each Ebay Article Tab in a Table
 * - Receives events from Ebay Article Tab Content Script
 * - Manages a simple database (e.g. containing the max-bids)
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

// mozilla webextension polyfill for chrome
import browser from "webextension-polyfill";
import $ from "jquery";

import "jquery-ui-dist/jquery-ui.css";
import "jquery-ui-dist/jquery-ui.js";

// datatables.net + responsive, jquery-ui design
import "datatables.net-jqui/css/dataTables.jqueryui.css";
import "datatables.net-buttons-jqui/css/buttons.jqueryui.css";
import "datatables.net-responsive-jqui/css/responsive.jqueryui.css";
import "datatables.net-rowgroup-jqui/css/rowGroup.jqueryui.css";
import "datatables.net-jqui";
import "datatables.net-buttons-jqui";
import "datatables.net-responsive-jqui";
import "datatables.net-rowgroup-jqui";

// date-fns as alternative to moment
import { format, formatDistanceToNow } from "date-fns";
import { de, enUS } from "date-fns/locale";

// FontAwesome
import "@fortawesome/fontawesome-free/css/all.css";
//import '@fortawesome/fontawesome-free/js/fontawesome';
//import '@fortawesome/fontawesome-free/js/regular';

// Notifications
//import { toastr } from "toastr";
import * as toastr from "toastr";
import "toastr/build/toastr.css";

import EbayParser from "./EbayParser.js";
import BomStorage from "./BomStorage.js";
import "../css/popup.css";

/*
 * All functions related to Auction Groups
 * Group information is stored in browser sync storage under key GROUPS: { 'name': { autoBid: true, bidAll: true }, ...]
 */
class Group {
  // returns the groups from sync.storage
  static async getAll() {
    let result = await Popup.storage.get("GROUPS");
    if (Object.keys(result).length === 1) return result.GROUPS;
    else return {};
  }

  /*
   * returns the state of group {autoBid: true|false, bidAll: true|false}
   * and sets the group cache
   */
  static async getState(name) {
    const result = { autoBid: true, bidAll: false };
    // name=null -> name=Other Auctions
    if (name == null || typeof name === "undefined") {
      name = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
    }
    const storedResult = await Popup.storage.get("GROUPS");
    if (Object.keys(storedResult).length === 1) {
      const groupInfo = storedResult.GROUPS;
      //console.debug("Biet-O-Matic: Group.getState(%s:%s) : %s", name, typeof name, JSON.stringify(groupInfo));
      if (groupInfo.hasOwnProperty(name)) {
        Object.assign(result, groupInfo[name]);
        if (!Popup.cachedGroups.hasOwnProperty(name)) {
          Popup.cachedGroups[name] = {};
        }
        Popup.cachedGroups[name] = result;
      } else {
        console.log("Biet-O-Matic: Group.getState(%s) NOT found in storage, returning default.", name);
      }
    }
    return result;
  }

  // return cached group state or default settings if not cached
  static getStateCached(name) {
    const result = { autoBid: true, bidAll: false };
    // name=null -> name=Keine Gruppe
    if (name == null || typeof name === "undefined") {
      name = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
    }
    if (Popup.cachedGroups.hasOwnProperty(name)) {
      //console.debug("Biet-O-Matic: getStateCached(%s) found in cache: %s", name, JSON.stringify(Popup.cachedGroups[name]));
      Object.assign(result, Popup.cachedGroups[name]);
    } else {
      console.log("Biet-O-Matic: Group.getStateCached(%s) NOT found in cache, returning default.", name);
    }
    return result;
  }

  /*
   * Set group autoBid state
   * Also creates the group if its not existing yet
   */
  static async setState(name, autoBid = false, bidAll = false) {
    // name=null -> name=Keine Gruppe
    if (name == null || typeof name === "undefined") name = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
    const groupInfo = await Group.getAll();
    // check if the autoBid needs to be updated
    if (groupInfo.hasOwnProperty(name)) {
      const autoBidUnchanged = groupInfo[name].hasOwnProperty("autoBid") && groupInfo[name].autoBid === autoBid;
      const bidAllUnchanged = groupInfo[name].hasOwnProperty("bidAll") && groupInfo[name].bidAll === bidAll;
      if (autoBidUnchanged && bidAllUnchanged) {
        return;
      }
    }
    console.debug("Biet-O-Matic: Group.setState(%s) setting autoBid=%s, bidAll=%s", name, autoBid, bidAll);

    groupInfo[name] = { autoBid: autoBid, bidAll: bidAll, timestamp: Date.now() };
    Popup.cachedGroups[name] = groupInfo[name];

    // store the info back to the storage
    await Popup.storage.set({ GROUPS: groupInfo });
  }

  static async toggleAutoBid(name) {
    if (typeof name === "undefined") return false;
    const state = await Group.getState(name);
    await Group.setState(name, !state.autoBid, state.bidAll);
  }

  static async toggleBidAll(name) {
    if (typeof name === "undefined") return false;
    const state = await Group.getState(name);
    await Group.setState(name, state.autoBid, !state.bidAll);
  }

  static async renderAutoBid(id, name) {
    const inpGroupAutoBid = await Group.waitFor(`#${id}[name="${name}"]`, 1000).catch((e) => {
      // its expected to fail sometimes, e.g. due to table pagination
      console.debug(
        "Biet-O-Matic: Group.renderAutoBid() failed ('#%s[name=%s]' element not found): %s",
        id,
        name,
        e.message
      );
    });
    if (inpGroupAutoBid == null || inpGroupAutoBid.length !== 1) {
      return;
    }
    try {
      const state = await Group.getState(name);
      if (state.autoBid) {
        $(inpGroupAutoBid).siblings("span").removeClass("autoBidDisabled");
        $(inpGroupAutoBid).siblings("span").addClass("autoBidEnabled");
        $(inpGroupAutoBid).siblings("span").attr("data-i18n-after", Popup.getTranslation("generic_active", ".active"));
      } else {
        $(inpGroupAutoBid).siblings("span").removeClass("autoBidEnabled");
        $(inpGroupAutoBid).siblings("span").addClass("autoBidDisabled");
        $(inpGroupAutoBid)
          .siblings("span")
          .attr("data-i18n-after", Popup.getTranslation("generic_inactive", ".inactive"));
      }
    } catch (e) {
      console.warn(`Biet-O-Matic: renderAutoBid() - Cannot determine autoBid state for group ${name}: ${e.message}`);
    }
  }

  // Add the proper class to the group name span
  static async renderBidAll(id, name) {
    const inpGroupBidAll = await Group.waitFor(`#${id}[name="${name}"]`, 1000).catch((e) => {
      // its expected to fail sometimes, e.g. due to table pagination
      console.debug(
        "Biet-O-Matic: Group.renderBidAll() failed ('#%s[name=%s]' element not found): %s",
        id,
        name,
        e.message
      );
    });
    if (inpGroupBidAll == null || inpGroupBidAll.length !== 1) {
      return;
    }
    try {
      const state = await Group.getState(name);
      if (state.bidAll) {
        $(inpGroupBidAll)
          .siblings("span")
          .text(" " + Popup.getTranslation("generic_group_bidAllEnabled", ".Bid all"));
      } else {
        $(inpGroupBidAll)
          .siblings("span")
          .text(" " + Popup.getTranslation("generic_group_bidAllDisabled", ".Bid until you win"));
      }  
    } catch (e) {
      console.warn(`Biet-O-Matic: renderBidAll() - Cannot determine bidAll state for group ${name}: ${e.message}`);
    }  
  }

  // remove unused groups
  static async removeAllUnused() {
    try {
      // first iterate through all articles and determine which groups are used
      let storedInfo = await Popup.storage.get(null);
      const usedGroups = {};
      Object.keys(storedInfo).forEach((articleId) => {
        if (/^[0-9]+$/.test(articleId) === false) {
          return;
        }
        if (storedInfo[articleId].hasOwnProperty("articleGroup") === false) {
          return;
        }
        let articleGroup = storedInfo[articleId].articleGroup;
        // handle default group to ensure its not removed
        if (articleGroup == null) {
          if (Popup.disableGroups) {
            articleGroup = Popup.getTranslation("generic_items", ".Items");
          } else {
            articleGroup = Popup.getTranslation("generic_noGroup", ".Other Items");
          }
        }
        usedGroups[articleGroup] = {};
      });

      // iterate through all groups and remove unused
      const groups = await Group.getAll();
      Object.keys(groups).forEach((groupName) => {
        // check article is used from previous determined info
        if (usedGroups.hasOwnProperty(groupName)) {
          return;
        }
        // remove if group has no timestamp or timestamp is older 5 days
        if (
          !groups[groupName].hasOwnProperty("timestamp") ||
          (Date.now() - groups[groupName].timestamp) / 1000 > 60 * 60 * 24 * 5
        ) {
          console.debug("Biet-O-Matic: Group.removeAllUnused() Removing group: %s", groupName);
          Group.remove(groupName);
        }
      });
    } catch (e) {
      console.log("Biet-O-Matic: Group.removeAllUnused() Error: %s", e.message);
    }
  }

  static async remove(name) {
    let result = await Popup.storage.get("GROUPS");
    if (Object.keys(result).length !== 1) return;
    if (!result.GROUPS.hasOwnProperty(name)) return;
    delete result.GROUPS[name];
    await Popup.storage.set(result);
  }

  // promisified setTimeout - simply wait for a defined time
  static wait(ms) {
    return new Promise(function (resolve) {
      if (ms < 500) {
        console.warn("Biet-O-Matic: wait(%s), too short, abort wait.", ms);
        resolve();
      } else {
        window.setTimeout(function () {
          resolve();
        }, ms);
      }
    });
  }

  // https://stackoverflow.com/questions/5525071/how-to-wait-until-an-element-exists
  static waitFor(selector, timeout = 3000) {
    return new Promise(function (resolve, reject) {
      waitForElementToDisplay(selector, 250, timeout);

      function waitForElementToDisplay(selector, interval, timeout) {
        if (timeout <= 0) {
          reject(`waitFor(${selector}), timeout expired!`);
        } else if ($(selector).length === 1) {
          resolve($(selector));
        } else {
          window.setTimeout(function () {
            waitForElementToDisplay(selector, interval, timeout - interval);
          }, interval);
        }
      }
    });
  }

  /*
   * Update group state from given GROUP info
   * this is typically called when the storage changed event was generated, i.e. triggered by a remote instance
   */
  static updateFromChanges(changes) {
    if (!changes.hasOwnProperty("newValue")) return;
    // todo: Do we have to handle removed groups?
    Object.keys(changes.newValue).forEach((groupName) => {
      if (groupName !== "") {
        Group.renderAutoBid("inpGroupAutoBid", groupName).catch();
        Group.renderBidAll("inpGroupBidAll", groupName).catch();
      }
    });
  }

  // update datalist on overview page, will be used by each article row
  static updateDatalist() {
    const datalist = $("#groups");
    if (typeof datalist === "undefined") return;
    datalist.empty();
    Object.keys(Popup.cachedGroups).forEach((group) => {
      if (group.length === 0) return;
      const option = document.createElement("option");
      option.value = group;
      datalist.append(option);
    });
  }
}

/*
 * Manage Window AutoBid
 * - uses both window.sessionStorage and browser sync storage to maintain the state
 * - only one window can have autoBid enabled
 * - when simulation is enabled, the state is not stored to sync storage
 */
class AutoBid {
  // own ID: Extension Id + Browser Window Id ->
  static async getId() {
    if (!AutoBid.hasOwnProperty("beWindowId") || AutoBid.beWindowId == null) {
      const currentWindow = await browser.windows.getCurrent({ populate: false });
      AutoBid.beWindowId = `${window.location.hostname}:${currentWindow.id}`;
    }
    return AutoBid.beWindowId;
  }

  static getLocalState() {
    const info = {};
    let result = JSON.parse(window.sessionStorage.getItem("settings"));
    if (result != null) {
      Object.assign(info, result);
    }
    return info;
  }

  /*
   * return the info as is, to be evaluated external
   * SETTINGS: {autoBid: {id: <Id>, autoBidEnabled: true, timestamp: xxx}, otherSetting: xxxx}
   */
  static async getSyncState() {
    let info = { autoBidEnabled: false, id: null, timestamp: null };
    let result = await browser.storage.sync.get("SETTINGS");
    //console.log("XXX getSyncState() %s", JSON.stringify(result));
    if (Object.keys(result).length === 1 && result.hasOwnProperty("SETTINGS")) {
      const settingsInfo = result.SETTINGS;
      if (settingsInfo.hasOwnProperty("autoBid")) {
        Object.assign(info, settingsInfo.autoBid);
        console.debug(
          "Biet-O-Matic: AutoBid.getSyncState() stored=%s, info=%s",
          JSON.stringify(settingsInfo),
          JSON.stringify(info)
        );
      }
    }
    return info;
  }

  /*
   * set state in browser sync storage. Do not store simulation state here.
   * - if autoBid is being disabled for this Id, then only update the syncInfo if the id is ours
   */
  static async setSyncState(autoBidEnabled) {
    let result = await browser.storage.sync.get("SETTINGS");
    let oldSettings = {};
    if (Object.keys(result).length === 1 && result.hasOwnProperty("SETTINGS")) {
      oldSettings = result.SETTINGS;
    }
    const myId = await AutoBid.getId();
    let newSettings = {
      autoBid: {
        id: myId,
        autoBidEnabled: autoBidEnabled,
        timestamp: Date.now(),
      },
    };

    if (autoBidEnabled == null) {
      // dead man switch, outdated entry should be removed
      delete newSettings.autoBid;
    } else if (autoBidEnabled === false) {
      // remove the sync autoBid info, but only if the id stored there is ours (internet / sync problems could maybe cause this)
      if (
        oldSettings.hasOwnProperty("autoBid") &&
        oldSettings.autoBid.hasOwnProperty("id") &&
        oldSettings.autoBid.id === myId
      ) {
        delete oldSettings.autoBid;
      }
      newSettings = oldSettings;
    } else {
      newSettings = Object.assign({}, oldSettings, newSettings);
    }
    console.debug("AutoBid.setSyncState(%s) Setting autoBid info %s", autoBidEnabled, JSON.stringify(newSettings));
    AutoBid.cachedChange = newSettings;
    await browser.storage.sync.set({ SETTINGS: newSettings });
  }

  /*
   * Determine autoBid state
   * - generally prefers the local state
   * - if the sync state is enabled for a different window (Id) then disable autoBid
   * - if sync state for this window is present, but local state is not set, then use sync state (extension update)
   * Note: this function is called by renderState, which will be called regularly to check for remote state updates
   * return {autoBidEnabled: true|false, simulation: true|false, id: <Id>|null, message: 'Text'}
   */
  static async getState() {
    let info = { autoBidEnabled: false, simulation: false, id: null };
    const localInfo = AutoBid.getLocalState();
    const syncInfo = await AutoBid.getSyncState();

    const myId = await AutoBid.getId();
    Object.assign(info, localInfo);

    // if sync state is for different id , then disable autoBid (sync state is only added if active)
    // Note: if syncInfo.id == localInfo.id , then the browser probably restarted and assigned new windowId,
    //       in that case do not disable autoBid
    const localInfoMatchesSyncInfo = syncInfo.hasOwnProperty("id") && localInfo.hasOwnProperty("id") && syncInfo.id === localInfo.id;
    const syncIdNotEqualMyId = syncInfo.hasOwnProperty("id") && syncInfo.id != null && syncInfo.id !== myId;

    if (localInfoMatchesSyncInfo) {
      // syncInfo is intended for this window, just update with (potentially) new Id
      console.log(
        "Biet-O-Matic: Updating localInfo id. (myId=%s, syncId=%s, localOldInfo=%s)",
        myId,
        syncInfo.id,
        localInfo.id
      );
      Popup.updateSetting({});
      AutoBid.deadManSwitchFunc();
    } else if (syncIdNotEqualMyId) {
      console.log(
        "Biet-O-Matic: Disabling autoBid because its enabled remotely. (myId=%s, syncId=%s, localOldInfo=%s)",
        myId,
        syncInfo.id,
        localInfo.id
      );
      info.messageHtml = AutoBid.getDisableMessage(syncInfo.id, info.autoBidEnabled, info.simulation);
      if (info.simulation === false && syncInfo.autoBidEnabled === true) {
        info.autoBidEnabled = false;
        Popup.updateSetting({ autoBidEnabled: false });
      }
    } else if (Object.keys(localInfo).length === 0) {
      // initially set localState after extension update
      Object.assign(info, syncInfo);
      Popup.updateSetting(info);
    }        

    return info;
  }

  /*
   * Set state in local storage and sync storage (if not simulating)
   */
  static setState(autoBidEnabled = false, simulation = false) {
    Popup.updateSetting({ autoBidEnabled: autoBidEnabled, simulation: simulation });
    // do not set sync state if simulation is on (but handle shift when autoBid is disabled with shift pressed)
    if (simulation === false || autoBidEnabled === false) {
      AutoBid.setSyncState(autoBidEnabled)
        .then(() => {
          console.debug("Biet-O-Matic: AutoBid.setSyncState(%s) completed", autoBidEnabled);
          AutoBid.renderState();
        })
        .catch((e) => {
          console.warn("Biet-O-Matic: AutoBid.setSyncState(%s) failed: %s", autoBidEnabled, e.message);
        });
    } else {
      AutoBid.renderState();
    }
  }

  static async toggleState(simulate = null) {
    const state = await AutoBid.getState();
    if (simulate == null) simulate = state.simulation;
    AutoBid.setState(!state.autoBidEnabled, simulate);
  }

  static renderState() {
    console.debug("Biet-O-Matic: AutoBid.renderState() called.");
    const lblAutoBid = $("#lblAutoBid");
    const autoBidMessage = $("#autoBidMessage");
    AutoBid.getState()
      .then((info) => {
        AutoBid.jq.prop("checked", info.autoBidEnabled);
        let state = "";
        if (info.simulation) {
          $("#internal").removeClass("hidden");
          state = "(Test) ";
        } else {
          $("#internal").addClass("hidden");
        }
        if (info.autoBidEnabled) {
          state += Popup.getTranslation("generic_active", ".active");
          lblAutoBid.addClass("autoBidEnabled");
          lblAutoBid.removeClass("autoBidDisabled");
        } else {
          state += Popup.getTranslation("generic_inactive", ".inactive");
          lblAutoBid.addClass("autoBidDisabled");
          lblAutoBid.removeClass("autoBidEnabled");
        }
        // do not set sync state if simulation is on
        lblAutoBid.attr("data-i18n-after", state);
        autoBidMessage.empty();
        // show info about other instances and their autoBid state
        if (info.hasOwnProperty("message")) autoBidMessage.text(info.message);
        else if (info.hasOwnProperty("messageHtml")) {
          autoBidMessage.append(info.messageHtml);
        }
        Popup.updateFavicon(info.autoBidEnabled, null, info.simulation);
        // prevent computer sleep
        // check if the regular refresh has been disabled
        Popup.storage.getConfig({ disableSleepPrevention: false }).then((globalOptions) => {
          if (globalOptions.disableSleepPrevention) {
            console.info("Biet-O-Matic: Not trying to prevent sleep mode.");
          } else {
            try {
              if (info.autoBidEnabled) {
                console.log("Biet-O-Matic: Requesting browser to keep system awake.");
                chrome.power.requestKeepAwake("system");
              } else {
                console.log("Biet-O-Matic: Cancelled request for browser to keep system awake.");
                chrome.power.releaseKeepAwake();
              }
            } catch (e) {
              console.log("Biet-O-Matic: Cannot modify computer sleep: %s", e);
            }
          }
        });
      })
      .catch((e) => {
        console.warn("Biet-O-Matic: AutoBid.renderState() failed: %s", e.message);
      });
  }

  static registerEvents() {
    // window inpAutoBid checkbox
    AutoBid.jq.on("click", (e) => {
      e.stopPropagation();
      console.debug(
        "Biet-O-Matic: Automatic mode toggled: %s - shift=%s, ctrl=%s",
        AutoBid.jq.is(":checked"),
        e.shiftKey,
        e.ctrlKey
      );
      AutoBid.setState(AutoBid.jq.is(":checked"), e.shiftKey);
    });

    window.addEventListener("hashchange", (e) => {
      e.preventDefault();
      const windowId = window.location.hash.split(":")[1];
      if (/[0-9]+/.test(windowId)) {
        browser.windows.update(Number.parseInt(windowId, 10), { focused: true }).catch((e) => {
          console.log("Biet-O-Matic: Cannot activate specified window %s: %s", windowId, e.message);
        });
      } else {
        console.warn(
          `Biet-O-Matic: getDisableMessage() Cannot activate specified window, id is not a number: ${windowId}`
        );
      }
      window.location.hash = "";
      return false;
    });
  }

  static getDisableMessage(otherId, autoBidEnabled, simulation) {
    const spanPre = document.createElement("span");
    const link = document.createElement("a");
    const spanPost = document.createElement("span");
    if (simulation || autoBidEnabled === false) {
      spanPre.textContent = Popup.getTranslation("popup_autoBidActive1", ".AutoBid is active in");
      link.href = `#${otherId}`;
      link.id = "windowLink";
      link.textContent = Popup.getTranslation("popup_autoBidActive2", ".another browser window");
      spanPost.textContent = Popup.getTranslation("popup_autoBidActive3", "..");
    } else {
      spanPre.textContent = Popup.getTranslation(
        "popup_autoBidDeactivated1",
        ".Auto-Bid deactivated. It was activated in "
      );
      link.href = `#${otherId}`;
      link.id = "windowLink";
      link.textContent = Popup.getTranslation("popup_autoBidDeactivated2", ".another Browser Window");
      spanPost.textContent = Popup.getTranslation("popup_autoBidDeactivated3", "..");
    }

    // jump to specific window
    // Group.waitFor('#windowLink')
    //   .then(windowLink => {
    //     windowLink.on('click', e => {
    //       e.preventDefault();
    //       const windowId = e.currentTarget.hash.split(':')[1];
    //       if (/[0-9]+/.test(windowId)) {
    //         browser.windows.update(Number.parseInt(windowId, 10), {focused: true}).catch(e => {
    //           console.log("Biet-O-Matic: Cannot activate specified window %s: %s", windowId, e.message);
    //         });
    //       } else {
    //         console.warn("Biet-O-Matic: getDisableMessage() Cannot activate specified window, id is not a number: %s", windowId);
    //       }
    //     });
    //   }, 1000)
    //   .catch(e => {
    //     console.log("Biet-O-Matic: getDisableMessage() Cannot add listener for window link: %s", e.message);
    //   });

    return spanPre.outerHTML + link.outerHTML + spanPost.outerHTML;
  }

  /*
   * If the window has autoBid enabled, then update timestamp in sync storage every 60 seconds
   * This will ensure that in case a browser is closed/crashes/has no internet, the bidding can still be performed
   */
  static deadManSwitch() {
    window.setInterval(() => {
      AutoBid.deadManSwitchFunc();
    }, 60_000);
  }

  static deadManSwitchFunc() {
    try {
      let localState = AutoBid.getLocalState();
      if (!localState.simulation && localState.autoBidEnabled) {
        console.debug("Biet-O-Matic: AutoBid.deadManSwitch() called");
        AutoBid.setSyncState(localState.autoBidEnabled).catch((e) => {
          console.warn("Biet-O-Matic: AutoBid.setSyncState() failed: " + e);
        });
      }
      localState = null;
      AutoBid.removeDeadAutoBid().catch((e) => {
        console.warn("Biet-O-Matic: deadManSwitch() removeDeadAutoBid failed: " + e);
      });
    } catch (e) {
      console.warn("Biet-O-Matic: deadManSwitch() internal error: " + e);
    }
  }

  // remove autoBid if the timestamp update was longer than 5 minutes ago
  static async removeDeadAutoBid() {
    let syncState = await AutoBid.getSyncState();
    if (syncState.hasOwnProperty("timestamp") && syncState.timestamp != null) {
      if ((Date.now() - syncState.timestamp) / 1000 > 300) {
        console.debug("Biet-O-Matic: removeDeadAutoBid() Removing dead entry: %s", JSON.stringify(syncState));
        await AutoBid.setSyncState(null);
      } else {
        console.debug(
          "Biet-O-Matic: removeDeadAutoBid() Entry good (%ss old)",
          (Date.now() - syncState.timestamp) / 1000
        );
      }
    }
    syncState = null;
  }

  /*
   * Check if the changeinfo is relevant for this instance
   * Will be called when the storage update event is received
   * - returns true, if the change was by different id
   *   {"SETTINGS":{
   *   "newValue":{"autoBid":{"autoBidEnabled":true,"id":"kfpgnpfmingbecjejgnjekbadpcggeae:138","timestamp":1577979582486}},
   *   "oldValue":{"autoBid":{"autoBidEnabled":true,"id":"kfpgnpfmingbecjejgnjekbadpcggeae:138","timestamp":1577979572481}}}}
   */
  static checkChangeIsRelevant(changeInfo) {
    if (!changeInfo.hasOwnProperty("newValue")) {
      console.log("Biet-O-Matic: checkChangeIsRelevant() newValue missing: %s", JSON.stringify(changeInfo));
      return true;
    }

    function sortObjByKey(value) {
      return typeof value === "object"
        ? Array.isArray(value)
          ? value.map(sortObjByKey)
          : Object.keys(value)
              .sort()
              .reduce((o, key) => {
                const v = value[key];
                o[key] = sortObjByKey(v);
                return o;
              }, {})
        : value;
    }

    const newValue = changeInfo.newValue;
    if (JSON.stringify(sortObjByKey(newValue)) === JSON.stringify(sortObjByKey(AutoBid.cachedChange))) {
      console.debug(
        "Biet-O-Matic: AutoBid.checkChangeIsRelevant: Change is not relevant for this id=%s: cached",
        AutoBid.beWindowId
      );
      return false;
    } else if (
      newValue.length > 0 &&
      AutoBid.hasOwnProperty("beWindowId") &&
      newValue.autoBid.id === AutoBid.beWindowId
    ) {
      console.debug(
        "Biet-O-Matic: AutoBid.checkChangeIsRelevant: Change is not relevant for this id=%s: %s",
        AutoBid.beWindowId,
        JSON.stringify(newValue)
      );
      return false;
    } else {
      console.debug(
        "Biet-O-Matic: AutoBid.checkChangeIsRelevant: Change is relevant for this id=%s: %s",
        AutoBid.beWindowId,
        JSON.stringify(newValue)
      );
      return true;
    }
  }

  // should be called once
  static init() {
    if ($("#inpAutoBid").length === 0)
      console.warn(
        "Biet-O-Matic: AutoBid cannot be initialized: inpAutoBid not found, inpAutoBid=%O",
        $("#inpAutoBid")
      );
    AutoBid.jq = $("#inpAutoBid");
    AutoBid.renderState();
    AutoBid.registerEvents();
    AutoBid.deadManSwitch();
  }
}

// static class vars
AutoBid.beWindowId = null;

class OptionCompactView {
  static getState() {
    const info = { compactViewEnabled: false };
    let result = JSON.parse(window.sessionStorage.getItem("settings"));
    if (result != null) {
      Object.assign(info, result);
    }
    return info;
  }

  static setState(compactViewEnabled) {
    Popup.updateSetting({ compactViewEnabled: compactViewEnabled });
    // local cache which should be used to check the option state
    OptionCompactView.compactViewEnabled = compactViewEnabled;
    OptionCompactView.renderState();
  }

  static toggleState() {
    const state = OptionCompactView.getState();
    OptionCompactView.setState(!state.compactViewEnabled);
  }

  static renderState() {
    const lblCompact = $("#lblCompact");
    const info = OptionCompactView.getState();
    OptionCompactView.jq.prop("checked", info.compactViewEnabled);
    // local cache which should be used to check the option state
    OptionCompactView.compactViewEnabled = info.compactViewEnabled;
    let state = "";
    if (info.compactViewEnabled) {
      state += Popup.getTranslation("generic_active", ".active");
    } else {
      state += Popup.getTranslation("generic_inactive", ".inactive");
    }
    lblCompact.attr("data-i18n-after", state);
  }

  static registerEvents() {
    // window inpCompact checkbox
    OptionCompactView.jq.on("click", (e) => {
      e.stopPropagation();
      OptionCompactView.setState(OptionCompactView.jq.is(":checked"));
      ArticlesTable.setCompact(OptionCompactView.compactViewEnabled);
    });
  }

  // should be called once
  static init() {
    OptionCompactView.jq = $("#inpCompact");
    if (OptionCompactView.jq.length === 0)
      console.warn(
        "Biet-O-Matic: OptionCompactView cannot be initialized: inpCompact not found, inpCompact=%O",
        OptionCompactView.jq
      );
    OptionCompactView.renderState();
    OptionCompactView.registerEvents();
  }
}

/*
 * All functions related to an eBay Article
 * - hold info for DataTable
 * -
 */
class Article {
  constructor(info, tab = null) {
    if (info == null || !info.hasOwnProperty("articleId")) {
      throw new Error("Failed to initialize new Article, articleId missing in info!");
    }
    this.articleId = info.articleId;
    this.articleGroup = null;
    this.articleMaxBid = null;
    this.articleAutoBid = false;
    this.offerTabId = null;
    // normal article, from open tab
    // Note: if the contentScript adds new attributes, they should be added here
    const elements = [
      "articleAuctionState",
      "articleAuctionStateText",
      "articleBidCount",
      "articleBidPrice",
      "articleCurrency",
      "articleBuyPrice",
      "articleDescription",
      "articleEndTime",
      "articleMinimumBid",
      "articlePaymentMethods",
      "articleShippingCost",
      "articleShippingMethods",
      "articleState",
      "articlePlatform",
      "articleImage",
      "articleSeller",
    ];
    elements.forEach((e) => {
      if (info.hasOwnProperty(e)) this[e] = info[e];
    });
    // add open tab info
    if (tab != null) this.tabId = tab.id;
    this.articleDetailsShown = false;
  }

  /*
   * some async initialization steps
   * - get information from storage
   */
  async init() {
    await this.addInfoFromStorage();
    return this;
  }

  /*
   * Convert the short keys to article keys
   * In version 0.2.x the information in the sync storage will be using the long key format
   * e.g. maxBid -> articleMaxBid
   * Note: the info which is sent to contentScript will still use the short format
   */
  static convertKeys(info) {
    let converted = 0;
    if (info.hasOwnProperty("autoBid")) {
      info.articleAutoBid = info.autoBid;
      delete info.autoBid;
      converted++;
    }
    if (info.hasOwnProperty("minBid")) {
      info.articleMinimumBid = info.minBid;
      delete info.minBid;
      converted++;
    }
    if (info.hasOwnProperty("maxBid")) {
      info.articleMaxBid = info.maxBid;
      delete info.maxBid;
      converted++;
    }
    if (info.hasOwnProperty("description")) {
      info.articleDescription = info.description;
      delete info.description;
      converted++;
    }
    if (info.hasOwnProperty("endTime")) {
      info.articleEndTime = info.endTime;
      delete info.endTime;
      converted++;
    }
    if (info.hasOwnProperty("bidPrice")) {
      info.articleBidPrice = info.bidPrice;
      delete info.bidPrice;
      converted++;
    }
    if (info.hasOwnProperty("group")) {
      info.articleGroup = info.group;
      delete info.group;
      converted++;
    }
    // convert maxBid from string to number (not sure why, but it happens).
    if (info.hasOwnProperty("articleMaxBid") && typeof info.articleMaxBid === "string") {
      info.articleMaxBid = Number.parseInt(info.articleMaxBid, 10);
      converted++;
    }
    return converted;
  }

  /*
   * Request item info from specific tab
   */
  static async getInfoFromTab(tab, calledFrom) {
    async function wait(ms) {
      return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
      });
    }
    console.debug("Biet-O-Matic: getInfoFromTab(%d) called from %s", tab.id, calledFrom);
    /*
     * Check if the tab is for an supported eBay article before we attempt to parse info from it
     * e.g. https://www.ebay.de/itm/*
     */
    let regex = /^https:\/\/www.ebay.(de|com)\/itm/i;
    if (!tab.hasOwnProperty("url") || !regex.test(tab.url)) {
      console.log("Biet-O-Matic: getInfoFromTab(%d) Not an ebay item tab, skipping (%s).", tab.id, tab.url);
      return Promise.resolve({});
    }
    console.debug("Biet-O-Matic: Injecting contentScript on tab %d = %s", tab.id, tab.url);
    // inject content script, it will only inject itself if not already loaded
    await browser.tabs.executeScript(tab.id, { file: "/contentScript.bundle.js", runAt: "document_end" }).catch((e) => {
      throw new Error(`getInfoFromTab(${tab.id}) executeScript failed: ${e.message}`);
    });

    let retryCount = 0;
    do {
      try {
        return await browser.tabs.sendMessage(tab.id, { action: "GetArticleInfo" });
      } catch (error) {
        if (retryCount >= 3) {
          // all retries failed
          return Promise.reject(error);
        } else {
          console.debug("Biet-O-Matic: getInfoFromTab(%d) Attempt %d failed: %s", tab.id, retryCount, error.message);
        }
        await wait(1000);
      }
    } while (retryCount++ < 3);
  }

  /*
   * Request item info from specific Ebay Offer tab
   */
  static async getInfoFromOfferTab(tab, calledFrom) {
    console.debug("Biet-O-Matic: getInfoFromOfferTab(%d) called from %s", tab.id, calledFrom);
    /*
     * Check if the tab is for an supported eBay article before we attempt to parse info from it
     * e.g. https://offer.ebay.de/*
     */
    let regex = /^https:\/\/offer.ebay.(de|com)\//i;
    if (!tab.hasOwnProperty("url") || !regex.test(tab.url)) {
      console.log("Biet-O-Matic: getInfoFromOfferTab(%d) Not an ebay offer tab, skipping (%s).", tab.id, tab.url);
      return Promise.resolve({});
    }

    return await browser.tabs.sendMessage(tab.id, { action: "GetOfferTabInfo" });
  }

  /*
   * Selected information which will be transmitted to tabs
   */
  static getInfoForTab(article) {
    if (article == null || typeof article === "undefined") return {};
    return {
      articleId: article.articleId,
      articleDescription: article.articleDescription,
      articleEndTime: article.articleEndTime,
      tabId: article.tabId,
      offerTabId: article.offerTabId,
    };
  }

  // return the stored info for the article or null
  async getInfoFromStorage() {
    let result = await Popup.storage.get(this.articleId);
    if (Object.keys(result).length === 1) {
      return result[this.articleId];
    } else {
      return null;
    }
  }

  // removes all article specific data in storage
  async removeInfoFromStorage() {
    await Popup.storage.remove(this.articleId);
    this.articleGroup = null;
    this.articleMaxBid = null;
    this.articleAutoBid = false;
    console.debug("Biet-O-Matic: removeInfoFromStorage(%s) Browser sync storage cleared", this.articleId);
  }

  // complement with DB info
  async addInfoFromStorage() {
    let result = await Popup.storage.get(this.articleId);
    if (Object.keys(result).length === 1) {
      let storInfo = result[this.articleId];
      let converted = Article.convertKeys(storInfo);
      // add the info to the current article object
      Object.assign(this, storInfo);
      console.debug(
        "Biet-O-Matic: addInfoFromStorage(%s) Found info for Article in storage (converted %d entries): %s",
        this.articleId,
        converted,
        this.toString()
      );
    }
  }

  /*
   * store articleInfo to sync storage
   *   will use values which are provided in the info object to update existing ones
   * - key: articleId
   * - from contentScript: minBid, maxBid, autoBid
   */
  async updateInfoInStorage(info, tabId = null, onlyIfExists = false) {
    let oldStoredInfo = {};
    // get existing article information from storage - it will be merged with the new info
    let result = await Popup.storage.get(this.articleId);
    if (Object.keys(result).length === 1) {
      oldStoredInfo = result[this.articleId];
      // update old keys in storedInfo (e.g. maxBid -> articleMaxBid, description -> articleDescription)
      Article.convertKeys(oldStoredInfo);
    } else {
      // should we only store the info if an storage entry already exists?
      if (onlyIfExists === true) return;
    }
    // store maxBid as number
    if (info != null && info.hasOwnProperty("articleMaxBid")) {
      if (typeof info.articleMaxBid === "string") {
        console.debug(
          "Biet-O-Matic: updateInfoInStorage() Convert articleMaxBid string=%s to float=%s",
          info.articleMaxBid,
          Number.parseFloat(info.articleMaxBid.replace(/,/, "."))
        );
        info.articleMaxBid = Number.parseFloat(info.articleMaxBid.replace(/,/, "."));
      }
    }

    // convert info short keys for storage (e.g. maxBid -> articleMaxBid)
    let newStoredInfo = Object.assign({}, info);
    Article.convertKeys(newStoredInfo);

    // enhance with articleInfo
    Object.assign(newStoredInfo, this);

    Article.removeUnwantedInfo(oldStoredInfo);
    Article.removeUnwantedInfo(newStoredInfo);

    // merge new info into existing settings
    let mergedStoredInfo = Object.assign({}, oldStoredInfo, newStoredInfo);
    let diffText = Article.getDiffMessage(
      Popup.getTranslation("generic_updated", ".Updated"),
      oldStoredInfo,
      newStoredInfo
    );
    //console.log("oldInfo=%O, info=%O, newInfo=%O, merged=%O, diffText=%O", oldStoredInfo, info, newStoredInfo, mergedStoredInfo, diffText);
    if (diffText != null) {
      // store the info back to the storage
      await Popup.storage.set({ [this.articleId]: mergedStoredInfo });
      if (tabId != null) {
        // send update to article tab
        await browser.tabs.sendMessage(tabId, {
          action: "UpdateArticleMaxBid",
          detail: info,
        });
      }
    }
  }

  // remove information from object which should not be stored
  static removeUnwantedInfo(info) {
    delete info.popup;
    delete info.tabId;
    delete info.offerTabId;
    delete info.tabRefreshed;
    delete info.articleDetailsShown;
    delete info.perfInfo;
    delete info.ebayParser;
    delete info.modifiedEndTime;
    delete info.tmpLastLogMessage;
  }

  /*
   * merge updated info and add the change to the article log
   * - group, maxBid and autoBid are only needed for browser sync feature
   */
  updateInfo(info, shouldLogChange = true) {
    const result = {
      modifiedForStorage: 0,
      modified: [],
    };
    let messages = [];
    const checkList = {
      articleDescription: { i18nKey: "generic_description", defaultText: ".Description" },
      articleCurrency: { i18nKey: "generic_currency", defaultText: ".Currency" },
      articleBidPrice: { i18nKey: "generic_price", defaultText: ".Price" },
      articleBidCount: { i18nKey: "popup_numberbids", defaultText: ".Number of Bids" },
      articleBuyPrice: { i18nKey: "popup_buynowprice", defaultText: ".Buy-It-Now Price" },
      articleShippingCost: { i18nKey: "popup_shippingcosts", defaultText: ".Shipping Costs" },
      articleShippingMethods: { i18nKey: "popup_shippingmethods", defaultText: ".Shipping Methods" },
      articlePaymentMethods: { i18nKey: "popup_paymentmethods", defaultText: ".Payment Methods" },
      articleMinimumBid: { i18nKey: "popup_minimumbid", defaultText: ".Minimum Bid" },
      articleEndTime: { i18nKey: "popup_auctionendtime", defaultText: ".Auction End Time" },
      articleAuctionState: { i18nKey: "generic_status", defaultText: ".Status" },
      articleImage: { i18nKey: "generic_picture", defaultText: ".Picture" },
      articleAutoBid: { i18nKey: "generic_articleAutoBid", defaultText: ".Article Auto-Bid" },
      articleMaxBid: { i18nKey: "generic_articleMaxBid", defaultText: ".Article Maximum Bid" },
      articleGroup: { i18nKey: "generic_group", defaultText: ".Article Group" },
    };

    for (const key in checkList) {
      if (info.hasOwnProperty(key) && info[key] !== this[key]) {
        const msg = Popup.getTranslation(checkList[key].i18nKey, checkList[key].defaultText);
        if (key === "articleAuctionState") {
          // only add message if StateText is present, else it (should be) HTML
          if (info.hasOwnProperty("articleAuctionStateText")) {
            messages.push(Article.getDiffMessage(msg, this.articleAuctionStateText, info.articleAuctionStateText));
            this.articleAuctionStateText = info.articleAuctionStateText;
          }
        } else {
          messages.push(Article.getDiffMessage(msg, this[key], info[key]));
        }
        this[key] = info[key];
        result.modifiedForStorage++;
        if (
          key !== "articleMaxBid" &&
          key !== "articleAutoBid" &&
          key !== "articleGroup" &&
          key !== "articleAuctionState"
        )
          result.modified.push(key);
      }
    }

    if (shouldLogChange && result.modifiedForStorage > 0 && messages.length > 0) {
      this.addLog({
        component: Popup.getTranslation("generic_items", ".Items"),
        level: Popup.getTranslation("generic_updated", ".Updated"),
        message: messages.join("; "),
      });
    }
    return result;
  }

  static getDiffMessage(description, oldVal, newVal) {
    try {
      //console.debug("getDiffMessage() description=%s, oldVal = %O (%s), newVal=%O",
      //  description, oldVal, typeof oldVal, newVal);
      let numberOfDifferences = 0;
      if (oldVal != null && typeof oldVal === "object") {
        // Short diff: https://stackoverflow.com/a/37396358
        let diffResult = Object.keys(newVal).reduce((diff, key) => {
          // just check if the keys are different, but do not add to diff output
          if (
            key.match(
              /^(articleAuctionState|articleAuctionStateText|articleBidCount|articleBidPrice|tabRefreshed|articleMinimumBid)$/
            )
          ) {
            if (oldVal[key] !== newVal[key]) numberOfDifferences++;
            return diff;
          }
          if (oldVal[key] === newVal[key]) return diff;
          numberOfDifferences++;
          let text = this.getDiffMessage(key, oldVal[key], newVal[key]);
          return {
            ...diff,
            [key]: text,
          };
        }, {});
        if (Object.keys(diffResult).length > 0) {
          const messages = [];
          Object.keys(diffResult).forEach((key) => {
            messages.push(diffResult[key]);
          });
          return `${description}: ${messages.join("; ")}`;
        } else {
          if (numberOfDifferences > 0) {
            return Popup.getTranslation("popup_changesMisc", ".$1: $2 other changes", [
              description,
              numberOfDifferences.toString(),
            ]);
          } else {
            return null;
          }
        }
      } else {
        if (oldVal == null || typeof oldVal === "undefined" || oldVal === newVal) return `${description}: ${newVal}`;
        else return `${description}: ${oldVal} -> ${newVal}`;
      }
    } catch (e) {
      console.warn(`getDiffMessage(${description}) failed: ${e.message}`);
      return Popup.getTranslation("popup_changesDiffError", ".$1: Cannot determine changes ($2)", [
        description,
        e.message,
      ]);
    }
  }

  /*
   * Refresh article information from manual HTTP request
   * - perform HTTP request to ebay for the article
   * - parse the returned HTML
   */
  async getRefreshedInfo() {
    const response = await fetch(this.getUrl());
    if (!response.ok)
      throw new Error(
        `Failed to fetch information for item ${this.articleId}: HTTP ${response.status} - ${response.statusText}`
      );
    const text = await response.text();
    //console.log("Fetch result: %s", text);
    let ebayParser = new EbayParser(this.getUrl(), text);
    await ebayParser.init();
    const info = ebayParser.parsePage();
    const auctionEndState = EbayParser.getAuctionEndState(info);
    // if we have a defined state for the action, and
    if (this.auctionEndState == null && auctionEndState.id !== EbayParser.auctionEndStates.unknown.id) {
      info.auctionEndState = auctionEndState.id;
      // the auctionEndState is not handled by Article.updateInfo
      this.auctionEndState = auctionEndState.id;
      this.handleAuctionEnded({ auctionEndState: auctionEndState.id }).catch((e) => {
        console.log("Biet-O-Matic: getRefreshedInfo() handleAuctionEnded() failed: " + e);
      });
    }
    ebayParser.cleanup();
    return info;
  }

  // add log message for article
  addLog(messageObject) {
    let message = {};
    message.timestamp = Date.now();
    message.message = JSON.stringify(messageObject);
    message.component = Popup.getTranslation("generic_unknown", ".Unknown");
    message.level = Popup.getTranslation("generic_internalError", ".Internal Error");
    if (messageObject.hasOwnProperty("timestamp")) message.timestamp = messageObject.timestamp;
    if (messageObject.hasOwnProperty("message")) message.message = messageObject.message;
    if (messageObject.hasOwnProperty("component")) message.component = messageObject.component;
    if (messageObject.hasOwnProperty("level")) message.level = messageObject.level;

    // simple duplicate message detection
    if (this.tmpLastLogMessage === message.message) return;

    // get info for article from storage
    let log = this.getLog();
    console.debug("Biet-O-Matic: addLog(%s) info=%s", this.articleId, JSON.stringify(message));
    if (log == null) log = [];
    log.push(message);
    window.localStorage.setItem("log:" + this.articleId, JSON.stringify(log));
    // inform local popup about the change
    const row = Popup.table.getRow("#" + this.articleId);
    if (row != null && row.length === 1) {
      // update child info, but drawing will be separate
      row.child(ArticlesTable.renderArticleLog(this));
      Popup.redrawTableCell(this.articleId, "articleDetailsControl:name");
    }
    // for duplicate message detection
    this.tmpLastLogMessage = message.message;
  }

  // return the log for the article from the storage, or null if none
  getLog() {
    return JSON.parse(window.localStorage.getItem("log:" + this.articleId));
  }

  // remove all log entries for specified article
  removeAllLogs() {
    window.localStorage.removeItem(`log:${this.articleId}`);
    console.debug("Biet-O-Matic: removeAllLogs(%s) Logs removed", this.articleId);
  }

  /*
   * Determines and Returns the id for the Article link:
   * tabId:<id> when Article Tab is open
   * articleId:<id> when Article Tab is not open
   */
  getArticleLinkId() {
    if (this.tabId == null) return "";
    else return "tabid-" + this.tabId;
  }

  // return the link for that article
  getUrl() {
    if (this.hasOwnProperty("articlePlatform"))
      return `https://cgi.${this.articlePlatform}/ws/eBayISAPI.dll?ViewItem&item=${this.articleId}&nordt=true&orig_cvip=true&rt=nc`;
    else return `https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=${this.articleId}&nordt=true&orig_cvip=true&rt=nc`;
  }

  getProfileUrl() {
    if (this.articleSeller == null) return "https://www.${this.articlePlatform}";
    if (this.hasOwnProperty("articlePlatform")) return `https://www.${this.articlePlatform}/usr/${this.articleSeller}`;
    else return `https://www.ebay.de/usr/${this.articleSeller}`;
  }

  // return the offer link for that article
  // https://offer.ebay.de/ws/eBayISAPI.dll?MakeBid&fromPage=2047675&item=124336100157&maxbid=3,00&fb=2&bu=confirm
  getOfferUrl() {
    if (this.hasOwnProperty("articlePlatform"))
      return `https://offer.${this.articlePlatform}/ws/eBayISAPI.dll?MakeBid&fromPage=2047675&item=${this.articleId}&maxbid=${this.articleMaxBid}&fb=2&bu=bid`;
    else
      return `https://offer.ebay.de/ws/eBayISAPI.dll?MakeBid&fromPage=2047675&item=${this.articleId}&maxbid=${this.articleMaxBid}&fb=2&bu=bid`;
  }

  // returns the autoBid state for window, article group and article
  getAutoBidState() {
    let groupName = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
    if (this.hasOwnProperty("articleGroup") && this.articleGroup != null && typeof this.articleGroup !== "undefined")
      groupName = this.articleGroup;
    const info = {
      articleAutoBid: this.articleAutoBid,
      groupName: groupName,
      groupAutoBid: Popup.disableGroups === true ? true : Group.getStateCached(groupName).autoBid,
    };
    // the the window info (autoBidEnabled)
    const windowAutoBidInfo = AutoBid.getLocalState();
    Object.assign(info, windowAutoBidInfo);
    return info;
  }

  /*
   * Determines the Bid Lock state
   * - this is used for articles which end close to each other
   * - it prevents that the second article will be bid for, if the first articles auction state is not yet known
   * - by use of perlenschnur algorithm it is ensured that between two articles are always 10s
   * - but still 2..n auctions could end at the same time
   */
  getBidLockState() {
    if (!this.hasOwnProperty("articleEndTime")) return;
    let groupName = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
    if (this.hasOwnProperty("articleGroup") && this.articleGroup != null && typeof this.articleGroup !== "undefined")
      groupName = this.articleGroup;
    const result = { bidIsLocked: false, message: "" };
    // if bidAll is set, then we dont need to special-handle articles collisions
    if (Group.getStateCached(groupName).bidAll) {
      console.debug("Biet-O-Matic: getBidLockState(%s) Skipping, bidAll is on.", this.articleId);
      result.message = "Group bidAll option is set.";
      return result;
    }
    // get articles which have the same group, autoBid enabled
    let articles = {};
    // build an object with required information
    Popup.table.DataTable.rows().every((index) => {
      let row = Popup.table.DataTable.row(index);
      let article = row.data();
      try {
        // groups have to match
        if (
          !article.hasOwnProperty("articleGroup") ||
          !this.hasOwnProperty("articleGroup") ||
          article.articleGroup !== this.articleGroup
        )
          return;
        // check if that article has autoBidEnabled, if not its not interesting
        if (!article.articleAutoBid) return;
        // ignore sofortkauf items (because they have to be manually purchased)
        if (!article.hasOwnProperty("articleEndTime") || article.articleEndTime == null) return;
        // TODO: ignore item which is overbid
        articles[article.articleId] = { articleEndTime: article.articleEndTime };
        // handover existing auction end states
        if (article.hasOwnProperty("auctionEndState")) {
          articles[article.articleId].auctionEndState = article.auctionEndState;
        }
      } catch (e) {
        console.log("getBidLockState() Internal Error in every: " + e);
      } finally {
        article = null;
        row = null;
      }
    });

    const sorter = function (a, b) {
      // sort by articleId if endTimes are same
      if (a.articleEndTime === b.articleEndTime) {
        return a.articleId - b.articleId;
      }
      return a.articleEndTime > b.articleEndTime ? 1 : -1;
    };

    /*
     * Iterate through keys (articleId's) from the ones ending first to last
     */
    const sortedArticles = Object.keys(articles).sort(sorter);
    //console.log("XXX articles=%O sortedArticles=%O", articles, sortedArticles);
    for (const articleId of sortedArticles) {
      // skip if endTime of that article is not within 10s of this article
      const timeDiff = Math.abs(this.articleEndTime - articles[articleId].articleEndTime);
      if (timeDiff > 10000) continue;
      // if we reach our article, we can abort the loop
      if (this.articleId === articleId) break;
      // if article has an final auctionEndState (!= unknown), then we can continue
      if (
        articles[articleId].hasOwnProperty("auctionEndState") &&
        articles[articleId].auctionEndState !== EbayParser.auctionEndStates.unknown.id
      ) {
        console.debug(
          "Biet-O-Matic: getBidLockState(%s) Article %s has an final auctionEndState: %s",
          this.articleId,
          articleId,
          articles[articleId].auctionEndState
        );
        continue;
      }
      let row = Popup.table.DataTable.row("#" + articleId);
      let article = row.data();
      //console.log("XXX3 article=%s info=%O, row=%O, article=%O", articleId, articles[articleId], row, article);
      if (article == null || typeof article === "unbdefined") {
        console.log("Biet-O-Matic: getBidLockState() Cannot get row for article %s", articleId);
        continue;
      }
      // if the auction price is higher than the maxBid, then we can continue (wont win this auction)
      if (article.articleMaxBid < article.articleBidPrice) {
        console.debug(
          "Biet-O-Matic: getBidLockState(%s) Article %s is going to overbid, it is safe to continue.",
          this.articleId,
          articleId
        );
        // todo user can manually increase the maxBid when the tab is open, then this wouldnt work reliably as
        //   we would not see the maxBid increase here
        continue;
      }

      /*
       * reload article info (will become active later, in one of the next calls)
       * - if the article price went higher than the maxBid, then auction will fail and we do not need to block
       * - if the article now has a final auction state, we do not need to block (handle successful auction too)
       */
      ArticlesTable.refreshArticle(articleId, articles[articleId].articleEndTime, false).catch((e) => {
        console.log("Biet-O-Matic: getBidLockState() refreshArticle %s failed: %s", articleId, e);
      });

      result.bidIsLocked = true;
      result.message = Popup.getTranslation(
        "popup_bidCollision",
        ".Cannot perform bidding, another auction is still running: $1",
        [articleId.toString()]
      );
      console.debug(
        "getBidLockState(%s) Cannot perform bidding, another auction is still running: %s",
        this.articleId,
        articleId
      );
      break;
    }
    articles = null;
    return result;
  }

  // get formatted bid price: EUR 123,12
  getPrettyBidPrice() {
    //console.log("data=%O, type=%O, row=%O", data, type, row);
    let currency;
    if (this.hasOwnProperty("articleCurrency")) {
      currency = this.articleCurrency;
    } else {
      console.log("Biet-O-Matic: Article %s - using default currency EUR", this.articleId);
      currency = "EUR?";
    }
    let price;
    if (this.hasOwnProperty("articleBidPrice")) {
      price = this.articleBidPrice;
    } else if (this.hasOwnProperty("articleBuyPrice")) {
      price = this.articleBuyPrice;
    }
    try {
      return new Intl.NumberFormat(Popup.lang, { style: "currency", currency: currency }).format(price);
    } catch (e) {
      return price;
    }
  }

  // same logic as activateAutoBid from contentScript
  canActivateAutoBid() {
    // console.debug("Biet-O-Matic: activateAutoBid(%s), autoBid=%s, maxBidValue=%s (%s), minBidValue=%s (%s)",
    //   this.articleId, this.articleAutoBid, this.articleMaxBid, typeof this.articleMaxBid,
    //   this.articleMinimumBid, typeof this.articleMinimumBid);
    //let isMaxBidEntered = (Number.isNaN(maxBidValue) === false);
    const isMinBidLargerOrEqualBidPrice = this.articleMinimumBid >= this.articleBidPrice;
    const isMaxBidLargerOrEqualMinBid = this.articleMaxBid >= this.articleMinimumBid;
    const isMaxBidLargerThanBidPrice = this.articleMaxBid > this.articleBidPrice;
    if (isMinBidLargerOrEqualBidPrice) {
      //console.debug("Enable bid button: (isMinBidLargerOrEqualBidPrice(%s) && isMaxBidLargerOrEqualMinBid(%s) = %s",
      //  isMinBidLargerOrEqualBidPrice, isMaxBidLargerOrEqualMinBid, isMinBidLargerOrEqualBidPrice && isMaxBidLargerOrEqualMinBid);
      return isMaxBidLargerOrEqualMinBid;
    } else if (isMaxBidLargerThanBidPrice === true) {
      //console.debug("Enable bid button: isMaxBidLargerThanBidPrice=%s", isMaxBidLargerThanBidPrice);
      return true;
    } else {
      return false;
    }
  }

  /*
   * Adjust article bid times to ensure that minimum 10s are between two biddings
   * - determine all autoBid-enabled articles for same group as this article
   * - sort by articleId and articleEndTime
   * - start from end and build new object with key articleId
   * - store reason why adjusted (collided articles)
   */
  perlenschnur() {
    // if bidAll is set, then we dont need to special handle articles collisions
    if (Group.getStateCached(this.articleGroup).bidAll) {
      return {
        articleEndTime: this.articleEndTime,
        adjustmentReason: null,
      };
    }
    const articles = {};
    // build an object with required information
    Popup.table.DataTable.rows().every((index) => {
      let row = Popup.table.DataTable.row(index);
      let article = row.data();
      try {
        // groups have to match
        if (
          !article.hasOwnProperty("articleGroup") ||
          !this.hasOwnProperty("articleGroup") ||
          article.articleGroup !== this.articleGroup
        )
          return;
        // check if that article has autoBidEnabled, if not its not interesting
        if (!article.articleAutoBid) return;
        // ignore sofortkauf items (because they have to be manually purchased)
        // ignore articles in the past
        if (
          !article.hasOwnProperty("articleEndTime") ||
          article.articleEndTime == null ||
          article.articleEndTime < Date.now()
        )
          return;
        articles[article.articleId] = {
          articleEndTime: article.articleEndTime,
        };
      } catch (e) {
        console.log("perlenschnur() Internal Error in rows.every: " + e);
      } finally {
        article = null;
        row = null;
      }
    });

    const sorter = function (a, b) {
      // sort by articleId if endTimes are same
      if (a.articleEndTime === b.articleEndTime) {
        return a.articleId - b.articleId;
      }
      return a.articleEndTime > b.articleEndTime ? 1 : -1;
    };

    /*
     * Iterate through keys, and adjust to ensure 10 seconds between endTimes
     *
     */
    let previous = null;
    for (let i = Object.keys(articles).length - 1; i >= 0; i--) {
      // sort the array on every iteration, because we modify the articleEndTimes
      const keys = Object.keys(articles).sort(sorter);
      const key = keys[i];
      const minDiffMs = 10000;
      if (previous != null && articles[previous].articleEndTime - articles[key].articleEndTime < minDiffMs) {
        const diff = (articles[key].articleEndTime - (articles[previous].articleEndTime - minDiffMs)) / 1000;
        articles[key].adjustmentReason = Popup.getTranslation(
          "popup_adjustedBidtime",
          ".Bid time was adjusted by $1s, due to collision with item $2",
          [diff.toString(10), previous.toString()]
        );
        // leave 5s buffer
        if (articles[previous].articleEndTime < Date.now() + 5000) {
          console.warn(
            `Biet-O-Matic: Failed to adjust Article ${key} bidding time, would be too close to its end time!`
          );
        } else {
          articles[key].articleEndTime = articles[previous].articleEndTime - minDiffMs;
        }
      }
      previous = key;
    }
    // finally return the interesting result
    return articles[this.articleId];
  }

  // open article in a new tab
  async openTab() {
    console.log("Biet-O-Matic: Article.openTab(%s) Opening Article Tab", this.articleId);
    let tab = await browser.tabs.create({
      url: this.getUrl(),
      active: false,
      openerTabId: Popup.tabId,
    });
    return tab.id;
  }

  // open offer page for article in a new tab
  async openOfferTab() {
    console.log("Biet-O-Matic: Article.openOfferTab(%s) Opening Article Offer Tab", this.articleId);
    let tab = await browser.tabs.create({
      url: this.getOfferUrl(),
      active: false,
      openerTabId: Popup.tabId,
    });
    const timeLeftSeconds = Math.round((this.articleEndTime - Date.now()) / 1000);
    this.addLog({
      component: Popup.getTranslation("cs_bidding", ".Bidding"),
      level: "Info",
      message: Popup.getTranslation(
        "popup_offerTabOpenedForBidding",
        ".Item tab opened for bidding $1 seconds before auction ends (tab $2)",
        [ timeLeftSeconds, tab.id.toString() ]
      ),
    });
    return tab.id;
  }

  // close the article tab, (optionally) except its active
  closeTab(onlyCloseIfNotActive = false) {
    if (this.tabId == null) {
      console.debug("Biet-O-Matic: Article.closeTab() Article %s, Tab=%s: Skip - no tabId", this.articleId, this.tabId);
      return;
    }
    browser.tabs
      .get(this.tabId)
      .then((tab) => {
        if (onlyCloseIfNotActive && tab.active) {
          console.debug(
            "Biet-O-Matic: Article.closeTab() Article %s, Tab=%s: Dont close - its active",
            this.articleId,
            this.tabId
          );
          return;
        }
        browser.tabs
          .remove(this.tabId)
          .then(() => {
            console.debug("Article.closeTab() Article %s, Tab=%s: Closed.", this.articleId, this.tabId);
          })
          .catch((e) => {
            console.log("Biet-O-Matic: Article.closeTab() browser.tabs.remove failed: %s", e.message);
          });
      })
      .catch((e) => {
        console.log("Biet-O-Matic: Article.closeTab() browser.tabs.get failed: %s", e.message);
      });
  }

  // close the article offer tab
  closeOfferTab(onlyCloseIfNotActive = false) {
    if (this.offerTabId == null) {
      console.debug("Biet-O-Matic: Article.closeOfferTab() Article %s: Skip - offerTabId is null", this.articleId);
      return;
    }
    browser.tabs
      .get(this.offerTabId)
      .then((tab) => {
        if (onlyCloseIfNotActive && tab.active) {
          console.debug(
            "Biet-O-Matic: Article.closeOfferTab() Article %s, Tab=%s: Dont close - its active",
            this.articleId,
            this.tabId
          );
          return;
        }
        browser.tabs
          .remove(this.offerTabId)
          .then(() => {
            console.debug("Article.closeOfferTab() Article %s, Tab=%s: Closed.", this.articleId, this.offerTabId);
            this.offerTabId = null;
          })
          .catch((e) => {
            console.log("Biet-O-Matic: Article.closeOfferTab() browser.tabs.remove failed: %s", e.message);
          });
      })
      .catch((e) => {
        console.log("Biet-O-Matic: Article.closeOfferTab() browser.tabs.get failed: %s", e.message);
      });
  }

  /*
   * ArticlesTable received event from Article tab with auction end state
   * - this can be called multiple times, the state change be updated several times (e.g. unknown -> purchased)
   * - add status to article log
   * - close tab if it was opened for bidding
   */
  async handleAuctionEnded(info) {
    try {
      let autoBidDisabled = false;
      if (!info.hasOwnProperty("auctionEndState")) info.auctionEndState = null;
      // 1 == purchased : then disable group autoBid
      if (info.auctionEndState === 1) {
        // disable group autoBid if bidAll is not set
        if (Group.getStateCached(this.articleGroup).bidAll === false) {
          console.debug(
            "Biet-O-matic: handleAuctionEnded(%s) disabling autoBid for group %s; groupAutoBid=%s, info=%s",
            this.articleId,
            this.articleGroup,
            JSON.stringify(Group.getStateCached(this.articleGroup)),
            info.auctionEndState
          );
          await Group.setState(this.articleGroup, false, false);
          autoBidDisabled = true;
        }
      }
      // add the ended state to the article log
      if (autoBidDisabled) {
        this.addLog({
          component: Popup.getTranslation("cs_bidding", ".Bidding"),
          level: "Status",
          message:
            Article.stateToText(info.auctionEndState) +
            " " +
            Popup.getTranslation("popup_autoBidDeactivatedForGroup", ".Auto-Bid for group $1 deactivated.", [ is.articleGroup ]),
        });
      } else {
        this.addLog({
          component: Popup.getTranslation("cs_bidding", ".Bidding"),
          level: "Status",
          message: Article.stateToText(info.auctionEndState),
        });
      }
    } catch (e) {
      console.log(
        "Biet-O-Matic: Article.handleAuctionEnded(%s) failed: %s, info=%s",
        this.articleId,
        e,
        JSON.stringify(info)
      );
    }
  }

  // convert state id to text
  static stateToText(state) {
    if (state === 0) return Popup.getTranslation("cs_biddingFailed", ".Auction failed");
    else if (state === 1)
      return Popup.getTranslation("cs_biddingSuccess", ".Auction was successful. Item has been purchased.");
    else if (state === 2)
      return Popup.getTranslation("cs_biddingOverbid", ".Auction was not successful. You were overbidden.");
    else return Popup.getTranslation("cs_biddingStatusUnknown", ".Final auction state is unknown.");
  }

  toString() {
    let str = "";
    String.prototype.trunc = function (n) {
      return this.substr(0, n - 1) + (this.length > n ? "..." : "");
    };
    for (let p in this) {
      if (this.hasOwnProperty(p)) {
        let v = null;
        if (this[p] != null) v = (this[p] || "").toString().trunc(64);
        str += `${p}=${v} (${typeof this[p]})\n`;
      }
    }
    return str;
  }
}

/*
 * All functions related to the articles Table
 * - create table
 * - listener events
 * - add article
 * - remove article
 */
class ArticlesTable {
  // selector = '#articles'
  constructor(selector) {
    if ($(selector).length === 0)
      throw new Error(`Unable to initialize articles table, selector '${selector}' not found in DOM`);
    if (Popup.disableGroups) {
      $.fn.DataTable.RowGroup.defaults.emptyDataGroup = Popup.getTranslation("generic_items", ".Items");
    } else {
      $.fn.DataTable.RowGroup.defaults.emptyDataGroup = Popup.getTranslation("generic_noGroup", ".Other Items");
    }
    try {
      const state = OptionCompactView.getState();
      ArticlesTable.setCompact(state.compactViewEnabled);
    } catch (e) {
      console.log("Biet-O-Matic: ArticlesTable constructor cannot set compact mode: " + e);
    }
    this.DataTable = ArticlesTable.init(selector);
    this.addSearchFields();
    this.registerEvents();
    this.registerTableEvents();
    this.regularOpenArticlesForBidding().catch((e) => {
      console.error("Biet-O-Matic: openArticleTabsForBidding() internal error: " + e);
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in regularOpenArticlesForBidding(): ${e.message}`
      });
    });
    ArticlesTable.regularRefreshArticleInfo().catch((e) => {
      console.error("Biet-O-Matic: regularRefreshArticleInfo() internal error: " + e);
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in regularRefreshArticleInfo(): ${e.message}`
      });
    });
  }

  // setup articles table
  static init(selector) {
    $.extend($.fn.dataTable.ext.type.order, {
      "natural-asc": function (a, b) {
        try {
          return ArticlesTable.naturalSort(a, b, true);
        } catch (e) {
          console.log("Biet-O-Matic: Natural Sorting (asc) failed: %s", e.message);
          return 0;
        }
      },
      "natural-desc": function (a, b) {
        try {
          return ArticlesTable.naturalSort(a, b, true) * -1;
        } catch (e) {
          console.log("Biet-O-Matic: Natural Sorting (desc) failed: %s", e.message);
          return 0;
        }
      },
    });
    return $(selector).DataTable({
      columns: [
        {
          name: "articleDetailsControl",
          className: "details-control",
          data: "articleDetailsShown",
          width: "10px",
          searchable: false,
          orderable: false,
          render: ArticlesTable.renderArticleDetailsControl,
        },
        {
          name: "articleId",
          data: "articleId",
          width: "100px",
          searchable: true,
          orderable: false,
          render: ArticlesTable.renderArticleId,
        },
        {
          name: "articleDescription",
          data: "articleDescription",
          searchable: true,
          orderable: false,
          render: ArticlesTable.renderArticleDescription,
        },
        {
          name: "articleEndTime",
          data: "articleEndTime",
          searchable: false,
          orderable: true,
          render: ArticlesTable.renderArticleEndTime,
          defaultContent: 7226582400000,
        },
        {
          name: "articleBidPrice",
          data: "articleBidPrice",
          defaultContent: 0,
          searchable: false,
          orderable: false,
          render: ArticlesTable.renderArticleBidPrice,
        },
        {
          name: "articleShippingCost",
          data: "articleShippingCost",
          searchable: false,
          orderable: false,
          defaultContent: "nicht angegeben",
          render: ArticlesTable.renderArticleShippingCost,
        },
        {
          name: "articleAuctionState",
          data: "articleAuctionState",
          searchable: false,
          orderable: false,
          defaultContent: "",
        },
        {
          name: "articleGroup",
          data: "articleGroup",
          width: "80px",
          searchable: !Popup.disableGroups,
          orderable: false,
          defaultContent: $.fn.DataTable.RowGroup.defaults.emptyDataGroup,
          render: ArticlesTable.renderArticleGroup,
          visible: !Popup.disableGroups,
        },
        {
          name: "articleMaxBid",
          data: "articleMaxBid",
          searchable: false,
          orderable: false,
          render: ArticlesTable.renderArticleMaxBid,
          defaultContent: 0,
        },
        {
          name: "articleButtons",
          data: "articleButtons",
          width: "50px",
          defaultContent: "",
          searchable: false,
          orderable: false,
          render: ArticlesTable.renderArticleButtons,
        },
      ],
      columnDefs: [
        { type: "num", targets: [1, 4] },
        { className: "dt-body-center dt-body-nowrap", targets: [0, 1, 7, 9] },
        { width: "100px", targets: [4, 5, 8] },
        { width: "220px", targets: [3] },
        { width: "300px", targets: [2, 6] },
        { type: "natural", targets: [7] },
      ],
      searchDelay: 400,
      rowId: "articleId",
      pageLength: 25,
      responsive: { details: false },
      ordering: true,
      order: [[3, "asc"]],
      orderFixed: {
        pre: [7, "asc"],
      },
      orderMulti: false,
      rowGroup: {
        enable: true,
        className: "row-group",
        dataSrc: "articleGroup",
        emptyDataGroup: $.fn.DataTable.RowGroup.defaults.emptyDataGroup,
        startRender: ArticlesTable.renderGroups,
        endRender: null,
      },
      dom: "<l<t>ip>",
      stateSave: false,
      language: ArticlesTable.getDatatableTranslation(navigator.language.slice(0, 2)),
    });
  }

  // add open article tabs to the table
  async addArticlesFromTabs() {
    // update browserAction Icon for all of this window Ebay Tabs (Chrome does not support windowId param)
    const tabs = await browser.tabs.query({ currentWindow: true }).catch((e) => {
      console.warn("Biet-O-Matic: addArticlesFromTabs() Failed to query open tabs: " + e);
    });

    for (let tab of tabs) {
      // retrieve article info asynchronously
      const myTab = tab;
      Article.getInfoFromTab(myTab, "addArticlesFromTabs")
        .then((articleInfo) => {
          if (typeof articleInfo !== "undefined" && articleInfo.hasOwnProperty("detail")) {
            let article = new Article(articleInfo.detail, myTab);
            article.init().then((article) => {
              if (Popup.disableGroups === false || article.articleGroup == null)
                this.addOrUpdateArticle(article, myTab, false);
            });
          } else {
            console.info(
              "Biet-O-Matic: addArticlesFromTabs() Failed to add articleInfo for tab %d, " +
                "received info missing or incomplete",
              myTab.id
            );
          }
        })
        .catch(function (e) {
          console.info(
            `Biet-O-Matic: addFromTabs() Failed to get ebay item info from Tab ${myTab.id}, URL=${myTab.url}, Error=${e.message}`
          );
          /*
           * The script injection failed, this can have multiple reasons:
           * - the contentScript threw an error because the page is not a article
           * - the contentScript threw an error because the article is a duplicate tab
           * - the browser extension reinitialized / updated and the tab cannot send us messages anymore
           * Therefore we perform a tab reload once, which should recover the latter case
           */
          ArticlesTable.reloadTab(myTab.id)
            .then(() => {
              console.debug("Biet-O-Matic: Tab %d reloaded to attempt repairing contentScript", myTab.id);
            })
            .catch((e) => {
              console.log("Biet-O-Matic: addArticlesFromTabs() reloadTab(%s) failed:%s", myTab.id, e.message);
            });
        });
    }
  }

  // scan ebay offer tabs (to prevent double opening in case overview page refreshed)
  async scanOfferTabs() {
    // update browserAction Icon for all of this window Ebay Tabs (Chrome does not support windowId param)
    const tabs = await browser.tabs.query({ currentWindow: true }).catch((e) => {
      console.warn("Biet-O-Matic: scanOfferTabs() Failed to query open tabs: " + e);
    });

    for (let tab of tabs) {
      // retrieve article info asynchronously
      const myTab = tab;
      Article.getInfoFromOfferTab(myTab, "scanOfferTabs")
        .then((offerInfo) => {
          if (typeof offerInfo !== "undefined" && offerInfo.hasOwnProperty("articleId")) {
            // mark offerTab as open for specific item
            const row = this.getRow("#" + offerInfo.articleId);
            const article = row.data();
            if (typeof article !== "undefined") {
              article.offerTabId = myTab.id;
            }
          }
        })
        .catch(function (e) {
          console.info(
            `Biet-O-Matic: getInfoFromOfferTab() Failed to get Offer Info from Tab ${myTab.id} (${myTab.url}): ${e.message}`
          );
        });
    }
  }

  // add articles which are in storage
  async addArticlesFromStorage() {
    let storedInfo = await Popup.storage.get(null);
    Object.keys(storedInfo).forEach((articleId) => {
      if (!/^[0-9]+$/.test(articleId)) {
        console.debug("Biet-O-Matic: Skipping invalid stored articleId=%s", articleId);
        return;
      }
      let info = storedInfo[articleId];
      info.articleId = articleId;
      //console.debug("Biet-O-Matic: addArticlesFromStorage(%s) info=%s", articleId, JSON.stringify(info));
      // add article if not already in table
      if (this.getRow("#" + articleId).length < 1) {
        let article = new Article(info);
        // add article to table asynchronously to avoid UI blocking
        article
          .init()
          .then((a) => {
            if (Popup.disableGroups === false || article.articleGroup == null) this.addArticle(a);
          })
          .catch((e) => {
            console.log("Biet-O-Matic: addArticlesFromStorage() Failed to init article %s: %s", article.articleId, e);
          });
      }
    });
  }

  /*
   * Add column search fields
   * 1 ArticleId
   * 2 ArticleDescription
   * 7 Group
   */
  addSearchFields() {
    // Setup - add a text input to each footer cell
    const tfoot = $("#articles tfoot");
    const tr = document.createElement("tr");
    $("#articles thead th").each(function () {
      const th = document.createElement("th");
      if (this.cellIndex === 1 || this.cellIndex === 2 || (Popup.disableGroups === false && this.cellIndex === 7)) {
        const title = $(this).text();
        const input = document.createElement("input");
        input.id = "colsearch";
        input.type = "text";
        input.placeholder = `${Popup.getTranslation("generic_search", "dSearch")} ${title}`;
        input.style.textAlign = "center";
        th.appendChild(input);
      }
      tr.appendChild(th);
    });
    tfoot.append(tr);

    // throttle search
    const searchColumn = $.fn.dataTable.util.throttle((colidx, val) => {
      if (val == null || typeof val === "undefined") return;
      let col = this.DataTable.column(colidx);
      col.search(val).draw(false);
    }, 100);

    // Apply the search
    $("#articles tfoot input").on("keyup change", (e) => {
      let column = this.DataTable.column(e.target.parentNode.cellIndex);
      if (typeof column === "undefined" || column.length !== 1) return;
      searchColumn(column.index(), e.target.value);
    });
  }

  // add an article to the table and return null if failed
  addArticle(article) {
    console.debug("Biet-O-Matic addArticle(%s) called. info=%O", article.articleId, article);
    if (article instanceof Article) {
      this.DataTable.row.add(article);
      this.DataTable.draw(false);
    } else {
      console.warn("Biet-O-Matic: Adding article failed; incorrect type: %O", article);
      return null;
    }
  }

  /*
   * update article with fresh information
   * - if row is null, it will be determined by articleId
   * - Note that changes are *not* compared against the storage.
   * - optional parameters: {onlyIfExistsInStorage, updatedFromRemote, informTab}
   */
  updateArticle(
    articleInfo,
    row = null,
    options = {
      informTab: false,
      onlyIfExistsInStorage: false,
      updatedFromRemote: false,
    }
  ) {
    if (articleInfo == null || typeof articleInfo === "undefined") return;
    if (row == null) row = this.getRow("#" + articleInfo.articleId);
    if (row == null || row.length !== 1) return;
    const article = row.data();
    //console.debug("Biet-O-Matic: updateArticle(%s) called. info=%O, options=%O", articleInfo.articleId, articleInfo, options);
    // sanity check if the info + row match
    if (articleInfo.hasOwnProperty("articleId") && article.articleId !== articleInfo.articleId) {
      throw new Error(
        `updateArticle() Article Id from row=${article.articleId} and info=${articleInfo.articleId} do not match!`
      );
    }
    // if updatedFromRemote, then do not log change
    const modifiedInfo = article.updateInfo(articleInfo, !options.updatedFromRemote);
    if (modifiedInfo.modifiedForStorage > 0) {
      Popup.redrawTableRow(article.articleId, false);
      // if the information was submitted from remote instance (detect via storage change),
      // then inform the open tab and do not store again
      if (options.updatedFromRemote) {
        // send update to article tab (update maxBid, autoBid)
        if (article.tabId != null) {
          browser.tabs
            .sendMessage(article.tabId, {
              action: "UpdateArticleMaxBid",
              detail: { articleMaxBid: article.articleMaxBid, articleAutoBid: article.articleAutoBid },
            })
            .catch((e) => {
              console.log(
                "Biet-O-Matic: addOrUpdateArticle() Sending UpdateArticleMaxBid to tab %s failed: %s",
                article.tabId,
                e
              );
            });
        }
      } else {
        article
          .updateInfoInStorage(articleInfo, options.informTab ? article.tabId : null, options.onlyIfExistsInStorage)
          .catch((e) => {
            console.log("Biet-O-Matic: updateArticle(%s) Failed to update storage: %s", article.articleId, e.message);
            Popup.addUserMessage({
              message: Popup.getTranslation("popup_updateStorageFailed", ".Failed to update storage: $1", [e.message]),
              title: Popup.getTranslation("generic_item", ".Item") + " " + article.articleId,
              level: "error",
              duration: 60000,
            });
          });
      }
      modifiedInfo.modified.forEach((key) => {
        this.markCellUpdated(row, key);
      });
    }
    //this.highlightArticleIfExpired(row);
  }

  // Update articleStatus column with given message
  // Note: the info will not be persisted
  updateArticleStatus(articleId, message) {
    const row = this.getRow("#" + articleId);
    if (row == null || row.length !== 1) {
      console.log("updateArticleStatus() Cannot determine row from articleId %s", articleId);
      return;
    }
    row.data().articleAuctionState = message;
    Popup.redrawTableCell(articleId, "articleAuctionState:name");
  }

  /*
   * Updates the maxBid input and autoBid checkbox for a given row, triggered from tab
   * Note: the articleInfo keys are the short keys (maxBid, autoBid) as the info comes from contentScript
   * Also performs row redraw to show the updated data.
   */
  updateRowMaxBid(articleInfo = {}, row = null) {
    if (row == null && articleInfo.hasOwnProperty("articleId")) row = this.getRow("#" + articleInfo.articleId);
    if (row == null || row.length !== 1) return;
    //console.debug('Biet-O-Matic: updateRowMaxBid(%s) info=%s', data.articleId, JSON.stringify(articleInfo));
    const info = {};

    // minBid
    if (articleInfo.hasOwnProperty("articleMinimumBid")) {
      info.articleMinimumBid = articleInfo.articleMinimumBid;
    }
    // maxBid
    if (articleInfo.hasOwnProperty("articleMaxBid")) {
      if (articleInfo.articleMaxBid == null || Number.isNaN(articleInfo.articleMaxBid)) {
        info.articleMaxBid = 0;
      } else {
        info.articleMaxBid = articleInfo.articleMaxBid;
      }
    }
    // autoBid
    if (articleInfo.hasOwnProperty("articleAutoBid")) {
      if (articleInfo.articleAutoBid != null) {
        info.articleAutoBid = articleInfo.articleAutoBid;
      }
    }

    this.updateArticle(info, row);
  }

  /*
    Add or Update Article in Table
    - if articleId not in table, add it
    - if in table, update the entry
    - also check if same tab has been reused
    - if tab is specified:
    - if updatedFromRemote will inform the open tab about the changes and prevent log addition
  */
  addOrUpdateArticle(articleInfo, tab = null, updatedFromRemote = false) {
    if (!articleInfo.hasOwnProperty("articleId")) return;
    let tabId = null;
    if (tab != null) tabId = tab.id;
    let articleId = articleInfo.articleId;
    console.debug(
      "Biet-O-Matic: addOrUpdateArticle(%s) updatedFromRemote=%s tab=%O, info=%O",
      articleId,
      updatedFromRemote,
      tab,
      articleInfo
    );
    // check if tab articleId changed
    const oldArticleId = this.getArticleIdByTabId(tabId);
    if (oldArticleId != null && oldArticleId !== articleInfo.articleId) {
      // remove article from the table, or unset at least the tabId
      this.removeArticleIfBoring(tabId);
    }

    // article already in table?
    const rowByArticleId = this.getRow("#" + articleId);
    // check if article is already open in another tab
    if (tab != null && rowByArticleId.length !== 0 && typeof rowByArticleId !== "undefined") {
      if (rowByArticleId.data().tabId != null && rowByArticleId.data().tabId !== tabId) {
        throw new Error(`Article ${articleId} is already open in another tab (${rowByArticleId.data().tabId})!`);
      } else if (rowByArticleId.data().tabId == null) {
        rowByArticleId.data().tabId = tabId;
        // redraw the row in case no other updates are registered
        Popup.redrawTableRow(articleId, false);
      }
    }
    if (rowByArticleId.length === 0) {
      // article not in table - simply add it
      let article = new Article(articleInfo, tab);
      article.init().then((a) => {
        this.addArticle(a);
      });
    } else {
      // article in table - update it (do not update storage if not already exists)
      //console.log("calling updateArticle for article %s", articleInfo.articleId)
      this.updateArticle(articleInfo, rowByArticleId, {
        informTab: updatedFromRemote,
        updatedFromRemote: updatedFromRemote,
      });
    }
  }

  // add items to BE from ebay watchlist or pasted from clipboard
  async addItems(items = [], addFromWatchlist = false) {
    try {
      let articlePlatform = "ebay.com";
      if (Popup.lang === "de") articlePlatform = "ebay.de";
      // check for user defined platform
      let options = await Popup.storage.getConfig({ ebayPlatform: null });
      if (options.hasOwnProperty("ebayPlatform") && options.ebayPlatform != null && options.ebayPlatform !== "") {
        articlePlatform = options.ebayPlatform;
      }
      if (items.length === 0 && addFromWatchlist) {
        items = await EbayParser.getWatchListItems(articlePlatform);
      }
      let addedCount = 0;
      for (let articleId of items) {
        const article = new Article({ articleId: articleId });
        article.articlePlatform = articlePlatform;
        // check if article is already in table
        const row = this.getRow("#" + articleId);
        if (row != null && row.length === 1) {
          continue;
        }
        // wait for each completion to prevent overloading cpu/network
        const articleInfo = await article.getRefreshedInfo().catch((e) => {
          console.log("Biet-O-Matic: Article %s updateInfo() failed: %s", article.articleId, e);
        });
        if (!Popup.disableGroups && addFromWatchlist) {
          // assign to group
          article.articleGroup = Popup.getTranslation("generic_watchListGroupName", ".Watch List");
        }
        article.updateInfo(articleInfo, false);
        this.addArticle(article);
        article.updateInfoInStorage({}, null, false).catch((e) => {
          console.log("Biet-O-Matic: addItems() failed to store article %s: %s", article.articleId, e);
        });
        addedCount++;
      }
      Popup.addUserMessage({
        message: Popup.getTranslation("popup_addItemsSuccess", ".Added $1 items from the $2.", [
          addedCount.toString(10),
          addFromWatchlist ? Popup.getTranslation("popup_watchlist") : Popup.getTranslation("popup_clipboard"),
        ]),
        level: "success",
        duration: 30_000,
      });
    } catch (e) {
      console.log("Biet-O-Matic: addItems() failed: " + e);
      Popup.addUserMessage({
        message: Popup.getTranslation("popup_addItemsFailed", ".Failed to add items from the $1: $2", [
          addFromWatchlist ? Popup.getTranslation("popup_watchlist") : Popup.getTranslation("popup_clipboard"),
          e.message,
        ]),
        level: "error",
        duration: 60_000,
      });
    }
  }

  /*
   * User initiated cleanup of items
   * - group select (or all groups)
   * - buy-it-now items
   * - expired auctions
   */
  static cleanupItems() {
    try {
      let removedCount = 0;
      let formData = new FormData(document.querySelector("#cleanupForm"));
      let group = formData.get("group");
      let cleanExpired = formData.get("cleanExpired");
      let cleanBuyItNow = formData.get("cleanBuyItNow");
      // iterate through all items
      Popup.table.DataTable.rows().every(function (index) {
        const row = Popup.table.DataTable.row(index);
        const article = row.data();
        let articleGroup = article.articleGroup;
        if (articleGroup == null || typeof articleGroup === "undefined") {
          articleGroup = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
        }
        // buy it now
        if (cleanBuyItNow && (!article.hasOwnProperty("articleEndTime") || article.articleEndTime == null)) {
          if (group === "" || group === articleGroup) {
            Popup.table.removeArticle(row);
            //row.remove().draw(false);
            removedCount++;
          }
        }
        // auction more than a minute in past?
        if (cleanExpired && article.hasOwnProperty("articleEndTime") && article.articleEndTime + 60_000 < Date.now()) {
          if (group === "" || group === articleGroup) {
            Popup.table.removeArticle(row);
            //row.remove().draw(false);
            removedCount++;
          }
        }
      });
      if (removedCount === 0) {
        Popup.addUserMessage({
          message: Popup.getTranslation("popup_cleanupNone", ".No items have been removed."),
          level: "info",
          duration: 10_000,
        });
      } else {
        Popup.addUserMessage({
          message: Popup.getTranslation("popup_cleanupDone", "$1 items have been removed.", [
            removedCount.toString(10),
          ]),
          level: "info",
          duration: 15_000,
        });
      }
    } catch (e) {
      console.log("Biet-O-Matic: cleanupItems() Internal error while cleanup items: ", e);
    }
  }

  /*
   * Remove an closed article from the table if its uninteresting.
   * Will be called if a tab is closed/changed
   * An article is regarded uninteresting if its not persisted to storage
   */
  removeArticleIfBoring(tabId) {
    // find articleId by tabId
    const articleId = this.getArticleIdByTabId(tabId);
    if (articleId == null) return;
    const row = this.DataTable.row("#" + articleId);
    const article = row.data();
    try {
      if (article == null) return;
      article.tabId = null;
      // retrieve article info from storage (maxBid)
      article.getInfoFromStorage().then((storageInfo) => {
        if (storageInfo != null) {
          // redraw, tabId has been updated
          console.debug("Biet-O-Matic: removeArticleIfBoring(tab=%d), keeping article %s.", tabId, articleId);
          Popup.redrawTableRow(articleId, false);
        } else {
          console.debug("Biet-O-Matic: removeArticleIfBoring(tab=%d), removed article %s.", tabId, articleId);
          // remove from table (recheck if the row still exists)
          const rowFresh = this.DataTable.row("#" + articleId);
          rowFresh.remove().draw(false);
        }
      });
    } catch (e) {
      console.log("Biet-O-Matic: removeArticleIfBoring(), Internal Error: " + e);
    }
  }

  /*
   * Render articleId
   * - generate link to existing or new article tab
   * - include article image if present
   */
  static renderArticleId(data, type, row) {
    if (type !== "display") {
      return data;
    }
    try {
      const div = document.createElement("div");
      div.id = data;

      const a = document.createElement("a");
      a.href = row.getUrl();
      a.id = row.getArticleLinkId();
      a.text = data;
      a.target = "_blank";

      if (OptionCompactView.compactViewEnabled) {
        div.appendChild(a);
      } else {
        div.classList.add("polaroid");
        div.style.width = "90px";
        div.style.minHeight = "25px";
        div.style.maxHeight = "90px";

        if (row.hasOwnProperty("articleImage")) {
          let img = document.createElement("img");
          img.src = row.articleImage;
          img.alt = row.articleId;
          img.style.width = "100%";
          img.style.userSelect = "none";
          div.appendChild(img);
        }

        let divContainer = document.createElement("div");
        divContainer.classList.add("container");
        divContainer.appendChild(a);
        div.appendChild(divContainer);
      }
      return div.outerHTML;
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleId(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return data;
    }
  }

  // render article description including seller if available
  // Note: articleSeller was added with 0.5.0 version
  static renderArticleDescription(data, type, row) {
    if (type !== "display") {
      return data;
    }
    try {
      const div = document.createElement("div");
      const divDescr = document.createElement("div");
      divDescr.textContent = data;
      div.appendChild(divDescr);
      if (row.hasOwnProperty("articleSeller")) {
        div.title = Popup.getTranslation("generic_seller", ".Seller") + ": " + row.articleSeller;
      }

      if (OptionCompactView.compactViewEnabled === false) {
        if (row.hasOwnProperty("articleSeller")) {
          // link to author
          let a = document.createElement("a");
          a.href = row.getProfileUrl(row.articleSeller);
          a.text = row.articleSeller;
          a.target = "_blank";
  
          let span2 = document.createElement("span");
          span2.textContent = Popup.getTranslation("generic_seller", ".Seller") + ": ";
  
          div.appendChild(span2);
          div.appendChild(a);
        }
      }
      return div.outerHTML;  
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleDescription(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return data;
    }
  }

  /*
   * datatable: render column articleMaxBid
   * - input:number for maxBid
   * - label for autoBid and in it:
   * - input:checkbox for autoBid
   */
  static renderArticleMaxBid(data, type, row) {
    if (type !== "display" && type !== "filter") {
      return data;
    }
    //console.log("renderArticleMaxBid(%s) data=%O, type=%O, row=%O", row.articleId, data, type, row);
    try {
      if (!row.hasOwnProperty("articleBidPrice") && data == null) {
        return Popup.getTranslation("generic_buyNow", ".Buy It Now");
      }
      let autoBid = false;
      if (row.hasOwnProperty("articleAutoBid")) {
        autoBid = row.articleAutoBid;
      }
      let maxBid = 0;
      if (data != null) {
        maxBid = data;
      }
      const divArticleMaxBid = document.createElement("div");
      const inpMaxBid = document.createElement("input");
      inpMaxBid.id = "inpMaxBid_" + row.articleId;
      inpMaxBid.type = "number";
      inpMaxBid.min = "0";
      inpMaxBid.step = "0.50";
      inpMaxBid.defaultValue = Number.isNaN(maxBid) ? "" : Number.parseFloat(maxBid).toFixed(2);
      inpMaxBid.style.width = "60px";
      const labelAutoBid = document.createElement("label");
      const chkAutoBid = document.createElement("input");
      chkAutoBid.id = "chkAutoBid_" + row.articleId;
      chkAutoBid.classList.add("ui-button");
      chkAutoBid.type = "checkbox";
      chkAutoBid.defaultChecked = autoBid;
      chkAutoBid.style.width = "15px";
      chkAutoBid.style.height = "15px";
      chkAutoBid.style.verticalAlign = "middle";
      labelAutoBid.appendChild(chkAutoBid);
      const spanAutoBid = document.createElement("span");
      if (autoBid) {
        spanAutoBid.textContent = Popup.getTranslation("generic_active");
        chkAutoBid.title = Popup.getTranslation("popup_deactivateArticleAutoBid", ".Deactivates Article Auto-Bid");
      } else {
        spanAutoBid.textContent = Popup.getTranslation("generic_inactive");
        chkAutoBid.title = Popup.getTranslation("popup_activateArticleAutoBid", ".Activates Article Auto-Bid");
      }
      labelAutoBid.appendChild(spanAutoBid);

      // maxBid was entered, check if the autoBid field can be enabled
      if (row.canActivateAutoBid()) {
        chkAutoBid.disabled = false;
      } else {
        labelAutoBid.classList.add("ui-state-disabled");
        chkAutoBid.disabled = true;
      }

      // set tooltip for button to minBidValue
      // if the maxBid is < minimum bidding price or current Price, add highlight color
      if (row.articleEndTime - Date.now() > 0 && chkAutoBid.disabled) {
        inpMaxBid.classList.add("bomHighlightBorder");
        inpMaxBid.title = Popup.getTranslation("popup_enterMinAmount", ".Enter at least $1", [
          row.articleMinimumBid.toString(),
        ]);
      } else {
        inpMaxBid.classList.remove("bomHighlightBorder");
        inpMaxBid.title = Popup.getTranslation("popup_minIncreaseReached", ".Required increase reached");
      }

      // disable maxBid/autoBid if article ended
      if (row.articleEndTime - Date.now() <= 0) {
        //console.debug("Biet-O-Matic: Article %s already ended, disabling inputs", row.articleId);
        labelAutoBid.classList.add("ui-state-disabled");
        inpMaxBid.disabled = true;
        chkAutoBid.disabled = true;
      }

      divArticleMaxBid.appendChild(inpMaxBid);
      divArticleMaxBid.appendChild(labelAutoBid);

      return divArticleMaxBid.outerHTML;
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleMaxBid(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return data;
    }

  }

  /*
   * Render row groups
   */
  static renderGroups(rows, groupName) {
    try {
      const td = document.createElement("td");
      td.colSpan = rows.columns()[0].length;
  
      // left side: icon + group name (number of articles)
      const i = document.createElement("i");
      i.classList.add("fas", "fa-shopping-cart", "fa-fw");
      i.style.fontSize = "1.2em";
      i.style.paddingTop = "0.5em";
      const span = document.createElement("span");
      span.textContent = `${groupName} (${rows.count()})`;
      span.style.fontSize = "1.2em";
      span.style.fontWeight = "normal";
      td.appendChild(i);
      td.appendChild(span);
  
      // right side: input groupBidAll, input groupAutoBid
      const labelGroupAutoBid = document.createElement("label");
      labelGroupAutoBid.id = "lblGroupAutoBid";
      labelGroupAutoBid.htmlFor = "inpGroupAutoBid";
      labelGroupAutoBid.classList.add("ui-button");
      labelGroupAutoBid.title = Popup.getTranslation(
        "generic_group_autoBidHint",
        ".Configures the Auto-Bid mode for the group"
      );
      labelGroupAutoBid.style.float = "right";
      const inputGroupAutoBid = document.createElement("input");
      inputGroupAutoBid.id = "inpGroupAutoBid";
      inputGroupAutoBid.setAttribute("name", groupName);
      inputGroupAutoBid.type = "checkbox";
      inputGroupAutoBid.style.display = "none";
      const spanGroupAutoBid = document.createElement("span");
      spanGroupAutoBid.id = "spanGroupAutoBid";
      spanGroupAutoBid.classList.add("translate");
      spanGroupAutoBid.textContent = Popup.getTranslation("generic_group_autoBid", ".Group Auto-Bid ") + " ";
      // set cached state, to avoid flicker
      if (Group.getStateCached(groupName).autoBid === true) {
        spanGroupAutoBid.classList.add("autoBidEnabled");
        spanGroupAutoBid.setAttribute("data-i18n-after", Popup.getTranslation("generic_active", ".active"));
      } else {
        spanGroupAutoBid.classList.add("autoBidDisabled");
        spanGroupAutoBid.setAttribute("data-i18n-after", Popup.getTranslation("generic_inactive", ".inactive"));
      }
      labelGroupAutoBid.appendChild(inputGroupAutoBid);
      labelGroupAutoBid.appendChild(spanGroupAutoBid);
      if (Popup.disableGroups) {
        labelGroupAutoBid.style.display = "none";
      }
      td.appendChild(labelGroupAutoBid);
  
      const labelGroupBidAll = document.createElement("label");
      labelGroupBidAll.id = "lblGroupBidAll";
      labelGroupBidAll.htmlFor = "inpGroupBidAll";
      labelGroupBidAll.classList.add("ui-button");
      labelGroupBidAll.title = Popup.getTranslation(
        "generic_group_bidAllHint",
        ".Toggles betwen Bid all and Bid one for this group"
      );
      labelGroupBidAll.style.float = "right";
      const inputGroupBidAll = document.createElement("input");
      inputGroupBidAll.id = "inpGroupBidAll";
      inputGroupBidAll.setAttribute("name", groupName);
      inputGroupBidAll.type = "checkbox";
      inputGroupBidAll.style.display = "none";
      const spanGroupBidAll = document.createElement("span");
      spanGroupBidAll.id = "spanGroupBidAll";
      if (Group.getStateCached(groupName).bidAll === true) {
        spanGroupBidAll.textContent = " " + Popup.getTranslation("generic_group_bidAllEnabled", ".Bid everything");
      } else {
        spanGroupBidAll.textContent = " " + Popup.getTranslation("generic_group_bidAllDisabled", ".Bid until you win");
      }
      labelGroupBidAll.appendChild(inputGroupBidAll);
      labelGroupBidAll.appendChild(spanGroupBidAll);
      td.appendChild(labelGroupBidAll);
  
      // renderState will asynchronously add a class toggling enabled/disabled state
      Group.renderAutoBid("inpGroupAutoBid", groupName)
        .catch(e => {
          console.log("Biet-O-Matic: renderGroups() Group.renderAutoBid failed: " + e.message);
        });
      Group.renderBidAll("inpGroupBidAll", groupName)
        .catch(e => {
          console.log("Biet-O-Matic: renderGroups() Group.renderBidAll failed: " + e.message);
        });
      Group.updateDatalist();
      // append data-name to tr
      return $("<tr/>").append(td).attr("data-name", groupName);
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: `Internal Error occured: renderGroups() ${e.message}`,
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderGroups(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return "";
    }
  }

  static renderArticleGroup(data, type, row) {
    if (type !== "display") {
      return data;
    }
    //console.debug("Biet-O-Matic: renderArticleGroup(%s) data=%s, type=%O, row=%O", row.articleId, data, type, row);
    try {
      const div = document.createElement("div");
      const inpGroup = document.createElement("input");
      inpGroup.id = "inpGroup_" + row.articleId;
      inpGroup.type = "text";
      inpGroup.setAttribute("list", "groups");
      inpGroup.setAttribute("maxlength", "32");
      inpGroup.multiple = false;
      inpGroup.style.width = "94%";
      inpGroup.placeholder = Popup.getTranslation("generic_group", ".Group");
      if (data != null && typeof data !== "undefined") {
        inpGroup.defaultValue = data; 
      }
      div.appendChild(inpGroup);
      return div.outerHTML;
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleGroup(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return data;
    }
  }

  static renderArticleLog(article) {
    if (article == null || !article.hasOwnProperty("articleId")) {
      return "";
    }
    try {
      const div = document.createElement("div");
      // <div style="width:320px; height:80px; overflow:auto;">
      div.style.height = "200px";
      div.style.overflow = "auto";
  
      // copy to clipboard button
      const spanCopyToClipboard = document.createElement("span");
      spanCopyToClipboard.id = article.articleId;
      spanCopyToClipboard.classList.add("copy-to-clipboard", "button-zoom", "far", "fa-copy", "fa-2x");
      spanCopyToClipboard.style.opacity = "0.6";
      spanCopyToClipboard.style.margin = "10px";
      spanCopyToClipboard.style.position = "absolute";
      spanCopyToClipboard.style.right = "30px";
      spanCopyToClipboard.title = Popup.getTranslation("popup_copyToClipboard", ".Copies the item log to the clipboard.");
      div.appendChild(spanCopyToClipboard);
  
      const table = document.createElement("table");
      table.style.paddingLeft = "50px";
      table.style.width = "80%";
      // get log entries
      let log = article.getLog();
      if (log == null) return "";
      if (log.length < 5) div.style.height = null;
      // iterate log array in reverse order (newest first)
      log
        .slice()
        .reverse()
        .forEach((e) => {
          const tr = document.createElement("tr");
          tr.style.width = "100%";
          const tdDate = document.createElement("td");
          tdDate.style.width = "150px";
          // first column: date
          if (e.hasOwnProperty("timestamp")) tdDate.textContent = format(e.timestamp, "PPpp", { locale: Popup.locale });
          else tdDate.textContent = "?";
          tr.append(tdDate);
          // second column: component
          const tdComp = document.createElement("td");
          tdComp.style.width = "100px";
          if (e.hasOwnProperty("component")) tdComp.textContent = e.component;
          else tdComp.textContent = "?";
          tr.append(tdComp);
          // third column: level
          let tdLevel = document.createElement("td");
          tdLevel.style.width = "100px";
          if (e.hasOwnProperty("level")) tdLevel.textContent = e.level;
          else tdLevel.textContent = "?";
          tr.append(tdLevel);
          // fourth column: message
          const tdMsg = document.createElement("td");
          if (e.hasOwnProperty("message")) tdMsg.textContent = e.message;
          else tdMsg.textContent = "n/a";
          tr.append(tdMsg);
          table.appendChild(tr);
        });
      div.appendChild(table);
      return div.outerHTML;
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleLog(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return "";
    }
  }

  /*
   * Render Article Bid Price
   * - when articleBidPrice is empty, use articleBuyPrice (Sofortkauf)
   * - include number of bids
   */
  static renderArticleBidPrice(data, type, row) {
    if (type !== "display" && type !== "filter") {
      return data;
    }
    try {
      const span = document.createElement("span");
      span.textContent = row.getPrettyBidPrice();
      if (row.hasOwnProperty("articleBidCount")) {
        span.textContent += "  (" + row.articleBidCount + ")";
      }
      if (row.hasOwnProperty("articlePaymentMethods")) {
        span.title = row.articlePaymentMethods;
      }
      return span.outerHTML;  
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleBidPrice(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return data;
    }
  }

  static renderArticleShippingCost(data, type, row) {
    if (typeof data === 'undefined' || type !== "display" && type !== "filter") {
      return data;
    }
    try {
      const span = document.createElement("span");
      let priceInfo = EbayParser.parsePriceString(data);
      if (priceInfo.price !== null && row.hasOwnProperty("articleCurrency")) {
        try {
          span.textContent = Intl.NumberFormat(Popup.lang, { style: "currency", currency: row.articleCurrency }).format(priceInfo.price);
        } catch (e) {
          span.textContent = data;
        }
      } else {
        span.textContent = data;
      }
      if (!row.hasOwnProperty("articleShippingCost") && row.hasOwnProperty("articleShippingMethods")) {
        span.textContent = row.articleShippingMethods;
      }
      if (row.hasOwnProperty("articleShippingMethods")) {
        span.title = row.articleShippingMethods;
      }
      return span.outerHTML;
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleShippingCost(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return data;
    }
  }

  /*
   * Render Article Buttons:
   * open/close: indicate if the article tab is open/closed
   * delete: remove the article info from storage
   */
  static renderArticleButtons(data, type, row) {
    if (type !== "display" && type !== "filter") {
      return data;
    }
    //console.log("renderArticleButtons(%s) data=%O, type=%O, row=%O", row.articleId, data, type, row);
    try {
      const div = document.createElement("div");
      div.id = "articleButtons";
  
      // tab status
      const spanTabStatus = document.createElement("span");
      spanTabStatus.id = "tabStatus";
      spanTabStatus.classList.add("button-zoom", "far", "fa-lg");
      spanTabStatus.style.opacity = "0.6";
      if (row.tabId == null) {
        spanTabStatus.classList.add("fa-folder");
        spanTabStatus.title = Popup.getTranslation("popup_openArticleInTab", ".Opens this article in a new tab");
      } else {
        spanTabStatus.classList.add("fa-folder-open");
        spanTabStatus.title = Popup.getTranslation("popup_closeArticleTab", ".Closes this articles tab");
      }
  
      // article remove
      const spanArticleRemove = document.createElement("span");
      spanArticleRemove.id = "articleRemove";
      spanArticleRemove.title = Popup.getTranslation(
        "popup_articleRemove",
        ".Removes all Article events and configuration"
      );
      spanArticleRemove.classList.add("button-zoom", "warning-hover", "far", "fa-trash-alt", "fa-lg");
      spanArticleRemove.style.marginLeft = "20px";
      spanArticleRemove.style.opacity = "0.6";
      // if there is currently no data to remove, then disable the button
      if (row.getLog() == null && row.articleMaxBid == null && row.articleGroup == null) {
        spanArticleRemove.classList.remove("button-zoom", "warning-hover");
        spanArticleRemove.style.opacity = "0.05";
      }
      div.appendChild(spanTabStatus);
      div.appendChild(spanArticleRemove);
      return div.outerHTML;
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleButtons(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return data;
    }
  }

  /*
   * Render the article details toggle
   * show '+' if logs are present and currently hidden
   * show '-' if logs are present and currently visible
   * empty if no logs are present
   */
  static renderArticleDetailsControl(data, type, row) {
    if (type !== "display" && type !== "filter") {
      return "";
    }
    try {
      // check if there are logs, then show plus if the log view is closed, else minus
      if (row.getLog() != null) {
        const div = document.createElement("div");
        div.style.textAlign = "center";
        const span = document.createElement("span");
        span.setAttribute("aria-hidden", "true");
        span.style.opacity = "0.6";
        span.classList.add("button-zoom", "fas");
        if (row.articleDetailsShown) {
          span.classList.add("fa-minus");
          span.title = Popup.getTranslation("popup_hide_articleEvents", ".Hide article events");
        } else {
          span.classList.add("fa-plus");
          span.title = Popup.getTranslation("popup_show_articleEvents", ".Show article events");
        }
        div.appendChild(span);
        return div.outerHTML;
      } else {
        return "";
     }
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleDetailsControl(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return "";
    }
  }

  static renderArticleEndTime(data, type, row) {
    if (type !== "display") {
      return data;
    }
    try {
      const span = document.createElement("span");
      span.textContent = Popup.getTranslation("generic_unlimited", ".unlimited");
      if (data != null && typeof data !== "undefined") {
        const timeLeft = formatDistanceToNow(data, { includeSeconds: true, locale: Popup.locale, addSuffix: true });
        const date = format(data, "PPp", { locale: Popup.locale });
        span.textContent = `${date} (${timeLeft})`;
        if (data - Date.now() < 0) {
          // ended
          span.classList.add("auctionEnded");
          span.title = Popup.getTranslation("popup_articleAuctionEnded", ".Article Auction already ended");
        } else if (data - Date.now() < 60_000) {
          // ends within 1 minute
          span.classList.add("auctionEndsVerySoon");
          span.title = Popup.getTranslation(
            "popup_articleAuctionEndsVerySoon",
            ".Article Auction ends in less then a minute."
          );
        } else if (data - Date.now() < 600_000) {
          // ends within 10 minutes
          span.classList.add("auctionEndsSoon");
          span.title = Popup.getTranslation("popup_articleAuctionEndsSoon", ".Article Auction ends soon.");
        }
      }
      return span.outerHTML;
    } catch (e) {
      Popup.addUserMessage({
        level: "error",
        message: Popup.getTranslation("generic_internalError", ".Internal Error") + ` in renderArticleEndTime(): ${e.message}`,
        title: row.hasOwnProperty("articleId") ? Popup.getTranslation("generic_item", ".Item") + " " + row.articleId : undefined,
        duration: 60_000,
      });
      return data;
    }
  }

  /*
   * Remove information for article
   * - log from window.localStorage
   * - settings from browser sync storage
   */
  removeArticle(rowNode) {
    try {
      if (typeof rowNode === "undefined" || rowNode.length !== 1) return;
      const row = this.DataTable.row(rowNode);
      if (typeof row === "undefined" || row.length !== 1) return;
      const article = row.data();
      article.removeAllLogs();
      row.child(false);
      article
        .removeInfoFromStorage()
        .then(function () {
          const rowFresh = Popup.table.DataTable.row(rowNode);
          if (typeof rowFresh === "undefined" || rowFresh.length !== 1) return;
          rowFresh.invalidate("data").draw(false);
        })
        .catch((e) => {
          console.log("Biet-O-Matic: removeArticle(%s) removeInfoFromStorage failed: %s", article.articleId, e);
        });
    } catch (e) {
      console.log("Biet-O-Matic: removeArticle(%s) failed: %s", rowNode, e.message);
    }
  }

  // remove an article from the table
  removeArticleFromTable(articleId) {
    if (articleId == null) return;
    let row = this.DataTable.row("#" + articleId);
    let article = row.data();
    if (typeof row === "undefined" || row.length === 0) return;
    // remove from table
    try {
      // also close eventually open tab
      if (article != null && typeof article !== "undefined" && article.hasOwnProperty("tabId") && article.tabId != null)
        article.closeTab(false);
      row.remove().draw(false);
    } catch (e) {
      console.info("Biet-O-Matic: removeArticleFromTable(%s) failed: %s", e.message);
    } finally {
      article = null;
      row = null;
    }
  }

  /*
   * toggle article tab:
   * - if closed open the article in a new tab, else
   * - close the tab
   */
  toggleArticleTab(rowNode) {
    if (typeof rowNode === "undefined" || rowNode.length !== 1) return;
    const row = this.DataTable.row(rowNode);
    if (typeof row === "undefined" || row.length !== 1) return;
    const article = row.data();
    if (article.tabId == null) {
      console.debug("Biet-O-Matic: toggleArticleTab(%s) Opening", article.articleId);
      article.openTab().then((tabId) => {
        article.tabId = tabId;
        // redraw article row to ensure all icons and links are refreshed
        Popup.redrawTableRow(row.id(), false);
      });
    } else {
      console.debug("Biet-O-Matic: toggleArticleTab(%s) Closing tab %d", article.articleId, article.tabId);
      article.closeTab(false);
      Popup.redrawTableRow(row.id(), false);
      /*browser.tabs.remove(article.tabId)
        .then(() => {
          article.tabId = null;
          // redraw article row to ensure all icons and links are refreshed
          Popup.redrawTableRow(row.id(), false);
        });
      */
    }
  }

  /*
   * Refresh Article information
   * - this should be called only by the Window with Auto-Bid enabled, e.g. every 5 minutes
   * - also called by getBidLockState to update auction state info (useRateLimit=false)
   * - also called when the popup initializes (useRateLimit=false)
   * - when useRateLimit=false, only current items will be refreshed
   */
  static async refreshArticle(articleId, articleEndTime, useRateLimit = true) {
    const timeLeft = Date.now() - articleEndTime;
    if (useRateLimit) {
      /*
       * Ratelimit the article refresh:
       * - > 12hours ago or in the future: 1x every hour
       * - > 2hours ago or in the future: 1x every 5 minutes
       * - ends within 1hour: every 5 minutes
       * - ends within 5 minutes: every minute
       */
      let rateLimitMs = 300_000;
      if (timeLeft > 43_200 * 1_000 || timeLeft < -7_200 * 1_000) {
        // > 12 hours -> refresh every hour
        rateLimitMs = 60 * 60 * 1_000;
      }
      if (Popup.checkRateLimit("refreshArticle", articleId, rateLimitMs)) {
        //console.debug("Biet-O-Matic: refreshArticle(%s) Skip refreshing (ratelimit=%ds)", articleId, rateLimitMs / 1000);
        return;
      }
    } else {
      // refresh only items which end within +/- 5 minutes
      if (timeLeft < -300 * 1000 || timeLeft > 300 * 1000) {
        return;
      }
    }
    const row = Popup.table.DataTable.row("#" + articleId);
    if (typeof row === "undefined" || row.length !== 1) {
      console.log(
        "Biet-O-Matic: refreshArticle() Unable to find row from articleId=%s (%s)",
        articleId,
        typeof articleId
      );
      return;
    }
    const article = row.data();
    console.debug("Biet-O-Matic: refreshArticle(%s) Refreshing", articleId);
    // add class to indicate update to the user
    let cell = Popup.table.DataTable.cell("#" + articleId, "articleDetailsControl:name");
    if (cell.length === 1) {
      cell.node().classList.add("loading-spinner");
    }
    // use await, which will lead to sequential article refresh to prevent overloading the browser / system
    let articleInfo = await article.getRefreshedInfo().catch((e) => {
      console.warn(`Biet-O-Matic: refreshArticle(${article.articleId}) Failed to refresh: ${e}`);
    });
    // apply the update info
    Popup.table.updateArticle(articleInfo, row, { onlyIfExistsInStorage: true });
    if (cell.length === 1) {
      window.setTimeout(
        (cellNode) => {
          cellNode.classList.remove("loading-spinner");
        },
        2000,
        cell.node()
      );
    }
  }

  // switch datatable compact mode
  static setCompact(compact) {
    if (compact) {
      $("#articles").addClass("compact");
    } else {
      $("#articles").removeClass("compact");
    }
    // redraw table if it is initialized
    if ($.fn.dataTable.isDataTable("#articles")) {
      Popup.table.DataTable.rows().invalidate("data").draw(false);
    }
  }

  // translation data for Datatable
  static getDatatableTranslation(language = "de") {
    //"url": "https://cdn.datatables.net/plug-ins/1.10.20/i18n/German.json"
    const languages = {};
    languages.de = {
      sEmptyTable: "Keine Daten in der Tabelle vorhanden",
      sInfo: "_START_ bis _END_ von _TOTAL_ Einträgen",
      sInfoEmpty: "Keine Daten vorhanden",
      sInfoFiltered: "(gefiltert von _MAX_ Einträgen)",
      sInfoPostFix: "",
      sInfoThousands: ".",
      sLengthMenu: "_MENU_ Einträge anzeigen",
      sLoadingRecords: "Wird geladen ..",
      sProcessing: "Bitte warten ..",
      sSearch: "Suchen",
      sZeroRecords: "Keine Einträge vorhanden",
      oPaginate: {
        sFirst: "Erste",
        sPrevious: "Zurück",
        sNext: "Nächste",
        sLast: "Letzte",
      },
      oAria: {
        sSortAscending: ": aktivieren, um Spalte aufsteigend zu sortieren",
        sSortDescending: ": aktivieren, um Spalte absteigend zu sortieren",
      },
      select: {
        rows: {
          _: "%d Zeilen ausgewählt",
          0: "",
          1: "1 Zeile ausgewählt",
        },
      },
      buttons: {
        print: "Drucken",
        colvis: "Spalten",
        copy: "Kopieren",
        copyTitle: "In Zwischenablage kopieren",
        copyKeys:
          "Taste <i>ctrl</i> oder <i>\u2318</i> + <i>C</i> um Tabelle<br>in Zwischenspeicher zu kopieren.<br><br>Um abzubrechen die Nachricht anklicken oder Escape drücken.",
        copySuccess: {
          _: "%d Zeilen kopiert",
          1: "1 Zeile kopiert",
        },
        pageLength: {
          "-1": "Zeige alle Zeilen",
          _: "Zeige %d Zeilen",
        },
        decimal: ",",
      },
    };
    if (languages.hasOwnProperty(language)) return languages[language];
    else return null;
  }

  // mark the specified cell
  markCellUpdated(row, key) {
    const cell = this.DataTable.cell("#" + row.data().articleId, key + ":name");
    if (cell.length === 1) {
      cell.node().classList.add("updated");
    }
  }

  /* reload a tab
   * check if a reload has been recently performed and only reload if > 60 seconds ago
   */
  static async reloadTab(tabId = null) {
    if (tabId == null) return;
    if (Popup.checkRateLimit("reloadTab", tabId, 60 * 1000)) {
      return;
    }
    await browser.tabs.reload(tabId);
    return true;
  }

  // return a DataTable row
  getRow(specifier) {
    return this.DataTable.row(specifier);
  }

  // returns the ArticleId for a given tabId, or null
  getArticleIdByTabId(tabId) {
    // $(`#tabid-${tabId}`);
    let articleId = null;
    this.DataTable.rows()
      .data()
      .each((article, index) => {
        //console.log("getRowIdxByTabId(%d) index=%d, tabid=%d", tabId, index, article.tabId);
        if (article.tabId === tabId) articleId = article.articleId;
      });
    return articleId;
  }

  /*
   * Open Article Tabs for bidding:
   * - abort if autoBid is disabled
   * - for all tabs in the table
   *   - skip if articleEndTime not defined (sofortkauf)
   *   - skip if articleEndTime in in past or in more than 60s + bidTime
   *   - skip if group autoBid is disabled
   *   - if tab is open just reload it
   *   - open tab
   * The function will schedule itself to be executed every 30s
   */
  async regularOpenArticlesForBidding() {
    window.setInterval(() => {
      try {
        this.DataTable.rows().every(ArticlesTable.openArticleForBidding);
      } catch (e) {
        console.warn("Biet-O-Matic: openArticleTabsForBidding() Internal Error: " + e);
      }
    }, 30_000);
  }

  static async openArticleForBidding(index) {
    let row = Popup.table.DataTable.row(index);
    let article = row.data();
    try {
      // redraw certain row elements regularly
      await Popup.redrawTableRow(article.articleId);
      if (!article.hasOwnProperty("articleEndTime")) {
        console.debug("Biet-O-Matic: openArticleTabsForBidding() Skip article %s, no endTime", article.articleId);
        return;
      }
      const timeLeftSeconds = (article.articleEndTime - Date.now()) / 1000;
      // default bid time of 10 seconds before auction ends
      let bidTime = 10;
      let options = await Popup.storage.getConfig({ bidTime: null });
      if (options.hasOwnProperty("bidTime") && options.bidTime != null && Number.isInteger(options.bidTime)) {
        bidTime = options.bidTime;
      }
      // skip if articleEndTime is in the past or the bidding process is not yet due
      if (timeLeftSeconds < 0 || timeLeftSeconds > (60 + bidTime)) {
        //console.debug("Biet-O-Matic: openArticleTabsForBidding() Skip article %s, not ending within 60s: %ss",
        //  article.articleId, timeLeftSeconds);
        return;
      }

      let shouldOpenTab = true;
      const autoBidState = article.getAutoBidState();

      // check Global autoBid state
      if (autoBidState.autoBidEnabled === false) {
        console.debug(
          "Biet-O-Matic: openArticleTabsForBidding() Skip article %s, Global autoBid is disabled",
          article.articleId
        );
        article.addLog({
          component: Popup.getTranslation("cs_bidding", ".Bidding"),
          level: "Info",
          message: Popup.getTranslation("cs_autobidInactiveForWindow", ".Global Auto-Bid is inactive"),
        });
        shouldOpenTab = false;
      }

      // check Group autoBid state
      if (autoBidState.articleAutoBid === false) {
        console.debug(
          "Biet-O-Matic: openArticleTabsForBidding() Skip article %s, Article autoBid is disabled",
          article.articleId
        );
        article.addLog({
          component: Popup.getTranslation("cs_bidding", ".Bidding"),
          level: "Info",
          message: Popup.getTranslation("cs_autobidInactiveForArticle", ".Auto-bid is inactive for this item"),
        });
        shouldOpenTab = false;
      } else if (autoBidState.groupAutoBid === false) {
        console.debug(
          "Biet-O-Matic: openArticleTabsForBidding() Skip article %s, Group '%s' autoBid is disabled",
          article.articleId,
          article.articleGroup
        );
        article.addLog({
          component: Popup.getTranslation("cs_bidding", ".Bidding"),
          level: "Info",
          message: Popup.getTranslation(
            "cs_autobidInactiveForGroup",
            ".Auto-bid is inactive for group $1",
            article.articleGroup
          ),
        });
        shouldOpenTab = false;
      } else if (article.canActivateAutoBid() === false && article.offerTabId == null) {
        console.debug(
          "Biet-O-Matic: openArticleTabsForBidding() Skip article %s, canActivateAutoBid returned false",
          article.articleId
        );
        article.addLog({
          component: Popup.getTranslation("cs_bidding", ".Bidding"),
          level: "Info",
          message: Popup.getTranslation(
            "popup_articlePriceTooLow",
            ".Skip, own offer of $1 $3 is lower than minimum bid of $2 $3.",
            [article.articleMaxBid, article.articleMinimumBid, article.articleCurrency]
          ),
        });
        shouldOpenTab = false;
      } else if (article.offerTabId != null) {
        // check if offer tab is really open
        try {
          let offerTab = await browser.tabs.get(article.offerTabId);
          shouldOpenTab = false;
          console.debug(
            "Biet-O-Matic: openArticleTabsForBidding() Skip article %s, offer tab is already open",
            article.articleId
          );
        } catch {
          // will open tab (shouldOpenTab stays true)
        }
        if (!shouldOpenTab) {
          article.addLog({
            component: Popup.getTranslation("cs_bidding", ".Bidding"),
            level: "Info",
            message: Popup.getTranslation("popup_offerTabIsOpen", ".Offer Tab is open ($1)", [article.offerTabId]),
          });
        }
      }

      // open tab
      if (shouldOpenTab) {
        console.debug("Biet-O-Matic: openArticleTabsForBiddingAsync() Article %s Opening tab now.", article.articleId);
        let tabId = await article.openOfferTab(true).catch((e) => {
          console.warn(
            `Biet-O-Matic: openArticleTabsForBidding() Unable to open tab for article ${article.articleId} for bidding: ${e.message}`
          );
          article.addLog({
            component: Popup.getTranslation("cs_bidding", ".Bidding"),
            level: "Error",
            message: "Opening offer tab now failed.",
          });
        });
        article.offerTabId = tabId;
      }
    } catch (e) {
      console.warn("openArticleForBidding() Internal Error: " + e);
      if (article != null && typeof article !== "undefined") {
        Popup.addUserMessage({
          level: "error",
          message: Popup.getTranslation("popup_failedToOpenArticleForBidding", ".Failed to open bidding tab: $1", [e.message]),
          title: Popup.getTranslation("generic_item", ".Item") + " " + article.articleId
        }); 
        article.addLog({
          component: Popup.getTranslation("cs_bidding", ".Bidding"),
          level: "Error",
          message: `Internal Error opening offer tab: ${e.message}`
        });  
      }
    } finally {
      article = null;
    }
  }

  /*
   * Refresh article information (i.e. price) for closed articles
   */
  static async regularRefreshArticleInfo() {
    window.setInterval(() => {
      // check if the regular refresh has been disabled
      Popup.storage
        .getConfig({ disableArticleRefresh: false })
        .then((globalOptions) => {
          if (globalOptions.disableArticleRefresh) {
            console.log("Biet-O-Matic: Regular item refresh has been deactivated by the user.");
          } else {
            ArticlesTable.refreshArticleInfo();
          }
        })
        .catch((e) => {
          console.warn("Biet-O-Matic: regularRefreshArticleInfo() Internal Error: " + e);
        });
    }, 300_000);
  }

  static refreshArticleInfo(useRateLimit = true) {
    // check if autoBid is enabled
    const localState = AutoBid.getLocalState();
    if (Popup.table == null || !localState.autoBidEnabled) return;
    console.debug("Biet-O-Matic: refreshArticleInfo() will execute now.");
    Popup.table.DataTable.rows().every(async (index) => {
      let row = Popup.table.DataTable.row(index);
      let article = row.data();
      try {
        // skip articles with open tab
        if (article.hasOwnProperty("tabId") && article.tabId != null) {
          return;
        }
        // skip articles older 1 month
        if ((Date.now() - article.articleEndTime) > 2_629_800*1000 ) {
          return;
        } 
        // Note: the refresh function can use a rate limit which depends on the article end time
        await ArticlesTable.refreshArticle(article.articleId, article.articleEndTime, useRateLimit);
      } catch (e) {
        console.log("refreshArticleInfo() Internal Error: " + e);
      } finally {
        article = null;
        row = null;
      }
    });
  }

  /*
   * Events for the Articles Table:
   * - ebayArticleUpdated: from content script with info about article
   * - ebayArticleMaxBidUpdated: from content script to update maxBid info
   * - ebayArticleRefresh: from content script, simple info to refresh the row (update remaining time)
   * - getArticleInfo: return article info from row
   * - ebayArticleSetAuctionEndState: from content script to update the Auction State with given info
   * - ebayArticleGetAdjustedBidTime: returns adjusted bidding time for a given articleId (see below for details)
   * - getAutoBidState: returns the state of window and group autoBid for the given articleId
   * - getBidLockState: returns the state of bid lock
   * - addArticleLog: from content script to store log info for article
   *
   * - browser.tabs.updated: reloaded/new url
   * - browser.tabs.removed: Tab closed
   * - storage changed
   */
  registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request, sender) => {
      //console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
      switch (request.action) {
        case "ebayArticleUpdated":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              console.debug(
                "Biet-O-Matic: Browser Event ebayArticleUpdated received from tab %s, articleId=%s, articleDescription=%s",
                sender.tab.id,
                request.detail.articleId,
                request.detail.articleDescription
              );
              this.updateArticle(request.detail, null);
              return Promise.resolve(true);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.ebayArticleUpdated internal error: %s", e);
            throw new Error(e);
          }
          break;
        case "ebayArticleMaxBidUpdated":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              console.debug(
                "Biet-O-Matic: Browser Event ebayArticleMaxBidUpdate received from tab %s, detail=%s",
                sender.tab.id,
                JSON.stringify(request)
              );
              let articleId;
              if (!request.hasOwnProperty("articleId") || typeof request.articleId === "undefined")
                articleId = this.getArticleIdByTabId(sender.tab.id);
              else articleId = request.articleId;
              const row = this.getRow("#" + articleId);
              if (row != null && row.length === 1) {
                this.updateRowMaxBid(request.detail, row);
                return Promise.resolve(true);
              } else {
                return Promise.resolve(false);
              }
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.ebayArticleMaxBidUpdated internal error: %s", e);
            throw new Error(e);
          }
          break;
        case "ebayArticleRefresh":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              console.debug(
                "Biet-O-Matic: Browser Event ebayArticleRefresh(%s) received from tab %s",
                request.articleId,
                sender.tab.id
              );
              // determine row by articleId
              if (request.hasOwnProperty("articleId")) {
                const row = this.getRow("#" + request.articleId);
                const article = row.data();
                if (typeof article === "undefined") {
                  // Note: this can happen if the contentScript was just inserted and the row has not yet been added
                  console.log(
                    "Biet-O-Matic: Event ebayArticleRefresh(%s) aborted: article not found in table row=%O, article=%O",
                    request.articleId,
                    row,
                    article
                  );
                  return Promise.resolve(false);
                }
                if (article.tabId !== sender.tab.id) {
                  console.log(
                    "Biet-O-Matic: ebayArticleRefresh() Article %s - Found tabId mismatch %s -> %s",
                    request.articleId,
                    article.tabId,
                    sender.tab.id
                  );
                }
                article.tabRefreshed = Date.now();
                Popup.redrawTableCell(request.articleId, "articleEndTime:name");
              }
              return Promise.resolve(true);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.ebayArticleRefresh internal error: %s", e);
            throw new Error(e);
          }
          break;
        case "getArticleInfo":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              console.debug(
                "Biet-O-Matic: Browser Event getArticleInfo(%s) received from tab %s",
                request.articleId,
                sender.tab.id
              );
              if (request.hasOwnProperty("articleId")) {
                // determine row by articleId
                const row = this.getRow("#" + request.articleId);
                const article = row.data();
                return Promise.resolve({
                  data: Article.getInfoForTab(article),
                  tabId: sender.tab.id,
                });
              } else {
                return Promise.reject("ArticleId missing in request data.");
              }
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.getArticleInfo internal error: %s", e);
            throw new Error(e);
          }
          break;
        case "getAutoBidState":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              let articleId;
              if (request.hasOwnProperty("articleId")) articleId = request.articleId;
              else return Promise.reject("getAutoBidState: missing request attribute: articleId");
              console.debug(
                "Biet-O-Matic: Browser Event getAutoBidState received from tab %s, article=%s",
                sender.tab.id,
                articleId
              );
              if (articleId != null) {
                const row = this.getRow("#" + articleId);
                const article = row.data();
                return Promise.resolve(article.getAutoBidState());
              } else {
                return Promise.reject("getAutoBidState: articleId is null!");
              }
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.getAutoBidState internal error: %s", e);
            throw new Error(e);
          }
          break;
        case "getBidLockState":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              let articleId;
              if (request.hasOwnProperty("articleId")) articleId = request.articleId;
              else return Promise.reject("Event.getBidLockState: missing request attribute: articleId");
              console.debug(
                "Biet-O-Matic: Browser Event getBidLockState received from tab %s, article=%s",
                sender.tab.id,
                articleId
              );
              if (articleId != null) {
                const row = this.getRow("#" + articleId);
                const article = row.data();
                return Promise.resolve(article.getBidLockState());
              } else {
                return Promise.reject("getBidLockState: articleId is null!");
              }
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.getBidLockState internal error: %s", e);
            throw new Error(e);
          }
          break;
        case "addArticleLog":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event addArticleLog received from tab %s", sender.tab.id);
              const article = this.getRow("#" + request.articleId).data();
              if (article != null) {
                const timeLeft = article.articleEndTime - Date.now();
                // performance message is received when the article bid has been performed
                if (request.detail.message.level === Popup.getTranslation("generic_performance", ".Performance")) {
                  // only refresh article info manually, if the article tab is not open
                  if (article.tabId == null) {
                    // refresh item info immediately (to show if bid was successful)
                    ArticlesTable.refreshArticle(request.articleId, article.articleEndTime, false).catch((e) => {
                      console.log(
                        "Biet-O-Matic: addArticleLog - async refreshArticle %s failed: %s",
                        request.articleId,
                        e
                      );
                    });
                    // refresh item info again when auction has ended (to show final auction state)
                    // TODO: refresh item as long no final status is determined (2s after auction end might not be sufficient)
                    if (timeLeft > 0) {
                      window.setTimeout(
                        function (article) {
                          ArticlesTable.refreshArticle(article.articleId, article.articleEndTime, false).catch((e) => {
                            console.log(
                              "Biet-O-Matic: addArticleLog - async refreshArticle %s failed: %s",
                              article.articleId,
                              e
                            );
                          });
                          article.closeOfferTab(true);
                        },
                        timeLeft + 2000,
                        article
                      );
                    } else {
                      ArticlesTable.refreshArticle(article.articleId, article.articleEndTime, false).catch((e) => {
                        console.log(
                          "Biet-O-Matic: addArticleLog - async refreshArticle %s failed: %s",
                          request.articleId,
                          e
                        );
                      });
                    }
                  }
                } else {
                  // redraw status (COLUMN 6)
                  this.updateArticleStatus(request.articleId, request.detail.message.message);
                }
                article.addLog(request.detail.message);
              }
              return Promise.resolve(true);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.addArticleLog internal error: %s", e);
            throw new Error(e);
          }
          break;
        case "ebayArticleSetAuctionEndState":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              if (!request.hasOwnProperty("articleId") || request.articleId === "undefined")
                return Promise.reject("ebayArticleSetAuctionEndState: articleId missing");
              const row = this.getRow("#" + request.articleId);
              if (typeof row === "undefined" || row.length !== 1)
                return Promise.reject("ebayArticleSetAuctionEndState: articleId invalid:" + request.articleId);
              const article = row.data();
              console.debug(
                "Biet-O-Matic: Browser Event ebayArticleSetAuctionEndState received: sender=%O, state=%s",
                sender,
                request.detail.auctionEndState
              );
              // return the promise
              return article
                .handleAuctionEnded(request.detail)
                .then(() => {
                  this.updateArticle(request.detail, row);
                  return Promise.resolve(true);
                })
                .catch((e) => {
                  console.log(
                    "Biet-O-Matic: Event ebayArticleSetAuctionEndState failed due to handleAuctionEnded: " + e
                  );
                  return Promise.reject("Popup handleAuctionEnded failed: " + e);
                });
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.ebayArticleSetAuctionEndState failed: " + e);
            throw new Error(e);
          }
          break;
        /*
         * If two article end at the same time (+/- 1 seconds), then one of these should bid earlier to
         * prevent that we purchase both
         */
        case "ebayArticleGetAdjustedBidTime":
          try {
            if (Popup.currentWindowId === sender.tab.windowId) {
              console.debug(
                "Biet-O-Matic: Browser Event ebayArticleGetAdjustedBidTime received: article=%s, sender=%O",
                request.articleId,
                sender
              );
              if (!request.hasOwnProperty("articleId")) {
                return Promise.reject("Missing parameter articleId");
              }
              const row = this.getRow("#" + request.articleId);
              const article = row.data();
              // {articleEndTime: <adjustedTime>, adjustmentReason}
              if (article != null) {
                return Promise.resolve(article.perlenschnur());
              } else {
                return Promise.resolve(null);
              }
            }
          } catch (e) {
            console.log("Biet-O-Matic: Event.ebayArticleGetAdjustedBidTime failed: %s", e);
            throw new Error(e);
          }
          break;
      }
    });

    /*
     * When the overview page gets activated, then refressh the complete table to immediately show changes
     */
    browser.tabs.onActivated.addListener((activeInfo) => {
      if (Popup.currentWindowId === activeInfo.windowId) {
        if (Popup.tabId === activeInfo.tabId) {
          Popup.redrawTable(false);
        }
      }
    });

    /*
     * tab reloaded or URL changed
     * The following cases should be handled:
     * - Same page, but maybe updated info
     * - undo close article tab
     * - An existing tab is used to show a different article
     *   -> get updated info and update table
     * - An existing article tab navigated away from ebay -> remove from table
     * - In last 2 cases, handle same as a closed tab
     */
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tabInfo) => {
      try {
        if (Popup.currentWindowId === tabInfo.windowId) {
          // "https://www.ebay.de/c/18021266829#oid184096781363"
          const ebayRecommendationUrl = /(www\.ebay\.[a-z]{1,3})\/c\/([0-9]+)#oid([0-9]+)/;
          if (
            changeInfo.status === "loading" &&
            tabInfo.hasOwnProperty("url") &&
            ebayRecommendationUrl.test(tabInfo.url)
          ) {
            const matches = tabInfo.url.match(ebayRecommendationUrl);
            const host = matches[1];
            const articleId = matches[3];
            const row = this.getRow("#" + articleId);
            if (typeof row !== "undefined" && row.length === 1) {
              browser.tabs
                .update(tabId, {
                  url: row.data().getUrl(),
                  openerTabId: Popup.tabId,
                })
                .then(() => {
                  console.log(
                    "onUpdatedListener found bad ebay t=%O c=%s, redirecting to %s : %s",
                    tabInfo,
                    JSON.stringify(changeInfo),
                    host,
                    articleId
                  );
                });
            }
          }

          // status == complete, then inject content script, request info and update table
          if (changeInfo.status === "complete") {
            console.debug(
              "Biet-O-Matic: tab(%d).onUpdated listener fired: change=%s, tabInfo=%s",
              tabId,
              JSON.stringify(changeInfo),
              JSON.stringify(tabInfo)
            );
            // update favicon
            const autoBidState = AutoBid.getLocalState();
            Popup.updateFavicon(autoBidState.autoBidEnabled, { id: tabId }, autoBidState.simulation);
            if (tabInfo.hasOwnProperty("url")) {
              Article.getInfoFromTab(tabInfo, "browser.tabs.onUpdated")
                .then((articleInfo) => {
                  if (articleInfo.hasOwnProperty("detail")) {
                    // if same article, then update it, else remove old, add new
                    this.addOrUpdateArticle(articleInfo.detail, tabInfo);
                  } else {
                    // new URL is not for an article (or couldnt be parsed) - remove the old article
                    this.removeArticleIfBoring(tabInfo.id);
                  }
                })
                .catch((e) => {
                  console.warn(`Biet-O-Matic: Failed to get Article Info from Tab ${tabInfo.id}: ${e.message}`);
                });
            } else {
              console.log(
                "Biet-O-Matic: tabs.onUpdated(%d): Tab Info is missing URL - permission issue or not an supported ebay page.",
                tabInfo.id
              );
            }
          }
        }
      } catch (e) {
        console.warn("Biet-O-Matic: tabs.onUpdated() internal error: %s", e.message);
        throw new Error(e.message);
      }
    });

    /*
     * Handle Tab Closed
     * - remove from table if no maxBid defined
     */
    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
      console.debug("Biet-O-Matic: tab(%d).onRemoved listener fired: %s", tabId, JSON.stringify(removeInfo));
      // window closing, no need to update anybody
      if (removeInfo.isWindowClosing === false) {
        this.removeArticleIfBoring(tabId);
      }
    });

    // listen for changes to browser storage area (settings, article info)
    browser.storage.onChanged.addListener((changes, area) => {
      //console.debug("Biet-O-Matic: Event.StorageChanged(%s) changed: %s", area, JSON.stringify(changes));

      // {"SETTINGS":{
      // "newValue":{"autoBid":{"autoBidEnabled":true,"id":"kfpgnpfmingbecjejgnjekbadpcggeae:1166"}},
      // "oldValue":{"autoBid":{"autoBidEnabled":true,"id":"kfpgnpfmingbecjejgnjekbadpcggeae:138"}}}}
      if (changes.hasOwnProperty("SETTINGS")) {
        if (AutoBid.checkChangeIsRelevant(changes.SETTINGS)) {
          console.debug(`Biet-O-Matic: Browser storage.${area} settings changed, refreshing AutoBid.`);
          AutoBid.renderState();
        }
      }
      // {"GROUPS":{
      // "newValue":{"Briefmarken":{"autoBid":true},"Keine Gruppe":{"autoBid":false},"Test":{"autoBid":true},"Tischdecken":{"autoBid":true}},
      // "oldValue":{"Briefmarken":{"autoBid":false},"Keine Gruppe":{"autoBid":false},"Test":{"autoBid":true},"Tischdecken":{"autoBid":true}}}}
      if (changes.hasOwnProperty("GROUPS")) {
        console.info(`Biet-O-Matic: Browser storage.${area} settings changed, refreshing Groups.`);
        Group.updateFromChanges(changes.GROUPS);
      }
      // check if a new article has been added, or has been updated by another instance of BE
      Object.keys(changes).forEach((key) => {
        // {"333462193472":{
        // "oldValue":{"articleAuctionState":"...}}}
        // "newValue":... (not if removed)
        if (/[0-9]+/.test(key)) {
          if (changes[key].hasOwnProperty("newValue")) {
            console.info(`Biet-O-Matic: Browser storage.${area} settings changed for article ${key} -> addOrUpdate article`);
            this.addOrUpdateArticle(changes[key].newValue, null, true);
          } else {
            console.info(`Biet-O-Matic: Browser storage.${area} settings removed for article ${key}. -> remove article`);
            this.removeArticleFromTable(key);
          }
        }
      });

      Popup.storage.updateDomMeter(area)
      .catch((e) => {
        console.log("Biet-O-Matic: storage.onChanged.updateDomMeter() failed: " + e);
      });
    });

    /*
     * Handle paste event on all elements except inputs
     * to allow pasting eBay Item Number(s)
     */
    window.addEventListener("paste", (e) => {
      if (e.target.nodeName === "INPUT") {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      let pastedText = "";
      if (e.clipboardData || e.originalEvent.clipboardData) {
        pastedText = (e.originalEvent || e).clipboardData.getData('text/plain');
      } else if (window.clipboardData) {
        pastedText = window.clipboardData.getData('Text');
      }
      console.debug("Biet-O-Matic: Text pasted: '%s' (Target Element %s)", pastedText, e.target);
      const items = EbayParser.parseItemNumberFromText(pastedText);
      if (!Popup.checkRateLimit("addItems", "clipboard", 5000)) {
        Popup.table
        .addItems(items, false)
        .catch((e) => {
          console.log("Biet-O-Matic: Popup.table.addItems() failed: " + e);
        });
      }
    });

  }

  /*
   * Events for the Articles Table:
   * - click on Article Link (jump to open tab, or open new tab)
   * - input change: change on maxBid,autoBid or group input
   * - table length change
   * - details control click
   * - button click
   */
  registerTableEvents() {
    // if articleId cell is clicked, active the tab of that article
    this.DataTable.on("click", "tbody tr a", (e) => {
      //console.log("tbody tr a clicked: %O", e);
      // first column, jump to open article tab
      if (/^tabid-([0-9]+)$/.test(e.target.id)) {
        e.preventDefault();
        let tabId = e.target.id.match(/^tabid-([0-9]+)$/);
        tabId = Number.parseInt(tabId[1]);
        browser.tabs.update(tabId, { active: true }).catch((e) => {
          console.log("Biet-O-Matic: Articles Table - Cannot activate Article Tab %d: %s", tabId, e.message);
        });
      }
    });

    // if the user selected the group input, then clear the value to show all options
    this.DataTable.on("focusin", "tr input", (e) => {
      if (e.target.id.startsWith("inpGroup_")) {
        $(e.target).val("");
      }
      // remember the focused input
      // if (e.target.id.startsWith("inpMaxBid_")) {
      //   this.lastFocusedInput = e.target.id;
      // }
    });

    // handle redraw: restore focus in last input
    // this.DataTable.on('draw.dt', (e) => {
    //   if (this.hasOwnProperty('lastFocusedInput')) {
    //     Group.waitFor(`#${this.lastFocusedInput}`, 200).then(lastFocusedInput => {
    //       lastFocusedInput.focus();
    //     });
    //   }
    // });

    // group/maxBid/autoBid inputs
    this.DataTable.on("change", "tr input", (e) => {
      //console.debug('Biet-O-Matic: configureUi() INPUT Event this=%O', e);
      // parse articleId from id of both inputs
      const articleId = e.target.id.replace("chkAutoBid_", "").replace("inpMaxBid_", "").replace("inpGroup_", "");

      // determine row by articleId
      let row = this.getRow("#" + articleId);
      if (row == null || row.length !== 1) return;
      let article = row.data();
      try {
        const info = {};
        console.debug("Biet-O-Matic: Input changed event: Article=%s, field=%s", article.articleId, e.target.id);
        if (e.target.id.startsWith("inpMaxBid_")) {
          // maxBid was entered
          // normally with input type=number this should not be necessary - but there was a problem reported...
          info.articleMaxBid = Number.parseFloat(e.target.value.replace(/,/, "."));
          if (Number.isNaN(article.articleMaxBid)) {
            info.articleMaxBid = 0;
          }
          // check if maxBid > buyPrice (sofortkauf), then adjust it to the buyprice - 1 cent
          if (article.hasOwnProperty("articleBuyPrice") && info.articleMaxBid >= article.articleBuyPrice) {
            info.articleMaxBid = Math.round((article.articleBuyPrice - 0.01) * 100) / 100;
          }
        } else if (e.target.id.startsWith("chkAutoBid_")) {
          // autoBid checkbox was clicked
          info.articleAutoBid = e.target.checked;
        } else if (e.target.id.startsWith("inpGroup_")) {
          // group has been updated
          if (e.target.value === "" || e.target.value === $.fn.DataTable.RowGroup.defaults.emptyDataGroup)
            info.articleGroup = undefined;
          else info.articleGroup = e.target.value;
        }
        this.updateArticle(info, row, { informTab: true });
      } catch (err) {
        console.log("DataTable Event tr input Internal Error: " + err);
      } finally {
        article = null;
        row = null;
      }
    });

    // datatable length change
    this.DataTable.on("length.dt", function (e, settings, len) {
      Popup.updateSetting({ articlesTableLength: len });
    });

    // articleButtons: activate tab, remove article
    this.DataTable.on("click", "#articleButtons", (e) => {
      e.preventDefault();
      let tr = $(e.target).closest("tr");
      if (e.target.id === "tabStatus") {
        this.toggleArticleTab(tr);
      } else if (e.target.id === "articleRemove") {
        this.removeArticle(tr);
      }
    });

    // Add event listener for opening and closing details
    this.DataTable.on("click", "td.details-control", (e) => {
      e.preventDefault();
      let tr = $(e.target).closest("tr");
      if (e.target.nodeName === "SPAN") {
        let span = e.target;
        const row = this.getRow(tr);
        if (row.child.isShown()) {
          // This row is already open - close it
          span.classList.remove("fa-minus");
          span.classList.add("fa-plus");
          span.title = Popup.getTranslation("popup_show_articleEvents", ".Show article events");
          // hide and remove data (save memory)
          row.child(false);
          row.data().articleDetailsShown = false;
        } else {
          // Open this row
          span.classList.remove("fa-plus");
          span.classList.add("fa-minus");
          span.title = Popup.getTranslation("popup_hide_articleEvents", ".Hide article events");
          row.child(ArticlesTable.renderArticleLog(row.data())).show();
          row.data().articleDetailsShown = true;
        }
      }
    });

    // articleButtons: activate tab, remove article
    this.DataTable.on("click", "span.copy-to-clipboard", (e) => {
      e.preventDefault();
      const row = Popup.table.getRow("#" + e.target.id);
      if (row == null || row.length !== 1) {
        return;
      }
      const article = row.data();
      if (typeof article === "undefined") {
        return;
      }
      const log = article.getLog();
      const logLinesArray = [];
      if (log == null) {
        return;
      }
      // {timestamp: 1609232122278, message: "Item Maximum Bid: 1.99", component: "Items", level: "Updated"}
      log
        .slice()
        .forEach((e) => {
          const timestamp = format(e.timestamp, "Ppp", { locale: Popup.locale });
          logLinesArray.push(`${timestamp}\t${e.component}\t${e.level}\t${e.message}`);
        });
      navigator.clipboard.writeText(logLinesArray.join("\n")).then(() => {
        console.debug("Biet-O-Matic: successfully copied log to clipboard");
      }, (e) => {
        console.log("Biet-O-Matic: Failed to copy log to clipboard: " + e);
      });
    });

    /*
     * Toggle Group autobid
     * e.currenTarget is the row, e.target can be span, label, i
     */
    this.DataTable.on("click", "tr.row-group", (e) => {
      e.preventDefault();
      if ("name" in e.currentTarget.dataset) {
        const name = e.currentTarget.dataset.name;
        if (e.target.id.includes("GroupAutoBid")) {
          Group.toggleAutoBid(name)
            .then(Group.renderAutoBid("inpGroupAutoBid", name))
            .catch((e) => {
              console.log("Biet-O-Matic: Failed to toggle group '%s' autoBid state: %s", name, e.message);
            });
        }
        if (e.target.id.includes("GroupBidAll")) {
          Group.toggleBidAll(name)
            .then(Group.renderBidAll("inpGroupBidAll", name))
            .catch((e) => {
              console.log("Biet-O-Matic: Failed to toggle group '%s' bidAll state: %s", name, e.message);
            });
        }
      }
    });
  }

  //region Custom sorter for DataTable
  /*
   * Natural Sort algorithm for Javascript - Version 0.7 - Released under MIT license
   * Author: Jim Palmer (based on chunking idea from Dave Koelle)
   * Contributors: Mike Grier (mgrier.com), Clint Priest, Kyle Adams, guillermo
   * See: http://js-naturalsort.googlecode.com/svn/trunk/naturalSort.js
   */
  static naturalSort(a, b, sortEmptyGroupLast = false) {
    const re = /(^-?[0-9]+(\.?[0-9]*)[df]?e?[0-9]?%?$|^0x[0-9a-f]+$|[0-9]+)/gi;
    const sre = /(^[ ]*|[ ]*$)/g;
    const dre = /(^([\w ]+,?[\w ]+)?[\w ]+,?[\w ]+\d+:\d+(:\d+)?[\w ]?|^\d{1,4}[\/\-]\d{1,4}[\/\-]\d{1,4}|^\w+, \w+ \d+, \d{4})/;
    const hre = /^0x[0-9a-f]+$/i;
    const ore = /^0/;

    // empty group (Keine Gruppe) should be sorted first
    if (sortEmptyGroupLast && a === $.fn.DataTable.RowGroup.defaults.emptyDataGroup && a === b) return 0;
    else if (sortEmptyGroupLast && a === $.fn.DataTable.RowGroup.defaults.emptyDataGroup) return -1;
    else if (sortEmptyGroupLast && b === $.fn.DataTable.RowGroup.defaults.emptyDataGroup) return 1;

    // convert all to strings and trim()
    const x = a.toString().replace(sre, "") || "";
    const y = b.toString().replace(sre, "") || "";

    // chunk/tokenize
    const xN = x.replace(re, "\0$1\0").replace(/\0$/, "").replace(/^\0/, "").split("\0");
    const yN = y.replace(re, "\0$1\0").replace(/\0$/, "").replace(/^\0/, "").split("\0");
    // numeric, hex or date detection
    const xD = Number.parseInt(x.match(hre), 10) || (xN.length !== 1 && x.match(dre) && Date.parse(x));
    const yD = Number.parseInt(y.match(hre), 10) || (xD && y.match(dre) && Date.parse(y)) || null;

    // first try and sort Hex codes or Dates
    if (yD) {
      if (xD < yD) return -1;
      else if (xD > yD) return 1;
      else return 0;
    }

    // natural sorting through split numeric strings and default strings
    for (let cLoc = 0, numS = Math.max(xN.length, yN.length); cLoc < numS; cLoc++) {
      // find floats not starting with '0', string or 0 if not defined (Clint Priest)
      let oFxNcL = (!(xN[cLoc] || "").match(ore) && Number.parseFloat(xN[cLoc])) || xN[cLoc] || 0;
      let oFyNcL = (!(yN[cLoc] || "").match(ore) && Number.parseFloat(yN[cLoc])) || yN[cLoc] || 0;
      // handle numeric vs string comparison - number < string - (Kyle Adams)
      if (isNaN(oFxNcL) !== isNaN(oFyNcL)) {
        return isNaN(oFxNcL) ? 1 : -1;
      }
      // rely on string comparison if different types - i.e. '02' < 2 != '02' < '2'
      else if (typeof oFxNcL !== typeof oFyNcL) {
        oFxNcL += "";
        oFyNcL += "";
      }
      if (oFxNcL < oFyNcL) return -1;
      else if (oFxNcL > oFyNcL) return 1;
    }
    return 0;
  }

  //endregion
} // end of ArticlesTable class

class Popup {
  constructor(version = "v0.0.0") {
    // BOM-BE version
    $("#bomVersion").text("Biet-O-Matic BE " + version);
    this.whoIAm = null;
  }

  /*
   * Check Storage permission granted and update the HTML with relevant internal information
   */
  static checkBrowserStorage() {
    // get total elements
    Popup.storage.get("").catch((e) => {
      Popup.addUserMessage({
        message: Popup.getTranslation("popup_storageReadFailed", ".Failed to read from $1 area: $1", [
          Popup.storage.storageArea,
          e.message,
        ]),
        duration: 15_000,
      });
    });

    // create meter widgets in popup page
    Popup.storage.updateDomMeters()
      .catch((e) => {
        console.warn("Biet-O-Matic: checkBrowserStorage() failed: " + e);
      });
  }

  /*
   * detectWhoAmI
   */
  static async detectWhoIAm() {
    let whoIAm = {};
    // first determine simply which window currently running on
    whoIAm.currentWindow = await browser.windows.getCurrent({ populate: false });
    console.debug("Biet-O-Matic: detectWhoIAm(): window=%d", whoIAm.currentWindow.id);
    return whoIAm;
  }

  static async getOwnTabId() {
    let tab = await browser.tabs.getCurrent();
    if (typeof tab === "undefined") return null;
    else return tab.id;
  }

  async init() {
    this.whoIAm = await Popup.detectWhoIAm();
    Popup.currentWindowId = this.whoIAm.currentWindow.id;
    Popup.tabId = await Popup.getOwnTabId();

    Popup.disableGroups = false;
    // read options from sync storage (irrespective of user storage selection)
    const options = await browser.storage.sync.get({ disableGroups: null, enableLocalMode: null });
    if (options.hasOwnProperty("disableGroups") && options.disableGroups != null && options.disableGroups !== "") {
      console.log("Biet-O-Matic: Popup.init() - User disabled groups.");
      Popup.disableGroups = options.disableGroups;
    }
    Popup.enableLocalMode = false;
    if (
      options.hasOwnProperty("enableLocalMode") &&
      options.enableLocalMode != null &&
      options.enableLocalMode !== ""
    ) {
      console.log("Biet-O-Matic: Popup.init() - User enabled local storage mode.");
      Popup.enableLocalMode = options.enableLocalMode;
    }

    Popup.storage = new BomStorage(Popup.enableLocalMode);

    Popup.cachedGroups = await Group.getAll();
    Popup.lang = navigator.languages ? navigator.languages[0] : navigator.language;
    // just store the first part (en-US -> en)
    Popup.lang = Popup.lang.slice(0, 2);
    // locale for date.fns
    Popup.locale = enUS
    if (Popup.lang === "de") Popup.locale = de;

    this.registerEvents();

    // initialize notification library early
    try {
      toastr.options = {
        "preventDuplicates": true,
        "closeButton": true,
        "extendedTimeOut": "2000",
        "timeOut": "60000",
        "showMethod": "slideDown",
        "progressBar": "true",
        "positionClass": "toast-top-right",
        "typeBasedOverrides": {
          "info": {
            "timeout": "30000"
          },
          "error": {
            "timeout": "120000"
          }
        }
      }
    } catch (e) {
      console.error(`Bid-O-Matic: Popup.init() failed to init notification support: ${e.message}`);
    }

    await Group.removeAllUnused().catch((e) => {
      console.log("Biet-O-Matic: Group.removeAllUnused() failed: %s", e.message);
    });

    Popup.table = new ArticlesTable("#articles");

    Popup.cleanupDialog = $("#dialog-form").dialog({
      autoOpen: false,
      height: "auto",
      width: 400,
      resizable: false,
      modal: true,
      buttons: [
        {
          text: Popup.getTranslation("popup_cleanup", ".Cleanup"),
          click: function () {
            ArticlesTable.cleanupItems();
            $(this).dialog("close");
          },
        },
      ],
      close: function () {
        Popup.cleanupDialog.find("form")[0].reset();
      },
    });

    Popup.importDialog = $("#dialog-form2").dialog({
      autoOpen: false,
      height: "auto",
      width: 400,
      resizable: false,
      modal: true,
      buttons: [
        {
          id: "importConfirmButton",
          disabled: true,
          text: Popup.getTranslation("popup_import", ".Import"),
          click: function () {
            Popup.importData(Popup.importFileData);
            Popup.importFileData = null;
            $("#importConfirmButton").button("disable");
            $(this).dialog("close");
          },
        },
      ],
      close: function () {
        Popup.importDialog.find("form")[0].reset();
        Popup.importFileData = null;
        $("#importConfirmButton").button("disable");
      },
    });
    Popup.importFile = Popup.importDialog.find("#inputFile").on("change", Popup.importDialogFileSelected);

    /*
     * restore settings from session storage (autoBidEnabled, bidAllEnabled, compactView)
     * Note: requires table to be initialized already
     */
    this.restoreSettings();

    await Popup.table.addArticlesFromStorage();
    await Popup.table.addArticlesFromTabs();
    await Popup.table.scanOfferTabs();
    Popup.checkBrowserStorage();
    // immediately perform closed item refresh on init
    ArticlesTable.refreshArticleInfo(false);
    await Popup.regularCheckEbayTime().catch((e) => {
      console.log("Biet-O-Matic: regularCheckEbayTime() failed: " + e);
    });
  }

  /*
   * Regular check of computer time
   * - will display a notification if the time difference is > 1s
   */
  static async regularCheckEbayTime() {
    try {
      // check if the regular refresh has been disabled
      const globalOptions = await Popup.storage.getConfig({ disableClockCheck: false });
      if (globalOptions.disableClockCheck) {
        console.log("Biet-O-Matic: Regular clock check has been deactivated by user.");
        return;
      }
      // Note: getEbayTimeDifference has a precision of 1s or more
      const diff = await EbayParser.getEbayTimeDifference();
      if (diff < -1000 || diff > 5000) {
        Popup.addUserMessage({
          message: Popup.getTranslation(
            "popup_timeDiff1",
            ".The time difference of your computer vs. the eBay time is too large: $1s",
            [(diff / 1000).toFixed(2)]
          ),
          level: "warning",
          duration: 60_000,
        });
      }
    } catch (e) {
      console.warn("Biet-O-Matic: regularCheckEbayTime() Internal Error: " + e);
    } finally {
      // reexecute this function at random (180..600s) interval
      window.setTimeout(function () {
        Popup.regularCheckEbayTime();
      }, Math.trunc(Math.random() * (600 - 180 + 1) + 180) * 1000);
    }
  }

  /*
   * Adds a message to be displayed to the user
   * info.message = i18n translated message
   * info.level = success|info|warn|error (default: info)
   * info.duration = optional display duration (default: unlimited)
   * info.cleanAll = optionally clean all old messages
   */
  static addUserMessage(info) {
    if (info.cleanAll) {
      toastr.clear();
    }
    if (info.hasOwnProperty("message")) {
      const title = info.hasOwnProperty("title") && info.title !== "undefined" ? info.title : null;
      if (info.hasOwnProperty("level") && info.level === "success") {
        toastr.success(info.message, title);
      } else if (info.hasOwnProperty("level") && info.level === "warning") {
        toastr.warning(info.message, title);
      } else if (info.hasOwnProperty("level") && info.level === "error") {
        toastr.error(info.message, title);
      }  else {
        toastr.info(info.message, title);
      }
    }
  }

  /*
   * register events:
   * - pingPopup: from background script to identify popup tabs (required without tabs permission)
   * - browserAction clicked
   * - inputAutoBid clicked
   */
  registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request, sender) => {
      //console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
      switch (request.action) {
        case "pingPopup":
          console.debug("Biet-O-Matic: Browser Event pingPopup received from %O", sender);
          return Promise.resolve("pong");
      }
    });

    // toggle autoBid for window when button in browser menu clicked
    // the other button handler is setup below
    browser.browserAction.onClicked.addListener((tab, clickData) => {
      if (Popup.currentWindowId === tab.windowId) {
        console.debug("Biet-O-Matic: browserAction.onClicked listener fired: tab=%O, clickData=%O", tab, clickData);
        // only toggle favicon for ebay tabs
        if (tab.url.startsWith(browser.runtime.getURL("")) || tab.url.match(/^https?:\/\/.*\.ebay\.(de|com)\/itm/i)) {
          let simulate = false;
          if (
            typeof clickData !== "undefined" &&
            clickData.hasOwnProperty("modifiers") &&
            clickData.modifiers.length === 1
          ) {
            if (clickData.modifiers[0] === "Shift") simulate = true;
          }
          AutoBid.toggleState(simulate).catch((e) => {
            console.log("Biet-O-Matic: Browser Action clicked, AutoBid.toggleState failed: " + e);
          });
        }
      }
    });

    $("#inpAddWatchItems").on("click", function () {
      $(this).parent().addClass("ui-state-disabled");
      Popup.table
        .addItems([], true)
        .then(function () {
          window.setTimeout(function () {
            $("#inpAddWatchItems").parent().removeClass("ui-state-disabled");
          }, 10_000);
        })
        .catch((e) => {
          console.log("Biet-O-Matic: Popup.table.addItems() failed: " + e);
        });
    });

    $("#butConfig").on("click", function () {
      browser.runtime.openOptionsPage().catch((e) => {
        console.log("Biet-O-Matic: Opening options page failed; ", e.message);
      });
    });
    $("#butCleanupItems").on("click", function () {
      Popup.cleanupDialog.dialog("open");
    });
    $("#butSaveItems").on("click", function () {
      Popup.storage
        .export()
        .then(() => {
          console.log("Biet-O-Matic: Export complete.");
        })
        .catch((e) => {
          console.log("Biet-O-Matic: Export failed: " + e.message);
        });
    });
    $("#butLoadItems").on("click", function () {
      Popup.importDialog.dialog("open");
    });
  }

  /* If file has been selected in importDialog
   * try to load it, validate and then unlock the import button
   */
  static importDialogFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      // validate the content
      try {
        const contents = e.target.result;
        const json = JSON.parse(contents);
        const count = Object.keys(json).length;
        // at least one element and GROUPS key exists
        if (count > 0 && "GROUPS" in json) {
          // unlock the import button
          $("#importConfirmButton").button("enable");
          // store json object for later access
          Popup.importFileData = json;
        }
      } catch (e) {
        console.log("Biet-O-Matic: Import failed: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  /*
   * User initiated import of data
   */
  static importData(data) {
    try {
      const formData = new FormData(document.querySelector("#importForm"));
      const enableClean = formData.get("clean");
      const enableRestoreConfig = formData.get("restoreConfig");

      // optionally clean selected storage area before importing
      if (enableClean) {
        Popup.storage.clear();
      }

      // import the data (must be validated externally)
      Popup.storage.set(data);

      // optionally restore current config after restore
      if (enableRestoreConfig) {
        console.log("XXX todo restore config");
      }

      Popup.addUserMessage({
        message: Popup.getTranslation("popup_importDone", ".Import of $1 items has been completed.", [
          Object.keys(data).length,
        ]),
        level: "success",
        duration: 30000,
      });
    } catch (e) {
      Popup.addUserMessage({
        message: Popup.getTranslation("popup_importFailed", ".Import failed: $1", [e.message]),
        level: "error",
        duration: 30000,
      });
      console.log("Biet-O-Matic: cleanupItems() Internal error while data import: ", e.message);
    }
  }

  /*
   * Restore settings from window session storage
   * - autoBid settings
   * - dataTable length (pagination)
   */
  restoreSettings() {
    AutoBid.init();
    OptionCompactView.init();

    let result = JSON.parse(window.sessionStorage.getItem("settings"));
    if (result != null) {
      console.debug(
        "Biet-O-Matic: restoreSettings() updating from session storage: settings=%s",
        JSON.stringify(result)
      );
      // pagination setting for articlesTable
      if (result.hasOwnProperty("articlesTableLength") && Popup.table != null) {
        Popup.table.DataTable.page.len(result.articlesTableLength).draw(false);
      }
    }
  }

  /*
   * update setting in window session storage:
   * autoBidEnabled - Automatic Bidding enabled
   * simulation     - Perfom simulated bidding (do all steps, except confirm the bid)
   */
  static updateSetting(info) {
    console.debug("Biet-O-Matic: Popup.updateSetting() info=%s", JSON.stringify(info));
    let result = JSON.parse(window.sessionStorage.getItem("settings"));
    if (result == null) result = {};
    // remove deprecated settings
    if (result.hasOwnProperty("simulate")) delete result.simulate;
    Object.assign(result, info);
    // assign cached id, will be used on browser restart to check if the info in sync area belongs to this "session"
    result.id = AutoBid.beWindowId;
    window.sessionStorage.setItem("settings", JSON.stringify(result));
  }

  /*
   * Redraw DataTable
   * - this function checks if the BE overview page is active and aborts if not
   *   If redraw occurs for inactive page, the memory leak piles up
   */
  static async redrawTable(useRateLimit = true) {
    if (Popup.table == null || typeof Popup.table.DataTable === "undefined") return;
    if (useRateLimit && Popup.checkRateLimit("redrawTable", "articles", 30_000)) return;
    // first check if window is active
    let window = await browser.windows.getCurrent();
    if (window.active === false) return;
    // second check if tab is active
    let tab = await browser.tabs.getCurrent();
    if (tab.active === false) return;
    console.debug("Biet-O-Matic: redrawTable() redrawing table now.");
    Popup.table.DataTable.rows().invalidate("data").draw(false);
  }

  static async redrawTableRow(rowId, useRateLimit = true) {
    if (typeof rowId === "undefined" || (useRateLimit && Popup.checkRateLimit("redrawTableRow", rowId, 30_000))) return;
    // first check if window is active
    let window = await browser.windows.getCurrent();
    if (window.active === false) return;
    // second check if tab is active
    let tab = await browser.tabs.getCurrent();
    if (tab.active === false) return;
    let row = Popup.table.DataTable.row("#" + rowId);
    if (row !== "undefined" && row.length === 1) {
      //console.debug("Biet-O-Matic: redrawTableRow(row=%s) redrawing table row now.", rowId);
      row.invalidate("data").draw(false);
    }
  }

  static async redrawTableCell(rowId, cellId) {
    if (Popup.checkRateLimit("redrawTableCell", `${rowId}:${cellId}`, 30_000)) return;
    // first check if window is active
    let window = await browser.windows.getCurrent();
    if (window.active === false) return;
    // second check if tab is active
    let tab = await browser.tabs.getCurrent();
    if (tab.active === false) return;
    let cell = Popup.table.DataTable.cell("#" + rowId, cellId);
    if (cell !== "undefined" && cell.length === 1) {
      //console.debug("Biet-O-Matic: redrawTableCell(row=%s,cell=%s) redrawing table cell now.", rowId, cellId);
      cell.invalidate("data").draw(false);
    }
  }

  /*
   * Update Favicon
   * - for popup
   * - for contentScript (ebay articles)
   * - for browser action
   */
  static updateFavicon(checked = false, tab = null, simulate = false) {
    let title = "B";
    let color = "#a6001a";
    if (checked) {
      color = "#457725";
    }
    let fav = new Favicon(title, color);
    let favUrl = fav.link;
    let favImg = fav.image;
    if (favUrl) {
      favUrl.id = "favicon";
      let head = document.getElementsByTagName("head")[0];
      if (document.getElementById("favicon")) {
        head.removeChild(document.getElementById("favicon"));
      }
      head.appendChild(favUrl);
    }
    if (tab == null) {
      // update browserAction Icon for all of this window Ebay Tabs (Chrome does not support windowId param)
      let query = browser.tabs.query({ currentWindow: true });
      query.then((tabs) => {
        console.debug("Biet-O-Matic: updateFavicon(), Setting icon on %d tabs", Object.keys(tabs).length);
        for (const tab of tabs) {
          browser.browserAction.setIcon({
            imageData: favImg,
            tabId: tab.id,
          });
          // update simulation badge (windowId not supported by chrome)
          if (simulate) browser.browserAction.setBadgeText({ text: "T", tabId: tab.id });
          else browser.browserAction.setBadgeText({ text: "", tabId: tab.id });
        }
      });
    } else {
      // update for specific single tab
      console.debug("Biet-O-Matic: updateFavicon(), Setting icon on single tab=%d", tab.id);
      browser.browserAction.setIcon({ imageData: favImg, tabId: tab.id });
      if (simulate) browser.browserAction.setBadgeText({ text: "T", tabId: tab.id });
      else browser.browserAction.setBadgeText({ text: "", tabId: tab.id });
    }
  }

  /*
   * execute the specified function maximum every limitMs milliseconds
   * returns true if the rate limit applies
   */
  static checkRateLimit(name, key, limitMs) {
    if (Popup.rateLimit.hasOwnProperty(name)) {
      if (Popup.rateLimit[name].hasOwnProperty(key)) {
        if (Date.now() - Popup.rateLimit[name][key] < limitMs) {
          return true;
        }
      }
    } else {
      Popup.rateLimit[name] = {};
    }
    Popup.rateLimit[name][key] = Date.now();
    return false;
  }

  //region i18n
  static getTranslation(i18nKey, defaultText = "", params = null) {
    let translatedText = browser.i18n.getMessage(i18nKey, params);
    // use provided default text, if specified
    if (translatedText === "") {
      if (defaultText !== "") {
        return defaultText;
      } else {
        return i18nKey;
      }
    } else {
      return translatedText;
    }
  }
  //endregion
}

// static class-var declaration outside the class
Popup.cachedGroups = {};
Popup.rateLimit = {};
Popup.alreadyRunning = {};
Popup.otherInfo = {};
Popup.tabId = null;
Popup.table = null;
Popup.currentWindowId = null;

//region Favicon Handling
class Favicon {
  constructor(title, color = "#ffffff") {
    if (typeof color !== "string" || !color.startsWith("#")) {
      throw new Error(`Invalid Favicon color: ${color}`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    let ctx = canvas.getContext("2d");
    // background color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 63, 63);
    // text color
    ctx.fillStyle = Favicon.getContrastYIQ(color);

    let acronym = title
      .split(" ")
      .map(function (item) {
        return item[0];
      })
      .join("")
      .substr(0, 2);

    let fontSize = Favicon.measureText(ctx, acronym, "Arial", 0, 60, 50);
    ctx.font = `bold ${fontSize}px "Arial"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(acronym, 32, 38);

    // prepare icon as Data URL
    const link = document.createElement("link");
    link.type = "image/x-icon";
    link.rel = "shortcut icon";
    link.href = canvas.toDataURL("image/x-icon");

    // persist info
    this.link = link;
    this.image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  static measureText(context, text, fontface, min, max, desiredWidth) {
    if (max - min < 1) {
      return min;
    }
    let test = min + (max - min) / 2; //Find half interval
    context.font = `bold ${test}px "${fontface}"`;
    let found;
    if (context.measureText(text).width > desiredWidth) {
      found = Favicon.measureText(context, text, fontface, min, test, desiredWidth);
    } else {
      found = Favicon.measureText(context, text, fontface, test, max, desiredWidth);
    }
    return parseInt(found);
  }

  /* determine good contrast color (black or white) for given BG color */
  static getContrastYIQ(hexcolor) {
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    // http://www.w3.org/TR/AERT#color-contrast
    let yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "black" : "white";
  }
}

//endregion

/*
 * MAIN
 */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  const popup = new Popup(BOM_VERSION);
  popup
    .init()
    .then(() => {
      console.info(
        "Biet-O-Matic: Initialization for window with id = %d completed (lang=%s).",
        Popup.currentWindowId,
        Popup.lang
      );
      //toastr.success('Bid-O-Matic successfully initialized.');
    })
    .catch((e) => {
      console.warn("Biet-O-Matic: Popup initialization failed: " + e);
    });
});
