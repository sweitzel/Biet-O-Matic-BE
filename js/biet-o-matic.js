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

  function onError(error, sender) {
    console.error("Error: %O, Sender: %O", error, sender);
  }

  /*
   register events:
     - custom 'ebayArticleUpdated': from content script with info about article
     - browser.tabs.onremoved: Tab closed
   */
  function registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request, sender) => {
      //console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
      switch (request.action) {
        case 'ebayArticleUpdated':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Browser Event ebayArticleUpdated received: sender=%O, detail=%O", sender, request.detail);
            addOrUpdateArticle(sender.tab, request.detail);
          }
          break;
        case 'ebayArticleRefresh':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Browser Event ebayArticleRefresh received from tab %s: sender=%O", sender.tab.id, sender);
            let dateCell = pt.table.cell(`#${sender.tab.id}`, 2);
            // redraw date
            //dateCell.draw();
          }
          break;
        case 'ebayArticleMaxBidUpdated':
          if (pt.whoIAm.currentWindow.id === sender.tab.windowId) {
            console.debug("Browser Event ebayArticleMaxBidUpdate received: sender=%O, detail=%O", sender, request.detail);
            let row = pt.table.row(`#${sender.tab.id}`);
            let data = row.data();
            updateRowMaxBid(row, request.detail.maxBid, request.detail.autoBid);
            storeArticleInfo(
              data.articleId,
              {
                endTime: data.articleEndTime,
                maxBid: request.detail.maxBid,
                autoBid: request.detail.autoBid
              },
              sender.tab.id,
              false
            );
          }
          break;
      }
    });

    // tab closed
    browser.tabs.onRemoved.addListener(function (tabId, removeInfo) {
      console.debug('Biet-O-Mat: tab(%d).onRemoved listener fired: %s', tabId, JSON.stringify(removeInfo));
      // window closing, no need to update anybody
      if (removeInfo.isWindowClosing === false) {
        // remove tab from table
        let row = pt.table.row(`#${tabId}`);
        if (row.length === 1) {
          row.remove().draw();
        }
      }
    });

    // inpAutoBid checkbox
    $('#inpAutoBid').on('input', (e) => {
      console.debug('Biet-O-Mat: Automatic mode toggled: %s', e.target.checked);
      //storeSetting('autoBidEnabled', e.target.checked);
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
    console.debug("detectWhoIAm(): window=%O", ret.currentWindow);
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
  function addOrUpdateArticle(tab, info) {
    if (!info.hasOwnProperty('articleId')) {
      return;
    }
    let row = pt.table.row(`#${tab.id}`);
    let articleId = info.articleId;
    console.debug('Biet-O-Mat: addOrUpdateArticle(%s) tab=%O, info=%O, row=%O', info.articleId, tab, info, row);
    info.tabId = tab.id;
    // article already in table
    if (row.length === 0 || typeof row === 'undefined') {
      // article not in table - simply add it
      addActiveArticleTab(info);
    } else {
      // article in table - update it
      updateActiveArticleTab(info, row);
    }

    // assign again, the row might have been just initialized
    row = pt.table.row(`#${tab.id}`);

    // complement with DB info
    updateRowMaxBid(row, null, null);
    browser.storage.sync.get(articleId).then((result) => {
      if (Object.keys(result).length === 1) {
        let maxBid = null;
        let autoBid = null;
        let storInfo = result[articleId];
        console.debug("Biet-O-Mat: Found info for Article %s in storage: %O", articleId, result);
        // maxBid
        if (storInfo.hasOwnProperty('maxBid')) {
          // get article row and update autoBid checkbox
          maxBid = Number.parseFloat(storInfo.maxBid);
        }
        // autoBid
        if (storInfo.hasOwnProperty('autoBid')) {
          autoBid = storInfo.autoBid;
        }
        updateRowMaxBid(row, maxBid, autoBid);
        // if articleEndTime changed, store it
        if (storInfo.hasOwnProperty('endTime')) {
          if (storInfo.endTime !== row.data().articleEndTime) {
            storInfo.endTime = row.data().articleEndTime;
            console.log("Biet-O-Matic: Updating article %s end time to %s", articleId, storInfo.endTime);
            storeArticleInfo(articleId, storInfo);
          }
        }
      }
    });
    // add highlight colors for expired auctions
    highlightExpired(row, info);
  }

  /*
   * Add a new article to the active articles table
   */
  function addActiveArticleTab(info) {
    console.debug('Biet-O-Mat: addActiveArticleTab(%s), info=%O)', info.articleId, info);
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
    console.debug('Biet-O-Mat: updateActiveArticleTab(%s) info=%O, row=%O', info.articleId, info, row);
    if (!info.hasOwnProperty('articleId')) {
      console.debug("addArticle skipped for tab %O, no info");
      return;
    }
    row.data(info).draw();
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
      console.info('Biet-O-Mat: Alle Storage Einträge entfernt (Gebote, Einstellungen)');
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
      console.debug("Biet-O-Mat: restoreSettings() updating from sync storage: settings=%O", result);
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

  // store a setting to sync storage
  function storeSetting(key, value) {
    if (typeof pt.settings === 'undefined') {
      console.warn("Biet-O-Matic: storeSetting() key=%O, value=%O - pt.settings still undefined!?!", key, value);
      restoreSettings();
    }
    pt.settings[key] = value;
    browser.storage.sync.set({"settings": pt.settings})
      .then((e) => {
        console.log('Biet-O-Mat: Successfully saved to sync-storage: %O', pt.settings);
      }).catch(onError);
  }

  /*
   * store articleInfo to sync storage
   * - key: articleId
   * - value: endTime, maxBid, autoBid
   */
  function storeArticleInfo(articleId, info, tabId, informTab = true) {
    if (articleId === null || typeof articleId === 'undefined') {
      console.warn("Bit-O-Matic: storeArticleInfo - unknown articleId! info=%O tab=%O", info, tabId);
      return;
    }
    browser.storage.sync.set({[articleId]: info})
      .then((e) => {
        console.debug('Biet-O-Mat: Successfully saved Article %s info to sync-storage: %O, tab %O', articleId, info, tabId);
        if (informTab) {
          // send update to article tab
          browser.tabs.sendMessage(tabId, {
            action: 'UpdateArticleMaxBid',
            detail: info
          });
        }
      }).catch(onError);
  }

  /*
   * Configure UI Elements events:
   * - maxBid Input: If auction running and value higher than the current bid, enable the autoBid checkbox for this row
   * - autoBid checkbox: when checked, the bid and autoBid status is updated in the storage
   */
  function configureUi() {
    // maxBid input field
    $('.dataTable').on('input', 'tr input', function (e) {
      console.debug('configureUi() INPUT Event e=%O, data=%O', e, this);
      if (this.parentNode.parentNode.nodeName !== 'TR') {
        console.warn('Biet-O-Mat: configureUi() missing parentNode id, %O', this.parentNode);
        return;
      }
      let tabId = parseInt(this.parentNode.parentNode.id, 10);
      let row = pt.table.row(`#${tabId}`);
      let data = row.data();

      let maxBidValue = null;
      let autoBidChecked = null;
      if (this.name === 'inpMaxBid') {
        // maxBid was entered
        maxBidValue = this.valueAsNumber;
      } else if (this.name === 'chkAutoBid') {
        // autoBid checkbox was clicked
        autoBidChecked = this.checked;
      }
      // store info when maxBid updated
      let info = {
        endTime: data.articleEndTime,
        autoBid: autoBidChecked,
        maxBid: maxBidValue
      };
      updateRowMaxBid(row, maxBidValue, autoBidChecked);
      storeArticleInfo(data.articleId, info, tabId, true);
    });
  }

  /*
   * Updates the maxBid input and autoBid checkbox for a given row
   */
  function updateRowMaxBid(row, maxBid, autoBid) {
    //row.invalidate();
    let data = row.data();
    console.debug('Biet-O-Mat: updateRowMaxBid(%s) row=%O, maxBid=%O, autoBid=%O data=%O',
      data.articleId, data, maxBid, autoBid, data);
    if (typeof data === 'undefined' || !data.hasOwnProperty('articleBidPrice')) {
      console.warn('Biet-O-Mat: updateRowMaxBid for row=%O - missing articleBidPrice in data', data);
      return;
    }
    // maxBid
    let maxBidInput = null;
    // get article row and update autoBid checkbox
    row.node().lastChild.childNodes.forEach((child) => {
      if (child.name === 'inpMaxBid') {
        maxBidInput = child;
        if (maxBid !== null) {
          maxBidInput.value = maxBid;
        }
      }
    });
    // autoBid
    let autoBidCheckbox = null;
    // get article row and update autoBid checkbox
    row.node().lastChild.childNodes.forEach((child) => {
      if (child.name === 'chkAutoBid') {
        autoBidCheckbox = child;
        if (autoBid != null) {
          autoBidCheckbox.checked = autoBid;
        }
      }
    });

    // maxBid was entered, check if the autoBid field can be enabled
    if (data.hasOwnProperty('articleBidPrice')) {
      // if the maxBid is > current Price, unlock the autoBod checkbox
      if (maxBidInput !== null && maxBidInput.valueAsNumber > data.articleBidPrice) {
        if (autoBidCheckbox !== null) {
          autoBidCheckbox.disabled = false;
        }
      } else if (autoBidCheckbox !== null && autoBidCheckbox.checked === false) {
        // only deactivate checkbox if no active bid is defined
        autoBidCheckbox.disabled = true;
      }

      // if the maxBid is < current Price, add highlight color
      if (maxBidInput === null || maxBidInput.valueAsNumber > data.articleBidPrice) {
        maxBidInput.classList.remove('bomHighlightBorder');
      } else {
        maxBidInput.classList.add('bomHighlightBorder');
      }
    }

    // disable maxBid/autoBid if article ended
    if ((data.articleEndTime - Date.now()) <= 0) {
      maxBidInput.disabled = true;
      autoBidCheckbox.disabled = true;
    }
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

  /*
   * MAIN
   */

  document.addEventListener('DOMContentLoaded', function () {
    //dbInit();
    detectWhoIAm().then(whoIAm => {
      pt.whoIAm = whoIAm;
      registerEvents();
      restoreSettings();

      pt.table = $('#articles').DataTable({
        columns: [
          {
            'data': 'articleId',
            'visible': true,
            /*render: function(data) {
              return '<img src="ebay.png"><p>'+data+'</p>';
            }*/
          },
          {
            data: 'articleDescription',
            render: $.fn.dataTable.render.ellipsis(100, true, false),
            'defaultContent': 'Unbekannt'
          },
          {
            data: 'articleEndTime',
            render: function (data, type, row) {
              if (typeof data !== 'undefined') {
                let timeLeft = moment(data);  // jshint ignore:line
                moment.relativeTimeThreshold('ss', 0);
                timeLeft.locale('de');
                let result = `${fixDate({articleEndTime: data})} (${timeLeft.fromNow()})`;
                return type === "display" || type === "filter" ? result : data;
              } else {
                return "unbegrenzt";
              }
            },
            defaultContent: '?'
          },
          {
            data: 'articleBidPrice',
            render: function (data, type, row) {
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
            },
          },
          {data: 'articleShippingCost', 'defaultContent': '0.00'},
          {data: 'articleAuctionState', 'defaultContent': ''},
          {
            data: 'maxBid', 'defaultContent':
              '<input name="inpMaxBid" type="number" min="0" step="0.50" width="50">' +
              '<input type="checkbox" name="chkAutoBid" disabled="true" style="width: 15px; height: 15px; vertical-align: middle">Aktiv'
          },
        ],
        order: [[2, "asc"]],
        columnDefs: [
          {"searchable": false, "orderable": false, "targets": [4, 5]},
          {"width": "150px", "targets": [5, 6]}
        ],
        searchDelay: 400,
        rowId: 'tabId',
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
            console.debug('Biet-O-Mat: Unable to activate tab(2): data=%O', data);
          }
        }
      });

      configureUi();
      checkBrowserStorage();
      console.debug("DOMContentLoaded handler for window with id = %d completed.", pt.whoIAm.currentWindow.id);
    }).catch(err => console.error(err));
  });
};
popup();