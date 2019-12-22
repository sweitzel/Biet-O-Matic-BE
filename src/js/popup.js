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
import 'datatables.net-jqui';
import 'datatables.net-buttons-jqui';
import 'datatables.net-responsive-jqui';

// date-fns as alternative to moment
import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

import "../css/popup.css";

/*
   <link rel="stylesheet" type="text/css" href="thirdparty/jquery-ui.min.css"/>
  <link rel="stylesheet" type="text/css" href="thirdparty/dataTables.jqueryui.min.css"/>
  C:\Users\Sebastian\IdeaProjects\Bietomat\node_modules\datatables.net-jqui\css\dataTables.jqueryui.css
 */

let popup = function () {
  'use strict';

  let pt = {};

  function onError(error, sender = null) {
    console.error("Biet-O-Matic: Promise Error: %O, Sender: %O", error, sender);
  }

  /*
   register events:
     - ebayArticleUpdated: from content script with info about article
     - ebayArticleRefresh: from content script, simple info to refresh the row (update remaing time)
     - updateArticleStatus: from content script to update the Auction State with given info
     - ebayArticleMaxBidUpdated: from content script to update maxBid info
     - getWindowSettings: from content script to retrieve the settings for this window (e.g. autoBidEnabled)
     - addArticleLog: from content script to store log info for article
     - getArticleInfo: return article info from row
     - getArticleSyncInfo: return article info from sync storage
     - ebayArticleGetAdjustedBidTime: returns adjusted bidding time for a given articleId (see below for details)
     - browser.tabs.onremoved: Tab closed
   */
  function registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
      //console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
      switch (request.action) {
        case 'ebayArticleUpdated':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event ebayArticleUpdated received: tab=%s, articleId=%s, articleDescription=%s",
              sender.tab.id, request.detail.articleId, request.detail.articleDescription);
            addOrUpdateArticle(sender.tab, request.detail)
              .catch(e => {
                console.debug ("Biet-O-Matic: addOrUpdateArticle() failed - %s", JSON.stringify(e));
              });
            // update BE favicon for this tab
            updateFavicon($('#inpAutoBid').prop('checked'), sender.tab);
          }
          break;
        case 'ebayArticleRefresh':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event ebayArticleRefresh received from tab %s", sender.tab.id);
            // redraw date (COLUMN 3)
            let dateCell = pt.table.cell(`#${sender.tab.id}`, 'articleEndTime:name');
            // redraw date
            dateCell.invalidate('data');
          }
          break;
        case 'updateArticleStatus':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event updateArticleStatus received from tab %s: sender=%O, detail=%s",
              sender.tab.id, sender, JSON.stringify(request.detail));
            let row = pt.table.row(`#${sender.tab.id}`);
            let data = row.data();
            // redraw status (COLUMN 6)
            let statusCell = pt.table.cell(`#${sender.tab.id}`, 'articleAuctionState:name');
            data.articleAuctionState = request.detail.message;
            statusCell.invalidate('data');
          }
          break;
        case 'ebayArticleMaxBidUpdated':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event ebayArticleMaxBidUpdate received: sender=%O, detail=%O", sender, request.detail);
            let row = pt.table.row(`#${sender.tab.id}`);
            updateRowMaxBid(row, request.detail);
            storeArticleInfo(request.articleId, request.detail).catch(e => {
              console.log("Biet-O-Matic: Unable to store article info: %s", e.message);
            });
          }
          break;
        case 'getWindowSettings':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event getWindowSettings received: sender=%O", sender);
            return Promise.resolve(JSON.parse(window.sessionStorage.getItem('settings')));
          }
          break;
        case 'addArticleLog':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event addArticleLog received: tab=%d, detail=%s",
              sender.tab.id, JSON.stringify(request.detail));
            let row = pt.table.row(`#${sender.tab.id}`);
            let data = row.data();
            // redraw status (COLUMN 6)
            if (request.detail.message.level !== "Performance") {
              // only if its not performance info (too verboose)
              let statusCell = pt.table.cell(`#${sender.tab.id}`, 'articleAuctionState:name');
              data.articleAuctionState = request.detail.message.message;
              statusCell.invalidate('data').draw();
            }
            storeArticleLog(request.articleId, request.detail);
          }
          break;
        case 'getArticleInfo':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event getArticleInfo received: sender=%O", sender);
            if (request.hasOwnProperty('articleId')) {
              // determine row by articleId
              let row = pt.table.row(`:contains(${request.articleId})`);
              return Promise.resolve({
                data: row.data(),
                tabId: sender.tab.id
              });
            }
          }
          break;
        case 'getArticleSyncInfo':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event getArticleSyncInfo received: sender=%O, article=%s",
              sender, request.articleId);
            if (request.hasOwnProperty('articleId')) {
              return Promise.resolve(browser.storage.sync.get(request.articleId));
            }
          }
          break;
        case 'ebayArticleSetAuctionEndState':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            let v = (typeof request.detail.auctionEndState !== 'undefined') ? request.detail.auctionEndState : null;
            console.debug("Biet-O-Matic: Browser Event ebayArticleSetAuctionEndState received: sender=%O, state=%s",
              sender, v);
            if (request.hasOwnProperty('articleId')) {
              if (request.detail.hasOwnProperty('auctionEndState') && request.detail.auctionEndState === 1) {
                if ($('#inpBidAll').is(':checked') === false) {
                  console.debug("Biet-O-Matic: ebayArticleSetAuctionEndState() disabling autoBid - Article %s was successful.",
                    request.articleId);
                  $('#inpAutoBid').prop('checked', false);
                  updateSetting('autoBidEnabled', false);
                }
              }
              storeArticleInfo(request.articleId, request.detail).catch(e => {
                console.log("Biet-O-Matic: Unable to store article info: %s", e.message);
              });
            }
          }
          break;
        /*
         * If two article end at the same time (+/- 1 seconds), then one of these should bid earlier to
         * prevent that we purchase both
         */
        case 'ebayArticleGetAdjustedBidTime':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event ebayArticleGetAdjustedBidTime received: article=%s, sender=%O",
              request.articleId, sender);
            if (!request.hasOwnProperty('articleId')) {
              return Promise.reject("Missing parameter articleId");
            }
            return Promise.resolve(getAdjustedBidTime(request.articleId, request.articleEndTime));
          }
          break;
      }
    });

    // tab openend, inject contentScript
    browser.tabs.onCreated.addListener(function (tab) {
      console.debug('Biet-O-Matic: tab(%d).onCreated listener fired: tab=%O', tab.id, tab);
    });

    // tab reloaded or URL changed
    browser.tabs.onUpdated.addListener(function (tabId, changeInfo, tabInfo) {
      console.debug('Biet-O-Matic: tab(%d).onUpdated listener fired: change=%s, tab=%O', tabId, JSON.stringify(changeInfo), tabInfo);
      // status == complete, then inject content script, request info and update table
      if (changeInfo.status === 'complete') {
        if (!tabInfo.hasOwnProperty('url')) {
          throw new Error("Tab Info is missing URL!");
        }
        getArticleInfoForTab(tabInfo)
          .then(articleInfo => {
            if (articleInfo.hasOwnProperty('detail')) {
              addOrUpdateArticle(tabInfo, articleInfo.detail)
                .catch(e => {
                  console.debug("Biet-O-Matic: addOrUpdateArticle() failed - %s", e.toString());
                });
            }
          })
          .catch(e => {
            console.warn(`Biet-O-Matic: Failed to get Article Info from Tab ${tabInfo.id}: ${e.message}`);
            // currently disable reload, probably not needed here
            //reloadTab(tabInfo.id);
          });
      }
    });

    // tab closed
    browser.tabs.onRemoved.addListener(function (tabId, removeInfo) {
      console.debug('Biet-O-Matic: tab(%d).onRemoved listener fired: %s', tabId, JSON.stringify(removeInfo));
      // window closing, no need to update anybody
      if (removeInfo.isWindowClosing === false) {
        // remove tab from activeArticles table
        const row = pt.table.row(`#${tabId}`);
        const data = row.data();
        if (row.length === 1) {
          row.remove().draw();
        }
        // if article is of interest (has storage entry), add closedTime to storage entry
        if (data != null && typeof data !== 'undefined' ) {
          storeArticleInfo(data.articleId, {
            closedTime: Date.now(),
            description: data.hasOwnProperty('articleDescription') ? data.articleDescription : "Unbekannt"
          }, null, true)
            .then(() => {
              // update closedArticles table (after closedTime has been set)
              browser.storage.sync.get(data.articleId)
                .then(result => {
                  if (result.hasOwnProperty(data.articleId)) {
                    let info = result[data.articleId];
                    info.articleId = data.articleId;
                    addClosedArticleToTable(info);
                  }
                }).catch(onError);
            })
            .catch(e => {
              console.log("Biet-O-Matic: Unable to store article info: %s", e.message);
            });
        }
      }
    });

    // toggle autoBid for window when button in browser menu clicked
    // the other button handler is setup below
    browser.browserAction.onClicked.addListener(function (tab, clickData) {
      if (pt.whoIAm.currentWindow.id === tab.windowId) {
        console.debug('Biet-O-Matic: browserAction.onClicked listener fired: tab=%O, clickData=%O', tab, clickData);
        const toggle = $('#inpAutoBid');
        let checked = toggle.prop('checked');
        // only toggle favicon for ebay tabs
        if (tab.url.startsWith(browser.extension.getURL("")) || tab.url.match(/^https?:\/\/.*\.ebay\.(de|com)\/itm/)) {
          toggle.prop('checked', !checked);
          updateSetting('autoBidEnabled', !checked);
          // note, in chrome the action click cannot be modified with shift
          updateSetting('simulate', false);
          updateFavicon(!checked, null, false);
        }
      }
    });

    // window inpAutoBid checkbox
    const inpAutoBid = $('#inpAutoBid');
    inpAutoBid.on('click', e => {
      e.stopPropagation();
      console.debug('Biet-O-Matic: Automatic mode toggled: %s - shift=%s, ctrl=%s', inpAutoBid.is(':checked'), e.shiftKey, e.ctrlKey);
      updateSetting('autoBidEnabled', inpAutoBid.is(':checked'));
      // when shift is pressed while clicking autobid checkbox, enable Simulation mode
      if (inpAutoBid.is(':checked') && e.shiftKey) {
        console.log("Biet-O-Matic: Enabling Simulation mode.");
        updateFavicon(inpAutoBid.is(':checked'), null, true);
        updateSetting('simulate', true);
        $("#lblAutoBid").text('Automatikmodus (Test)');
        $("#internal").removeClass('hidden');
      } else {
        updateFavicon(inpAutoBid.is(':checked'), null, false);
        updateSetting('simulate', false);
        $("#lblAutoBid").text('Automatikmodus');
        $("#internal").addClass('hidden');
      }
    });
    // window bidAll checkbox
    const inpBidAll = $('#inpBidAll');
    inpBidAll.on('click', e => {
      console.debug('Biet-O-Matic: Bid all articles mode toggled: %s', inpBidAll.is(':checked'));
      updateSetting('bidAllEnabled', inpBidAll.is(':checked'));
    });
  }

  /*
  * detectWhoAmI
  *   Detect if the current window belongs to a topic
  *   If a topic matched, updates Favicon as well
  */
  async function detectWhoIAm() {
    let ret = {};
    // first determine simply which window currently running on
    ret.currentWindow = await browser.windows.getCurrent({populate: true});
    console.debug("Biet-O-Matic: detectWhoIAm(): window=%O", ret.currentWindow);
    return ret;
  }

  /*
   * Request article info form specific tab
   */
  async function getArticleInfoForTab(tab) {
    // e.g. https://www.ebay.de/itm/*
    let regex = /^https:\/\/www.ebay.(de|com)\/itm/i;
    if (!tab.url.match(regex)) {
      return Promise.resolve({});
    }
    // inject content script in case its not loaded
    await browser.tabs.executeScript(tab.id, {file: 'contentScript.bundle.js'})
      .catch(e => {
        throw new Error(`getArticleInfoForTab(${tab.id}) executeScript failed: ${e.message}`);
      });
    return Promise.resolve(browser.tabs.sendMessage(tab.id, {action: 'GetArticleInfo'}));
  }

  /*
    Add or Update Article in Table
    - if articleId not in table, add it
    - if if table, update the entry
    - also complement the date with info from DB
  */
  async function addOrUpdateArticle(tab, info) {
    if (!info.hasOwnProperty('articleId')) {
      return;
    }
    let articleId = info.articleId;
    console.debug('Biet-O-Matic: addOrUpdateArticle(%s) tab=%O, info=%O', articleId, tab, info);
    info.tabId = tab.id;

    // complement with DB info
    let maxBid = null;
    let autoBid = false;
    let result = await browser.storage.sync.get(articleId);
    if (Object.keys(result).length === 1) {
      let storInfo = result[articleId];
      console.debug("Biet-O-Matic: Found info for Article %s in storage: %s", articleId, JSON.stringify(result));
      // maxBid
      if (storInfo.hasOwnProperty('maxBid') && storInfo.maxBid != null) {
        if (typeof storInfo.maxBid === 'string') {
          maxBid = Number.parseFloat(storInfo.maxBid).toFixed(2);
        } else {
          maxBid = storInfo.maxBid.toFixed(2);
        }
      }
      // autoBid
      if (storInfo.hasOwnProperty('autoBid')) {
        autoBid = storInfo.autoBid;
      }
      // if articleEndTime changed, update it in storage
      if (!storInfo.hasOwnProperty('endTime') || storInfo.endTime !== info.articleEndTime) {
        storInfo.endTime = info.articleEndTime;
        console.log("Biet-O-Matic: Updating article %s end time to %s", articleId, storInfo.endTime);
        await storeArticleInfo(articleId, storInfo);
      }
      // closedTime: if present - remove it (as tab is now open again)
      if (storInfo.hasOwnProperty('closedTime')) {
        // remove from closedArticlesTable
        const row = pt.tableClosedArticles.row(`#${articleId}`);
        if (row.length === 1) {
          console.debug("Biet-O-Matic: Article %s has been reopened, removing from closedTable.", articleId);
          row.remove().draw();
        }
        await storeArticleInfo(articleId, {closedTime: null});
      }
    }
    info.articleMaxBid = maxBid;
    info.articleAutoBid = autoBid;

    // article already in table
    let rowByTabId = pt.table.row(`#${tab.id}`);
    // determine row by articleId
    let rowByArticleId = pt.table.row(`:contains(${articleId})`);
    //console.log("XXX tabid=%O, articleid=%O, this TabId=%d", rowByTabId.data(), rowByArticleId.data(), info.tabId);
    // check if article is already open in another tab
    if (rowByArticleId.length !== 0 && typeof rowByArticleId !== 'undefined') {
      if (rowByArticleId.data().tabId !== info.tabId) {
        throw new Error(`Article ${info.articleId} already open in another tab!`);
      }
    }
    if (rowByTabId.length === 0 || typeof rowByTabId === 'undefined') {
      // article not in table - simply add it
      addActiveArticleToTable(info);
    } else {
      // article in table - update it
      updateActiveArticleTab(info, rowByTabId);
    }

    // assign again, the row might have been just initialized
    rowByTabId = pt.table.row(`#${tab.id}`);

    // add highlight colors for expired auctions
    highlightExpired(rowByTabId, info);
  }

  /*
   * Add a new article to the active articles table
   */
  function addActiveArticleToTable(info) {
    console.debug('Biet-O-Matic: addActiveArticleToTable(%s), info=%O)', info.articleId, info);
    if (!info.hasOwnProperty('articleId')) {
      console.debug("Biet-O-Matic: addActiveArticleToTable skipped, no info: %s", JSON.stringify(info));
      return;
    }
    const row = pt.table.row.add(info);
    row.draw();
  }

  /*
   * Add a closed article to the closedArticles table
   */
  function addClosedArticleToTable(info) {
    console.debug('Biet-O-Matic: addClosedArticleToTable(%s), info=%O)', info.articleId, info);
    if (!info.hasOwnProperty('articleId')) {
      console.debug("Biet-O-Matic: addClosedArticleToTable skipped, no info: %s", JSON.stringify(info));
      return;
    }
    const row = pt.tableClosedArticles.row.add(info);
    row.draw();
  }

  /*
   * Update an existing article in the active articles table
   */
  function updateActiveArticleTab(info, row) {
    console.debug('Biet-O-Matic: updateActiveArticleTab(%s) info=%O, row=%O', info.articleId, info, row);
    if (!info.hasOwnProperty('articleId')) {
      console.debug("addArticle skipped for tab %O, no info");
      return;
    }
    row.data(info).invalidate().draw();
    // todo animate / highlight changed cell or at least the row
  }

  // convert epoch to local time string
  function fixDate(info) {
    let date = 'n/a';
    if (info.hasOwnProperty('articleEndTime') && typeof info.articleEndTime !== 'undefined') {
      date = new Intl.DateTimeFormat('default', {'dateStyle': 'medium', 'timeStyle': 'medium'})
        .format(new Date(info.articleEndTime));
    }
    return date;
  }

  /*
   * Check Storage permission granted and update the HTML with relevent internal information
   * - also add listener for storageClearAll button and clear complete storage on request.
   *
   */
  async function checkBrowserStorage() {
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
            console.warn("Biet-O-Matic: Unable to remove article %s from sync storage: %s", e.message);
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
      // reload page
      //browser.tabs.reload();
    });
  }

  /*
   * Restore settings from window session storage
   */
  function restoreSettings() {
    // inpAutoBid
    let result = JSON.parse(window.sessionStorage.getItem('settings'));
    if (result != null) {
      console.debug("Biet-O-Matic: restoreSettings() updating from session storage: settings=%s", JSON.stringify(result));
      if (result.hasOwnProperty('autoBidEnabled')) {
        $('#inpAutoBid').prop('checked', result.autoBidEnabled);
      }
      if (result.hasOwnProperty('simulate') && result.simulate) {
        $("#lblAutoBid").text('Automatikmodus (Test)');
        updateFavicon($('#inpAutoBid').is(':checked'), null, true);
      } else {
        updateFavicon($('#inpAutoBid').is(':checked'));
      }
      if (result.hasOwnProperty('bidAllEnabled')) {
        $('#inpBidAll').prop('checked', result.bidAllEnabled);
      }
    }
  }
  /*
   * update setting in session storage:
   * autoBidEnabled - Automatic Bidding enabled
   * bidAllEnabled  - Bid should be placed for all articles, even one was already won.
   * simulate       - Perfom simulated bidding (do all , but not confirm the bid)
   */
  function updateSetting(key, value) {
    let result = JSON.parse(window.sessionStorage.getItem('settings'));
    if (result == null) {
      result = {};
    }
    result[key] = value;
    window.sessionStorage.setItem('settings', JSON.stringify(result));
  }

  /*
   * store articleInfo to sync storage
   *   will use values which are provided in the info object to update existing ones
   * - key: articleId
   * - value: endTime, minBid, maxBid, autoBid, closedTime
   */
  async function storeArticleInfo(articleId, info, tabId = null, onlyIfExists = false) {
    if (articleId === null || typeof articleId === 'undefined') {
      console.warn("Biet-O-Matic: storeArticleInfo() - unknown articleId! info=%O tab=%O", info, tabId);
      return;
    }
    let settings = {};
    // restore from existing config
    let result = await browser.storage.sync.get(articleId);
    if (Object.keys(result).length === 1) {
      settings = result[articleId];
    } else {
      // should we only store the info if an storage entry already exists?
      if (onlyIfExists === true) return false;
    }
    // merge new info into existing settings
    let newSettings = Object.assign({}, settings, info);
    // store the settings back to the storage
    await browser.storage.sync.set({[articleId]: newSettings});
    if (tabId != null) {
      // send update to article tab
      await browser.tabs.sendMessage(tabId, {
        action: 'UpdateArticleMaxBid',
        detail: info
      });
    }
    return true;
  }

  /*
   * Append log entry for Article to local storage
   */
  function storeArticleLog(articleId, info) {
    // get info for article from storage
    let log = JSON.parse(window.localStorage.getItem(`log:${articleId}`));
    console.debug("Biet-O-Matic: storeArticleLog(%s) info=%s", articleId, JSON.stringify(info));
    if (log == null) log = [];
    log.push(info.message);
    window.localStorage.setItem(`log:${articleId}`, JSON.stringify(log));
  }
  // get the log
  function getArticleLog(articleId) {
    return JSON.parse(window.localStorage.getItem(`log:${articleId}`));
  }

  /*
   * Configure UI Elements events:
   * - maxBid Input: If auction running and value higher than the current bid, enable the autoBid checkbox for this row
   * - autoBid checkbox: when checked, the bid and autoBid status is updated in the storage
   */
  function configureUi() {
    const table = $('#articles.dataTable');
    // maxBid input field
    table.on('change', 'tr input', e => {
      //console.debug('Biet-O-Matic: configureUi() INPUT Event this=%O', e);
      // parse articleId from id of both inputs
      let articleId = e.target.id
        .replace('chkAutoBid_', '')
        .replace('inpMaxBid_', '');
      // determine row by articleId
      const row = pt.table.row(`:contains(${articleId})`);
      let data = row.data();
      if (e.target.id.startsWith('inpMaxBid_')) {
        // maxBid was entered
        data.articleMaxBid = Number.parseFloat(e.target.value);
        // check if maxBid > buyPrice (sofortkauf), then adjust it to the buyprice - 1 cent
        //console.log("XXX adjusted maxBid %O to %s", data, data.articleBuyPrice - 0.01)
        if (data.hasOwnProperty('articleBuyPrice') && data.articleMaxBid  > data.articleBuyPrice) {
          data.articleMaxBid = data.articleBuyPrice - 0.01;
        }
      } else if (e.target.id.startsWith('chkAutoBid_')) {
        // autoBid checkbox was clicked
        data.articleAutoBid = e.target.checked;
      }
      // redraw the row
      row.invalidate('data').draw();
      // store info when maxBid updated
      let info = {
        endTime: data.articleEndTime,
        maxBid: data.articleMaxBid,
        autoBid: data.articleAutoBid
      };
      // update storage info
      storeArticleInfo(data.articleId, info, data.tabId)
        .catch(e => {
          console.warn("Biet-O-Matic: Failed to store article info: %O", e);
        });
    });

    // Add event listener for opening and closing details
    pt.table.on('click', 'td.details-control', e => {
      e.preventDefault();
      let tr = $(e.target).closest('tr');
      if (e.target.nodeName === 'I') {
        let i = e.target;
        let row = pt.table.row(tr);
        if ( row.child.isShown() ) {
          // This row is already open - close it
          i.classList.remove('ui-icon-minus');
          i.classList.add('ui-icon-plus');
          row.child.hide();
        } else {
          // Open this row
          i.classList.remove('ui-icon-plus');
          i.classList.add('ui-icon-minus');
          row.child(renderArticleLog(row.data())).show();
        }
      }
    });

    // if articleId cell is clicked, active the tab of that article
    table.on('click', 'tbody tr a', e => {
      //console.log("tbody tr a clicked: %O", e);
      e.preventDefault();
      // first column, jumpo to open article tab
      let tabId = e.target.id.match(/^tabid:([0-9]+)$/);
      if (tabId != null) {
        tabId = Number.parseInt(tabId[1]);
        browser.tabs.update(tabId, {active: true})
          .catch(onError);
      } else {
        // check link and open in new tab
        let href = e.target.href;
        if (href !== "#") {
          window.open(href, '_blank');
        }
      }
    });

    // article delete button'
    const closedTable = $('#closedArticles.dataTable');
    closedTable.on('click', 'tbody tr button', e => {
      const tr = $(e.target).closest('tr');
      // remove from sync storage
      browser.storage.sync.remove(tr[0].id).catch(onError);
      tr.remove();
    });
  }

  /*
   * Updates the maxBid input and autoBid checkbox for a given row
   * Note: the update can either be triggered from the article page, or via user editing on the datatable
   * Also performs row redraw to show the updated data.
   */
  function updateRowMaxBid(row, info= {}) {
    let data = row.data();
    console.debug('Biet-O-Matic: updateRowMaxBid(%s) info=%s', data.articleId, JSON.stringify(info));
    // minBid
    if (info.hasOwnProperty('minBid')) {
      data.articleMinimumBid = info.minBid;
    }
    // maxBid
    if (info.hasOwnProperty('maxBid')) {
      if (info.maxBid == null || Number.isNaN(info.maxBid)) {
        data.articleMaxBid = 0;
      } else {
        data.articleMaxBid = info.maxBid;
      }
    }
    // autoBid
    if (info.hasOwnProperty('autoBid')) {
      if (info.autoBid != null) {
        data.articleAutoBid = info.autoBid;
      }
    }
    // invalidate data, redraw
    // todo selective redraw for parts of the row ?
    row.invalidate('data').draw();
  }

  //region Favicon Handling
  function measureText(context, text, fontface, min, max, desiredWidth) {
    if (max-min < 1) {
      return min;
    }
    let test = min+((max-min)/2); //Find half interval
    context.font=`bold ${test}px "${fontface}"`;
    let found;
    if ( context.measureText(text).width > desiredWidth) {
      found = measureText(context, text, fontface, min, test, desiredWidth);
    } else {
      found = measureText(context, text, fontface, test, max, desiredWidth);
    }
    return parseInt(found);
  }
  /* determine good contrast color (black or white) for given BG color */
  function getContrastYIQ(hexcolor){
    const r = parseInt(hexcolor.substr(0,2),16);
    const g = parseInt(hexcolor.substr(2,2),16);
    const b = parseInt(hexcolor.substr(4,2),16);
    // http://www.w3.org/TR/AERT#color-contrast
    let yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? 'black' : 'white';
  }
  /* generate favicon based on title and color */
  function createFavicon(title, color) {
    if (typeof color !== 'string' || !color.startsWith('#')) {
      console.warn("createFavicon() skipped (invalid color): title=%s, color=%s (%s)", title, color, typeof color);
      return undefined;
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    let ctx = canvas.getContext('2d');
    // background color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 63, 63);
    // text color
    ctx.fillStyle = getContrastYIQ(color);

    let acronym = title.split(' ').map(function(item) {
      return item[0];
    }).join('').substr(0, 2);

    let fontSize = measureText(ctx, acronym, 'Arial', 0, 60, 50);
    ctx.font = `bold ${fontSize}px "Arial"`;
    ctx.textAlign='center';
    ctx.textBaseline="middle";
    ctx.fillText(acronym, 32, 38);

    // prepare icon as Data URL
    const link = document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = canvas.toDataURL("image/x-icon");

    return {
      link: link,
      image: ctx.getImageData(0, 0, canvas.width, canvas.height)
    };
    //document.getElementsByTagName('head')[0].appendChild(link);
  }
  function updateFavicon(checked = false, tab = null, test = false) {
    let title = 'B';
    let color = '#a6001a';
    if (checked) {
      color = '#457725';
    }
    let favUrl = createFavicon(title, color).link;
    let favImg = createFavicon(title, color).image;
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
        for (let tab of tabs) {
          console.debug("Biet-O-Matic: updateFavicon(), Set icon on tab %d (%s)", tab.id, tab.url);
          browser.browserAction.setIcon({
            imageData: favImg,
            tabId: tab.id
          })
            .catch(onError);
          if (test) {
            browser.browserAction.setBadgeText({text: 'T'});
            //browser.browserAction.setBadgeBackgroundColor({color: '#fff'});
          } else {
            browser.browserAction.setBadgeText({text: ''});
          }
        }
      }, onError);
    } else {
      // update for single tab
      console.debug("Biet-O-Matic: updateFavicon(), Set icon on single tab %d (%s)", tab.id, tab.url);
      browser.browserAction.setIcon({imageData: favImg, tabId: tab.id})
        .catch(onError);
    }
  }
  //endregion

  /*
   * return adjusted endtime for an article
   * - if bidAll option is set, then return original time
   * - if 1..n articles with endTime+-1 are found, then sort by articleId and return idx0+0s, idx1+2s, idx2+4s ...
   */
  function getAdjustedBidTime(articleId, articleEndTime) {
    // bidAll, then we dont need to special handle articles ending at the same time
    if ($('#inpBidAll').is(':checked')) {
      return articleEndTime;
    }

    // filter from https://stackoverflow.com/a/37616104
    Object.filter = (obj, predicate) =>
      Object.keys(obj)
        .filter( key => predicate(obj[key]) )
        .reduce( (res, key) => Object.assign(res, { [key]: obj[key] }), {} );

    const rows = pt.table.rows();
    if (rows == null) return null;
    const articles = rows.data();
    // filter articles with endtime same as for the given article +/- 1
    let filtered = Object.filter(articles, article => {
      if (!article.hasOwnProperty('articleEndTime')) return false;
      //if (article.articleId === articleId) return false;
      return (Math.abs(article.articleEndTime - articleEndTime) < 1000);
    });
    if (filtered.length === 1) {
      return articleEndTime;
    }
    // sort by articleId
    let keys = Object.keys(filtered).sort(function(a,b) {
      return filtered[a].articleId - filtered[b].articleId;
    });
    const findKey = function (obj, value) {
      let key = null;
      for (let prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          if (obj[prop].articleId === value) key = prop;
        }
      }
      return key;
    };
    // the index determines how many seconds an article bid will be earlier
    let idx = findKey(filtered, articleId);
    console.debug("Biet-O-Matic: getAdjustedBidTime() Adjusted Article %s bidTime by %ss, %d articles end at the same time (%O).",
      articleId, keys.indexOf(idx), keys.length, filtered);
    return (articleEndTime - ((keys.indexOf(idx)*2) * 1000));
  }

  /*
   * If an article is close to ending or ended, highlight the date
   * if it ended, highlight the status as well
   */
  function highlightExpired(row, info) {
    let rowNode = row.node();
    if (info.articleEndTime - Date.now() < 0) {
      // ended
      $(rowNode).css('color', 'red');
    } else if (info.articleEndTime - Date.now() < 60) {
      // ends in 1 minute
      $(rowNode).css('text-shadow', '2px -2px 3px #FF0000');
    }
  }

  // datable: render column articleBidPrice
  function renderArticleBidPrice(data, type, row) {
    if (typeof data !== 'undefined') {
      //console.log("data=%O, type=%O, row=%O", data, type, row);
      let currency = "EUR";
      if (row.hasOwnProperty('articleCurrency')) {
        currency = row.articleCurrency;
      }
      try {
        let result = new Intl.NumberFormat('de-DE', {style: 'currency', currency: currency})
          .format(data);
        return type === "display" || type === "filter" ? result : data;
      } catch (e) {
        return data;
      }
    }
  }

  /*
   * same logic as activateAutoBidButton from contentScript
   */
  function activateAutoBidButton(maxBidValue, minBidValue, bidPrice) {
    console.debug("Biet-O-Matic: activateAutoBidButton(), maxBidValue=%s (%s), minBidValue=%s (%s)",
      maxBidValue, typeof maxBidValue,  minBidValue, typeof minBidValue);
    //let isMaxBidEntered = (Number.isNaN(maxBidValue) === false);
    const isMinBidLargerOrEqualBidPrice = (minBidValue >= bidPrice);
    const isMaxBidLargerOrEqualMinBid = (maxBidValue >= minBidValue);
    const isMaxBidLargerThanBidPrice = (maxBidValue > bidPrice);
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
   * datatable: render column articleMaxBid
   * - input:number for maxBid
   * - label for autoBid and in it:
   * - input:checkbox for autoBid
   */
  function renderArticleMaxBid(data, type, row) {
    if (type !== 'display' && type !== 'filter') return data;
    //console.log("renderArticleMaxBid(%s) data=%O, type=%O, row=%O", row.articleId, data, type, row);
    let autoBid = false;
    let closedArticle = false;
    if (row.hasOwnProperty('articleAutoBid')) {
      autoBid = row.articleAutoBid;
    } else if (row.hasOwnProperty('autoBid')) {
      autoBid = row.autoBid;
      closedArticle = true;
    }
    let maxBid = 0;
    if (data != null) {
      maxBid = data;
    }
    const divArticleMaxBid = document.createElement('div');
    const inpMaxBid = document.createElement('input');
    inpMaxBid.id = 'inpMaxBid_' + row.articleId;
    inpMaxBid.type = 'number';
    inpMaxBid.min = '0';
    inpMaxBid.step = '0.01';
    inpMaxBid.defaultValue = maxBid.toString();
    inpMaxBid.style.width = "60px";
    const labelAutoBid = document.createElement('label');
    const chkAutoBid = document.createElement('input');
    chkAutoBid.id = 'chkAutoBid_' + row.articleId;
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
      inpMaxBid.disabled = true;
      chkAutoBid.disabled = true;
    } else {
      // maxBid was entered, check if the autoBid field can be enabled
      chkAutoBid.disabled = !activateAutoBidButton(row.articleMaxBid, row.articleMinimumBid, row.articleBidPrice);
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
        inpMaxBid.disabled = true;
        chkAutoBid.disabled = true;
      }
    }

    divArticleMaxBid.appendChild(inpMaxBid);
    divArticleMaxBid.appendChild(labelAutoBid);
    return divArticleMaxBid.outerHTML;
  }

  // render the log data for the specified article
  // returns the HTML content
  function renderArticleLog(data) {
    if (!data.hasOwnProperty('articleId')) return "";
    let div = document.createElement('div');
    let table = document.createElement('table');
    table.style.paddingLeft = '50px';
    // get log entries
    let log = getArticleLog(data.articleId);
    if (log == null) return "";
    log.forEach(e => {
      let tr = document.createElement('tr');
      let tdDate = document.createElement('td');
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
    return div.innerHTML;
  }

  // translation data for Datatable
  function getDatatableTranslation(language = 'de_DE') {
    console.log("getDatatableTranslation called: %s", language);
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
    return languages.de_DE;
  }

  // setup active articles table
  function setupTableActiveArticles() {
    pt.table = $('#articles').DataTable({
      responsive: {
        details: false
      },
      columns: [
        {
          className: 'details-control',
          orderable: false,
          data: null,
          width: '5px',
          defaultContent: '',
          "render": function (data, type, row) {
            if (getArticleLog(row.articleId) != null)
              return '<i class="ui-icon ui-icon-plus" aria-hidden="true"></i>';
            else
              return '';
          },
        },
        {
          name: 'articleId',
          data: 'articleId',
          visible: true,
          width: '100px',
          render: function (data, type, row) {
            if (type !== 'display' && type !== 'filter') return data;
            let div = document.createElement("div");
            div.id = data;
            let a = document.createElement('a');
            a.href = 'https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=' + row.articleId;
            a.id = 'tabid:' + row.tabId;
            a.text = data;
            div.appendChild(a);
            return div.outerHTML;
          }
        },
        {
          name: 'articleDescription',
          data: 'articleDescription',
          //render: $.fn.dataTable.render.ellipsis(100, true, false),
          defaultContent: 'Unbekannt'
        },
        {
          name: 'articleEndTime',
          data: 'articleEndTime',
          render: function (data, type, row) {
            if (typeof data !== 'undefined') {
              if (type !== 'display' && type !== 'filter') return data;
              let timeLeft = formatDistanceToNow(data, {includeSeconds: true, locale: de, addSuffix: true});
              return `${fixDate({articleEndTime: data})} (${timeLeft})`;
            } else {
              return "unbegrenzt";
            }
          },
          defaultContent: '?'
        },
        {
          name: 'articleBidPrice',
          data: 'articleBidPrice',
          defaultContent: 0,
          render: renderArticleBidPrice
        },
        {
          name: 'articleShippingCost',
          data: 'articleShippingCost',
          defaultContent: '0.00'
        },
        {
          name: 'articleAuctionState',
          data: 'articleAuctionState',
          defaultContent: ''
        },
        {
          name: 'articleAutoBid',
          data: 'articleAutoBid',
          visible: false,
          defaultContent: "false"
        },
        {
          name: 'articleMaxBid',
          data: 'articleMaxBid',
          render: renderArticleMaxBid,
          defaultContent: 0
        }
      ],
      order: [[3, "asc"]],
      columnDefs: [
        {searchable: false, "orderable": false, targets: [6, 7, 8]},
        {type: "num", targets: [1, 8]},
        {className: "dt-body-center dt-body-nowrap", targets: [0, 1, 8]},
        {width: "100px", targets: [4, 5, 7, 8]},
        {width: "220px", targets: [3]},
        {width: "300px", targets: [2, 6]}
      ],
      searchDelay: 400,
      rowId: 'tabId',
      pageLength: 25,
      language: getDatatableTranslation('de_DE')
    });

    // initialize active tabs
    pt.whoIAm.currentWindow.tabs.forEach((tab) => {
      getArticleInfoForTab(tab)
        .then(articleInfo => {
          if (articleInfo.hasOwnProperty('detail')) {
            addOrUpdateArticle(tab, articleInfo.detail)
              .catch(e => {
                console.debug("Biet-O-Matic: addOrUpdateArticle() failed - %s", e.toString());
              });
          }
        })
        .catch(e => {
          console.warn(`Biet-O-Matic: Failed to get Article Info from Tab ${tab.id}: ${e.message}`);
          /*
           * The script injection failed, this can have multiple reasons:
           * - the contentScript threw an error because the page is not a article
           * - the contentScript threw an error because the article is a duplicate tab
           * - the browser extension reinitialized / updated and the tab cannot send us messages anymore
           * Therefore we perform a tab reload once, which should recover the latter case
           */
          reloadTab(tab.id);
        });
    });
  }

  /* reload a tab
   * check if a reload has been recently performed and only reload if > 60 seconds ago
   */
  function reloadTab(tabId = null) {
    if (tabId == null) return;
    if (pt.hasOwnProperty('reloadInfo') && pt.reloadInfo.hasOwnProperty(tabId)) {
      if ((Date.now() - pt.reloadInfo[tabId]) < (60 * 1000)) {
        console.debug("Biet-O-Matic: Tab %d skipped reloading (was reloaded less then a minute ago", tabId);
        return;
      }
    } else {
      pt.reloadInfo = {};
    }
    pt.reloadInfo[tabId] = Date.now();
    browser.tabs.reload(tabId);
  }

  /*
   * setup table for recently closed articles
   */
  function setupTableClosedArticles() {
    pt.tableClosedArticles = $('#closedArticles').DataTable({
      responsive: {
        details: false
      },
      columns: [
        {
          name: 'articleId',
          data: 'articleId',
          visible: true,
          width: '100px',
          render: function (data, type, row) {
            if (type !== 'display' && type !== 'filter') return data;
            let div = document.createElement("div");
            div.id = data;
            let a = document.createElement('a');
            a.href = 'https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=' + row.articleId;
            a.target = '_blank';
            a.rel = 'noopener';
            a.text = data;
            div.appendChild(a);
            return div.outerHTML;
          }
        },
        {
          name: 'articleDescription',
          data: 'description',
          //render: $.fn.dataTable.render.ellipsis(100, true, false),
          defaultContent: 'Unbekannt'
        },
        {
          name: 'articleEndTime',
          data: 'endTime',
          defaultContent: '?',
          width: '220px',
          render: function (data, type, row) {
            if (typeof data !== 'undefined') {
              if (type !== 'display' && type !== 'filter') return data;
              let timeLeft = formatDistanceToNow(data, {includeSeconds: true, locale: de, addSuffix: true});
              return `${fixDate({articleEndTime: data})} (${timeLeft})`;
            } else {
              return 'unbekannt';
            }
          }
        },
        {
          name: 'articleClosedTime',
          data: 'closedTime',
          defaultContent: '?',
          width: '220px',
          render: function (data, type, row) {
            if (typeof data !== 'undefined') {
              if (type !== 'display' && type !== 'filter') return data;
              let timeLeft = formatDistanceToNow(data, {includeSeconds: true, locale: de, addSuffix: true});
              return `${fixDate({articleEndTime: data})} (${timeLeft})`;
            } else {
              return 'unbekannt';
            }
          }
        },
        {
          name: 'articleAuctionState',
          data: 'auctionEndState',
          defaultContent: '',
          render: function (data, type, row) {
            const auctionEndStates = {
              0: 'Beendet',
              1: 'Höchstbietender',
              2: 'Überboten',
              null: 'Unbekannt'
            };
            if (typeof data !== 'undefined') {
              if (type !== 'display' && type !== 'filter') return data;
              //return Object.keys(auctionEndStates).find(key => auctionEndStates[key] === data);
              return auctionEndStates[data];
            } else {
              return 'unbekannt';
            }
          }
        },
        {
          name: 'articleAutoBid',
          data: 'autoBid',
          visible: false,
          defaultContent: "false"
        },
        {
          name: 'articleMaxBid',
          data: 'maxBid',
          defaultContent: 0,
          width: '120px',
          render: renderArticleMaxBid
        },
        {
          name: 'action',
          defaultContent: '',
          width: '15px',
          render: function (data, type, row) {
            let button = document.createElement('button');
            button.id = row.articleId;
            button.name = 'removeArticleFromClosedTabs';
            button.classList.add('ui-button', 'ui-corner-all', 'ui-widget', 'ui-button-icon-only');
            button.title = 'Entfernen';
            button.textContent = 'B';
            let span = document.createElement('span');
            span.classList.add('ui-button-icon', 'ui-icon', 'ui-icon-trash');
            let span2= document.createElement('span');
            span2.classList.add('ui-button-icon-space');
            button.appendChild(span);
            button.appendChild(span2);
            return button.outerHTML;
          }
        }
      ],
      order: [[3, "desc"]],
      columnDefs: [
        {searchable: false, "orderable": false, targets: [4, 5, 6, 7]},
        {type: "num", targets: [0, 5]},
        {className: "dt-body-center dt-body-nowrap", targets: [0,2,3,6, 7]}
      ],
      searchDelay: 400,
      rowId: 'articleId',
      pageLength: 10,
      language: getDatatableTranslation('de_DE')
    });

    // get closed tabs from sync storage and add them to the table
    // Note: we do not filter here at all, old entries which shouldnt be displayed should be removed from DB
    browser.storage.sync.get(null)
      .then(result => {
        Object.keys(result).forEach(key => {
          let data = result[key];
          if (data.hasOwnProperty('closedTime') && data.closedTime != null) {
            console.log("Biet-O-Matic: setupTableClosedArticles() Add row to closed tabs: %s", JSON.stringify(data));
            data.articleId = key;
            addClosedArticleToTable(data);
          }
        });
      })
      .catch(onError);
  }


  /*
   * MAIN
   */

    document.addEventListener('DOMContentLoaded', function () {
      detectWhoIAm().then(whoIAm => {
        pt.whoIAm = whoIAm;
        registerEvents();
        // restore settings from session storage (autoBidEnabled, bidAllEnabled)
        restoreSettings();
        setupTableActiveArticles();

        setupTableClosedArticles();

        configureUi();
        checkBrowserStorage().catch(onError);

        console.debug("DOMContentLoaded handler for window with id = %d completed (%O).", pt.whoIAm.currentWindow.id, pt.whoIAm.currentWindow);
      }).catch((err) => {
        console.error("Biet-O-Matic:; DOMContentLoaded post initialisation failed; %s", err);
      });
    });
};

popup();