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
    if (tab != null) {
      this.tabId = tab.id;
    }
    // stored article, not currently open in tab
    if (!this.hasOwnProperty('articleGroup') && info.hasOwnProperty('group'))
      this.articleGroup = info.group;
    if (!this.hasOwnProperty('articleBidPrice') && info.hasOwnProperty('bidPrice'))
      this.articleBidPrice = info.bidPrice;
    if (!this.hasOwnProperty('articleMaxBid') && info.hasOwnProperty('maxBid'))
      this.articleMaxBid = info.maxBid;
    if (!this.hasOwnProperty('articleAutoBid') && info.hasOwnProperty('autoBid'))
      this.articleAutoBid = info.autoBid;
    if (!this.hasOwnProperty('articleDescription') && info.hasOwnProperty('description'))
      this.articleDescription = info.description;
    if (!this.hasOwnProperty('articleEndTime') && info.hasOwnProperty('endTime'))
      this.articleEndTime = info.endTime;

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
    return Promise.resolve(browser.tabs.sendMessage(tab.id, {action: 'GetArticleInfo'}));
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
    let group = null;
    let maxBid = null;
    let autoBid = false;
    let result = await browser.storage.sync.get(this.articleId);
    if (Object.keys(result).length === 1) {
      let storInfo = result[this.articleId];
      console.debug("Biet-O-Matic: Found info for Article %s in storage: %s", this.articleId, JSON.stringify(result));
      // group
      if (storInfo.hasOwnProperty('group') && storInfo.group != null)
        group = storInfo.group;
      // maxBid
      if (storInfo.hasOwnProperty('maxBid') && storInfo.maxBid != null)
        maxBid = storInfo.maxBid;
      // autoBid
      if (storInfo.hasOwnProperty('autoBid'))
        autoBid = storInfo.autoBid;
    }
    this.articleGroup = group;
    this.articleMaxBid = maxBid;
    this.articleAutoBid = autoBid;
  }

  /*
   * store articleInfo to sync storage
   *   will use values which are provided in the info object to update existing ones
   * - key: articleId
   * - from contentScript: minBid, maxBid, autoBid
   * - from popup: group, description, bidPrice
   */
  async updateInfoInStorage(info, tabId = null, onlyIfExists = false) {
    let storedInfo = {};
    if (info == null || typeof info === 'undefined')
      return;
    // restore from existing config
    let result = await browser.storage.sync.get(this.articleId);
    if (Object.keys(result).length === 1) {
      storedInfo = result[this.articleId];
    } else {
      // should we only store the info if an storage entry already exists?
      if (onlyIfExists === true) return false;
    }
    // store maxBid as number
    if (info.hasOwnProperty('maxBid')) {
      if (typeof info.maxBid === 'string') {
        console.debug("Biet-O-Matic: updateInfoInStorage() Convert maxBid string=%s to float=%s",
          info.maxbid, Number.parseFloat(info.maxBid.replace(/,/, '.')));
        info.maxBid = Number.parseFloat(info.maxBid.replace(/,/, '.'));
      }
    }
    // merge new info into existing settings
    let newSettings = Object.assign({}, storedInfo, info);
    // https://stackoverflow.com/a/37396358
    let diffSettings = Object.keys(info).reduce((diff, key) => {
      if (storedInfo[key] === info[key]) return diff;
      let text = info[key];
      if (storedInfo.hasOwnProperty(key) && storedInfo[key] != null && typeof storedInfo[key] !== 'undefined')
        text = `${storedInfo[key]} -> ${info[key]}`;
      return {
        ...diff,
        [key]: text
      };
    }, {});
    if (JSON.stringify(storedInfo) !== JSON.stringify(info)) {
      this.addLog({
        component: "Artikel",
        level: "Einstellungen",
        message: `Aktualisiert: '${JSON.stringify(diffSettings)}'`,
      });
      // Finally add article info (description, bidPrice) which will be used when the article tab is not open
      newSettings.endTime = this.articleEndTime;
      newSettings.description = this.articleDescription;
      newSettings.bidPrice = this.articleBidPrice;
      // store the settings back to the storage
      await browser.storage.sync.set({[this.articleId]: newSettings});
      if (tabId != null) {
        // send update to article tab
        await browser.tabs.sendMessage(tabId, {
          action: 'UpdateArticleMaxBid',
          detail: info
        });
      }
    }
  }

  /*
   * merge updated info and add the change to the article log
   */
  updateInfo(info, tabId) {
    let modified = 0;
    // new tabId
    if (tabId != null && tabId !== this.tabId) {
      this.addLog({
        component: "Artikel",
        level: "Aktualisierung",
        message: Article.getDiffMessage('Tab', this.tabId, tabId),
      });
      this.tabId = tabId;
      modified++;
    }
    // articleDescription
    if (info.hasOwnProperty('articleDescription') && info.articleDescription !== this.articleDescription) {
        this.addLog({
          component: "Artikel",
          level: "Aktualisierung",
          message: Article.getDiffMessage('Beschreibung', this.articleDescription, info.articleDescription),
        });
        this.articleDescription = info.articleDescription;
        modified++;
        // todo: optionally deactivate autoBid for this article?
    }
    // articleBidPrice
    if (info.hasOwnProperty('articleBidPrice') && info.articleBidPrice !== this.articleBidPrice) {
      this.addLog({
        component: "Artikel",
        level: "Aktualisierung",
        message: Article.getDiffMessage('Preis', this.articleBidPrice, info.articleBidPrice),
      });
      this.articleBidPrice = info.articleBidPrice;
      modified++;
    }
    // articleBidCount
    if (info.hasOwnProperty('articleBidCount') && info.articleBidCount !== this.articleBidCount) {
      this.addLog({
        component: "Artikel",
        level: "Aktualisierung",
        message: Article.getDiffMessage('Anzahl Gebote', this.articleBidCount, info.articleBidCount),
      });
      this.articleBidCount = info.articleBidCount;
      modified++;
    }
    // articleShippingCost
    if (info.hasOwnProperty('articleShippingCost') && info.articleShippingCost !== this.articleShippingCost) {
      this.addLog({
        component: "Artikel",
        level: "Aktualisierung",
        message: Article.getDiffMessage('Lieferkosten', this.articleShippingCost, info.articleShippingCost),
      });
      this.articleShippingCost = info.articleShippingCost;
      modified++;
    }
    // articleMinimumBid
    if (info.hasOwnProperty('articleMinimumBid') && info.articleMinimumBid !== this.articleMinimumBid) {
      this.addLog({
        component: "Artikel",
        level: "Aktualisierung",
        message: Article.getDiffMessage('Minimal Gebot', this.articleMinimumBid, info.articleMinimumBid),
      });
      this.articleMinimumBid = info.articleMinimumBid;
      modified++;
    }
    // articleEndTime
    if (info.hasOwnProperty('articleEndTime') && info.articleEndTime !== this.articleEndTime) {
      this.addLog({
        component: "Artikel",
        level: "Aktualisierung",
        message: Article.getDiffMessage('Auktionsende', this.articleEndTime, info.articleEndTime),
      });
      this.articleEndTime = info.articleEndTime;
      modified++;
    }
    return modified;
  }

  static getDiffMessage(description, oldVal, newVal) {
    if (oldVal == null || typeof oldVal === 'undefined')
      return `${description}: ${newVal}`;
    else
      return `${description}: ${oldVal} -> ${newVal}`;
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

  getPrettyEndTime() {
    let date = 'n/a';
    let timeLeft = 'n/a';
    if (this.hasOwnProperty('articleEndTime') && typeof this.articleEndTime !== 'undefined') {
      timeLeft = formatDistanceToNow(this.articleEndTime, {includeSeconds: true, locale: de, addSuffix: true});
      date = new Intl.DateTimeFormat('default', {'dateStyle': 'medium', 'timeStyle': 'medium'})
        .format(new Date(this.articleEndTime));
    }
    return `${date} (${timeLeft})`;
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

  // get formatted bid price: EUR 123,12
  getPrettyBidPrice() {
    //console.log("data=%O, type=%O, row=%O", data, type, row);
    let currency;
    if (this.hasOwnProperty('articleCurrency')) {
      currency = this.articleCurrency;
    } else {
      console.warn("Biet-O-Matic: Article %s - using default currency EUR", this.articleId);
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
    console.debug("Biet-O-Matic: activateAutoBid(), maxBidValue=%s (%s), minBidValue=%s (%s)",
      this.articleMaxBid, typeof this.articleMaxBid,  this.articleMinimumBid, typeof this.articleMinimumBid);
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
    if ($(selector).length === 0 )
      throw new Error(`Unable to initialize articles table, selector '${selector}' not found in DOM`);
    $.fn.DataTable.RowGroup.defaults.emptyDataGroup = "Keine Gruppe";
    this.DataTable = ArticlesTable.init(selector);
    this.addSearchFields();
    this.registerEvents();
    this.registerTableEvents();
  }

  // setup articles table
  static init(selector) {
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
            a.href = 'https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=' + row.articleId;
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
          orderable: false,
          render: function (data, type, row) {
            if (typeof data !== 'undefined') {
              if (type !== 'display' && type !== 'filter')
                return data;
              return row.getPrettyEndTime();
            } else {
              // e.g. sofortkauf
              return "unbegrenzt";
            }
          },
          defaultContent: '?'
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
          orderable: false,
          defaultContent: '',
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
        {width: "300px", targets: [2, 6]}
      ],
      searchDelay: 400,
      rowId: 'articleId',
      pageLength: 25,
      responsive: {details: false},
      ordering: true,
      order: [ 3, 'asc' ],
      orderFixed: {
        pre: [ 7, 'asc' ]
      },
      orderMulti: true,
      rowGroup: {dataSrc: 'articleGroup'},
      dom: '<l<t>ip>',
      language: ArticlesTable.getDatatableTranslation('de_DE')
    });
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
        at.reloadTab(myTab.id);
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
      let info = storedInfo[articleId];
      info.articleId = articleId;
      console.debug("Biet-O-Matic: addArticlesFromStorage(%s) info=%s", articleId, JSON.stringify(info));
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
    //console.log("addArticle() called");
    if (article instanceof Article) {
      let row = this.DataTable.row.add(article);
      this.highlightArticleIfExpired(row);
      row.draw(false);
      return row;
    } else {
      console.warn("Biet-O-Matic: Adding article failed; incorrect type: %O", article);
      return null;
    }
  }

  // update article with fresh information
  updateArticle(articleInfo, row = null, tabId = null) {
    if (row == null)
      row = this.getRow(`#${articleInfo.articleId}`);
    if (row == null || row.length !== 1) return;
    const article = row.data();
    console.log("Biet-O-Matic: updateArticle(%s)", articleInfo.articleId);
    // sanity check if the info + row match
    if (article.articleId !== articleInfo.articleId) {
      throw new Error("updateArticle() ArticleInfo and Row do not match!");
    }
    if (article.updateInfo(articleInfo, tabId) > 0) {
      row.invalidate('data').draw(false);
      article.updateInfoInStorage(null, null, true);
    }
    this.highlightArticleIfExpired(row);
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
 * Note: the update can either be triggered from the article page, or via user editing on the datatable
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
  addOrUpdateArticle(articleInfo, tab) {
    if (!articleInfo.hasOwnProperty('articleId')) {
      return;
    }
    let articleId = articleInfo.articleId;
    console.debug('Biet-O-Matic: addOrUpdateArticle(%s) tab=%O, info=%s', articleId, tab, JSON.stringify(articleInfo));

    // check if tab articleId changed
    const oldArticleId = this.getArticleIdByTabId(tab.id);
    if (oldArticleId != null && oldArticleId !== articleInfo.articleId) {
      // remove article from the table, or unset at least the tabId
      this.removeArticleIfBoring(tab.id);
    }

    // article already in table?
    const rowByArticleId = this.DataTable.row(`#${articleId}`);
    // check if article is already open in another tab
    if (rowByArticleId.length !== 0 && typeof rowByArticleId !== 'undefined') {
      if (rowByArticleId.data().tabId != null && rowByArticleId.data().tabId !== tab.id) {
        throw new Error(`Article ${articleId} is already open in another tab (${rowByArticleId.data().tabId})!`);
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
      this.updateArticle(articleInfo, rowByArticleId, tab.id);
    }
  }

  /*
   * remove an closed article from the table if its uninteresting. Will be called if a tab is closed/changed
   * An article is regarded uninteresting if no maxBid defined yet
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
        if (storageInfo != null && storageInfo.hasOwnProperty('maxBid') && storageInfo.maxBid != null) {
          // redraw, tabid has been updated
          console.debug("Biet-O-Matic: removeArticleIfBoring(%d), keeping article %s.", tabId, articleId);
          row.invalidate('data').draw(false);
        } else {
          console.debug("Biet-O-Matic: removeArticleIfBoring(%d), removed article %s.", tabId, articleId);
          // remove from table
          row.remove().draw(false);
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
    if (!row.hasOwnProperty('articleBidPrice'))
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
    inpMaxBid.defaultValue = maxBid.toString(10);
    inpMaxBid.style.width = "60px";
    const labelAutoBid = document.createElement('label');
    const chkAutoBid = document.createElement('input');
    chkAutoBid.id = 'chkAutoBid_' + row.articleId;
    chkAutoBid.title = 'Aktiviert die "Automatisch Bieten" Funktion für diesen Artikel';
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
      chkAutoBid.disabled = !row.activateAutoBid();
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

  static renderArticleGroup(data, type, row) {
    if (type !== 'display') return data;
    console.debug("Biet-O-Matic: renderArticleGroup(%s) data=%s, type=%O, row=%O", row.articleId, data, type, row);
    let div = document.createElement('div');
    const inpGroup = document.createElement('input');
    inpGroup.id = 'inpGroup_' + row.articleId;
    inpGroup.type = 'text';
    inpGroup.setAttribute('maxlength', '32');
    inpGroup.multiple = false;
    inpGroup.style.width = "60px";
    inpGroup.placeholder = 'Gruppe';
    if (data != null && typeof data !== 'undefined')
      inpGroup.defaultValue = data;
    div.appendChild(inpGroup);
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
    return div.outerHTML;
  }

  /*
   * Render Article Bid Price
   * - when articleBidPrice is emtpy, use articleBuyPrice (sofortkauf)
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

  /*
   * Remove information for article
   * - log from window.localStorage
   * - settings from browser sync storage
   */
  removeArticle(rowNode) {
    if (typeof rowNode === 'undefined' || rowNode.length !== 1)
      return;
    const row = this.DataTable.row(rowNode);
    if (typeof row === 'undefined' || row.length !== 1)
      return;
    const article = row.data();
    article.removeAllLogs();
    row.child(false);
    article.removeInfoFromStorage().then(() => {
      row.invalidate('data').draw(false);
    });
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
        url: 'https://cgi.ebay.de/ws/eBayISAPI.dll?ViewItem&item=' + article.articleId,
        active: false,
        openerTabId: Popup.tabId
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

  /* reload a tab
   * check if a reload has been recently performed and only reload if > 60 seconds ago
   */
  static reloadTab(tabId = null) {
    if (tabId == null) return;
    if (this.hasOwnProperty('reloadInfo') && this.reloadInfo.hasOwnProperty(tabId)) {
      if ((Date.now() - this.reloadInfo[tabId]) < (60 * 1000)) {
        console.debug("Biet-O-Matic: Tab %d skipped reloading (was reloaded less then a minute ago", tabId);
        return;
      }
    } else {
      this.reloadInfo = {};
    }
    console.debug("Biet-O-Matic: Tab %d reloaded to attempt repairing contentScript", tabId);
    this.reloadInfo[tabId] = Date.now();
    browser.tabs.reload(tabId);
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

  /*
   * If an article is close to ending or ended, highlight the endDate
   * if it ended, highlight the status as well
   */
  highlightArticleIfExpired(row) {
    let article = row.data();
    let node = this.DataTable.cell(`#${article.articleId}`, 'articleEndTime:name').node();
    if (article.articleEndTime - Date.now() < 0) {
      // ended
      $(node).css('color', 'red');
    } else if (article.articleEndTime - Date.now() < 600) {
      // ends in 10 minute
      $(node).css('text-shadow', '0px -0px 2px #FF0000');
    }
  }

  /*
   * Events for the Articles Table:
   * - ebayArticleUpdated: from content script with info about article
   * - ebayArticleMaxBidUpdated: from content script to update maxBid info
   * - ebayArticleRefresh: from content script, simple info to refresh the row (update remaining time)
   * - getArticleInfo: return article info from row
   * - getArticleSyncInfo: return article info from sync storage
   * - addArticleLog: from content script to store log info for article
   * - browser.tabs.updated: reloaded/new url
   * - browser.tabs.removed: Tab closed
   * - storage changed
   *
   * - updateArticleStatus: from content script to update the Auction State with given info
   * - ebayArticleGetAdjustedBidTime: returns adjusted bidding time for a given articleId (see below for details)
   */
  registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
      //console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
      switch (request.action) {
        case 'ebayArticleUpdated':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event ebayArticleUpdated received from tab %s, articleId=%s, articleDescription=%s",
                sender.tab.id, request.detail.articleId, request.detail.articleDescription);
              this.updateArticle(request.detail, null, sender.tab.id);
              // update BE favicon for this tab
              //updateFavicon($('#inpAutoBid').prop('checked'), sender.tab);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: ebayArticleUpdated() internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'ebayArticleMaxBidUpdated':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event ebayArticleMaxBidUpdate received from tab %s, detail=%s",
                sender.tab.id, JSON.stringify(request.detail));
              const row = this.getRow(`#${request.articleId}`);
              const article = row.data();
              this.updateRowMaxBid(request.detail, row);
              article.updateInfoInStorage(request.detail, null).then();
            }
          } catch (e) {
            console.warn("Biet-O-Matic: ebayArticleMaxBidUpdated() internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'ebayArticleRefresh':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event ebayArticleRefresh received from tab %s", sender.tab.id);
              const articleId = this.getArticleIdByTabId(sender.tab.id);
              // redraw date (COLUMN 3)
              let dateCell = this.DataTable.cell(`#${articleId}`, 'articleEndTime:name');
              // redraw date
              if (dateCell !== 'undefined' && dateCell.length === 1)
                dateCell.draw(false);
            }
          } catch (e) {
            console.warn("Biet-O-Matic: ebayArticleRefresh() internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
        case 'getArticleInfo':
          try {
            if (this.currentWindowId === sender.tab.windowId) {
              console.debug("Biet-O-Matic: Browser Event getArticleInfo received from tab %s", sender.tab.id);
              if (request.hasOwnProperty('articleId')) {
                // determine row by articleId
                const row = this.getRow(`#${request.articleId}`);
                const article = row.data();
                return Promise.resolve({
                  data: Article.getInfoForTab(article),
                  tabId: sender.tab.id
                });
              }
            }
          } catch (e) {
            console.warn("Biet-O-Matic: getArticleInfo() internal error: %s", e.message);
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
              }
            }
          } catch (e) {
            console.warn("Biet-O-Matic: getArticleSyncInfo() internal error: %s", e.message);
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
            }
          } catch (e) {
            console.warn("Biet-O-Matic: addArticleLog() internal error: %s", e.message);
            throw new Error(e.message);
          }
          break;
      }
    });

    /*
     * tab reloaded or URL changed
     * The following cases should be handled:
     * - Same page, but maybe updated info
     * - An existing tab is used to show a different article
     *   -> get updated info and update table
     * - An existing article tab navigated away from ebay -> remove from table
     * - In last 2 cases, handle same as a closed tab
     */
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tabInfo) => {
      try {
        // status == complete, then inject content script, request info and update table
        if (changeInfo.status === 'complete') {
          console.debug('Biet-O-Matic: tab(%d).onUpdated listener fired: change=%s, tab=%s',
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
      console.log("XXX browser %s storage changed: %s", area, JSON.stringify(changes));
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
        // check if maxBid > buyPrice (sofortkauf), then adjust it to the buyprice - 1 cent
        if (article.hasOwnProperty('articleBuyPrice') && article.articleMaxBid > article.articleBuyPrice) {
          article.articleMaxBid = article.articleBuyPrice - 0.01;
        }
      } else if (e.target.id.startsWith('chkAutoBid_')) {
        // autoBid checkbox was clicked
        article.articleAutoBid = e.target.checked;
      } else if (e.target.id.startsWith('inpGroup_')) {
        // group has been updated
        if (e.target.value === '')
          article.articleGroup = undefined;
        else
          article.articleGroup = e.target.value;
      }

      // redraw the row
      row.invalidate('data').draw(false);
      // store info when inputs updated
      let info = {};
      if (article.hasOwnProperty('articleEndTime'))
        info.endTime = article.articleEndTime;
      if (article.hasOwnProperty('articleMaxBid'))
        info.maxBid = article.articleMaxBid;
      if (article.hasOwnProperty('articleAutoBid'))
        info.autoBid = article.articleAutoBid;
      if (article.hasOwnProperty('articleGroup'))
        info.group = article.articleGroup;
      // update storage info and inform tab of new values
      article.updateInfoInStorage(info, article.tabId)
        .catch(e => {
          console.warn("Biet-O-Matic: Failed to store article info: %s", e.message);
        });
    });


    // datatable length change
    this.DataTable.on('length.dt', function (e, settings, len) {
      Popup.updateSetting('articlesTableLength', len);
    });

    // if articleId cell is clicked, active the tab of that article
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
  }
}

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
    this.registerEvents();

    this.table = new ArticlesTable(this, '#articles');
    await this.table.addArticlesFromTabs();
    await this.table.addArticlesFromStorage();
    // restore settings from session storage (autoBidEnabled, bidAllEnabled)
    this.restoreSettings();
    await Popup.checkBrowserStorage();

    this.tabId = await Popup.getOwnTabId();
  }

  /*
   * register events:
   * - ebayArticleUpdated: from content script with info about article
   * - ebayArticleRefresh: from content script, simple info to refresh the row (update remaing time)
   * - ebayArticleMaxBidUpdated: from content script to update maxBid info
   * - getWindowSettings: from content script to retrieve the settings for this window (e.g. autoBidEnabled)
   * - addArticleLog: from content script to store log info for article
   * - ebayArticleGetAdjustedBidTime: returns adjusted bidding time for a given articleId (see below for details)
   * - browser.tabs.onremoved: Tab closed
   */
  registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
      //console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
      switch (request.action) {
        case 'getWindowSettings':
          if (this.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Biet-O-Matic: Browser Event getWindowSettings received: sender=%O", sender);
            return Promise.resolve(JSON.parse(window.sessionStorage.getItem('settings')));
          }
          break;
      }
    });

    // toggle autoBid for window when button in browser menu clicked
    // the other button handler is setup below
    browser.browserAction.onClicked.addListener(function (tab, clickData) {
      if (this.whoIAm.currentWindow.id === tab.windowId) {
        console.debug('Biet-O-Matic: browserAction.onClicked listener fired: tab=%O, clickData=%O', tab, clickData);
        const toggle = $('#inpAutoBid');
        let checked = toggle.prop('checked');
        // only toggle favicon for ebay tabs
        if (tab.url.startsWith(browser.extension.getURL("")) || tab.url.match(/^https?:\/\/.*\.ebay\.(de|com)\/itm/)) {
          toggle.prop('checked', !checked);
          Popup.updateSetting('autoBidEnabled', !checked);
          // note, in chrome the action click cannot be modified with shift
          Popup.updateSetting('simulate', false);
          Popup.updateFavicon(!checked, null, false);
        }
      }
    });

    // window inpAutoBid checkbox
    const inpAutoBid = $('#inpAutoBid');
    inpAutoBid.on('click', e => {
      e.stopPropagation();
      console.debug('Biet-O-Matic: Automatic mode toggled: %s - shift=%s, ctrl=%s', inpAutoBid.is(':checked'), e.shiftKey, e.ctrlKey);
      Popup.updateSetting('autoBidEnabled', inpAutoBid.is(':checked'));
      // when shift is pressed while clicking autobid checkbox, enable Simulation mode
      if (inpAutoBid.is(':checked') && e.shiftKey) {
        console.log("Biet-O-Matic: Enabling Simulation mode.");
        Popup.updateFavicon(inpAutoBid.is(':checked'), null, true);
        Popup.updateSetting('simulate', true);
        $("#lblAutoBid").text('Automatikmodus (Test)');
        $("#internal").removeClass('hidden');
      } else {
        Popup.updateFavicon(inpAutoBid.is(':checked'), null, false);
        Popup.updateSetting('simulate', false);
        $("#lblAutoBid").text('Automatikmodus');
        $("#internal").addClass('hidden');
      }
    });
    // window bidAll checkbox
    const inpBidAll = $('#inpBidAll');
    inpBidAll.on('click', e => {
      console.debug('Biet-O-Matic: Bid all articles mode toggled: %s', inpBidAll.is(':checked'));
      Popup.updateSetting('bidAllEnabled', inpBidAll.is(':checked'));
    });
  }

  /*
   * Restore settings from window session storage
   */
  restoreSettings() {
    // inpAutoBid
    let result = JSON.parse(window.sessionStorage.getItem('settings'));
    if (result != null) {
      console.debug("Biet-O-Matic: restoreSettings() updating from session storage: settings=%s", JSON.stringify(result));
      if (result.hasOwnProperty('autoBidEnabled')) {
        $('#inpAutoBid').prop('checked', result.autoBidEnabled);
      }
      if (result.hasOwnProperty('simulate') && result.simulate) {
        $("#lblAutoBid").text('Automatikmodus (Test)');
        Popup.updateFavicon($('#inpAutoBid').is(':checked'), null, true);
        $("#internal").removeClass('hidden');
      } else {
        Popup.updateFavicon($('#inpAutoBid').is(':checked'));
      }
      if (result.hasOwnProperty('bidAllEnabled')) {
        $('#inpBidAll').prop('checked', result.bidAllEnabled);
      }
      // pagination setting for articlesTable
      if (result.hasOwnProperty('articlesTableLength') && this.table != null) {
        this.table.DataTable.page.len(result.articlesTableLength).draw();
      }
    }
  }

  /*
   * update setting in session storage:
   * autoBidEnabled - Automatic Bidding enabled
   * bidAllEnabled  - Bid should be placed for all articles, even one was already won.
   * simulate       - Perfom simulated bidding (do all , but not confirm the bid)
   */
  static updateSetting(key, value) {
    console.debug("Biet-O-Matic: updateSetting() key=%s, value=%s", key, JSON.stringify(value));
    let result = JSON.parse(window.sessionStorage.getItem('settings'));
    if (result == null)
      result = {};
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

}

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
      console.debug("Biet-O-Matic: DOMContentLoaded handler for window with id = %d completed (%O).",
        popup.whoIAm.currentWindow.id, popup.whoIAm.currentWindow);
    })
    .catch(e => {
      console.warn("Biet-O-Matic: Popup initialization failed: %s", e.message);
    });
});
