/*
 * biet-o-matic.js - Ebay Article Overview (Extension Popup)
 * =======================================================
 * - Display each Ebay Article Tab in a Table
 * - Receives events from Ebay Article Tab Content Script
 * - Manages a simple database (e.g. containing the max-bids)
 *
 * By Sebastian Weitzel, sebastian.weitzel@gmail.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
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
     - browser.tabs.onremoved: Tab closed
   */
  function registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
      //console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
      switch (request.action) {
        case 'ebayArticleUpdated':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event ebayArticleUpdated received: tab=%s, detail=%s", sender.tab.id, JSON.stringify(request.detail));
            addOrUpdateArticle(sender.tab, request.detail)
              .catch(onError);
            // update BE favicon for this tab
            updateFavicon($('#inpAutoBid').prop('checked'), sender.tab);
          }
          break;
        case 'ebayArticleRefresh':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event ebayArticleRefresh received from tab %s", sender.tab.id);
            let dateCell = pt.table.cell(`#${sender.tab.id}`, 2);
            // redraw date
            dateCell.invalidate('data').draw();
          }
          break;
        case 'updateArticleStatus':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event updateArticleStatus received from tab %s: sender=%O, detail=%s",
              sender.tab.id, sender, JSON.stringify(request.detail));
            let row = pt.table.row(`#${sender.tab.id}`);
            let data = row.data();
            let statusCell = pt.table.cell(`#${sender.tab.id}`, 5);
            data.articleAuctionState = request.detail.message;
            statusCell.invalidate('data').draw();
          }
          break;
        case 'ebayArticleMaxBidUpdated':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event ebayArticleMaxBidUpdate received: sender=%O, detail=%O", sender, request.detail);
            let row = pt.table.row(`#${sender.tab.id}`);
            updateRowMaxBid(row, request.detail);
            storeArticleInfo(request.articleId, request.detail);
          }
          break;
        case 'getWindowSettings':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event getWindowSettings received: sender=%O", sender);
            return Promise.resolve(getWindowSettings());
          }
          break;
        case 'addArticleLog':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event addArticleLog received: tab=%d, detail=%s",
              sender.tab.id, JSON.stringify(request.detail));
            let row = pt.table.row(`#${sender.tab.id}`);
            let data = row.data();
            // show latest message in table (status column)
            let statusCell = pt.table.cell(`#${sender.tab.id}`, 5);
            data.articleAuctionState = request.detail.message.message;
            statusCell.invalidate('data').draw();
            storeArticleLog(request.articleId, request.detail);
          }
          break;
      }
    });

    // tab closed
    browser.tabs.onRemoved.addListener(function (tabId, removeInfo) {
      console.debug('Biet-O-Matic: tab(%d).onRemoved listener fired: %s', tabId, JSON.stringify(removeInfo));
      // window closing, no need to update anybody
      if (removeInfo.isWindowClosing === false) {
        // remove tab from table
        let row = pt.table.row(`#${tabId}`);
        if (row.length === 1) {
          row.remove().draw();
        }
      }
    });
    // tab reloaded
    /*browser.tabs.onUpdated.addListener(function (tabId, changeInfo, tabInfo) {
      console.debug('Biet-O-Matic: tab(%d).onUpdated listener fired: change=%s, tab=%O', tabId, JSON.stringify(changeInfo), tabInfo);
    });
     */

    // toggle autoBid for window
    browser.browserAction.onClicked.addListener(function (tab, clickData) {
      if (pt.whoIAm.currentWindow.id === tab.windowId) {
        console.debug('Biet-O-Matic: browserAction.onClicked listener fired: tab=%O, clickData=%O', tab, clickData);
        const toggle = $('#inpAutoBid');
        let checked = toggle.prop('checked');
        toggle.prop('checked', !checked);
        updateFavicon(!checked);
      }
    });

    // inpAutoBid checkbox
    $('#inpAutoBid').on('input', (e) => {
      console.debug('Biet-O-Matic: Automatic mode toggled: %s', e.target.checked);
      updateFavicon(e.target.checked);
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
    await browser.tabs.executeScript(tab.id, {file: 'thirdparty/browser-polyfill.min.js'});
    await browser.tabs.insertCSS(tab.id, {file: "css/contentScript.css"});
    await browser.tabs.executeScript(tab.id, {file: 'js/contentScript.js'});
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
    console.debug('Biet-O-Matic: addOrUpdateArticle(%s) tab=%O, info=%O', info.articleId, tab, info);
    info.tabId = tab.id;

    // complement with DB info
    let maxBid = null;
    let autoBid = false;
    let result = await browser.storage.sync.get(articleId);
    if (Object.keys(result).length === 1) {
      let storInfo = result[articleId];
      console.debug("Biet-O-Matic: Found info for Article %s in storage: %O", articleId, result);
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
      if (storInfo.hasOwnProperty('endTime')) {
        if (storInfo.endTime !== info.articleEndTime) {
          storInfo.endTime = info.articleEndTime;
          console.log("Biet-O-Matic: Updating article %s end time to %s", articleId, storInfo.endTime);
          storeArticleInfo(articleId, storInfo);
        }
      }
    }
    info.articleMaxBid = maxBid;
    info.articleAutoBid = autoBid;

    // article already in table
    let row = pt.table.row(`#${tab.id}`);
    if (row.length === 0 || typeof row === 'undefined') {
      // article not in table - simply add it
      addActiveArticleTab(info);
    } else {
      // article in table - update it
      updateActiveArticleTab(info, row);
    }

    // assign again, the row might have been just initialized
    row = pt.table.row(`#${tab.id}`);

    // add highlight colors for expired auctions
    highlightExpired(row, info);
  }

  /*
   * Add a new article to the active articles table
   */
  function addActiveArticleTab(info) {
    console.debug('Biet-O-Matic: addActiveArticleTab(%s), info=%O)', info.articleId, info);
    if (!info.hasOwnProperty('articleId')) {
      console.debug("addArticle skipped for tab %O, no info");
      return;

    }
    let row = pt.table.row.add(info);
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
  function checkBrowserStorage() {
    // total elements
    browser.storage.sync.get(null).then((result) => {
      // update html element storageCount
      $('#inpStorageCount').val(Object.keys(result).length);
    });
    // total size
    browser.storage.sync.getBytesInUse(null).then((result) => {
      $('#inpStorageSize').val(result);
    });
    $('#inpStorageClearAll').on('click', (e) => {
      console.debug('Biet-O-Matic: Alle Storage Einträge entfernt (Gebote, Einstellungen) %O', e);
      browser.storage.sync.clear().catch(onError);
      // reload page
      browser.tabs.reload();
    });
  }

  /*
   * Restore settings from browser storage
   */
  function restoreSettings() {
    // inpAutoBid
    pt.settings = {};
    browser.storage.sync.get('settings').then((result) => {
      console.debug("Biet-O-Matic: restoreSettings() updating from sync storage: settings=%O", result);
      if (typeof result.settings !== undefined) {
        pt.settings = result.settings;
      }
      /* Note: This doesnt make sense, autoBid is per browser window
      if (typeof pt.settings !== 'undefined' && pt.settings.hasOwnProperty('autoBidEnabled')) {
        $('#inpAutoBid').attr('checked', pt.settings.autoBidEnabled);
      }
      */
    });
  }

  /*
   * store articleInfo to sync storage
   *   will keep update values which are provided in the info object
   * - key: articleId
   * - value: endTime, minBid, maxBid, autoBid
   */
  async function storeArticleInfo(articleId, info, tabId = null) {
    if (articleId === null || typeof articleId === 'undefined') {
      console.warn("Biet-O-Matic: storeArticleInfo() - unknown articleId! info=%O tab=%O", info, tabId);
      return;
    }
    let settings = {};
    // restore from existing config
    let result = await browser.storage.sync.get(articleId);
    if (Object.keys(result).length === 1) {
      settings = result[articleId];
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
  }

  /*
   * Append log entry for Article to local storage
   */
  async function storeArticleLog(articleId, info) {
    // get info for article from storage
    let log = JSON.parse(window.localStorage.getItem(`log:${articleId}`));
    console.debug("Biet-O-Matic: storeArticleLog(%s) info=%s", articleId, JSON.stringify(info));
    if (log == null) log = [];
    log.push(info.message);
    window.localStorage.setItem(`log:${articleId}`, JSON.stringify(log));
  }

  /*
   * Configure UI Elements events:
   * - maxBid Input: If auction running and value higher than the current bid, enable the autoBid checkbox for this row
   * - autoBid checkbox: when checked, the bid and autoBid status is updated in the storage
   */
  function configureUi() {
    // settings
    $('#inpAutoBid').prop('checked', false);

    // maxBid input field
    $('.dataTable').on('change', 'tr input', function () {
      //console.debug('Biet-O-Matic: configureUi() INPUT Event e=%O, data=%O, val=%s', e, this, this.value);
      // parse articleId from id of both inputs
      let articleId = this.id
        .replace('chkAutoBid_', '')
        .replace('inpMaxBid_', '');
      // determine row by articleId
      const row = pt.table.row(`:contains(${articleId})`);
      let data = row.data();
      if (this.id.startsWith('inpMaxBid_')) {
        // maxBid was entered
        data.articleMaxBid = Number.parseFloat(this.value);
      } else if (this.id.startsWith('chkAutoBid_')) {
        // autoBid checkbox was clicked
        data.articleAutoBid = this.checked;
      }
      // update local with maxBid/autoBid changes
      updateRowMaxBid(row);
      // store info when maxBid updated
      let info = {
        endTime: data.articleEndTime,
        maxBid: data.articleMaxBid,
        autoBid: data.articleAutoBid
      };
      // update storage info
      storeArticleInfo(data.articleId, info, data.tabId);
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
  function updateFavicon(checked = false, tab = null) {
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
          browser.browserAction.setIcon({imageData: favImg, tabId: tab.id})
            .catch(onError);
        }
      }, onError);
    } else {
      // update for single tab
      console.debug("Biet-O-Matic: updateFavicon(), Set icon on tab %d (%s)", tab.id, tab.url);
      browser.browserAction.setIcon({imageData: favImg, tabId: tab.id})
        .catch(onError);
    }
  }
  //endregion


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
   * datatable: render column articleMaxBid
   * - input:number for maxBid
   * - label for autoBid and in it:
   * - input:checkbox for autoBid
   */
  function renderArticleMaxBid(data, type, row) {
    if (type !== 'display' && type !== 'filter') return data;
    //console.log("renderArticleMaxBid(%s) data=%O, type=%O, row=%O", row.articleId, data, type, row);
    let autoBid = false;
    if (row.hasOwnProperty('articleAutoBid')) {
      autoBid = row.articleAutoBid;
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
    inpMaxBid.step = '0.5';
    inpMaxBid.defaultValue = maxBid;
    const labelAutoBid = document.createElement('label');
    const chkAutoBid = document.createElement('input');
    chkAutoBid.id = 'chkAutoBid_' + row.articleId;
    chkAutoBid.type = 'checkbox';
    chkAutoBid.defaultChecked = autoBid;
    chkAutoBid.style.width = '15px';
    chkAutoBid.style.height = '15px';
    chkAutoBid.style.verticalAlign = 'middle';
    labelAutoBid.appendChild(chkAutoBid);
    const spanAutoBid = document.createElement('span');
    spanAutoBid.textContent = 'Aktiv';
    labelAutoBid.appendChild(spanAutoBid);

    // maxBid was entered, check if the autoBid field can be enabled
    if (row.hasOwnProperty('articleBidPrice') && row.articleBidPrice != null) {
      // if the maxBid is > current Price, unlock the autoBid checkbox
      // also minBid must be > articleBid (could be stale info)
      if (row.hasOwnProperty('articleMinimumBid') &&
        (row.hasOwnProperty('articleBidPrice') && row.articleMinimumBid *1 > row.articleBidPrice *1)) {
        chkAutoBid.disabled = false;
      } else if (row.hasOwnProperty('articleBidPrice') && row.articleMaxBid *1 > row.articleBidPrice *1) {
        // fallback if the minimum bid price is not set by article page
        chkAutoBid.disabled = false;
      } else if (chkAutoBid.checked === false) {
        // only deactivate checkbox if no active bid is defined
        chkAutoBid.disabled = true;
      }
      // if the maxBid is < minimum bidding price or current Price, add highlight color
      // *1 to ensure all values are numbers
      if ((row.articleMinimumBid *1 >= row.articleBidPrice *1 && row.articleMaxBid *1 < row.articleMinimumBid *1) ||
        row.articleMaxBid *1 <= row.articleBidPrice *1) {
        inpMaxBid.classList.add('bomHighlightBorder');
      } else {
        inpMaxBid.classList.remove('bomHighlightBorder');
      }
    }
    // disable maxBid/autoBid if article ended
    if (row.articleEndTime - Date.now() <= 0) {
      //console.debug("Biet-O-Matic: Article %s already ended, disabling inputs", row.articleId);
      inpMaxBid.disabled = true;
      chkAutoBid.disabled = true;
    }
    divArticleMaxBid.appendChild(inpMaxBid);
    divArticleMaxBid.appendChild(labelAutoBid);
    return divArticleMaxBid.outerHTML;
  }

  /*
   * Return settings for the current window
   * autoBidEnabled: Is autoBid enabled for this window?
   * bidMoment: When to execute the bid, early (10s) or late (2s)
   * howMany: How many articles to bid for this window (one or all)
   *
   */
  function getWindowSettings() {
    let settings = { autoBidEnabled: false, prepareBidSecs: 5};
    settings.autoBidEnabled = $('#inpAutoBid').is(':checked');
    settings.prepareBidSecs = Number.parseInt($('#inpPrepareBidSecs').val(), 10);
    return settings;
  }

  /*
   * MAIN
   */

  document.addEventListener('DOMContentLoaded', function () {
    detectWhoIAm().then(whoIAm => {
      pt.whoIAm = whoIAm;
      registerEvents();
      restoreSettings();
      updateFavicon();

      pt.table = $('#articles').DataTable({
        columns: [
          {
            data: 'articleId',
            visible: true,
            /*render: function(data) {
              return '<img src="ebay.png"><p>'+data+'</p>';
            }*/
          },
          {
            data: 'articleDescription',
            render: $.fn.dataTable.render.ellipsis(100, true, false),
            defaultContent: 'Unbekannt'
          },
          {
            data: 'articleEndTime',
            render: function (data, type, row) {
              if (typeof data !== 'undefined') {
                if (type !== 'display' && type !== 'filter') return data;
                let timeLeft = moment(data);  // jshint ignore:line
                moment.relativeTimeThreshold('ss', 0);
                timeLeft.locale('de');
                return `${fixDate({articleEndTime: data})} (${timeLeft.fromNow()})`;
              } else {
                return "unbegrenzt";
              }
            },
            defaultContent: '?'
          },
          {
            data: 'articleBidPrice',
            defaultContent: 0,
            render: renderArticleBidPrice
          },
          {data: 'articleShippingCost', 'defaultContent': '0.00'},
          {data: 'articleAuctionState', 'defaultContent': ''},
          {
            data: 'articleAutoBid',
            visible: false,
            defaultContent: "false"
          },
          {
            data: 'articleMaxBid',
            render: renderArticleMaxBid,
            defaultContent: 0
          }
        ],
        order: [[2, "asc"]],
        columnDefs: [
          {"searchable": false, "orderable": false, "targets": [4, 5, 6, 7]},
          { "type": "num", "targets": 7 },
          {"width": "100px", "targets": [0, 3, 4]},
          {"width": "220px", "targets": [2, 5, 6, 7]},
        ],
        searchDelay: 400,
        rowId: 'tabId',
        pageLength: 25,
        language:
        //"url": "https://cdn.datatables.net/plug-ins/1.10.20/i18n/German.json"
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
              }
            }
          }
      });
      // initialize tabs
      pt.whoIAm.currentWindow.tabs.forEach((tab) => {
        getArticleInfoForTab(tab)
          .then((articleInfo) => {
            if (articleInfo.hasOwnProperty('detail')) {
              addOrUpdateArticle(tab, articleInfo.detail);
            }
          });
      });

      // if first cell is clicked, active the tab of that article
      $('.dataTable').on('click', 'tbody tr', function (e) {
        //console.log('API row values : e=%O, data=%O', e, settings, pt.table.row(this).data());
        // first cell of a row clicked?
        if (e.target.cellIndex === 0) {
          let data = pt.table.row(this).data();
          if (typeof data !== 'undefined' && data.hasOwnProperty('tabId')) {
            browser.tabs.update(data.tabId, {active: true})
              .catch(onError);
          } else {
            console.debug('Biet-O-Matic: Unable to activate tab(2): data=%O', data);
          }
        }
      });

      configureUi();
      checkBrowserStorage();
      console.debug("DOMContentLoaded handler for window with id = %d completed (%O).", pt.whoIAm.currentWindow.id, pt.whoIAm.currentWindow.helloFromBom);
      pt.whoIAm.currentWindow.helloFromBom = "Date: " + moment().format();
    }).catch((err) => {
      console.error("Biet-O-Matic:; DOMContentLoaded post initialisation failed; %s", err);
    });
  });
};
popup();