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
import $ from 'jquery';

import 'jquery-ui-dist/jquery-ui.css';

// datatables.net + responsive, jquery-ui design
import 'datatables.net-jqui/css/dataTables.jqueryui.css';
import 'datatables.net-buttons-jqui/css/buttons.jqueryui.css';
import 'datatables.net-responsive-jqui/css/responsive.jqueryui.css';
import 'datatables.net-rowgroup-jqui/css/rowgroup.jqueryui.css';
import 'datatables.net-jqui';
import 'datatables.net-buttons-jqui';
import 'datatables.net-responsive-jqui';
import 'datatables.net-rowgroup-jqui';

// date-fns as alternative to moment
import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

// FontAwesome
import '@fortawesome/fontawesome-free/css/all.css';
//import '@fortawesome/fontawesome-free/js/fontawesome';
//import '@fortawesome/fontawesome-free/js/regular';

import "../css/popup.css";

/*
 * All functions related to Auction Groups
 * Group information is stored in browser sync storage under key GROUPS: { 'name': { autoBid: false }, ...]
 */
class Group {
  // returns the groups from sync.storage
  static async getAll() {
    let result = await browser.storage.sync.get('GROUPS');
    if (Object.keys(result).length === 1)
      return result.GROUPS;
    else
      return {};
  }

  // returns the state of group autoBid: true|false
  static async getState(name) {
    // name=null -> name=Keine Gruppe
    if (name == null || typeof name === 'undefined')
      name = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
    let result = await browser.storage.sync.get('GROUPS');
    if (Object.keys(result).length === 1) {
      const groupInfo = result.GROUPS;
      //console.debug("Biet-O-Matic: Group.getState(%s:%s) : %s", name, typeof name, JSON.stringify(groupInfo));
      if (groupInfo.hasOwnProperty(name)) {
        return groupInfo[name].hasOwnProperty('autoBid') && groupInfo[name].autoBid === true;
      } else {
        // no value for this group stored yet
        return false;
      }
    } else {
      // no groups stored at all
      return false;
    }
  }

  static async setState(name, autoBid = false) {
    // name=null -> name=Keine Gruppe
    if (name == null || typeof name === 'undefined')
      name = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
    let result = await browser.storage.sync.get('GROUPS');
    const groupInfo = {};
    if (Object.keys(result).length === 1)
      Object.assign(groupInfo, result.GROUPS);

    // check if the autoBid needs to be updated
    if (groupInfo.hasOwnProperty(name) && groupInfo[name].hasOwnProperty('autoBid') && groupInfo[name].autoBid === autoBid)
      return;

    groupInfo[name] = { autoBid: autoBid };
    //console.log("group.setState %s", JSON.stringify(groupInfo));

    // store the info back to the storage
    await browser.storage.sync.set({GROUPS: groupInfo});
  }

  static async toggleState(name) {
    if (typeof name === 'undefined')
      return false;
    let state = await Group.getState(name);
    await Group.setState(name, !state);
    return !state;
  }

  /*
   * Add the proper class to the group name span
   * requires a bit waiting, because the function will be called before the actual elements will be added
   */
  static renderState(id, name) {
    Group.waitFor(`#${id}[name="${name}"]`, 500)
      .then(spanGroupAutoBid => {
        if (spanGroupAutoBid == null || spanGroupAutoBid.length !== 1) {
          console.warn("Biet-O-Matic: Group.renderState, could not find group span");
          return;
        }
        Group.getState(name).then(autoBid => {
          if (autoBid) {
            spanGroupAutoBid.addClass('groupAutoBidEnabled');
            spanGroupAutoBid.removeClass('groupAutoBidDisabled');
          } else {
            spanGroupAutoBid.addClass('groupAutoBidDisabled');
            spanGroupAutoBid.removeClass('groupAutoBidEnabled');
          }
        }).catch(e => {
          console.warn("Biet-O-Matic: Cannot determine autoBid state for group %s: %s", name, e.message);
        });
      })
      .catch(e => {
        console.log("Biet-O-Matic: Group.renderState(%s) failed (Probably not found): %s", name, e.message);
      });
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
      function waitForElementToDisplay(selector, time, timeout) {
        if (timeout <= 0) {
          reject(`waitFor(${selector}), timeout expired!`);
        } else if ($(selector).length === 1) {
          resolve($(selector));
        } else {
          setTimeout(function () {
            waitForElementToDisplay(selector, time, timeout - time);
          }, time);
        }
      }
    });
  }

  /*
   * Update group state from given GROUP info
   * this is typically called when the storage changed event was generated, i.e. triggered by a remote instance
   */
  static updateFromChanges(changes) {
    if (!changes.hasOwnProperty('newValue'))
      return;
    // todo: Do we have to handle removed groups?
    Object.keys(changes.newValue).forEach(groupName => {
      Group.renderState('spanGroupAutoBid', groupName);
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
    if (!AutoBid.hasOwnProperty('beWindowId') || AutoBid.beWindowId == null) {
      const currentWindow = await browser.windows.getCurrent({populate: false});
      AutoBid.beWindowId = `${window.location.hostname}:${currentWindow.id}`;
    }
    return AutoBid.beWindowId;
  }

  static getLocalState() {
    const info = {};
    let result = JSON.parse(window.sessionStorage.getItem('settings'));
    if (result != null) {
      Object.assign(info, result);
    }
    return info;
  }
  static setLocalState(autoBidEnabled, simulation) {
    Popup.updateSetting('autoBidEnabled', autoBidEnabled);
    Popup.updateSetting('simulation', simulation);
  }

  /*
   * return the info as is, to be evaluated external
   * SETTINGS: {autoBid: {id: <Id>, autoBidEnabled: true, timestamp: xxx}, otherSetting: xxxx}
   */
  static async getSyncState() {
    let info = {autoBidEnabled: false, id: null, timestamp: null};
    let result = await browser.storage.sync.get('SETTINGS');
    //console.log("XXX getSyncState() %s", JSON.stringify(result));
    if (Object.keys(result).length === 1 && result.hasOwnProperty('SETTINGS')) {
      const settingsInfo = result.SETTINGS;
      if (settingsInfo.hasOwnProperty('autoBid')) {
        Object.assign(info, settingsInfo.autoBid);
        console.debug("Biet-O-Matic: AutoBid.getSyncState() stored=%s, info=%s",
          JSON.stringify(settingsInfo), JSON.stringify(info));
      }
    }
    return info;
  }

  /*
   * set state in browser sync storage. Do not store simulation state here.
   * - if autoBid is being disabled for this Id, then only update the syncInfo if the id is ours
   */
  static async setSyncState(autoBidEnabled) {
    let result = await browser.storage.sync.get('SETTINGS');
    let oldSettings = {};
    if (Object.keys(result).length === 1 && result.hasOwnProperty('SETTINGS')) {
      oldSettings = result.SETTINGS;
    }
    const myId = await AutoBid.getId();
    let newSettings = {
      'autoBid': {
        'id': myId,
        'autoBidEnabled': autoBidEnabled,
        'timestamp': Date.now()
      }
    };

    if (autoBidEnabled == null) {
      // dead man switch, outdated entry should be removed
      delete newSettings.autoBid;
    } else if (autoBidEnabled === false) {
      // remove the sync autoBid info, but only if the id stored there is ours (internet / sync problems could maybe cause this)
      if (oldSettings.hasOwnProperty('autoBid') && oldSettings.autoBid.hasOwnProperty('id') && oldSettings.autoBid.id === myId) {
        delete oldSettings.autoBid;
      }
      newSettings = oldSettings;
    } else {
      newSettings = Object.assign({}, oldSettings, newSettings);
    }
    console.debug("AutoBid.setSyncState(%s) Setting autoBid info %s", autoBidEnabled, JSON.stringify(newSettings));
    await browser.storage.sync.set({'SETTINGS': newSettings});
  }

  /*
   * Determine autoBid state
   * - prefers generally the local state
   * - if the sync state is enabled for a different window (Id) then disable autobid
   * - if sync state for this window is present, but local state is not set, then use sync state (extension update)
   * Note: this function is called by renderState, which will be called regularly to check for remote state updates
   * return {autoBidEnabled: true|false, simulation: true|false, id: <Id>|null, message: 'Text'}
   */
  static async getState() {
    let info = {autoBidEnabled: false, simulation: false, id: null};
    const localInfo = AutoBid.getLocalState();
    const syncInfo = await AutoBid.getSyncState();

    const myId = await AutoBid.getId();
    Object.assign(info, localInfo);

    // if sync state is for different id , then disable autoBid (sync state is only added if active)
    if (syncInfo.hasOwnProperty('id') && syncInfo.id != null && syncInfo.id !== myId) {
      info.messageHtml = AutoBid.getDisableMessage(syncInfo.id, info.autoBidEnabled, info.simulation);
      if (info.simulation === false && syncInfo.autoBidEnabled === true) {
        info.autoBidEnabled = false;
        AutoBid.setLocalState(info.autoBidEnabled);
      }
    } else if (Object.keys(localInfo).length === 0) {
        Object.assign(info, syncInfo);
        // initially set localState after extension update
        AutoBid.setLocalState(info.autoBidEnabled, info.simulation);
    }
    return info;
  }

  /*
   * Set state in local storage and sync storage (if not simulating)
   */
  static setState(autoBidEnabled = false, simulation = false) {
    AutoBid.setLocalState(autoBidEnabled, simulation);
    // do not set sync state if simulation is on (but handle shift when autoBid is disabled with shift pressed)
    if (simulation === false || autoBidEnabled === false) {
      AutoBid.setSyncState(autoBidEnabled).then(() => {
        console.debug("Biet-O-Matic: AutoBid.setSyncState(%s) completed", autoBidEnabled);
        AutoBid.renderState();
      }).catch(e => {
        console.warn("Biet-O-Matic: AutoBid.setSyncState(%s) failed: %s", autoBidEnabled, e.message);
      });
    } else {
      AutoBid.renderState();
    }
  }

  static async toggleState() {
    const state = await AutoBid.getState();
    AutoBid.setState(!state.autoBidEnabled, state.simulation);
    return !state;
  }

  static renderState() {
    console.debug("Biet-O-Matic: AutoBid.renderState() called.");
    AutoBid.getState().then(info => {
      AutoBid.jq.prop('checked', info.autoBidEnabled);
      // do not set sync state if simulation is on
      if (info.simulation === false) {
        $("#lblAutoBid").text('Automatikmodus');
        $("#internal").addClass('hidden');
      } else {
        $("#lblAutoBid").text('Automatikmodus (Test)');
        $("#internal").removeClass('hidden');
      }
      $("#autoBidMessage").empty();
      // show info about other instances and their autoBid state
      if (info.hasOwnProperty('message'))
        $("#autoBidMessage").text(info.message);
      else if (info.hasOwnProperty('messageHtml')) {
        $("#autoBidMessage").append(info.messageHtml);
      }
      Popup.updateFavicon(info.autoBidEnabled, null, info.simulation);
    }).catch(e => {
      console.warn("Biet-O-Matic: AutoBid.renderState() failed: %s", e.message);
    });
  }

  static registerEvents() {
    // window inpAutoBid checkbox
    AutoBid.jq.on('click', e => {
      e.stopPropagation();
      console.debug('Biet-O-Matic: Automatic mode toggled: %s - shift=%s, ctrl=%s', AutoBid.jq.is(':checked'), e.shiftKey, e.ctrlKey);
      AutoBid.setState(AutoBid.jq.is(':checked'), e.shiftKey);
    });

    window.addEventListener('hashchange', (e) => {
      e.preventDefault();
      const windowId = window.location.hash.split(':')[1];
      if (/[0-9]+/.test(windowId)) {
        browser.windows.update(Number.parseInt(windowId, 10), {focused: true}).catch(e => {
          console.log("Biet-O-Matic: Cannot activate specified window %s: %s", windowId, e.message);
        });
      } else {
        console.warn("Biet-O-Matic: getDisableMessage() Cannot activate specified window, id is not a number: %s", windowId);
      }
      window.location.hash = '';
      return false;
    });
  }

  static getDisableMessage(otherId, autoBidEnabled, simulation) {
    const spanPre = document.createElement('span');
    const link = document.createElement('a');
    const spanPost = document.createElement('span');
    if (simulation || autoBidEnabled === false) {
      spanPre.textContent = 'Automatikmodus ist in einem ';
      link.href = `#${otherId}`;
      link.id = 'windowLink';
      link.textContent = 'anderen Fenster';
      spanPost.textContent = ' aktiv.';
    } else {
      spanPre.textContent = 'Automatikmodus deaktiviert. Er wurde in einem ';
      link.href = `#${otherId}`;
      link.id = 'windowLink';
      link.textContent = 'anderen Fenster';
      spanPost.textContent = ' aktiviert.';
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
    try {
      let localState = AutoBid.getLocalState();
      if (!localState.simulation && localState.autoBidEnabled) {
        console.debug("Biet-O-Matic: AutoBid.deadManSwitch() called");
        AutoBid.setSyncState(localState.autoBidEnabled).then(() => {
          console.debug("Biet-O-Matic: AutoBid.setSyncState(%s) completed", localState.autoBidEnabled);
        }).catch(e => {
          console.warn("Biet-O-Matic: AutoBid.setSyncState(%s) failed: %s", localState.autoBidEnabled, e.message);
        });
      }
      AutoBid.removeDeadAutoBid().catch(e => {
        console.warn(`Biet-O-Matic: deadManSwitch() removeDeadAutoBid failed: ${e.message}`);
      });
    } catch (e) {
      console.warn(`Biet-O-Matic: deadManSwitch() internal error: ${e.message}`);
    } finally {
      setTimeout( function () {
        AutoBid.deadManSwitch();
      }, 60000);
    }
  }

  // remove autoBid if the timestamp update was longer than 5 minutes ago
  static async removeDeadAutoBid() {
    let syncState = await AutoBid.getSyncState();
    if (syncState.hasOwnProperty('timestamp') && syncState.timestamp != null) {
      if ((Date.now() - syncState.timestamp)/1000 > 300 ) {
        console.debug("Biet-O-Matic: removeDeadAutoBid() Removing dead entry: %s", JSON.stringify(syncState));
        await AutoBid.setSyncState(null);
      } else {
        console.debug("Biet-O-Matic: removeDeadAutoBid() Entry good (%ss old)", (Date.now() - syncState.timestamp)/1000);
      }
    }
  }

  /*
   * Check if the changeinfo is relevant for this instance
   * Will be called when the storage update event is received
   * - change was by different id
   *   {"SETTINGS":{
   *   "newValue":{"autoBid":{"autoBidEnabled":true,"id":"kfpgnpfmingbecjejgnjekbadpcggeae:138","timestamp":1577979582486}},
   *   "oldValue":{"autoBid":{"autoBidEnabled":true,"id":"kfpgnpfmingbecjejgnjekbadpcggeae:138","timestamp":1577979572481}}}}
   */
  static checkChangeIsRelevant(changeInfo) {
    if (!changeInfo.hasOwnProperty('newValue')) {
      console.log("Biet-O-Matic: checkChangeIsRelevant() newValue missing: %s", JSON.stringify(changeInfo));
      return true;
    }
    const newValue = changeInfo.newValue;
    if (newValue.length > 0 && AutoBid.hasOwnProperty('beWindowId') && newValue.autoBid.id === AutoBid.beWindowId) {
      console.debug("Biet-O-Matic: AutoBid.checkChangeIsRelevant: Change is not relevant for this id=%s: %s",
        AutoBid.beWindowId, JSON.stringify(newValue));
      return false;
    } else {
      console.debug("Biet-O-Matic: AutoBid.checkChangeIsRelevant: Change is relevant for this id=%s: %s",
        AutoBid.beWindowId, JSON.stringify(newValue));
      return true;
    }
  }

  // should be called once
  static init() {
    if ($('#inpAutoBid').length === 0)
      console.warn("Biet-O-Matic: AutoBid cannot be initialized: inpAutoBid not found, inpAutoBid=%O", $('#inpAutoBid'));
    AutoBid.jq = $('#inpAutoBid');
    AutoBid.renderState();
    AutoBid.registerEvents();
    AutoBid.deadManSwitch();
  }
}
// static class vars
AutoBid.beWindowId = null;

/*
 * All functions related to an eBay Article
 * - hold info for DataTable
 * -
 */
class Article {
  constructor(popup, info, tab = null) {
    if (info == null || !info.hasOwnProperty('articleId'))
      throw new Error("Failed to initialize new Article, articleId missing in info!");
    this.articleId = info.articleId;
    this.articleGroup = null;
    this.articleMaxBid = null;
    this.articleAutoBid = false;
    // normal article, from open tab
    const elements = [
      'articleAuctionState', 'articleAuctionStateText', 'articleBidCount', 'articleBidPrice', 'articleCurrency',
      'articleBuyPrice', 'articleDescription', 'articleEndTime',
      'articleMinimumBid', 'articlePaymentMethods', 'articleShippingCost', 'articleShippingMethods',
      'articleState'
    ];
    elements.forEach(e => {
      if (info.hasOwnProperty(e))
        this[e] = info[e];
    });
    // add open tab info
    if (tab != null) this.tabId = tab.id;
    this.popup = popup;
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
    if (info.hasOwnProperty('autoBid')) {
      info.articleAutoBid = info.autoBid;
      delete info.autoBid;
      converted++;
    }
    if (info.hasOwnProperty('minBid')) {
      info.articleMinimumBid = info.minBid;
      delete info.minBid;
      converted++;
    }
    if (info.hasOwnProperty('maxBid')) {
      info.articleMaxBid = info.maxBid;
      delete info.maxBid;
      converted++;
    }
    if (info.hasOwnProperty('description')) {
      info.articleDescription = info.description;
      delete info.description;
      converted++;
    }
    if (info.hasOwnProperty('endTime')) {
      info.articleEndTime = info.endTime;
      delete info.endTime;
      converted++;
    }
    if (info.hasOwnProperty('bidPrice')) {
      info.articleBidPrice = info.bidPrice;
      delete info.bidPrice;
      converted++;
    }
    if (info.hasOwnProperty('group')) {
      info.articleGroup = info.group;
      delete info.group;
      converted++;
    }
    return converted;
  }

  // Request article info from specific tab
  static async getInfoFromTab(tab) {
    /*
     * Check if the tab is for an supported eBay article before we attempt to parse info from it
     * e.g. https://www.ebay.de/itm/*
     */
    let regex = /^https:\/\/www.ebay.(de|com)\/itm/i;
    if (!regex.test(tab.url)) {
      return Promise.resolve({});
    }
    // inject content script in case its not loaded
    await browser.tabs.executeScript(tab.id, {file: 'contentScript.bundle.js'})
      .catch(e => {
        throw new Error(`getInfoFromTab(${tab.id}) executeScript failed: ${e.message}`);
      });

    /*
     * The remote tab needs some time to initialize, so we have to retry the messages a few times
     * https://stackoverflow.com/a/55270741
     */
    const withRetries = ({ attempt, maxRetries }) => async (...args) => {
      const slotTime = 500;
      let retryCount = 0;
      do {
        try {
          console.log('Biet-O-Matic: getInfoFromTab(%d) Attempting... retriesLeft=%d', tab.id, maxRetries);
          return await attempt(...args);
        } catch (error) {
          const isLastAttempt = retryCount === maxRetries;
          if (isLastAttempt) {
            // Stack Overflow console doesn't show unhandled
            // promise rejections so lets log the error.
            //console.error(error);
            return Promise.reject(error);
          }
        }
        const randomTime = Math.floor(Math.random() * slotTime);
        const delay = 2 ** retryCount * slotTime + randomTime;
        // Wait for the exponentially increasing delay period before retrying again.
        await new Promise(resolve => setTimeout(resolve, delay));
      } while (retryCount++ < maxRetries);
    };
    const getArticleInfo = withRetries({ attempt: browser.tabs.sendMessage, maxRetries: 3 });
    return await getArticleInfo(tab.id, {action: 'GetArticleInfo'});
  }

  /*
   * Selected information which will be transmitted to tabs
   */
  static getInfoForTab(article) {
    if (article == null || typeof article === 'undefined')
      return {};
    return {
      articleId: article.articleId,
      articleDescription: article.articleDescription,
      tabId: article.tabId
    };
  }

  // return the stored info for the article or null
  async getInfoFromStorage() {
    let result = await browser.storage.sync.get(this.articleId);
    if (Object.keys(result).length === 1) {
      return result[this.articleId];
    } else {
      return null;
    }
  }

  // removes all article specific data in storage
  async removeInfoFromStorage() {
    await browser.storage.sync.remove(this.articleId);
    this.articleGroup = null;
    this.articleMaxBid = null;
    this.articleAutoBid = false;
    console.debug("Biet-O-Matic: removeInfoFromStorage(%s) Browser sync storage cleared", this.articleId);
  }

  // complement with DB info
  async addInfoFromStorage() {
    let result = await browser.storage.sync.get(this.articleId);
    if (Object.keys(result).length === 1) {
      let storInfo = result[this.articleId];
      let converted = Article.convertKeys(storInfo);
      // add the info to the current article object
      Object.assign(this, storInfo);
      console.debug("Biet-O-Matic: addInfoFromStorage(%s) Found info for Article in storage (converted %d entries): %s",
        this.articleId, converted, this.toString());
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
    let result = await browser.storage.sync.get(this.articleId);
    if (Object.keys(result).length === 1) {
      oldStoredInfo = result[this.articleId];
      // update old keys in storedInfo (e.g. maxBid -> articleMaxBid, description -> articleDescription)
      Article.convertKeys(oldStoredInfo);
    } else {
      // should we only store the info if an storage entry already exists?
      if (onlyIfExists === true) return false;
    }
    // store maxBid as number
    if (info != null && info.hasOwnProperty('maxBid')) {
      if (typeof info.maxBid === 'string') {
        console.debug("Biet-O-Matic: updateInfoInStorage() Convert maxBid string=%s to float=%s",
          info.maxbid, Number.parseFloat(info.maxBid.replace(/,/, '.')));
        info.maxBid = Number.parseFloat(info.maxBid.replace(/,/, '.'));
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
    let diffText = Article.getDiffMessage('Aktualisiert', oldStoredInfo, newStoredInfo);
    //console.log("oldInfo=%O, newInfo=%O, merged=%O, diffText=%O", oldStoredInfo, newStoredInfo, mergedStoredInfo, diffText);
    if (diffText != null) {
      this.addLog({
        component: "Artikel",
        level: "Einstellungen",
        message: diffText
      });
      // store the info back to the storage
      await browser.storage.sync.set({[this.articleId]: mergedStoredInfo});
      if (tabId != null) {
        // send update to article tab
        await browser.tabs.sendMessage(tabId, {
          action: 'UpdateArticleMaxBid',
          detail: info  // Note: use the original info with short keys
        });
      }
    }
  }

  // remove information from object which should not be stored
  static removeUnwantedInfo(info) {
    delete info.popup;
    delete info.tabId;
    delete info.tabRefreshed;
    delete info.tabOpenedForBidding;
    delete info.articleDetailsShown;
    delete info.perfInfo;
  }

  /*
   * merge updated info and add the change to the article log
   * - group, maxBid and autoBid are only needed for browser sync feature
   */
  updateInfo(info) {
    let modifiedForStorage = 0;
    let modifiedForDisplay = 0;
    let messages = [];
    // tabId should not be handled here, because its window specific
    // articleDescription
    if (info.hasOwnProperty('articleDescription') && info.articleDescription !== this.articleDescription) {
      messages.push(Article.getDiffMessage('Beschreibung', this.articleDescription, info.articleDescription));
      this.articleDescription = info.articleDescription;
      modifiedForStorage++;
      // todo: optionally deactivate autoBid for this article?
    }
    // articleBidPrice
    if (info.hasOwnProperty('articleBidPrice') && info.articleBidPrice !== this.articleBidPrice) {
      messages.push(Article.getDiffMessage('Auktionspreis', this.articleBidPrice, info.articleBidPrice));
      this.articleBidPrice = info.articleBidPrice;
      modifiedForStorage++;
    }
    // articleBidCount
    if (info.hasOwnProperty('articleBidCount') && info.articleBidCount !== this.articleBidCount) {
      messages.push(Article.getDiffMessage('Anzahl Gebote', this.articleBidCount, info.articleBidCount));
      this.articleBidCount = info.articleBidCount;
      modifiedForStorage++;
    }
    // articleBidPrice
    if (info.hasOwnProperty('articleBuyPrice') && info.articleBuyPrice !== this.articleBuyPrice) {
      messages.push(Article.getDiffMessage('Kaufpreis', this.articleBuyPrice, info.articleBuyPrice));
      this.articleBuyPrice = info.articleBuyPrice;
      modifiedForStorage++;
    }
    // articleShippingCost
    if (info.hasOwnProperty('articleShippingCost') && info.articleShippingCost !== this.articleShippingCost) {
      messages.push(Article.getDiffMessage('Lieferkosten', this.articleShippingCost, info.articleShippingCost));
      this.articleShippingCost = info.articleShippingCost;
      modifiedForStorage++;
    }
    // articleShippingMethods
    if (info.hasOwnProperty('articleShippingMethods') && info.articleShippingMethods !== this.articleShippingMethods) {
      messages.push(Article.getDiffMessage('Liefermethoden', this.articleShippingMethods, info.articleShippingMethods));
      this.articleShippingMethods = info.articleShippingMethods;
      modifiedForStorage++;
    }
    // articleMinimumBid
    if (info.hasOwnProperty('articleMinimumBid') && info.articleMinimumBid !== this.articleMinimumBid) {
      messages.push(Article.getDiffMessage('Minimal Gebot', this.articleMinimumBid, info.articleMinimumBid));
      this.articleMinimumBid = info.articleMinimumBid;
      modifiedForStorage++;
    }
    // articleEndTime
    if (info.hasOwnProperty('articleEndTime') && info.articleEndTime !== this.articleEndTime) {
      messages.push(Article.getDiffMessage('Auktionsende', this.articleEndTime, info.articleEndTime));
      this.articleEndTime = info.articleEndTime;
      modifiedForStorage++;
    }
    // articleAuctionState
    if (info.hasOwnProperty('articleAuctionState') && info.articleAuctionState !== this.articleAuctionState) {
      messages.push(Article.getDiffMessage('Status', this.articleAuctionStateText, info.articleAuctionStateText));
      this.articleAuctionState = info.articleAuctionState;
      if (info.hasOwnProperty('articleAuctionStateText'))
        this.articleAuctionStateText = info.articleAuctionStateText;
      else
        this.articleAuctionStateText = "Text fehlt";
      modifiedForStorage++;
    }
    // autoBid (do not log or count as modified as the storage is already up-to-date)
    if (info.hasOwnProperty('articleAutoBid')) {
      this.articleAutoBid = info.articleAutoBid;
      modifiedForDisplay++;
    }
    // maxBid (do not log or count as modified as the storage is already up-to-date)
    if (info.hasOwnProperty('articleMaxBid')) {
      this.articleMaxBid = info.articleMaxBid;
      modifiedForDisplay++;
    }
    // articleGroup (do not log or count as modified as the storage is already up-to-date)
    if (info.hasOwnProperty('articleGroup')) {
      this.articleGroup = info.articleGroup;
      modifiedForDisplay++;
    }

    if (modifiedForStorage > 0) {
      this.addLog({
        component: "Artikel",
        level: "Aktualisierung",
        message: messages.join('; '),
      });
    }
    return {
      modifiedForStorage: modifiedForStorage,
      modifiedForDisplay: modifiedForDisplay
    };
  }

  static getDiffMessage(description, oldVal, newVal) {
    try {
      //console.debug("getDiffMessage() description=%s, oldVal = %O (%s), newVal=%O",
      //  description, oldVal, typeof oldVal, newVal);
      let numberOfDifferences = 0;
      if (oldVal != null && typeof oldVal === 'object') {
        // Short diff: https://stackoverflow.com/a/37396358
        let diffResult = Object.keys(newVal).reduce((diff, key) => {
          // just check if the keys are different, but do not add to diff output
          if (key.match(/^(articleAuctionState|articleAuctionStateText|articleBidCount|articleBidPrice|tabRefreshed|articleMinimumBid)$/)) {
            if (oldVal[key] !== newVal[key])
              numberOfDifferences++;
            return diff;
          }
          if (oldVal[key] === newVal[key]) return diff;
          numberOfDifferences++;
          let text = this.getDiffMessage(key, oldVal[key], newVal[key]);
          return {
            ...diff,
            [key]: text
          };
        }, {});
        if (Object.keys(diffResult).length > 0) {
          const messages = [];
          Object.keys(diffResult).forEach(key => {
            messages.push(diffResult[key]);
          });
          return `${description}: ${messages.join('; ')}`;
        } else {
          if (numberOfDifferences > 0) {
            return `${description}: ${numberOfDifferences} sonstige Änderungen`;
          } else {
            return null;
          }
        }
      } else {
        if (oldVal == null || typeof oldVal === 'undefined' || oldVal === newVal)
          return `${description}: ${newVal}`;
        else
          return `${description}: ${oldVal} -> ${newVal}`;
      }
    } catch(e) {
      console.warn(`getDiffMessage(${description}) failed: ${e.message}`);
      return `${description}: Kann die Unterschiede nicht anzeigen!`;
    }
  }

  // add log message for article
  addLog(messageObject) {
    let message = {};
    message.timestamp = Date.now();
    message.message = JSON.stringify(messageObject);
    message.component = "Unbekannt";
    message.level = "Interner Fehler";
    if (messageObject.hasOwnProperty('timestamp'))
      message.timestamp = messageObject.timestamp;
    if (messageObject.hasOwnProperty('message'))
      message.message = messageObject.message;
    if (messageObject.hasOwnProperty('component'))
      message.component = messageObject.component;
    if (messageObject.hasOwnProperty('level'))
      message.level = messageObject.level;

    // get info for article from storage
    let log = JSON.parse(window.localStorage.getItem(`log:${this.articleId}`));
    console.debug("Biet-O-Matic: addLog(%s) info=%s", this.articleId, JSON.stringify(message));
    if (log == null) log = [];
    log.push(message);
    window.localStorage.setItem(`log:${this.articleId}`, JSON.stringify(log));
    // inform local popup about the change
    const row = this.popup.table.getRow(`#${this.articleId}`);
    if (row != null && row.length === 1) {
      // update child info, but drawing will be separate
      row.child(ArticlesTable.renderArticleLog(this));
      // 0 = articleDetailsControl
      row.cell(0).invalidate('data').draw(false);
    }
  }

  // return the log for the article from the storage, or null if none
  getLog() {
    return JSON.parse(window.localStorage.getItem(`log:${this.articleId}`));
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
    if (this.tabId == null)
      return "";
    else
      return 'tabid-' + this.tabId;
  }

  // returns the autoBid state for window and article group
  async getAutoBidState() {
    let groupName = $.fn.DataTable.RowGroup.defaults.emptyDataGroup;
    if (this.hasOwnProperty('articleGroup') && this.articleGroup != null && typeof this.articleGroup !== 'undefined' )
      groupName = this.articleGroup;
    const info = {
      articleAutoBid: this.articleAutoBid,
      groupName: groupName,
      groupAutoBid: await Group.getState(groupName)
    };
    // the the window info (autoBidEnabled)
    const windowAutoBidInfo = AutoBid.getLocalState();
    Object.assign(info, windowAutoBidInfo);
    return info;
  }

  // get formatted bid price: EUR 123,12
  getPrettyBidPrice() {
    //console.log("data=%O, type=%O, row=%O", data, type, row);
    let currency;
    if (this.hasOwnProperty('articleCurrency')) {
      currency = this.articleCurrency;
    } else {
      console.log("Biet-O-Matic: Article %s - using default currency EUR", this.articleId);
      currency = 'EUR';
    }
    let price;
    if (this.hasOwnProperty('articleBidPrice'))
      price = this.articleBidPrice;
    else if (this.hasOwnProperty('articleBuyPrice'))
      price = this.articleBuyPrice;
    try {
      return new Intl.NumberFormat('de-DE', {style: 'currency', currency: currency}).format(price);
    } catch (e) {
      return price;
    }
  }

  // same logic as activateAutoBid from contentScript
  activateAutoBid() {
    console.debug("Biet-O-Matic: activateAutoBid(%s), maxBidValue=%s (%s), minBidValue=%s (%s)",
      this.articleId, this.articleMaxBid, typeof this.articleMaxBid,  this.articleMinimumBid, typeof this.articleMinimumBid);
    //let isMaxBidEntered = (Number.isNaN(maxBidValue) === false);
    const isMinBidLargerOrEqualBidPrice = (this.articleMinimumBid >= this.articleBidPrice);
    const isMaxBidLargerOrEqualMinBid = (this.articleMaxBid >= this.articleMinimumBid);
    const isMaxBidLargerThanBidPrice = (this.articleMaxBid > this.articleBidPrice);
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
   * Adjust article bid times to ensure that minimum 10s are between to biddings
   * - determine all autoBid-enabled articles for same group as this article
   * - sort by articleId and articleEndTime
   * - start from end and build new object with key articleId
   * - store reason why adjusted (collided articles)
   */
  perlenschnur() {
    const articles = {};
    // build an object with required information
    this.popup.table.DataTable.rows().every(index => {
      const row = this.popup.table.DataTable.row(index);
      const article = row.data();
      // groups have to match
      if (!article.hasOwnProperty('articleGroup') || !this.hasOwnProperty('articleGroup') || article.articleGroup !== this.articleGroup)
        return;
      // check if that article has autoBidEnabled, if not its not interesting
      if (!article.articleAutoBid)
        return;
      // ignore sofortkauf items (because they have to be manually purchased)
      // ignore articles in the past
      if (!article.hasOwnProperty('articleEndTime') || article.articleEndTime == null || article.articleEndTime < Date.now())
        return;
      articles[article.articleId] = {
        articleEndTime: article.articleEndTime
      };
    });

    const sorter = function(a,b) {
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
      if (previous != null && (articles[previous].articleEndTime - articles[key].articleEndTime) < 15*1000) {
        const diff = (articles[key].articleEndTime - (articles[previous].articleEndTime - 10*1000)) / 1000;
        articles[key].adjustmentReason = `Bietzeit um ${diff}s angepasst, da Gefahr der Überschneidung mit Artikel ${previous}.`;
        // todo adjust the bidding preparation time (currently hardcoded to 30s)
        // leave 5s buffer (twice the biddingTime)
        if (articles[previous].articleEndTime < (Date.now() + 5*1000)) {
          console.warn(`Biet-O-Matic: Failed to adjust Article ${key} bidding time, would be too close to its end time!`);
        } else {
          articles[key].articleEndTime = articles[previous].articleEndTime - 15*1000;
        }
      }
      previous = key;
    }
    // finally return the interesting result
    return articles[this.articleId];
  }

  // open article in a new tab
  async openTab(tabOpenedForBidding = false) {
    console.log("Biet-O-Matic: Article.openTab(%s) Opening Article Tab (tabOpenedForBidding=%s)",
      this.articleId, tabOpenedForBidding);
    // orig_cvip will go directly to the original bidding page
    let tab = await browser.tabs.create({
      url: 'https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=' + this.articleId + '&orig_cvip=true',
      active: false,
      openerTabId: this.popup.tabId
    });
    this.tabId = tab.id;
    if (tabOpenedForBidding) {
      this.tabOpenedForBidding = true;
      this.addLog({
        component: "Bietvorgang",
        level: "Info",
        message: `Artikel Tab wurde zum Bieten geöffnet (${tab.id}).`
      });
    }
    return tab.id;
  }

  // close the article tab, except its active
  closeTab(onlyCloseIfNotActive = false, onlyCloseIfOpenedForBidding = true) {
    if (this.tabId == null) {
      console.debug("Biet-O-Matic: Article.closeTab() Article %s, Tab=%s: Skip - no tabId", this.articleId, this.tabId);
      return;
    }
    if (onlyCloseIfOpenedForBidding && !this.tabOpenedForBidding) {
      return;
    }
    browser.tabs.get(this.tabId).then(tab => {
      if ((this.hasOwnProperty('tabOpenedForBidding') && this.tabOpenedForBidding === false) || (onlyCloseIfNotActive && tab.active)) {
        console.debug("Biet-O-Matic: Article.closeTab() Article %s, Tab=%s: Dont close (%O)", this.articleId, this.tabId, tab);
        return;
      }
      browser.tabs.remove(this.tabId).then(() => {
        console.debug("Article.closeTab() Article %s, Tab=%s: Closed.", this.articleId, this.tabId);
        // hopefully this will lead to log entry for article
        if (this.hasOwnProperty('tabOpenedForBidding'))
          delete this.tabOpenedForBidding;
      }).catch(e => {
        console.log("Biet-O-Matic: Article.closeTab() browser.tabs.remove failed: %s", e.message);
      });
    }).catch(e => {
      console.log("Biet-O-Matic: Article.closeTab() browser.tabs.get failed: %s", e.message);
    });
  }

  /*
   * ArticlesTable received event from Article tab with auction end state
   * - this can be called multiple times, the state change be updated several times (e.g. unknown -> purchased)
   * - update article 'auctionEndState' in storage
   * - add status to article log
   * - close tab if it was opened for bidding
   */
  async handleAuctionEnded(info) {
    try {
      if (!info.hasOwnProperty('auctionEndState'))
        info.auctionEndState = null;
      // 1 == purchased : then disable group autoBid
      if (info.auctionEndState === 1) {
        await Group.setState(this.articleGroup, false);
      }
      await this.updateInfoInStorage(info)
        .catch(e => {
          console.warn("Biet-O-Matic: Unable to store article info: %s", e.message);
        });
      // add the ended state to the article log
      this.addLog({
        component: "Bietvorgang",
        level: "Status",
        message: Article.stateToText(info.auctionEndState)
      });
    } catch (e) {
      console.log("Biet-O-Matic: Article.handleAuctionEnded(%s) failed: %s, info=%s", JSON.stringify(info), e.message);
    }
    // close tab in 10 seconds if its still inactive (if the user activates the tab, it will stay open)
    setTimeout(() => {
      this.closeTab(true);
    }, 10000);
  }

  // convert state id to text
  static stateToText(state) {
    if (state === 0)
      return "Auktion nicht erfolgreich - Das Gebot konnte vermutlich nicht rechtzeitig abgegeben werden!";
    else if (state === 1)
      return "Auktion erfolgreich, der Artikel wurde gekauft.";
    else if (state === 2)
      return "Auktion nicht erfolgreich, sie wurden überboten.";
    else
      return "Der finale Status ist noch nicht bekannt.";
  }

  toString () {
    let str = '';
    String.prototype.trunc =
      function(n){
        return this.substr(0,n-1)+(this.length>n?'...':'');
      };
    for (let p in this) {
      if (this.hasOwnProperty(p)) {
        let v = null;
        if (this[p] != null)
          v  = (this[p] || '').toString().trunc(64);
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
  constructor(popup, selector) {
    this.popup = popup;
    this.selector = selector;
    this.currentWindowId = popup.whoIAm.currentWindow.id;
    if ($(selector).length === 0)
      throw new Error(`Unable to initialize articles table, selector '${selector}' not found in DOM`);
    $.fn.DataTable.RowGroup.defaults.emptyDataGroup = "Keine Gruppe";
    this.DataTable = ArticlesTable.init(selector);
    this.addSearchFields();
    this.registerEvents();
    this.registerTableEvents();
    this.openArticleTabsForBidding().catch(e => {
      console.error(`Biet-O-Matic: openArticleTabsForBidding() internal error: ${e.message}`);
    });
    this.collapsedGroups = {};
  }

  // setup articles table
  static init(selector) {
    $.extend(
      $.fn.dataTable.ext.type.order, {
        'natural-asc': function (a, b) {
          try {
            return ArticlesTable.naturalSort(a, b, true);
          } catch (e) {
            console.log("Biet-O-Matic: Natural Sorting (asc) failed: %s", e.message);
            return 0;
          }
        }
      },
      $.fn.dataTable.ext.type.order, {
        'natural-desc': function (a, b) {
          try {
            return ArticlesTable.naturalSort(a, b, true) * -1;
          } catch (e) {
            console.log("Biet-O-Matic: Natural Sorting (desc) failed: %s", e.message);
            return 0;
          }
        }
      });
    return $(selector).DataTable({
      columns: [
        {
          name: 'articleDetailsControl',
          className: 'details-control',
          data: 'articleDetailsShown',
          width: '10px',
          searchable: false,
          orderable: false,
          render: ArticlesTable.renderArticleDetailsControl,
        },
        {
          name: 'articleId',
          data: 'articleId',
          width: '100px',
          searchable: true,
          orderable: false,
          render: function (data, type, row) {
            if (type !== 'display') return data;
            let div = document.createElement("div");
            div.id = data;
            let a = document.createElement('a');
            a.href = 'https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=' + row.articleId  + '&orig_cvip=true';
            a.id = row.getArticleLinkId();
            a.text = data;
            a.target = '_blank';
            div.appendChild(a);
            return div.outerHTML;
          }
        },
        {
          name: 'articleDescription',
          data: 'articleDescription',
          searchable: true,
          orderable: false,
          defaultContent: 'Unbekannt'
        },
        {
          name: 'articleEndTime',
          data: 'articleEndTime',
          searchable: false,
          orderable: true,
          render: ArticlesTable.renderArticleEndTime,
          defaultContent: 7226582400000
        },
        {
          name: 'articleBidPrice',
          data: 'articleBidPrice',
          defaultContent: 0,
          searchable: false,
          orderable: false,
          render: ArticlesTable.renderArticleBidPrice
        },
        {
          name: 'articleShippingCost',
          data: 'articleShippingCost',
          searchable: false,
          orderable: false,
          defaultContent: 'nicht angegeben',
          render: function (data, type, row) {
            if (type !== 'display' && type !== 'filter') return data;
            let span = document.createElement('span');
            span.textContent = data;
            if (!row.hasOwnProperty('articleShippingCost') && row.hasOwnProperty('articleShippingMethods'))
              span.textContent = row.articleShippingMethods;
            if (row.hasOwnProperty('articleShippingMethods'))
              span.title = row.articleShippingMethods;
            return span.outerHTML;
          }
        },
        {
          name: 'articleAuctionState',
          data: 'articleAuctionState',
          searchable: false,
          orderable: false,
          defaultContent: ''
        },
        {
          name: 'articleGroup',
          data: 'articleGroup',
          width: '80px',
          searchable: true,
          orderable: false, // this should ideally be false, but then the ordering is messed up
          defaultContent: $.fn.DataTable.RowGroup.defaults.emptyDataGroup,
          render: ArticlesTable.renderArticleGroup
        },
        {
          name: 'articleMaxBid',
          data: 'articleMaxBid',
          searchable: false,
          orderable: false,
          render: ArticlesTable.renderArticleMaxBid,
          defaultContent: 0
        },
        {
          name: 'articleButtons',
          data: 'articleButtons',
          width: '50px',
          defaultContent: '',
          searchable: false,
          orderable: false,
          render: ArticlesTable.renderArticleButtons,
        }
      ],
      columnDefs: [
        {type: "num", targets: [1, 4]},
        {className: "dt-body-center dt-body-nowrap", targets: [0, 1, 7, 8, 9]},
        {width: "100px", targets: [4, 5, 8]},
        {width: "220px", targets: [3]},
        {width: "300px", targets: [2, 6]},
        {type: "natural", targets: [7] }
      ],
      searchDelay: 400,
      rowId: 'articleId',
      pageLength: 25,
      responsive: {details: false},
      ordering: true,
      order: [[3, 'asc']],
      orderFixed: {
        pre: [7, 'asc']
      },
      orderMulti: false,
      rowGroup: {
        className: 'row-group',
        dataSrc: 'articleGroup',
        emptyDataGroup: $.fn.DataTable.RowGroup.defaults.emptyDataGroup,
        startRender: ArticlesTable.renderGroups,
        endRender: null
      },
      dom: '<l<t>ip>',
      stateSave: false,
      language: ArticlesTable.getDatatableTranslation('de_DE')
    });
  }

  /*
   * Open Article Tabs for bidding:
   * - abort if autoBid is disabled
   * - for all tabs in the table
   *   - skip if articleEndTime not defined (sofortkauf)
   *   - skip if articleEndTime in past or after 60 seconds
   *   - skip if group autoBid is disabled
   *   - if tab is open just reload it
   *   - open tab
   * The function will schedule itself to be executed every 30s
   */
  async openArticleTabsForBidding() {
    try {
      // window autoBid enabled?
      if (AutoBid.getLocalState().autoBidEnabled) {
        //console.debug("Biet-O-Matic: openArticleTabsForBidding() called");
        this.DataTable.rows().every(async function (rowIdx, tableLoop, rowLoop) {
          const article = this.data();
          // update date column for closed tab (open tabs will be handled by ebayArticleRefresh event)
          ArticlesTable.redrawArticleDate(article.articleId);
          if (!article.hasOwnProperty('articleEndTime')) {
            console.debug("Biet-O-Matic: openArticleTabsForBidding() Skip article %s, no endTime", article.articleId);
            return;
          }
          const timeLeftSeconds = (article.articleEndTime - Date.now()) / 1000;

          // skip if articleEndTime is in the past
          if (timeLeftSeconds < 0 || timeLeftSeconds > 90) {
            //console.debug("Biet-O-Matic: openArticleTabsForBidding() Skip article %s, not ending within 90s: %ss",
            //  article.articleId, timeLeftSeconds);
            return;
          }

          // get group autoBid state
          let groupAutoBid = await Group.getState(article.articleGroup)
            .catch(e => console.warn(`Biet-O-Matic: openArticleTabsForBidding() Failed to get Group state! ${e.message}`));
          if (groupAutoBid === true) {
            let shouldOpenTab = true;
            // skip if tab already opened
            if (article.tabOpenedForBidding) {
              console.debug("Biet-O-Matic: openArticleTabsForBidding() Skipping, article %s is already open", article.articleId);
              return;
            }
            // check and skip if tab has autoBid disabled
            if (article.articleAutoBid === false) {
              shouldOpenTab = false;
            } else if (article.hasOwnProperty('tabId') && article.tabId != null && typeof article.tabId !== 'undefined') {
              shouldOpenTab = false;
              // reload a tab if auction ends within 30..90 seconds - the reloadTab will rateLimit it self to 1 per 60s
              if (timeLeftSeconds > 30) {
                const reloaded = await ArticlesTable.reloadTab(article.tabId).catch(e => {
                  console.log("Biet-O-Matic: openArticleTabsForBidding() reloadTab failed: %s", e.message);
                });
                if (reloaded) {
                  console.debug("Biet-O-Matic: openArticleTabsForBidding() Article %s tab %s has been reloaded for bidding.",
                    article.articleId, article.tabId);
                }
              }
            }
            // schedule to open tab, if not already scheduled
            if (shouldOpenTab) {
              // set timer to open tab 60 seconds before auction ends
              const wakeUpInMs = (article.articleEndTime - Date.now()) - 60000;
              if (wakeUpInMs > 0) {
                console.debug("Biet-O-Matic: openArticleTabsForBiddingAsync() Article %s - Opening tab via wakeUp timer: %sms",
                  article.articleId, wakeUpInMs);
                setTimeout(() => {
                  article.openTab(true)
                    .catch(e => {
                      console.warn(`Biet-O-Matic: openArticleTabsForBidding() Unable to open tab for article ${article.articleId} for bidding: ${e.message}`);
                    });
                }, wakeUpInMs, true);
              } else {
                console.debug("Biet-O-Matic: openArticleTabsForBiddingAsync() Article %s Opening tab now",
                  article.articleId, wakeUpInMs);
                await article.openTab(true)
                  .catch(e => {
                    console.warn(`Biet-O-Matic: openArticleTabsForBidding() Unable to open tab for article ${article.articleId} for bidding: ${e.message}`);
                  });
              }
            } else {
              console.debug("Biet-O-Matic: openArticleTabsForBiddingAsync() Article %s - should not open tab (already open=%d)",
                article.articleId, article.tabId);
            }
          } else {
            // group autoBid is disabled, do not open tab
            console.debug("Biet-O-Matic: openArticleTabsForBidding() Skip article %s, Group '%s' autoBid is disabled",
              article.articleId, article.articleGroup);
          }
        });
      } else {
        //console.debug("Biet-O-Matic: openArticleTabsForBidding() skipping run - Window autoBid disabled.");
      }
    } catch (e) {
      console.warn(`Biet-O-Matic: openArticleTabsForBidding() Internal Error: ${e.message}`);
    } finally {
      setTimeout(() => {
        this.openArticleTabsForBidding();
      }, 30000);
    }
  }

  // add open article tabs to the table
  async addArticlesFromTabs() {
    // update browserAction Icon for all of this window Ebay Tabs (Chrome does not support windowId param)
    let tabs = await browser.tabs.query({
      currentWindow: true,
      url: ['*://*.ebay.de/itm/*', '*://*.ebay.com/itm/*']
    }).catch(e => {
      console.warn("Biet-O-Matic: Failed to add articles from tabs: %s", e.message);
    });
    for (let tab of tabs) {
      const myTab = tab;
      const at = ArticlesTable;
      let articleInfo = await Article.getInfoFromTab(myTab).catch(e => {
        console.warn(`Biet-O-Matic: addFromTabs() Failed to get Article Info from Tab ${myTab.id}: ${e.message}`);
        /*
         * The script injection failed, this can have multiple reasons:
         * - the contentScript threw an error because the page is not a article
         * - the contentScript threw an error because the article is a duplicate tab
         * - the browser extension reinitialized / updated and the tab cannot send us messages anymore
         * Therefore we perform a tab reload once, which should recover the latter case
         */
        at.reloadTab(myTab.id).then(() => {
          console.debug("Biet-O-Matic: Tab %d reloaded to attempt repairing contentScript", myTab.id);
        }).catch(e => {
          console.log("Biet-O-Matic: addArticlesFromTabs() reloadTab(%s) failed:%s", myTab.id, e.message);
        });
      });
      if (typeof articleInfo !== 'undefined' && articleInfo.hasOwnProperty('detail')) {
        let article = new Article(this.popup, articleInfo.detail, myTab);
        article.init().then(a => {
          this.addArticle(a);
        });
      } else {
        console.warn("Biet-O-Matic: addArticlesFromTabs() Failed to add articleInfo for tab %d, " +
          "received info missing or incomplete", myTab.id);
      }
    }
  }

  // add articles which are in storage
  async addArticlesFromStorage() {
    let storedInfo = await browser.storage.sync.get(null);
    Object.keys(storedInfo).forEach(articleId => {
      if (!/^[0-9]+$/.test(articleId)) {
        console.log("Biet-O-Matic: Skipping invalid stored articleId=%s", articleId);
        return;
      }
      let info = storedInfo[articleId];
      info.articleId = articleId;
      //console.debug("Biet-O-Matic: addArticlesFromStorage(%s) info=%s", articleId, JSON.stringify(info));
      // add article if not already in table
      if (this.getRow(`#${articleId}`).length < 1) {
        let article = new Article(this.popup, info);
        article.init().then(a => {
          this.addArticle(a);
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
    const tfoot = $('#articles tfoot');
    const tr = document.createElement('tr');
    $('#articles thead th').each(function () {
      const th = document.createElement('th');
      if (this.cellIndex === 1 || this.cellIndex === 2 || this.cellIndex === 7) {
        const title = $(this).text();
        const input = document.createElement('input');
        input.id = 'colsearch';
        input.type = 'text';
        input.placeholder = `Suche ${title}`;
        input.style.textAlign = 'center';
        th.appendChild(input);
      }
      tr.appendChild(th);
    });
    tfoot.append(tr);

    // throttle search
    const searchColumn = $.fn.dataTable.util.throttle(
      (colidx, val) => {
        if (val == null || typeof val === 'undefined')
          return;
        let col = this.DataTable.column(colidx);
        col.search(val).draw(false);
      },
      100
    );

    // Apply the search
    $('#articles tfoot input').on('keyup change', e => {
      let column = this.DataTable.column(e.target.parentNode.cellIndex);
      if (typeof column === 'undefined' || column.length !== 1)
        return;
      searchColumn(column.index(), e.target.value);
    });
  }

  // add an article to the table and return the row or null if failed
  addArticle(article) {
    console.log("Biet-O-Matic addArticle(%s) called.", article.articleId);
    if (article instanceof Article) {
      let row = this.DataTable.row.add(article);
      this.DataTable.draw(false);
      return row;
    } else {
      console.warn("Biet-O-Matic: Adding article failed; incorrect type: %O", article);
      return null;
    }
  }

  /*
   * update article with fresh information
   * - if row is null, it will be determined by articleId
   */
  updateArticle(articleInfo, row = null) {
    if (row == null)
      row = this.getRow(`#${articleInfo.articleId}`);
    if (row == null || row.length !== 1) return;
    const article = row.data();
    console.debug("Biet-O-Matic: updateArticle(%s) info=%O", articleInfo.articleId, articleInfo);
    // sanity check if the info + row match
    if (article.articleId !== articleInfo.articleId) {
      throw new Error("updateArticle() ArticleInfo and Row do not match!");
    }
    const modifiedInfo = article.updateInfo(articleInfo);
    if (modifiedInfo.modifiedForStorage > 0 || modifiedInfo.modifiedForDisplay > 0) {
      row.invalidate('data').draw(false);
      // update info in storage, if there is any, do not inform the articleTab
      if (modifiedInfo.modifiedForStorage > 0) {
        article.updateInfoInStorage(articleInfo, null, true)
          .catch(e => {
            console.log("Biet-O-Matic: updateArticle(%s) Failed to update storage: %s", article.articleId, e.message);
          });
      }
    }
    //this.highlightArticleIfExpired(row);
  }

  // update articleStatus column with given message
  updateArticleStatus(articleId, message) {
    const row = this.getRow(`#${articleId}`);
    if (row == null || row.length !== 1) {
      console.log("updateArticleStatus() Cannot determine row from articleId %s", articleId);
      return;
    }
    let statusCell = this.DataTable.cell(`#${articleId}`, 'articleAuctionState:name');
    row.data().articleAuctionState = message;
    statusCell.invalidate('data').draw(false);
  }

  /*
 * Updates the maxBid input and autoBid checkbox for a given row
 * Note: the articleInfo keys are the short keys (maxBid, autoBid) as the info comes from contentScript
 * Also performs row redraw to show the updated data.
 */
  updateRowMaxBid(articleInfo = {}, row = null) {
    if (row == null && articleInfo.hasOwnProperty('articleId'))
      row = this.getRow(`#${articleInfo.articleId}`);
    if (row == null || row.length !== 1) return;
    const data = row.data();
    //console.debug('Biet-O-Matic: updateRowMaxBid(%s) info=%s', data.articleId, JSON.stringify(articleInfo));
    // minBid
    if (articleInfo.hasOwnProperty('minBid')) {
      data.articleMinimumBid = articleInfo.minBid;
    }
    // maxBid
    if (articleInfo.hasOwnProperty('maxBid')) {
      if (articleInfo.maxBid == null || Number.isNaN(articleInfo.maxBid)) {
        data.articleMaxBid = 0;
      } else {
        data.articleMaxBid = articleInfo.maxBid;
      }
    }
    // autoBid
    if (articleInfo.hasOwnProperty('autoBid')) {
      if (articleInfo.autoBid != null) {
        data.articleAutoBid = articleInfo.autoBid;
      }
    }
    // invalidate data, redraw
    // todo selective redraw for parts of the row ?
    row.invalidate('data').draw(false);
  }

  /*
    Add or Update Article in Table
    - if articleId not in table, add it
    - if in table, update the entry
    - also check if same tab has been reused
  */
  addOrUpdateArticle(articleInfo, tab = null, updatedFromRemote = false) {
    if (!articleInfo.hasOwnProperty('articleId'))
      return;
    let tabId = null;
    if (tab != null) tabId = tab.id;
    let articleId = articleInfo.articleId;
    console.debug('Biet-O-Matic: addOrUpdateArticle(%s) tab=%O, info=%O', articleId, tab, articleInfo);
    // check if tab articleId changed
    const oldArticleId = this.getArticleIdByTabId(tabId);
    if (oldArticleId != null && oldArticleId !== articleInfo.articleId) {
      // remove article from the table, or unset at least the tabId
      this.removeArticleIfBoring(tabId);
    }

    // article already in table?
    const rowByArticleId = this.getRow(`#${articleId}`);
    // check if article is already open in another tab
    if (tab != null && rowByArticleId.length !== 0 && typeof rowByArticleId !== 'undefined') {
      if (rowByArticleId.data().tabId != null && rowByArticleId.data().tabId !== tabId) {
        throw new Error(`Article ${articleId} is already open in another tab (${rowByArticleId.data().tabId})!`);
      } else if (rowByArticleId.data().tabId == null) {
        rowByArticleId.data().tabId = tab.id;
      }
    }
    if (rowByArticleId.length === 0) {
      // article not in table - simply add it
      let article = new Article(this.popup, articleInfo, tab);
      article.init().then(a => {
        this.addArticle(a);
      });
    } else {
      // article in table - update it
      this.updateArticle(articleInfo, rowByArticleId);
      // send update to article tab (update maxBid, autoBid)
      if (updatedFromRemote && articleInfo.hasOwnProperty('articleMaxBid') && articleInfo.hasOwnProperty('articleAutoBid')) {
        const row = this.getRow(`#${articleInfo.articleId}`);
        if (row.data().hasOwnProperty('tabId') && row.data().tabId != null) {
          let tabId = row.data().tabId;
          browser.tabs.sendMessage(tabId, {
            action: 'UpdateArticleMaxBid',
            detail: {articleMaxBid: articleInfo.articleMaxBid, articleAutoBid: articleInfo.articleAutoBid}
          }).catch(e => {
            console.log("Biet-O-Matic: addOrUpdateArticle() Sending UpdateArticleMaxBid to tab %s failed: %s",
              tabId, e.message);
          });
        }
      }
    }
  }

  /*
   * remove an closed article from the table if its uninteresting. Will be called if a tab is closed/changed
   * An article is regarded uninteresting if no maxBid/group defined yet
   */
  removeArticleIfBoring(tabId) {
    // find articleId by tabId
    const articleId = this.getArticleIdByTabId(tabId);
    if (articleId == null) return;
    const row = this.DataTable.row(`#${articleId}`);
    const article = row.data();
    if (article == null) return;
    article.tabId = null;
    // retrieve article info from storage (maxBid)
    article.getInfoFromStorage()
      .then(storageInfo => {
        if (storageInfo != null && storageInfo.hasOwnProperty('articleMaxBid') &&
          (storageInfo.articleMaxBid != null || storageInfo.articleGroup != null)) {
          // redraw, tabid has been updated
          console.debug("Biet-O-Matic: removeArticleIfBoring(tab=%d), keeping article %s.", tabId, articleId);
          row.invalidate('data').draw(false);
        } else {
          console.debug("Biet-O-Matic: removeArticleIfBoring(tab=%d), removed article %s.", tabId, articleId);
          // remove from table (recheck if the row still exists)
          const rowFresh = this.DataTable.row(`#${articleId}`);
          rowFresh.remove().draw(false);
        }
      });
  }

  /*
   * datatable: render column articleMaxBid
   * - input:number for maxBid
   * - label for autoBid and in it:
   * - input:checkbox for autoBid
   */
  static renderArticleMaxBid(data, type, row) {
    if (type !== 'display' && type !== 'filter') return data;
    //console.log("renderArticleMaxBid(%s) data=%O, type=%O, row=%O", row.articleId, data, type, row);
    if (!row.hasOwnProperty('articleBidPrice') && data == null)
      return 'Sofortkauf';
    let autoBid = false;
    let closedArticle = false;
    if (row.hasOwnProperty('articleAutoBid')) {
      autoBid = row.articleAutoBid;
    } else if (row.hasOwnProperty('autoBid')) {
      autoBid = row.autoBid;
      closedArticle = true;
    }
    let maxBid = 0;
    if (data != null) maxBid = data;
    const divArticleMaxBid = document.createElement('div');
    const inpMaxBid = document.createElement('input');
    inpMaxBid.id = 'inpMaxBid_' + row.articleId;
    inpMaxBid.type = 'number';
    inpMaxBid.min = '0';
    inpMaxBid.step = '0.01';
    inpMaxBid.defaultValue = Number.isNaN(maxBid) ? '' : maxBid.toString(10);
    inpMaxBid.style.width = "60px";
    const labelAutoBid = document.createElement('label');
    const chkAutoBid = document.createElement('input');
    chkAutoBid.id = 'chkAutoBid_' + row.articleId;
    chkAutoBid.title = 'Aktiviert Automatisches Bieten für diesen Artikel';
    chkAutoBid.classList.add('ui-button');
    chkAutoBid.type = 'checkbox';
    chkAutoBid.defaultChecked = autoBid;
    chkAutoBid.style.width = '15px';
    chkAutoBid.style.height = '15px';
    chkAutoBid.style.verticalAlign = 'middle';
    labelAutoBid.appendChild(chkAutoBid);
    const spanAutoBid = document.createElement('span');
    spanAutoBid.textContent = 'Aktiv';
    labelAutoBid.appendChild(spanAutoBid);

    if (closedArticle === true) {
      labelAutoBid.classList.add('ui-state-disabled');
      inpMaxBid.disabled = true;
      chkAutoBid.disabled = true;
    } else {
      // maxBid was entered, check if the autoBid field can be enabled
      if (row.activateAutoBid()) {
        chkAutoBid.disabled = false;
      } else {
        labelAutoBid.classList.add('ui-state-disabled');
        chkAutoBid.disabled = true;
      }
      // set tooltip for button to minBidValue
      // if the maxBid is < minimum bidding price or current Price, add highlight color
      if ((row.articleEndTime - Date.now() > 0) && chkAutoBid.disabled) {
        inpMaxBid.classList.add('bomHighlightBorder');
        inpMaxBid.title = `Geben sie minimal ${row.articleMinimumBid} ein`;
      } else {
        inpMaxBid.classList.remove('bomHighlightBorder');
        inpMaxBid.title = "Minimale Erhöhung erreicht";
      }

      // disable maxBid/autoBid if article ended
      if (row.articleEndTime - Date.now() <= 0) {
        //console.debug("Biet-O-Matic: Article %s already ended, disabling inputs", row.articleId);
        labelAutoBid.classList.add('ui-state-disabled');
        inpMaxBid.disabled = true;
        chkAutoBid.disabled = true;
      }
    }

    divArticleMaxBid.appendChild(inpMaxBid);
    divArticleMaxBid.appendChild(labelAutoBid);
    return divArticleMaxBid.outerHTML;
  }

  // render row groups
  static renderGroups(rows, groupName) {
    let td = document.createElement('td');
    td.colSpan = rows.columns()[0].length;
    let div = document.createElement('div');
    let i = document.createElement('i');
    i.classList.add('fas', 'fa-shopping-cart', 'fa-fw');
    i.style.fontSize = '1.2em';
    i.style.paddingTop = '0.5em';
    let span = document.createElement('span');
    span.textContent = `${groupName} (${rows.count()})`;
    span.style.fontSize = '1.2em';
    span.style.fontWeight = 'normal';
    td.appendChild(i);
    td.appendChild(span);

    let spanGroupAutoBid = document.createElement('span');
    spanGroupAutoBid.id = 'spanGroupAutoBid';
    spanGroupAutoBid.classList.add('ui-button');
    spanGroupAutoBid.setAttribute('name', groupName);
    spanGroupAutoBid.textContent = "Automatikmodus";
    spanGroupAutoBid.style.float = 'right';
    // renderState can take up to 500ms
    Group.renderState('spanGroupAutoBid', groupName);
    td.appendChild(spanGroupAutoBid);
    // append data-name to tr
    return $('<tr/>')
      .append(td)
      .attr('data-name', groupName);
  }

  static renderArticleGroup(data, type, row) {
    if (type !== 'display') {
      return data;
    }
    //console.debug("Biet-O-Matic: renderArticleGroup(%s) data=%s, type=%O, row=%O", row.articleId, data, type, row);
    let div = document.createElement('div');

    const inpGroup = document.createElement('input');
    inpGroup.id = 'inpGroup_' + row.articleId;
    inpGroup.type = 'text';
    inpGroup.setAttribute('list', 'groups');
    inpGroup.setAttribute('maxlength', '32');
    inpGroup.multiple = false;
    inpGroup.style.width = "60px";
    inpGroup.placeholder = 'Gruppe';
    if (data != null && typeof data !== 'undefined')
      inpGroup.defaultValue = data;

    const listGroup = document.createElement('datalist');
    listGroup.id = 'groups';
    Object.keys(Popup.cachedGroups).forEach(group => {
      const option = document.createElement('option');
      option.value = group;
      listGroup.appendChild(option);
    });
    div.appendChild(inpGroup);
    div.appendChild(listGroup);
    return div.outerHTML;
  }

  static renderArticleLog(article) {
    if (article == null || !article.hasOwnProperty('articleId')) return "";
    let div = document.createElement('div');
    // <div style="width:320px; height:80px; overflow:auto;">
    div.style.height = '200px';
    div.style.overflow = 'auto';
    //div.style.width = '99%';

    let table = document.createElement('table');
    table.style.paddingLeft = '50px';
    // get log entries
    let log = article.getLog();
    if (log == null) return "";
    if (log.length < 5) div.style.height = null;
    // iterate log array in reverse order (newest first)
    log.slice().reverse().forEach(e => {
      let tr = document.createElement('tr');
      tr.style.width = '100%';
      let tdDate = document.createElement('td');
      tdDate.style.width = '10%';
      // first column: date
      if (e.hasOwnProperty('timestamp'))
        tdDate.textContent = format(e.timestamp, 'PPpp', {locale: de});
      else
        tdDate.textContent = '?';
      tr.append(tdDate);
      // second column: component
      let tdComp = document.createElement('td');
      if (e.hasOwnProperty('component'))
        tdComp.textContent = e.component;
      else
        tdComp.textContent = '?';
      tr.append(tdComp);
      // third column: level
      let tdLevel = document.createElement('td');
      if (e.hasOwnProperty('level'))
        tdLevel.textContent = e.level;
      else
        tdLevel.textContent = '?';
      tr.append(tdLevel);
      // fourth column: message
      let tdMsg = document.createElement('td');
      if (e.hasOwnProperty('message'))
        tdMsg.textContent = e.message;
      else
        tdMsg.textContent = 'n/a';
      tr.append(tdMsg);
      table.appendChild(tr);
    });
    div.appendChild(table);
    return div.outerHTML;
  }

  /*
   * Render Article Bid Price
   * - when articleBidPrice is empty, use articleBuyPrice (Sofortkauf)
   * - include number of bids
   */
  static renderArticleBidPrice(data, type, row) {
    if (type !== 'display' && type !== 'filter') return data;
    let price;
    price = row.getPrettyBidPrice();
    if (row.hasOwnProperty('articleBidCount'))
      price = `${price} (${row.articleBidCount})`;
    return price;
  }

  /*
   * Render Article Buttons:
   * open/close: indicate if the article tab is open/closed
   * delete: remove the article info from storage
   */
  static renderArticleButtons(data, type, row) {
    if (type !== 'display' && type !== 'filter') return data;
    //console.log("renderArticleButtons(%s) data=%O, type=%O, row=%O", row.articleId, data, type, row);

    let div = document.createElement('div');
    div.id = 'articleButtons';

    // tab status
    let spanTabStatus = document.createElement('span');
    spanTabStatus.id = 'tabStatus';
    spanTabStatus.classList.add('button-zoom', 'far', 'fa-lg');
    spanTabStatus.style.opacity = '0.6';
    if (row.tabId == null) {
      spanTabStatus.classList.add('fa-folder');
      spanTabStatus.title = 'Öffnet den Artikel in Neuem Tab';
    } else {
      spanTabStatus.classList.add('fa-folder-open');
      spanTabStatus.title = 'Schließt den Artikel Tab';
    }

    // article remove
    let spanArticleRemove = document.createElement('span');
    spanArticleRemove.id = 'articleRemove';
    spanArticleRemove.title = 'Entfernt Artikel Ereignisse und Einstellungen';
    spanArticleRemove.classList.add('button-zoom', 'warning-hover', 'far', 'fa-trash-alt', 'fa-lg');
    spanArticleRemove.style.marginLeft = '20px';
    spanArticleRemove.style.opacity = '0.6';
    // if there is currently no data to remove, then disable the button
    if (row.getLog() == null && row.articleMaxBid == null && row.articleGroup == null) {
      spanArticleRemove.classList.remove('button-zoom', 'warning-hover');
      spanArticleRemove.style.opacity = '0.05';
    }
    div.appendChild(spanTabStatus);
    div.appendChild(spanArticleRemove);
    return div.outerHTML;
  }

  /*
   * Render the article details toggle
   * show '+' if logs are present and currently hidden
   * show '-' if logs are present and currently visible
   * empty if no logs are present
   */
  static renderArticleDetailsControl(data, type, row) {
    if (type !== 'display' && type !== 'filter') return '';
    // check if there are logs, then show plus if the log view is closed, else minus
    if (row.getLog() != null) {
      let span = document.createElement('span');
      span.setAttribute('aria-hidden', 'true');
      span.style.opacity = '0.6';
      span.classList.add('button-zoom', 'fas');
      if (row.articleDetailsShown) {
        span.classList.add('fa-minus');
        span.title = 'Verbirgt Artikel Ereignisse';
      } else {
        span.classList.add('fa-plus');
        span.title = 'Zeigt Artikel Ereignisse an';
      }
      return span.outerHTML;
    } else
      return '';
  }

  static renderArticleEndTime(data, type, row) {
    if (type !== 'display') {
      //console.log("renderArticleEndTime returning data=%s (type=%s)", data, type);
      return data;
    }
    let span = document.createElement('span');
    span.textContent = 'unbegrenzt';
    if (typeof data !== 'undefined') {
      const timeLeft = formatDistanceToNow(data, {includeSeconds: true, locale: de, addSuffix: true});
      const date = new Intl.DateTimeFormat('default', {'dateStyle': 'medium', 'timeStyle': 'medium'}).format(new Date(data));
      span.textContent = `${date} (${timeLeft})`;
      if (data - Date.now() < 0) {
        // ended
        span.classList.add('auctionEnded');
        span.title = 'Artikel Auktion bereits beendet';
      } else if (data - Date.now() < 60*1000) {
        // ends within 1 minute
        span.classList.add('auctionEndsVerySoon');
        span.title = 'Artikel Auktion endet in weniger als einer Minute';
      } else if (data - Date.now() < 600*1000) {
        // ends within 10 minutes
        span.classList.add('auctionEndsSoon');
        span.title = 'Artikel Auktion endet bald';
      }
    }
    return span.outerHTML;
  }

  /*
   * Remove information for article
   * - log from window.localStorage
   * - settings from browser sync storage
   */
  removeArticle(rowNode) {
    try {
      if (typeof rowNode === 'undefined' || rowNode.length !== 1)
        return;
      const row = this.DataTable.row(rowNode);
      if (typeof row === 'undefined' || row.length !== 1)
        return;
      const article = row.data();
      article.removeAllLogs();
      row.child(false);
      article.removeInfoFromStorage()
        .then(() => {
          row.invalidate('data').draw(false);
        })
        .catch(e => {
          console.log("Biet-O-Matic: removeArticle(%s) removeInfoFromStorage failed: %s", article.articleId, e.message);
        });
    } catch (e) {
      console.log("Biet-O-Matic: removeArticle(%s) failed: %s", rowNode, e.message);
    }
  }

  // remove an article from the table
  removeArticleFromTable(articleId) {
    if (articleId == null) return;
    const row = this.DataTable.row(`#${articleId}`);
    const article = row.data();
    if (typeof row === 'undefined' || row.length === 0) return;
    // remove from table
    try {
      // also close eventually open tab
      if (article != null && typeof article !== 'undefined' && article.hasOwnProperty('tabId') && article.tabId != null)
        article.closeTab(false, false);
      row.remove().draw(false);
    } catch (e) {
      console.info("Biet-O-Matic: removeArticleFromTable(%s) failed: %s", e.message);
    }
  }

  /*
   * toggle article tab:
   * - if closed open the article in a new tab, else
   * - close the tab
   */
  toggleArticleTab(rowNode) {
    if (typeof rowNode === 'undefined' || rowNode.length !== 1)
      return;
    const row = this.DataTable.row(rowNode);
    if (typeof row === 'undefined' || row.length !== 1)
      return;
    const article = row.data();
    if (article.tabId == null) {
      console.debug("Biet-O-Matic: toggleArticleTab(%s) Opening", article.articleId);
      browser.tabs.create({
        url: 'https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=' + article.articleId  + '&orig_cvip=true',
        active: false,
        openerTabId: this.popup.tabId
      }).then(tab => {
        article.tabId = tab.id;
        row.invalidate('data').draw(false);
      });
    } else {
      console.debug("Biet-O-Matic: toggleArticleTab(%s) Closing tab %d", article.articleId, article.tabId);
      browser.tabs.remove(article.tabId).then(() => {
        article.tabId = null;
        row.invalidate('data').draw(false);
      });
    }
  }

  // translation data for Datatable
  static getDatatableTranslation(language = 'de_DE') {
    //"url": "https://cdn.datatables.net/plug-ins/1.10.20/i18n/German.json"
    const languages = {};
    languages.de_DE =
      {
        "sEmptyTable": "Keine Daten in der Tabelle vorhanden",
        "sInfo": "_START_ bis _END_ von _TOTAL_ Einträgen",
        "sInfoEmpty": "Keine Daten vorhanden",
        "sInfoFiltered": "(gefiltert von _MAX_ Einträgen)",
        "sInfoPostFix": "",
        "sInfoThousands": ".",
        "sLengthMenu": "_MENU_ Einträge anzeigen",
        "sLoadingRecords": "Wird geladen ..",
        "sProcessing": "Bitte warten ..",
        "sSearch": "Suchen",
        "sZeroRecords": "Keine Einträge vorhanden",
        "oPaginate": {
          "sFirst": "Erste",
          "sPrevious": "Zurück",
          "sNext": "Nächste",
          "sLast": "Letzte"
        },
        "oAria": {
          "sSortAscending": ": aktivieren, um Spalte aufsteigend zu sortieren",
          "sSortDescending": ": aktivieren, um Spalte absteigend zu sortieren"
        },
        "select": {
          "rows": {
            "_": "%d Zeilen ausgewählt",
            "0": "",
            "1": "1 Zeile ausgewählt"
          }
        },
        "buttons": {
          "print": "Drucken",
          "colvis": "Spalten",
          "copy": "Kopieren",
          "copyTitle": "In Zwischenablage kopieren",
          "copyKeys": "Taste <i>ctrl</i> oder <i>\u2318</i> + <i>C</i> um Tabelle<br>in Zwischenspeicher zu kopieren.<br><br>Um abzubrechen die Nachricht anklicken oder Escape drücken.",
          "copySuccess": {
            "_": "%d Zeilen kopiert",
            "1": "1 Zeile kopiert"
          },
          "pageLength": {
            "-1": "Zeige alle Zeilen",
            "_": "Zeige %d Zeilen"
          },
          "decimal": ","
        }
      };
    return languages[language];
  }

  static checkTabIsOpen(tabId) {

  }

  /* reload a tab
   * check if a reload has been recently performed and only reload if > 60 seconds ago
   */
  static async reloadTab(tabId = null) {
    if (tabId == null) return;
    if (Popup.checkRateLimit('reloadTab', tabId, 60*1000)) {
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
    this.DataTable.rows().data().each((article, index) => {
      //console.log("getRowIdxByTabId(%d) index=%d, tabid=%d", tabId, index, article.tabId);
      if (article.tabId === tabId) articleId = article.articleId;
    });
    return articleId;
  }

  // limit to once a minute
  static redrawArticleDate(articleId) {
    if (Popup.checkRateLimit('redrawArticleDate', articleId, 60*1000)) {
      return;
    }
    // redraw date (COLUMN 3)
    let dateCell = $('#articles').DataTable().cell(`#${articleId}`, 'articleEndTime:name');
    // redraw date
    if (dateCell !== 'undefined' && dateCell.length === 1) {
      dateCell.invalidate('data').draw(false);
    }
  }

  /*
   * Events for the Articles Table:
   * - ebayArticleUpdated: from content script with info about article
   * - ebayArticleMaxBidUpdated: from content script to update maxBid info
   * - ebayArticleRefresh: from content script, simple info to refresh the row (update remaining time)
   * - getArticleInfo: return article info from row
   * - getArticleSyncInfo: return article info from sync storage
   * - ebayArticleSetAuctionEndState: from content script to update the Auction State with given info
   * - ebayArticleGetAdjustedBidTime: returns adjusted bidding time for a given articleId (see below for details)
   * - getAutoBidState: returns the state of window and group autoBid for the given articleId
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
        case 'ebayArticleUpdated':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event ebayArticleUpdated received from tab %s, articleId=%s, articleDescription=%s",
                sender.tab.id, request.detail.articleId, request.detail.articleDescription);
              this.updateArticle(request.detail, null);
              return Promise.resolve(true);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.ebayArticleUpdated internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'ebayArticleMaxBidUpdated':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event ebayArticleMaxBidUpdate received from tab %s, detail=%s",
                sender.tab.id, JSON.stringify(request));
              let articleId;
              if (!request.hasOwnProperty('articleId') || typeof request.articleId === 'undefined')
                articleId = this.getArticleIdByTabId(sender.tab.id);
              else
                articleId = request.articleId;
              const row = this.getRow(`#${articleId}`);
              const article = row.data();
              if (row.length === 1)
                this.updateRowMaxBid(request.detail, row);
              if (typeof article !== 'undefined') {
                article.updateInfoInStorage(request.detail, null).then();
              } else {
                console.warn(`Biet-O-Matic: Browser Event ebayArticleMaxBidUpdate for tab ${sender.tab.id} failed, article ${request.articleId} could not be determined`);
              }
              return Promise.resolve(true);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.ebayArticleMaxBidUpdated internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'ebayArticleRefresh':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event ebayArticleRefresh(%s) received from tab %s",
                request.articleId, sender.tab.id);
              // determine row by articleId
              if (request.hasOwnProperty('articleId')) {
                const row = this.getRow(`#${request.articleId}`);
                const article = row.data();
                if (typeof article === 'undefined') {
                  console.log("Biet-O-Matic: Event ebayArticleRefresh() aborted: article not found in table row=%O, article=%O", row, article);
                  return Promise.reject(`Specified article ${request.articleId} not found in table`);
                }
                if (article.tabId !== sender.tab.id) {
                  console.log("Biet-O-Matic: ebayArticleRefresh() Article %s - Found tabId mismatch %s -> %s",
                      request.articleId, article.tabId, sender.tab.id);
                }
                article.tabRefreshed = Date.now();
                ArticlesTable.redrawArticleDate(request.articleId);
              }
              return Promise.resolve(true);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.ebayArticleRefresh internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'getArticleInfo':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event getArticleInfo(%s) received from tab %s",
                request.articleId, sender.tab.id);
              if (request.hasOwnProperty('articleId')) {
                // determine row by articleId
                const row = this.getRow(`#${request.articleId}`);
                const article = row.data();
                return Promise.resolve({
                  data: Article.getInfoForTab(article),
                  tabId: sender.tab.id
                });
              } else {
                return Promise.reject("ArticleId missing in request data.");
              }
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.getArticleInfo internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'getArticleSyncInfo':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event getArticleSyncInfo received from tab %s, article=%s",
                sender.tab.id, request.articleId);
              if (request.hasOwnProperty('articleId')) {
                return Promise.resolve(browser.storage.sync.get(request.articleId));
              } else {
                return Promise.reject("ArticleId missing in request data.");
              }
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.getArticleSyncInfo internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'getAutoBidState':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              let articleId;
              if (request.hasOwnProperty('articleId'))
                articleId = request.articleId;
              else
                articleId = this.getArticleIdByTabId(sender.tab.id);
              console.debug("Biet-O-Matic: Browser Event getAutoBidState received from tab %s, article=%s",
                sender.tab.id, articleId);
              const row = this.getRow(`#${articleId}`);
              const article = row.data();
              return Promise.resolve(article.getAutoBidState());
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.getAutoBidState internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'addArticleLog':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event addArticleLog received from tab %s, detail=%s",
                sender.tab.id, JSON.stringify(request.detail));
              const article = this.getRow(`#${request.articleId}`).data();
              // redraw status (COLUMN 6)
              if (request.detail.message.level !== "Performance") {
                this.updateArticleStatus(request.articleId, request.detail.message.message);
              }
              if (article != null)
                article.addLog(request.detail.message);
              return Promise.resolve(true);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: Event.addArticleLog internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'ebayArticleSetAuctionEndState':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              let articleId;
              if (!request.hasOwnProperty('articleId') || request.articleId === 'undefined')
                articleId = this.getArticleIdByTabId(sender.tab.id);
              else
                articleId = request.articleId;
              const row = this.getRow(`#${request.articleId}`);
              const article = row.data();
              console.debug("Biet-O-Matic: Browser Event ebayArticleSetAuctionEndState received: sender=%O, state=%s",
                sender, request.detail.auctionEndState);
              article.handleAuctionEnded(request.detail)
                .then(() => {
                  this.updateArticle(request.detail, null);
                  return Promise.resolve(true);
                })
                .catch(e => {
                  console.log("Biet-O-Matic: Event ebayArticleSetAuctionEndState failed due to handleAuctionEnded: %s", e.message);
                  return Promise.reject(`Popup handleAuctionEnded failed: ${e.message}`);
                });
            }
          } catch (e) {
            console.warn(`Biet-O-Matic: Event.ebayArticleSetAuctionEndState failed: ${e.message}`);
            throw new Error(e.message);
          }
          break;
        /*
         * If two article end at the same time (+/- 1 seconds), then one of these should bid earlier to
         * prevent that we purchase both
         */
        case 'ebayArticleGetAdjustedBidTime':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event ebayArticleGetAdjustedBidTime received: article=%s, sender=%O",
                request.articleId, sender);
              if (!request.hasOwnProperty('articleId')) {
                return Promise.reject("Missing parameter articleId");
              }
              const row = this.getRow(`#${request.articleId}`);
              const article = row.data();
              // {articleEndTime: <adjustedTime>, adjustmentReason}
              return Promise.resolve(article.perlenschnur());
            }
          } catch (e) {
            console.log("Biet-O-Matic: Event.ebayArticleGetAdjustedBidTime failed: %s", e.message);
            throw new Error(e.message);
          }
          break;
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
        if (this.currentWindowId === tabInfo.windowId) {
          // "https://www.ebay.de/c/18021266829#oid184096781363"
          const ebayRecommendationUrl = /(www\.ebay\.[a-z]{1,3})\/c\/([0-9]+)#oid([0-9]+)/;
          if (changeInfo.status === 'loading' && tabInfo.hasOwnProperty('url') && ebayRecommendationUrl.test(tabInfo.url)) {
            let matches = tabInfo.url.match(ebayRecommendationUrl);
            let host = matches[1];
            let articleId = matches[3];
            browser.tabs.update(tabId, {
              url: 'https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=' + articleId + '&nordt=true&orig_cvip=true&rt=nc',
              openerTabId: this.popup.tabId,
            }).then(() => {
              console.log("onUpdatedListener found bad ebay t=%O c=%s, redirecting to %s : %s", tabInfo, JSON.stringify(changeInfo), host, articleId);
            });
          }
          // status == complete, then inject content script, request info and update table
          if (changeInfo.status === 'complete') {
            console.debug('Biet-O-Matic: tab(%d).onUpdated listener fired: change=%s, tabInfo=%s',
              tabId, JSON.stringify(changeInfo), JSON.stringify(tabInfo));
            if (!tabInfo.hasOwnProperty('url')) {
              throw new Error("Tab Info is missing URL - permission issue?!");
            }
            Article.getInfoFromTab(tabInfo)
              .then(articleInfo => {
                if (articleInfo.hasOwnProperty('detail')) {
                  // if same article, then update it, else remove old, add new
                  this.addOrUpdateArticle(articleInfo.detail, tabInfo);
                } else {
                  // new URL is not for an article (or couldnt be parsed) - remove the old article
                  this.removeArticleIfBoring(tabInfo.id);
                }
              })
              .catch(e => {
                console.warn(`Biet-O-Matic: Failed to get Article Info from Tab ${tabInfo.id}: ${e.message}`);
              });
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
      console.debug('Biet-O-Matic: tab(%d).onRemoved listener fired: %s', tabId, JSON.stringify(removeInfo));
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
      if (area === 'sync') {
        if (changes.hasOwnProperty('SETTINGS')) {
          if (AutoBid.checkChangeIsRelevant(changes.SETTINGS)) {
            console.info("Biet-O-Matic: Browser Sync Storage Settings changed, refreshing AutoBid.");
            AutoBid.renderState();
          }
        }
        // {"GROUPS":{
        // "newValue":{"Briefmarken":{"autoBid":true},"Keine Gruppe":{"autoBid":false},"Test":{"autoBid":true},"Tischdecken":{"autoBid":true}},
        // "oldValue":{"Briefmarken":{"autoBid":false},"Keine Gruppe":{"autoBid":false},"Test":{"autoBid":true},"Tischdecken":{"autoBid":true}}}}
        if (changes.hasOwnProperty('GROUPS')) {
          console.info("Biet-O-Matic: Browser Sync Storage Settings changed, refreshing Groups.");
          Group.updateFromChanges(changes.GROUPS);
        }
        // check if a new article has been added, or has been updated by another instance of BE
        Object.keys(changes).forEach(key => {
          // {"333462193472":{
          // "oldValue":{"articleAuctionState":"...}}}
          // "newValue":... (not if removed)
          if (/[0-9]+/.test(key)) {
            if (changes[key].hasOwnProperty('newValue')) {
              console.info("Biet-O-Matic: Browser Sync Storage Settings changed for article %s -> addOrUpdate article", key);
              this.addOrUpdateArticle(changes[key].newValue, null, true);
            } else {
              console.info("Biet-O-Matic: Browser Sync Storage Settings removed for article %s. -> remove article", key);
              this.removeArticleFromTable(key);
            }
          }
        });
      }
    });

    /*
     * listen for changes to window storage (logs)
     *        Note: does not fire if generated on same tab
     */
    window.addEventListener('storage', (e) => {
      console.log("XXX Window Storage changed %O", e);
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
    this.DataTable.on('click', 'tbody tr a', e => {
      //console.log("tbody tr a clicked: %O", e);
      // first column, jump to open article tab
      if (/^tabid-([0-9]+)$/.test(e.target.id)) {
        e.preventDefault();
        let tabId = e.target.id.match(/^tabid-([0-9]+)$/);
        tabId = Number.parseInt(tabId[1]);
        browser.tabs.update(tabId, {active: true})
          .catch(e => {
            console.log("Biet-O-Matic: Articles Table - Cannot activate Article Tab %d: %s", tabId, e.message);
          });
      }
    });

    // group/maxBid/autoBid inputs
    this.DataTable.on('change', 'tr input', e => {
      //console.debug('Biet-O-Matic: configureUi() INPUT Event this=%O', e);
      // parse articleId from id of both inputs
      let articleId = e.target.id
        .replace('chkAutoBid_', '')
        .replace('inpMaxBid_', '')
        .replace('inpGroup_', '');

      // determine row by articleId
      const row = this.getRow(`#${articleId}`);
      if (row == null || row.length !== 1)
        return;
      let article = row.data();
      console.debug("Biet-O-Matic: Input changed event: Article=%s, field=%s", article.articleId, e.target.id);
      if (e.target.id.startsWith('inpMaxBid_')) {
        // maxBid was entered
        // normally with input type=number this should not be necessary - but there was a problem reported...
        article.articleMaxBid = Number.parseFloat(e.target.value.replace(/,/, '.'));
        if (Number.isNaN(article.articleMaxBid))
          article.articleMaxBid = 0;
        // check if maxBid > buyPrice (sofortkauf), then adjust it to the buyprice - 1 cent
        if (article.hasOwnProperty('articleBuyPrice') && article.articleMaxBid >= article.articleBuyPrice) {
          article.articleMaxBid = article.articleBuyPrice - 0.01;
        } else if (article.hasOwnProperty('articleMinimumBid') && article.articleMaxBid > 0 &&
          article.articleMaxBid < article.articleMinimumBid) {
          article.articleMaxBid = article.articleMinimumBid;
        }
      } else if (e.target.id.startsWith('chkAutoBid_')) {
        // autoBid checkbox was clicked
        article.articleAutoBid = e.target.checked;
      } else if (e.target.id.startsWith('inpGroup_')) {
        // group has been updated
        if (e.target.value === '' || e.target.value === $.fn.DataTable.RowGroup.defaults.emptyDataGroup)
          article.articleGroup = undefined;
        else
          article.articleGroup = e.target.value;
        this.lastFocusedInput = null;
      }

      // redraw the row
      row.invalidate('data').draw(false);
      // store info when inputs updated
      let info = {};
      if (article.hasOwnProperty('articleMaxBid'))
        info.maxBid = article.articleMaxBid;
      if (article.hasOwnProperty('articleAutoBid'))
        info.autoBid = article.articleAutoBid;
      if (article.hasOwnProperty('articleGroup'))
        info.group = article.articleGroup;
      // update storage info and inform tab of new values
      article.updateInfoInStorage(info, article.tabId)
        .catch(e => {
          console.log("Biet-O-Matic: Failed to store article info: %s", e.message);
        });
    });

    // datatable length change
    this.DataTable.on('length.dt', function (e, settings, len) {
      Popup.updateSetting('articlesTableLength', len);
    });

    // articleButtons: activate tab, remove article
    this.DataTable.on('click', '#articleButtons', e => {
      e.preventDefault();
      let tr = $(e.target).closest('tr');
      if (e.target.id === 'tabStatus') {
        this.toggleArticleTab(tr);
      } else if (e.target.id === 'articleRemove') {
        this.removeArticle(tr);
      }
    });

    // Add event listener for opening and closing details
    this.DataTable.on('click', 'td.details-control', e => {
      e.preventDefault();
      let tr = $(e.target).closest('tr');
      if (e.target.nodeName === 'SPAN') {
        let span = e.target;
        const row = this.getRow(tr);
        if (row.child.isShown()) {
          // This row is already open - close it
          span.classList.remove('fa-minus');
          span.classList.add('fa-plus');
          // hide and remove data (save memory)
          row.child(false);
          row.data().articleDetailsShown = false;
        } else {
          // Open this row
          span.classList.remove('fa-plus');
          span.classList.add('fa-minus');
          row.child(ArticlesTable.renderArticleLog(row.data())).show();
          row.data().articleDetailsShown = true;
        }
      }
    });

    // remember last focused event
    this.DataTable.on('focus', 'tr input', e => {
      //console.debug('Biet-O-Matic: configureUi() INPUT Focus Event this=%O', e);
      if (e.currentTarget.id.match(/^inpGroup_/))
        this.lastFocusedInput = e.target.id;
      else
        this.lastFocusedInput = null;
    });

    // handle redraw: restore focus in last input
    this.DataTable.on('draw.dt', (e) => {
      if (this.hasOwnProperty('lastFocusedInput') && this.lastFocusedInput != null) {
        Group.waitFor(`#${this.lastFocusedInput}`, 200).then(lastFocusedInput => {
          if (document.activeElement !== lastFocusedInput)
            lastFocusedInput.focus();
        }).catch(e => {
          console.log("Biet-O-Matic: draw.dt cannot activate input %s: %s", this.lastFocusedInput, e.message);
        });
      }
    });

    /*
     * Toggle Group autobid
     */
    this.DataTable.on('click', 'tr.row-group', e => {
      const name = $(e.currentTarget).data('name');
      Group.toggleState(name)
        .then(() => Group.renderState('spanGroupAutoBid', name))
        .catch(e => {
        console.log("Biet-O-Matic: Failed to toggle group %s autoBid state: %s", name, e.message);
      });
    });
  }

  //region Custom sorter for DataTable
  /*
   * Natural Sort algorithm for Javascript - Version 0.7 - Released under MIT license
  * Author: Jim Palmer (based on chunking idea from Dave Koelle)
  * Contributors: Mike Grier (mgrier.com), Clint Priest, Kyle Adams, guillermo
  * See: http://js-naturalsort.googlecode.com/svn/trunk/naturalSort.js
  */
  static naturalSort (a, b, sortEmptyGroupLast = false) {
    const re = /(^-?[0-9]+(\.?[0-9]*)[df]?e?[0-9]?%?$|^0x[0-9a-f]+$|[0-9]+)/gi;
    const sre = /(^[ ]*|[ ]*$)/g;
    const dre = /(^([\w ]+,?[\w ]+)?[\w ]+,?[\w ]+\d+:\d+(:\d+)?[\w ]?|^\d{1,4}[\/\-]\d{1,4}[\/\-]\d{1,4}|^\w+, \w+ \d+, \d{4})/;
    const hre = /^0x[0-9a-f]+$/i;
    const ore = /^0/;

    // empty group (Keine Gruppe) should be sorted last
    if (sortEmptyGroupLast && a === $.fn.DataTable.RowGroup.defaults.emptyDataGroup && a === b) return 0;
    else if (sortEmptyGroupLast && a === $.fn.DataTable.RowGroup.defaults.emptyDataGroup) return 1;
    else if (sortEmptyGroupLast && b === $.fn.DataTable.RowGroup.defaults.emptyDataGroup) return -1;

    // convert all to strings and trim()
    const x = a.toString().replace(sre, '') || '';
    const y = b.toString().replace(sre, '') || '';

    // chunk/tokenize
    const xN = x.replace(re, '\0$1\0').replace(/\0$/,'').replace(/^\0/,'').split('\0');
    const yN = y.replace(re, '\0$1\0').replace(/\0$/,'').replace(/^\0/,'').split('\0');
    // numeric, hex or date detection
    const xD = Number.parseInt(x.match(hre), 10) || (xN.length !== 1 && x.match(dre) && Date.parse(x));
    const yD = Number.parseInt(y.match(hre), 10) || xD && y.match(dre) && Date.parse(y) || null;

    // first try and sort Hex codes or Dates
    if (yD) {
      if ( xD < yD ) return -1;
      else if ( xD > yD ) return 1;
      else return 0;
    }

    // natural sorting through split numeric strings and default strings
    for(let cLoc=0, numS=Math.max(xN.length, yN.length); cLoc < numS; cLoc++) {
      // find floats not starting with '0', string or 0 if not defined (Clint Priest)
      let oFxNcL = !(xN[cLoc] || '').match(ore) && Number.parseFloat(xN[cLoc]) || xN[cLoc] || 0;
      let oFyNcL = !(yN[cLoc] || '').match(ore) && Number.parseFloat(yN[cLoc]) || yN[cLoc] || 0;
      // handle numeric vs string comparison - number < string - (Kyle Adams)
      if (isNaN(oFxNcL) !== isNaN(oFyNcL)) {
        return (isNaN(oFxNcL)) ? 1 : -1;
      }
      // rely on string comparison if different types - i.e. '02' < 2 != '02' < '2'
      else if (typeof oFxNcL !== typeof oFyNcL) {
        oFxNcL += '';
        oFyNcL += '';
      }
      if (oFxNcL < oFyNcL) return -1;
      else if (oFxNcL > oFyNcL) return 1;
    }
    return 0;
  }

  //endregion

} // end of ArticlesTable class

class Popup {
  constructor(version = 'v0.0.0') {
    // BOM-BE version
    $('#bomVersion').text('Biet-O-Matic BE ' + version);

    this.whoIAm = null;
    this.table = null;
    this.tabId = null;
  }

  /*
   * Check Storage permission granted and update the HTML with relevant internal information
   * - also add listener for storageClearAll button and clear complete storage on request.
   */
  static async checkBrowserStorage() {
    // total elements
    let inpStorageCount = await browser.storage.sync.get(null);
    // update html element storageCount
    $('#inpStorageCount').val(Object.keys(inpStorageCount).length);

    // total size
    let inpStorageSize = await browser.storage.sync.getBytesInUse(null);
    $('#inpStorageSize').val(inpStorageSize);

    $('#inpStorageClearAll').on('click', async e => {
      console.debug('Biet-O-Matic: Clear all data from local and sync storage, %O', e);
      await browser.storage.sync.clear();
      window.localStorage.clear();
      // reload page
      browser.tabs.reload();
    });
    $('#inpRemoveOldArticles').on('click', async function() {
      // sync storage
      let result = await browser.storage.sync.get(null);
      Object.keys(result).forEach(function(articleId) {
        let data = result[articleId];
        //Date.now = 1576359588  yesterday = 1576265988;
        let diff = (Date.now() - data.endTime) / 1000;
        if (data.hasOwnProperty('endTime') && diff > 86400) {
          console.debug("Biet-O-Matic: Deleting Article %s from sync storage, older 1 day (%s > 86000s)", articleId, diff);
          browser.storage.sync.remove(articleId).catch(e => {
            console.log("Biet-O-Matic: Unable to remove article %s from sync storage: %s", e.message);
          });
        }
        // localStorage (logs)
        Object.keys(window.localStorage).forEach(key => {
          let value = JSON.parse(window.localStorage.getItem(key));
          let diff = (Date.now() - value[0].timestamp) / 1000;
          if (diff > 10000) {
            console.debug("Biet-O-Matic: Deleting Article %s log entries from localStorage, older 1 day (%s, %s > 86000s)",
              key, value[0].timestamp, diff);
            window.localStorage.removeItem(key);
          }
        });
      });
    });
  }

  /*
   * detectWhoAmI
   */
  static async detectWhoIAm() {
    let whoIAm = {};
    // first determine simply which window currently running on
    whoIAm.currentWindow = await browser.windows.getCurrent({populate: false});
    console.debug("Biet-O-Matic: detectWhoIAm(): window=%d", whoIAm.currentWindow.id);
    return whoIAm;
  }

  static async getOwnTabId() {
    let tab = browser.tabs.getCurrent();
    if (typeof tab === 'undefined')
      return null;
    else
      return tab.id;
  }

  async init() {
    this.whoIAm = await Popup.detectWhoIAm();
    this.tabId = await Popup.getOwnTabId();
    Popup.cachedGroups = await Group.getAll();
    this.registerEvents();

    this.table = new ArticlesTable(this, '#articles');
    await this.table.addArticlesFromTabs();
    await this.table.addArticlesFromStorage();
    // restore settings from session storage (autoBidEnabled, bidAllEnabled)
    this.restoreSettings();
    await Popup.checkBrowserStorage();
  }

  /*
   * register events:
   * - getWindowSettings: from content script to retrieve the settings for this window (e.g. autoBidEnabled)
   * - browserAction clicked
   * - inputAutoBid clicked
   */
  registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request, sender) => {
      //console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
      switch (request.action) {
        case 'getWindowSettings':
          if (this.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event getWindowSettings received from tab %s", sender.tab.id);
            return Promise.resolve(JSON.parse(window.sessionStorage.getItem('settings')));
          }
          break;
      }
    });

    // toggle autoBid for window when button in browser menu clicked
    // the other button handler is setup below
    browser.browserAction.onClicked.addListener((tab, clickData) => {
      if (this.whoIAm.currentWindow.id === tab.windowId) {
        console.debug('Biet-O-Matic: browserAction.onClicked listener fired: tab=%O, clickData=%O', tab, clickData);
        // only toggle favicon for ebay tabs
        if (tab.url.startsWith(browser.runtime.getURL("")) || tab.url.match(/^https?:\/\/.*\.ebay\.(de|com)\/itm/)) {
          AutoBid.toggleState().catch(e => {
            console.log("Biet-O-Matic: Browser Action clicked, AutoBid.toggleState failed: %s", e.message);
          });
        }
      }
    });
  }

  /*
   * Restore settings from window session storage
   * - autoBid settings
   * - dataTable length (pagination)
   */
  restoreSettings() {
    AutoBid.init();

    let result = JSON.parse(window.sessionStorage.getItem('settings'));
    if (result != null) {
      console.debug("Biet-O-Matic: restoreSettings() updating from session storage: settings=%s", JSON.stringify(result));
      // pagination setting for articlesTable
      if (result.hasOwnProperty('articlesTableLength') && this.table != null) {
        this.table.DataTable.page.len(result.articlesTableLength).draw();
      }
    }
  }

  /*
   * update setting in session storage:
   * autoBidEnabled - Automatic Bidding enabled
   * simulation     - Perfom simulated bidding (do all , but not confirm the bid)
   */
  static updateSetting(key, value) {
    console.debug("Biet-O-Matic: updateSetting() key=%s, value=%s", key, JSON.stringify(value));
    let result = JSON.parse(window.sessionStorage.getItem('settings'));
    if (result == null)
      result = {};
    // remove old settings
    if (result.hasOwnProperty('simulate'))
      delete result.simulate;
    result[key] = value;
    window.sessionStorage.setItem('settings', JSON.stringify(result));
  }

  /*
   * Update Favicon
   * - for popup
   * - for contentScript (ebay articles)
   * - for browser action
   */
  static updateFavicon(checked = false, tab = null, simulate = false) {
    let title = 'B';
    let color = '#a6001a';
    if (checked) {
      color = '#457725';
    }
    let fav = new Favicon(title, color);
    let favUrl = fav.link;
    let favImg = fav.image;
    if (favUrl) {
      favUrl.id = "favicon";
      let head = document.getElementsByTagName('head')[0];
      if (document.getElementById('favicon')) {
        head.removeChild(document.getElementById('favicon'));
      }
      head.appendChild(favUrl);
    }
    if (tab == null) {
      // update browserAction Icon for all of this window Ebay Tabs (Chrome does not support windowId param)
      let query = browser.tabs.query({
        currentWindow: true,
        url: [ browser.extension.getURL("*"), "*://*.ebay.de/itm/*","*://*.ebay.com/itm/*" ]
      });
      query.then((tabs) => {
        console.debug("Biet-O-Matic: updateFavicon(), Setting icon on all article tabs");
        for (let tab of tabs) {
          //console.debug("Biet-O-Matic: updateFavicon(), Set icon on tab %d (%s)", tab.id, tab.url);
          browser.browserAction.setIcon({
            imageData: favImg,
            tabId: tab.id
          });
          if (simulate) {
            browser.browserAction.setBadgeText({text: 'T'});
            //browser.browserAction.setBadgeBackgroundColor({color: '#fff'});
          } else {
            browser.browserAction.setBadgeText({text: ''});
          }
        }
      });
    } else {
      // update for specific single tab
      console.debug("Biet-O-Matic: updateFavicon(), Setting icon on single tab %d (%s)", tab.id, tab.url);
      browser.browserAction.setIcon({imageData: favImg, tabId: tab.id});
    }
  }

  /*
   * execute the specified function maximum every limitMs milliseconds
   * returns true if the rate limit applies
   */
  static checkRateLimit(name, key, limitMs) {
    if (Popup.rateLimit.hasOwnProperty(name) && Popup.rateLimit[name].hasOwnProperty(key)) {
      if ((Date.now() - Popup.rateLimit[name][key]) < limitMs) {
        return true;
      }
    } else {
      Popup.rateLimit[name] = {};
    }
    Popup.rateLimit[name][key] = Date.now();
    return false;
  }
}
// static class-var declaration outside the class
Popup.rateLimit = {};

//region Favicon Handling
class Favicon {
  constructor(title, color = '#ffffff') {
    if (typeof color !== 'string' || !color.startsWith('#')) {
      throw new Error(`Invalid Favicon color: ${color}`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    let ctx = canvas.getContext('2d');
    // background color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 63, 63);
    // text color
    ctx.fillStyle = Favicon.getContrastYIQ(color);

    let acronym = title.split(' ').map(function(item) {
      return item[0];
    }).join('').substr(0, 2);

    let fontSize = Favicon.measureText(ctx, acronym, 'Arial', 0, 60, 50);
    ctx.font = `bold ${fontSize}px "Arial"`;
    ctx.textAlign='center';
    ctx.textBaseline="middle";
    ctx.fillText(acronym, 32, 38);

    // prepare icon as Data URL
    const link = document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = canvas.toDataURL("image/x-icon");

    // persist info
    this.link = link;
    this.image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  static measureText(context, text, fontface, min, max, desiredWidth) {
    if (max-min < 1) {
      return min;
    }
    let test = min+((max-min)/2); //Find half interval
    context.font=`bold ${test}px "${fontface}"`;
    let found;
    if ( context.measureText(text).width > desiredWidth) {
      found = Favicon.measureText(context, text, fontface, min, test, desiredWidth);
    } else {
      found = Favicon.measureText(context, text, fontface, test, max, desiredWidth);
    }
    return parseInt(found);
  }

  /* determine good contrast color (black or white) for given BG color */
  static getContrastYIQ(hexcolor){
    const r = parseInt(hexcolor.substr(0,2),16);
    const g = parseInt(hexcolor.substr(2,2),16);
    const b = parseInt(hexcolor.substr(4,2),16);
    // http://www.w3.org/TR/AERT#color-contrast
    let yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? 'black' : 'white';
  }
}
//endregion


/*
 * MAIN
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const popup = new Popup(BOM_VERSION);
  popup.init()
    .then(() => {
      console.info("Biet-O-Matic: Initialization for window with id = %d completed (%O).",
        popup.whoIAm.currentWindow.id, popup.whoIAm.currentWindow);
    })
    .catch(e => {
      console.log("Biet-O-Matic: Popup initialization failed: %s", e.message);
    });
});
