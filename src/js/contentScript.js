/*
 * contentScript.js - Ebay Article Page handler
 * ===================================================
 * - Parse information from the article page and informs the background thread
 * - Place automatic bids
 * - Note: Whenever the page reloads, the contentScript will reinitialize
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

import browser from "webextension-polyfill";
import $ from 'jquery';
import "../css/contentScript.css";

(function () {
  'use strict';

  // check if the contentScript was already loaded (each Tab will get its own window object)
  // return value will be passed back to executeScript
  if (window.hasRun === true) {
    console.debug("Biet-O-Mat: RELOADED EXTENSION, window=%O", window);
    return true;
  }
  window.hasRun = true;

  // Object containing determined Information from Ebay Article Page
  let ebayArticleInfo = {};

  // array with performance information (related to bidding)
  let perfInfo = [];

  // auction states as communicated to the overview page
  const auctionEndStates = {
    ended: 0,
    purchased: 1,
    overbid: 2,
    unknown: null
  };

  function registerEvents() {
    // event listener for messages from BE overview popup
    browser.runtime.onMessage.addListener((request, sender) => {
      // return ebayArticleInfo back to Popup script
      if (request.action === "GetArticleInfo") {
        return Promise.resolve({detail: ebayArticleInfo});
      } else if (request.action === "UpdateArticleMaxBid") {
        // receive updated MaxBid info from Popup - update the document
        console.debug("Biet-O-Matic: onMessage(UpdateArticleMaxBid) request=%O, sender=%O", request, sender);
        updateMaxBidInfo(request.detail);
        return Promise.resolve(true);
      }
    });
  }

  /*
   * handle reload: for various reasons the page can reload or go even to a different page
   * - article ended and redirects to a recommended article -> redirect back
   * - reload when a modal was closed  -> resume bidding
   */
  async function handleReload() {
    parseInfoEntry(['#descItemNumber'], 'articleId');
    parseInfoEntry(['#msgPanel'], 'articleAuctionState');
    // determine auction state - if any yet
    // TODO: think of a better way, to support languages or be robust against changing strings
    let state = auctionEndStates.unknown;
    if (ebayArticleInfo.hasOwnProperty('articleAuctionStateText')) {
      if (ebayArticleInfo.articleAuctionStateText.includes('Dieses Angebot wurde beendet')) {
        state = auctionEndStates.ended;
      } else if (ebayArticleInfo.articleAuctionStateText.includes('Sie waren der Höchstbietende')) {
        state = auctionEndStates.purchased;
      } else if (ebayArticleInfo.articleAuctionStateText.includes('Sie wurden überboten')) {
        state = auctionEndStates.overbid;
      } else if (ebayArticleInfo.articleAuctionStateText.includes('Mindestpreis wurde noch nicht erreicht')) {
        // Sie sind derzeit Höchstbietender, aber der Mindestpreis wurde noch nicht erreicht.
        // its not really overbid, but we will not win the auction due to defined minimum price
        state = auctionEndStates.overbid;
      }
      console.debug("Biet-O-Matic: handleReload() state=%s (%d)", ebayArticleInfo.articleAuctionStateText, state);
    }

    // retrieve settings from popup
    // if simulation is on, then we define successful bid status randomly with 33% chance (ended, overbid, purchased)
    const settings = await browser.runtime.sendMessage({
      action: 'getWindowSettings',
    });
    let simulate = false;
    if (settings != null && typeof settings !== 'undefined' && settings.hasOwnProperty('simulate')) {
      simulate = settings.simulate;
      if (simulate) {
        // https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/Math/math.random
        state = Math.floor(Math.random() * (3));
      }
    }

    /*
     * Retrieve stored article info from popup
     * - if null returned, then the article is not of interest (no bid)
     * - if articleState from stored result is incomplete (e.g. state.unknown), then
     *   update the state
     * The popup can then use the result to decide e.g. to stop the automatic bidding
     */
    const articleStoredInfo = await browser.runtime.sendMessage({
      action: 'getArticleSyncInfo',
      articleId: ebayArticleInfo.articleId
    });
    if (articleStoredInfo != null && articleStoredInfo.hasOwnProperty(ebayArticleInfo.articleId)) {
      const data = articleStoredInfo[ebayArticleInfo.articleId];
      if (data.hasOwnProperty('auctionEndState') &&
        (state !== auctionEndStates.unknown && data.auctionEndState === auctionEndStates.unknown)) {
        // send updated end state
        sendAuctionEndState(state, simulate).catch(e => {
          console.warn("Sending Auction End State failed: %s", e.message);
        });
      }
    }

    /*
     * If bidInfo exists in sessionStorage, it means a bid process was started before reload
     * we will inform the popup about the state indicated now on the page
     */
    let bidInfo = JSON.parse(window.sessionStorage.getItem(`bidInfo:${ebayArticleInfo.articleId}`));
    if (bidInfo != null) {
      console.debug("Biet-O-Matic: handleReload() Found bidInfo in sessionStorage: %s", JSON.stringify(bidInfo));
      // go back to previous page (?)
      // remove bidinfo if the auction for sure ended
      if (bidInfo.hasOwnProperty('bidPerformed') || bidInfo.endTime <= Date.now()) {
        console.debug("Biet-O-Matic: Setting auctionEnded now. state=%s", ebayArticleInfo.articleAuctionStateText);
        window.sessionStorage.removeItem(`bidInfo:${ebayArticleInfo.articleId}`);
        // set this, so the script will not trigger parsing further down
        ebayArticleInfo.auctionEnded = true;
        sendAuctionEndState(state, simulate).catch(e => {
          console.warn("Sending initial auction end state failed: %s", e.message);
        });
      }
    }
  }

  /*
   * Inform popup about auction end state. It might not be the final state though.
   * This function will likely be called multiple times
   */
  async function sendAuctionEndState(state, simulate = false) {
    if(!ebayArticleInfo.hasOwnProperty('articleId'))
      throw new Error(`sendAuctionEndState(${ebayArticleInfo.articleId}): Cannot send, auctionId unknown.`);
    if (state == null)
      throw new Error(`sendAuctionEndState(${ebayArticleInfo.articleId}): Cannot send, invalid state.`);
    await browser.runtime.sendMessage({
      action: 'ebayArticleSetAuctionEndState',
      articleId: ebayArticleInfo.articleId,
      detail: {auctionEndState: state}
    });
    // add the ended state to the log
    let statet = Object.keys(auctionEndStates).find(key => auctionEndStates[key] === state);
    if (simulate) {
      console.debug("Biet-O-Matic: Simulation is on, returning random state: %s", statet);
      sendArticleLog({
        component: "Bietvorgang",
        level: "Status",
        message: `Bietvorgang mit simuliertem Ergebnis beendet: ${statet} (${state})`,
      });
    } else {
      sendArticleLog({
        component: "Bietvorgang",
        level: "Status",
        message: `Bietvorgang Status wurde aktualisiert: ${statet} (${state})`,
      });
    }
    return true;
  }

  /*
   * Parse information from Ebay Article page
   */
  function parsePage() {
    console.debug("Biet-O-Matic: parsePage() started");
    // DOM Element Parsing
    const parseInfoArray = new Map([
      ['articleId', ['#descItemNumber']],
      ['articleDescription', ['#itemTitle']],
      ['articleState', ['#vi-itm-cond']],
      ['articleEndTime', [
        '#bb_tlft > span.vi-tm-left',  // normal running article
        '#bb_tlft']                    // ended article
      ],
      ['articleBidPrice', [
        '#prcIsum_bidPrice',           // normal running article
        '#mainContent > div:nth-child(1) > table > tbody > tr:nth-child(6) > td > div > div:nth-child(2) > div.u-flL.w29.vi-price-np > span', // ended auction
      ]],
      ['articleBuyPrice', [
        '#prcIsum'                     // sofortkauf
      ]],
      ['articlePaymentMethods', ['#payDet1']],
      ['articleShippingCost', ['#fshippingCost']],
      ['articleShippingMethods', ['#fShippingSvc']],
      ['articleAuctionState', ['#msgPanel']],
      ['articleBidCount', ['#qty-test']],
      ['articleMinimumBid', ['#MaxBidId']]
    ]);
    parseInfoArray.forEach(parseInfoEntry);
    console.debug("Biet-O-Matic: parsePage() ended");
  }

  // parse a specific DOM element from the current page
  function parseInfoEntry(value, key, map) {
    for (let v of value) {
      let domEntry = document.querySelector(v);
      if (domEntry != null) {
        let value = null;
        if (key === "articleEndTime") {
          value = parseEndTime(domEntry);
        } else if (key === "articleBidPrice") {
          // attempt to get price lazily from the content attribute
          let price = domEntry.getAttribute("content");
          let currency = null;
          if (price != null && typeof price !== 'undefined') {
            // this is the normal method for articles
            value = parseFloat(price);
          } else {
            let p = parsePriceString(domEntry.textContent.trim());
            if (p != null) {
              currency = p.currency;
              value = p.price;
            }
          }
          // get currency from itemprop=priceCurrency
          if (currency == null) {
            currency = document.querySelectorAll('[itemprop="priceCurrency"]');
            if (currency.length >= 1) {
              ebayArticleInfo.articleCurrency = currency[0].getAttribute("content");
            }
          } else {
            // determined above
            ebayArticleInfo.articleCurrency = currency;
          }
        } else if (key === "articleBuyPrice") {
          // attempt to get price lazily from the content attribute
          let price = domEntry.getAttribute("content");
          if (price != null && typeof price !== 'undefined') {
            value = parseFloat(price);
          } else {
            value = parsePriceString(domEntry.textContent.trim()).price;
          }
          // get currency from itemprop=priceCurrency
          if (!ebayArticleInfo.hasOwnProperty('articleCurrency')) {
            let currency = document.querySelectorAll('[itemprop="priceCurrency"]');
            if (currency.length >= 1) {
              ebayArticleInfo.articleCurrency = currency[0].getAttribute("content");
            }
          }
        } else if (key === "articleDescription") {
          // some articles have long description, separated by <wbr> - so concat the strings
          value = "";
          for (let child of domEntry.childNodes) {
            if (child.nodeName === '#text') {
              value += child.textContent.trim();
            }
          }
        } else if (key === "articleMinimumBid") {
          // the MinBidId input has a attribute which lists the minimum bid
          // that will be used in the UI to indicate if the maxBid is high enough
          value = domEntry.getAttribute('aria-label')
            .replace(/\n/g, "")
            .replace(/\s+/g, " ");
          //console.debug("Minimum Bid: %O", value);
          value = parsePriceString(value).price;
        } else if (key === "articleBidCount") {
          //console.debug("articleBidCount=%s", domEntry.textContent.trim());
          value = parseInt(domEntry.textContent.trim(), 10);
        } else if (key === "articleAuctionState") {
          // todo it could be wise to sanitize the HTML, e.g. remove aria, style and id tags
          value = domEntry.outerHTML;
          let text = domEntry.textContent.trim()
            .replace(/\n/g, "")
            .replace(/\s+/g, " ");
          ebayArticleInfo.articleAuctionStateText = text;
          value = cleanupHtmlString(value);
        } else {
          value = domEntry.textContent.trim();
          // replace newline and multiple spaces
          value = value.replace(/\n/g, "");
          value = value.replace(/\s+/g, " ");
        }
        ebayArticleInfo[key] = value;
        break;
      }
    }
  }

  //region Status HTML Cleanup
  /*
   * parse html string via jquery and only keep whitelisted elements
   * - elements: div, span
   * - tags: class, style, id
   */
  function cleanupHtmlString(html) {
    // http://booden.net/ContentCleaner.aspx
    //Extension for getting the tagName
    $.fn.tagName = function () {
      if (!this.get(0).tagName) return "";
      return this.get(0).tagName.toLowerCase();
    };
    //Extension for removing comments
    $.fn.removeComments = function () {
      this.each(
        function (i, objNode) {
          let objChildNode = objNode.firstChild;
          while (objChildNode) {
            if (objChildNode.nodeType === 8) {
              const next = objChildNode.nextSibling;
              objNode.removeChild(objChildNode);
              objChildNode = next;
            } else {
              if (objChildNode.nodeType === 1) {
                //recursively down the tree
                $(objChildNode).removeComments();
              }
              objChildNode = objChildNode.nextSibling;
            }
          }
        }
      );
    };

    const tagsAllowed = "|div|span|a|strong|br|";
    const attributesAllowed = [];
    attributesAllowed.div = "|id|class|style|";
    attributesAllowed.span = "|class|style|";
    attributesAllowed.a = "|class|href|name|";
    //console.log("Before: %s", $(jqHtml).html());
    try {
      html = html.replace(/(\r\n|\n|\r)/gm, '');
      html = html.replace(/\t+/gm, '');
      let jqHtml = $(html);
      $(jqHtml).removeComments();
      clearUnsupportedTagsAndAttributes($(jqHtml), tagsAllowed, attributesAllowed);
      //console.log("After2: %s", $(jqHtml)[0].outerHTML);
      return $(jqHtml)[0].outerHTML;
    } catch(e) {
      console.warn("Biet-O-Matic: Failed to cleanup status: %s", e.message);
      return html;
    }
  }

  function clearUnsupportedTagsAndAttributes(
    obj,
    tagsAllowed,
    attributesAllowed,
    emptyTagsAllowed = '|div|br|hr|'
  ) {
    $(obj).children().each(function () {
      //recursively down the tree
      const el = $(this);
      clearUnsupportedTagsAndAttributes(el, tagsAllowed, attributesAllowed, emptyTagsAllowed);
      try {
        const tag = el.tagName();
        if (tagsAllowed.indexOf("|" + tag + "|") < 0) {
          if (tag === "style" || tag === "script")
            el.remove();
          else
            el.replaceWith(el.html());
        } else {
          if (el.html().replace(/^\s+|\s+$/g, '') === "" && emptyTagsAllowed.indexOf("|" + tag + "|") < 0)
            el.remove();
          else {
            let attrs = el.get(0).attributes;
            for (let i = 0; i < attrs.length; i++) {
              try {
                if (attributesAllowed[tag] == null ||
                  attributesAllowed[tag].indexOf("|" + attrs[i].name.toLowerCase() + "|") < 0) {
                  el.removeAttr(attrs[i].name);
                }
              } catch (e) {} //Fix for IE, catch unsupported attributes like contenteditable and dataFormatAs
            }
          }
        }
      } catch (e) {
        throw new Error(e.message);
      }
    });
  }
  //endregion

  /*
   * Convert Ebay Time String (articleEndTime) to Date()
   * German: "(01. Dez. 2019\n							17:29:13 MEZ)"
   * English: 1575217753000 (Unix Epoch stored in attribute timems) (only on ebay.com right now)
   */
  function parseEndTime(domValue) {
    // ebay.com has unix epoch time, yeah!
    //<span class="timeMs" timems="1575217753000">Today 5:29PM</span>
    let timems = domValue.querySelector('span[timems]');
    if ( timems != null) {
      return parseInt(timems.getAttribute('timems'), 10);
    }
    // ebay.de still only has ugly date string which needs to be parsed
    let months = {
      'Jan' : 0,
      'Feb' : 1,
      'Mär' : 2,
      'Apr' : 3,
      'Mai' : 4,
      'Jun' : 5,
      'Jul' : 6,
      'Aug' : 7,
      'Sep' : 8,
      'Okt' : 9,
      'Nov' : 10,
      'Dez' : 11
    };
    let text = domValue.textContent.trim();
    text = text.replace(/\n/g, ' ');
    // domValue.innerText:
    //   normal Article: "Restzeit:↵4T 00Std ↵(08. Dez. 2019 17:30:42 MEZ)"
    //   ended Article: "01. Dez. 2019 12:35:50 MEZ"
    let regex = /^[(]?([0-9]{2})\.\s(.+)\.\s([0-9]{4})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})\s+([A-Z]{3})[)]?$/i;
    if (regex.test(text)) {
      let m = text.match(regex);
      // new Date(year, monthIndex [, day [, hour [, minutes [, seconds [, milliseconds]]]]]);
      let date = new Date(parseInt(m[3], 10), months[m[2]],
        parseInt(m[1],10), parseInt(m[4],10), parseInt(m[5],10), parseInt(m[6],10));
      //console.debug("Biet-O-Matic: Input Date=%O, regexMatch=%O, date=%O", text, m, date);
      return date.valueOf();
    } else {
      console.warn("Biet-O-Matic: Unable to parse date from Input Date=%O", text);
    }
    return null;
  }

  /*
   * Extend Article Page with information from Biet-O-Matic:
   * - Max Bid for the article (and highlight if bid lower than current price)
   * - link to popup page
   * - option to define bid
   */
  function extendPage() {
    console.debug("Biet-O-Matic: extendPage() started");
    let bidButton = document.getElementById('bidBtn_btn');
    if (bidButton == null || typeof bidButton === 'undefined') {
      console.log("Biet-O-Matic: Do not extend page, no bid button found.");
      return;
    }
    // check if button already exists (extension reloaded?)

    // add button right of bid button
    let buttonDiv = document.getElementById("BomAutoBidDiv");
    if (buttonDiv != null) {
      buttonDiv.remove();
    }
    buttonDiv = document.createElement("div");
    buttonDiv.id = "BomAutoBidDiv";
    buttonDiv.style.width = '280px';
    buttonDiv.style.height = '18px';
    buttonDiv.style.align = 'center';
    buttonDiv.style.marginTop = '10px';
    let buttonInput = document.createElement("input");
    buttonInput.id ="BomAutoBid";
    buttonInput.classList.add('tgl', 'tgl-skewed');
    buttonInput.type = 'checkbox';
    buttonDiv.appendChild(buttonInput);
    let buttonLabel = document.createElement("label");
    buttonLabel.classList.add('tgl-btn');
    buttonLabel.setAttribute('data-tg-off', "B-O-M: Automatisch bieten aus");
    buttonLabel.setAttribute('data-tg-on', "B-O-M: Automatisch bieten an");
    buttonLabel.setAttribute('for', 'BomAutoBid');
    buttonDiv.appendChild(buttonLabel);

    //mainContent.appendChild(button);
    bidButton.parentNode.insertBefore(buttonDiv, bidButton.nextSibling);

    // info from storage
    // complement with DB info
    browser.storage.sync.get(ebayArticleInfo.articleId).then((result) => {
      if (Object.keys(result).length === 1) {
        let storInfo = result[ebayArticleInfo.articleId];
        console.debug("Biet-O-Mat: extendPage() Found info for Article %s in storage: %O", ebayArticleInfo.articleId, result);
        updateMaxBidInfo(storInfo);
      }
    });
    activateAutoBidButton();
  }

  /*
   * Activate the auto bid button if:
   * - a value has been entered in MaxBidId Input field
   * - the value is higher than the minimum or current price of the article
   */
  function activateAutoBidButton(maxBidValue, minBidValue = null) {
    let buttonInput = document.getElementById('BomAutoBid');
    if (buttonInput == null) {
      console.warn("activateAutoBidButton() ButtonInput invalid - should not happen!?");
      return;
    }
    if (minBidValue == null && ebayArticleInfo.hasOwnProperty('articleMinimumBid')) {
      minBidValue = ebayArticleInfo.articleMinimumBid;
    }
    if (typeof maxBidValue === 'string') {
      maxBidValue = maxBidValue.replace(/,/, '.');
      maxBidValue = Number.parseFloat(maxBidValue);
    }
    console.debug("Biet-O-Matic: activateAutoBidButton(), maxBidValue=%s (%s), minBidValue=%s (%s)",
      maxBidValue, typeof maxBidValue,  minBidValue, typeof minBidValue);
    //let isMaxBidEntered = (Number.isNaN(maxBidValue) === false);
    const isMinBidLargerOrEqualBidPrice = (minBidValue >= ebayArticleInfo.articleBidPrice);
    const isMaxBidLargerOrEqualMinBid = (maxBidValue >= minBidValue);
    const isMaxBidLargerThanBidPrice = (maxBidValue > ebayArticleInfo.articleBidPrice);

    if (isMinBidLargerOrEqualBidPrice) {
      //console.debug("Enable bid button: (isMinBidLargerOrEqualBidPrice(%s) && isMaxBidLargerOrEqualMinBid(%s) = %s",
      //  isMinBidLargerOrEqualBidPrice, isMaxBidLargerOrEqualMinBid, isMinBidLargerOrEqualBidPrice && isMaxBidLargerOrEqualMinBid);
      buttonInput.disabled = !isMaxBidLargerOrEqualMinBid;
      // set tooltip for button to minBidValue
      let t = document.querySelector('.tgl-btn');
      if (buttonInput.disabled) {
        t.title = `Geben sie minimal ${minBidValue} ein`;
        buttonInput.checked =  false;
      } else {
        t.title = "Minimale Erhöhung erreicht";
      }
    } else if (isMaxBidLargerThanBidPrice === true) {
      //console.debug("Enable bid button: isMaxBidLargerThanBidPrice=%s", isMaxBidLargerThanBidPrice);
      buttonInput.disabled = false;
    } else {
      buttonInput.disabled = true;
      buttonInput.checked = false;
    }
  }

  /*
   * Detect changes on the page (by user) via event listeners
   * - #MaxBidId: (Bid input)
   * - #prcIsum_bidPrice: Current price of the article
   * - #BomAutoBid: AutoBid
   */
  function monitorChanges() {
    console.debug("Biet-O-Matic: monitorChanges() started");
    let maxBidInput = document.getElementById('MaxBidId');
    let bomAutoBid = document.getElementById('BomAutoBid');
    // max bid input changed?
    if (maxBidInput != null) {
      maxBidInput.addEventListener('change', (e) => {
        let bomAutoBidNew = document.getElementById('BomAutoBid');
        let maxBidInputNew = document.getElementById('MaxBidId');
        if (maxBidInputNew != null) {
          //updateMaxBidInput(maxBidInputNew.value);
          // replace , with .
          let maxBidInputValue = maxBidInputNew.value.replace(/,/, '.');
          maxBidInputValue = Number.parseFloat(maxBidInputValue);
          ebayArticleInfo.articleMaxBid = maxBidInputValue;
          // update minimum bid
          let minBidValue = null;
          if (maxBidInputNew.getAttribute('aria-label') != null) {
            minBidValue = maxBidInputNew.getAttribute('aria-label')
              .replace(/\n/g, "")
              .replace(/\s+/g, " ");
            minBidValue = parsePriceString(minBidValue).price;
            ebayArticleInfo.articleMinimumBid = minBidValue;
          }
          // check if bid > buy-now price (sofortkauf), then we update the maxBid with buyPrice
          if (ebayArticleInfo.hasOwnProperty('articleBuyPrice') && maxBidInputValue >= ebayArticleInfo.articleBuyPrice) {
            console.log("Biet-O-Matic: monitorChanges() updated maxBid %s to %s (sofortkauf price)",
              maxBidInputValue, ebayArticleInfo.articleBuyPrice);
            // set to 1 cent less, to prevent unfriendly redirection
            maxBidInputValue = (Number.parseFloat(ebayArticleInfo.articleBuyPrice.toString()) - 0.01);
            maxBidInputNew.value = maxBidInputValue.toLocaleString('de-DE',
              {useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2});
            ebayArticleInfo.articleMaxBid = maxBidInputValue;
          } else {
            maxBidInputNew.value = maxBidInputValue.toLocaleString('de-DE',
              {useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2});
          }
          activateAutoBidButton(maxBidInputValue, minBidValue);
          // inform popup
          browser.runtime.sendMessage({
            action: 'ebayArticleMaxBidUpdated',
            articleId: ebayArticleInfo.articleId,
            detail: {
              maxBid: maxBidInputValue,
              autoBid: bomAutoBidNew.checked,
              minBid: minBidValue
            }
          }).catch((e) => {
            console.warn("Biet-O-Matic: sendMessage(ebayArticleMaxBidUpdated) failed: %O", e);
          });
        }
      });
    }
    // BomAutoBid input checked?
    if (bomAutoBid != null) {
      bomAutoBid.addEventListener('change', (e) => {
        let bomAutoBidNew = document.getElementById('BomAutoBid');
        if (bomAutoBidNew != null) {
          // inform popup
          browser.runtime.sendMessage({
            action: 'ebayArticleMaxBidUpdated',
            articleId: ebayArticleInfo.articleId,
            detail: {
              autoBid: bomAutoBidNew.checked
            }
          }).catch((e) => {
            console.warn("Biet-O-Matic: sendMessage(ebayArticleMaxBidUpdated) failed: %O", e);
          });
        }
      });
    }

    // article current price
    // Note: the itemprop=price content is not refreshed, only the text!
    /*
     * Ebay automatically updates certain elements.
     * The sooner the Article is ending, the faster the refresh occurs.
     * We use this to update the price information, as well as trigger the bidding procedure.
     */
    let articleBidPrice = document.getElementById('prcIsum_bidPrice');
    if (articleBidPrice != null) {
      let observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            let timeLeftInSeconds = (ebayArticleInfo.articleEndTime - Date.now()) / 1000;
            if (timeLeftInSeconds <= 10) {
              console.debug("Biet-O-Matic: Mutation received: %d seconds left", timeLeftInSeconds);
              doBid(false)
                .catch(e => {
                  console.info("Biet-O-Matic: doBid() was aborted: %s", e.message);
                  sendArticleLog(e);
                });
            }
            let oldN = mutation.removedNodes;
            let newN = mutation.target;
            oldN=oldN[0];
            if (typeof oldN !== 'undefined' && oldN.textContent !== newN.textContent) {
              // price changed
              ebayArticleInfo.articleBidPrice = parsePriceString(newN.textContent).price;
              // find Ebay MaxBidId Input
              let maxBidInput = document.getElementById('MaxBidId');
              if (maxBidInput == null) {
                console.warn("Biet-O-Matic: Cannot find MaxBidId input!");
                return;
              }
              // update minimumbid
              let minBidValue = null;
              if (maxBidInput.getAttribute('aria-label') != null) {
                minBidValue = maxBidInput.getAttribute('aria-label')
                  .replace(/\n/g, "")
                  .replace(/\s+/g, " ");
                minBidValue = parsePriceString(minBidValue).price;
                ebayArticleInfo.articleMinimumBid = minBidValue;
              }
              activateAutoBidButton(maxBidInput.value, minBidValue);
              // send info to extension popup about new price
              browser.runtime.sendMessage({
                action: 'ebayArticleUpdated',
                detail: ebayArticleInfo
              }).catch((e) => {
                console.warn("Biet-O-Matic: sendMessage(ebayArticleUpdated) failed: %O", e);
              });
            } else {
              // send trigger to extension popup, so it can refresh the date (timeleft)
              browser.runtime.sendMessage({
                action: 'ebayArticleRefresh',
              }).catch((e) => {
                console.warn("Biet-O-Matic: sendMessage(ebayArticleRefresh) failed - reloading page!: %s", e.message);
                location.reload();
              });
            }
          }
        });
      });
      observer.observe(articleBidPrice, {
        childList: true
      });
    }
  }

  /*
   * Parse price from text
   * returns {currency: "EUR", price: 0.01}
   */
  function parsePriceString(price) {
    let currency = null;
    if (price == null) {
      return null;
    }
    price = price
      .replace(/\n/g, "")
      .replace(/\s+/g, " ");
    // use regular expression to parse info, e.g.
    // US $1,000.12
    // GBP 26.00
    // EUR 123,00
    let regex = /([A-Z]{2,3}(?:\s[$]?))([0-9,]+)(?:.|,)([0-9]{2})/;
    let result = [];
    if (price.match(regex)) {
      result = price.match(regex);
      let p1 = result[2].replace(/,/, '');
      let p2 = result[3];
      price = parseFloat(`${p1}.${p2}`).toFixed(2);
      currency = result[1].trim();
      if (currency === "US $")
        currency = "USD";
    }
    return {
      price: Number.parseFloat(price.toString()),
      currency: currency
    };
  }

  /*
   * set new MaxBidInput value and autoBid checked status
   */
  function updateMaxBidInfo(info) {
    // id=MaxBidId defined by eBay
    let maxBidInput = document.getElementById('MaxBidId');
    // id=BomAutoBid defined by us
    let autoBidInput = document.getElementById('BomAutoBid');
    if (maxBidInput != null) {
      if (info.maxBid != null) {
        try {
          if (typeof info.maxBid === 'string')
            info.maxBid = Number.parseFloat(info.maxBid);
          maxBidInput.value = info.maxBid.toLocaleString('de-DE',
            {useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2});
        } catch (e) {
          console.warn("Biet-O-Matic: updateMaxBidInfo() Failed to parse, info.maxBid=%s (%s)",
            info.maxBid, typeof info.maxBid);
          maxBidInput.value = info.maxBid.toString();
        }
      } else {
        info.maxBid = Number.parseFloat(maxBidInput.value);
      }
      if (autoBidInput != null) {
        if (info.autoBid != null) {
          autoBidInput.checked = info.autoBid;
        }
      }
      // update in ebayArticleInfo, it might have been updated by popup
      ebayArticleInfo.articleMaxBid = info.maxBid;
      activateAutoBidButton(info.maxBid);
    }
  }

  /*
   * Trigger the Bid for an Article
   * - perform bid only if autoBid is checked (window + article) - this will also be repeated at the very end!
   * - Trigger time checking has to be performed externally!
   * - The bid is separated in two phases:
   *   Phase1: Prepare Bid (~10 seconds before end) -> inform popup setArticleStatus "Gebotsbgabe vorbereiten."
   *   Phase2: Confirm Bid (1..3 seconds before end) -> inform popup setArticleStatus "Gebotsabgabe erfolgt."
   */
  async function doBid() {
    let simulate = false;
    let perfSnapshot = [];
    storePerfInfo("Initialisierung");
    try {
      // if end time reached, abort directly
      if ((ebayArticleInfo.hasOwnProperty('auctionEnded') && ebayArticleInfo.auctionEnded) ||
          ebayArticleInfo.endTime <= Date.now()) {
        let t = Date.now() - ebayArticleInfo.endTime;
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: `Auktion bereits beendet.`
        };
      }
      const autoBidInput = await waitFor('#BomAutoBid', 1000)
        .catch((e) => {
          console.log("Biet-O-Matic: Bidding failed: AutoBid Button missing!");
          throw {
            component: "Bietvorgang",
            level: "Fehler beim bieten",
            message: "Element #BomAutoBid konnte innerhalb von 1s nicht gefunden werden!"
          };
        });
      if (autoBidInput == null) {
       throw {
          component: "Bietvorgang",
          level: "Fehler beim bieten",
          message: "AutoBid Knopf nicht gefunden"
        };
      }
      // ensure article autoBid is checked
      if (autoBidInput.checked === false) {
        console.debug("Biet-O-Matic: doBid() abort, Article autoBid is off");
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: "Automatisches bieten für Artikel inaktiv"
        };
      }
      // retrieve settings from popup
      let settings = await browser.runtime.sendMessage({action: 'getWindowSettings'});
      if (settings == null || typeof settings === 'undefined' || !settings.hasOwnProperty('autoBidEnabled')) {
        throw {
          component: "Bietvorgang",
          level: "Interner Fehler",
          message: "Konnte autoBidEnabled Option nicht prüfen"
        };
      }
      // ensure window autoBid is enabled
      if (settings.autoBidEnabled === false) {
        console.debug("Biet-O-Matic: doBid() abort, Window autoBid is off");
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: "Automatisches bieten für Fenster inaktiv"
        };
      }
      // enable test mode if specified by popup
      if (settings.hasOwnProperty('simulate') && settings.simulate) {
        console.debug("Biet-O-Matic: Enable simulated bidding.");
        simulate = true;
      }

      /*
       * The following will ensure that the bid procedure will not be executed twice
       * due to mutation observer the function will be called again, even after the auction ended
       */
      let bidInfo = JSON.parse(window.sessionStorage.getItem(`bidInfo:${ebayArticleInfo.articleId}`));
      if (bidInfo == null) {
        // bid not yet running (or not anymore after page refresh)
        bidInfo = {
          maxBid: ebayArticleInfo.articleMaxBid,
          endTime: ebayArticleInfo.articleEndTime,
          started: Date.now()
        };
        window.sessionStorage.setItem(`bidInfo:${ebayArticleInfo.articleId}`, JSON.stringify(bidInfo));
      } else {
        if (bidInfo.hasOwnProperty('ended')) {
          // bid has ended
          console.debug("Biet-O-Matic: doBid(), bid already finished: %s", JSON.stringify(bidInfo));
        } else {
          // bid is already running
          console.debug("Biet-O-Matic: doBid(), bid is already running: %s", JSON.stringify(bidInfo));
        }
        return;
      }

      storePerfInfo("Phase1: Gebotsvorbereitung");
      console.log("Biet-O-Matic: Performing bid for article %s", ebayArticleInfo.articleId);
      sendArticleLog({
        component: "Bietvorgang",
        level: "Info",
        message: "Bietvorgang wird vorbereitet...",
      });
      // press bid button
      const bidButton = document.getElementById('bidBtn_btn');
      if (bidButton == null) {
        console.warn("Biet-O-Matic: Article %s - Unable to get Bid Button!", ebayArticleInfo.articleId);
        throw {
          component: "Bietvorgang",
          level: "Interner Fehler",
          message: "Kann den Bieten-Knopf nicht auf der Artikel Seite finden!"
        };
      }

      /*
       * We use a Mutation Observer to wait for the Modal 'vilens-modal-wrapper' to open
       * after the Bid Button was clicked
       * Use timeout: 3000ms
       * Uses: https://stackoverflow.com/questions/7434685/how-can-i-be-notified-when-an-element-is-added-to-the-page
       *
       * Two considered alternative results:
       * a) Bid was too low
       * b) Bid was high enough still and we need to confirm
       *
       * Note: If not logged in, here the page will redirect to signin and terminate the Content Script!
       */

      /*
       * Phase 2: Initiate the Bid
       */
      storePerfInfo("Phase2: Gebot abgeben");
      bidButton.click();
      // wait for modal to open: vilens-modal-wrapper
      const modalBody = await waitFor('#MODAL_BODY', 5000)
        .catch((e) => {
          console.warn("Biet-O-Matic: Waiting for Bidding Modal timed out: %s", e.toString());
          throw {
            component: "Bietvorgang",
            level: "Interner Fehler",
            message: "Element #MODAL_BODY konnte innerhalb von 5s nicht gefunden werden!"
          };
        });
      // modal close button
      const closeButton = document.querySelector('.vilens-modal-close');
      const statusMsg = document.getElementById('STATUS_MSG');
      // e.g. 'Bieten Sie mindestens EUR 47,50.'

      // some bidding issue, send status to popup (keep modal open, in case user wants to manually correct bid)
      if (statusMsg != null) {
        console.log("Biet-O-Matic: Bidding failed: Error reported by eBay: %s", statusMsg.textContent);
        throw {
          component: "Bietvorgang",
          level: "Problem beim bieten",
          message: statusMsg.textContent
        };
      }

      // get confirm button
      const confirmButton = await waitFor('#confirm_button', 1000)
        .catch((e) => {
          console.log("Biet-O-Matic: Bidding failed: Confirm Button missing!");
          throw {
            component: "Bietvorgang",
            level: "Fehler beim bieten",
            message: "Element #confirm_body konnte innerhalb von 500ms nicht gefunden werden!"
          };
        });

      /*
       Phase 3: Confirm the bid
       We want to perform the confirmation of the bid as close as possible to the end
       We set a timeout which will perform the bid ~2 seconds before the auction ends
       */

      // contact popup to check if we should perform the bid earlier (multiple articles could end at the same time)
      let modifiedEndTime = await browser.runtime.sendMessage({
        action: 'ebayArticleGetAdjustedBidTime',
        articleId: ebayArticleInfo.articleId,
        articleEndTime: ebayArticleInfo.articleEndTime
      });
      if (modifiedEndTime == null) {
        console.warn("Biet-O-Matic: Unable to get ebayArticleGetAdjustedBidTime result!");
        modifiedEndTime = ebayArticleInfo.articleEndTime;
      } else {
        console.debug("Biet-O-Matic: Modified bidTime: %ds earlier.",
          (ebayArticleInfo.articleEndTime - modifiedEndTime) / 1000);
      }

      // todo: customizable bidding confirm time
      storePerfInfo("Phase3: Warten auf Bietzeitpunkt");
      let wakeUpInMs = (modifiedEndTime - Date.now()) - 1500;
      await wait(wakeUpInMs);

      // check again if autobid is enabled (except if we should bid for all articles anyway)
      if (!settings.hasOwnProperty('bidAllEnabled') || settings.bidAllEnabled === false) {
        settings = await browser.runtime.sendMessage({action: 'getWindowSettings'});
        if (settings.hasOwnProperty('autoBidEnabled') && settings.autoBidEnabled === false) {
          console.info("Biet-O-Matic: doBid() abort, Window autoBid is now off.");
          throw {
            component: "Bietvorgang",
            level: "Abbruch",
            message: "Automatisches bieten wurde kurz vor der Gebot Bestätigung deaktiviert."
          };
        }
      }

      // Note: After closing the modal, the page will reload and the content script reinitialize!
      if (simulate) {
        // close modal
        if (closeButton != null) {
          closeButton.click();
        }
        console.log("Biet-O-Matic: Test bid performed for Article %s", ebayArticleInfo.articleId);
        storePerfInfo("Phase3: Testgebot beendet");
        // send info to popup about (almost) successful bid
        let t = ebayArticleInfo.articleEndTime - Date.now();
        sendArticleLog({
          component: "Bietvorgang",
          level: "Erfolg",
          message: `Test-Bietvorgang (bis zur Bestätigung) ${t}ms vor Ablauf der Auktion abgeschlossen.`,
        });
      } else {
        // confirm the bid
        confirmButton.click();
        console.log("Biet-O-Matic: Bid submitted for Article %s", ebayArticleInfo.articleId);
        storePerfInfo("Phase3: Gebot wurde abgegeben");
        // send info to popup
        let t = ebayArticleInfo.articleEndTime - Date.now();
        sendArticleLog({
          component: "Bietvorgang",
          level: "Erfolg",
          message: `Bietvorgang ${t}ms vor Ablauf der Auktion abgeschlossen.`,
        });
      }
      // finally also submit performance info
      getPerfInfoString();
      // set bid process to "bidPerformed" - this
      bidInfo = JSON.parse(window.sessionStorage.getItem(`bidInfo:${ebayArticleInfo.articleId}`));
      if (bidInfo != null) {
        bidInfo.bidPerformed = Date.now();
        window.sessionStorage.setItem(`bidInfo:${ebayArticleInfo.articleId}`, JSON.stringify(bidInfo));
      }
    } catch (err) {
      // pass error through, will be forwarded to popup
      throw err;
    } finally {
      console.debug("Biet-O-Matic: doBid() reached the end.");
    }
  }

  // promisified setTimeout - simply wait for a defined time
  function wait(ms) {
    return new Promise(function (resolve) {
      if (ms < 100) {
        console.warn("Biet-O-Mat: wait(%s), too short, abort wait.", ms);
        resolve();
      } else {
        window.setTimeout(function () {
          resolve();
        }, ms);
      }
    });
  }

  // https://stackoverflow.com/questions/5525071/how-to-wait-until-an-element-exists
  function waitFor(selector, timeout = 3000) {
    return new Promise(function (resolve, reject) {
      waitForElementToDisplay(selector, 250, timeout);
      function waitForElementToDisplay(selector, time, timeout) {
        if (timeout <= 0) {
          reject(`waitFor(${selector}), timeout expired!`);
        } else if (document.querySelector(selector) != null) {
          resolve(document.querySelector(selector));
        } else {
          setTimeout(function () {
            waitForElementToDisplay(selector, time, timeout - time);
          }, time);
        }
      }
    });
  }

  /*
    Send log information to popup - it will be persisted under the storage
    - messageObject { component: s, message: s, level: s}
    TODO: use HTML for good/bad indication
   */
  function sendArticleLog(messageObject) {
    let message = {};
    message.timestamp = Date.now();
    message.message = JSON.stringify(messageObject);
    message.component = "Unbekannt";
    message.level = "Interner Fehler";
    if (messageObject.hasOwnProperty('message'))
      message.message = messageObject.message;
    if (messageObject.hasOwnProperty('component'))
      message.component = messageObject.component;
    if (messageObject.hasOwnProperty('level'))
      message.level = messageObject.level;
    browser.runtime.sendMessage({
      action: 'addArticleLog',
      articleId: ebayArticleInfo.articleId,
      detail: {
        message: message
      },
    }).catch((e) => {
      console.warn("Biet-O-Matic: sendArticleLog(), Cannot sendMessage");
    });
  }

  /*
   * store timing data in array - can be sent to popup
  */
  function storePerfInfo(message) {
    perfInfo.push({
      date: Date.now(),
      perf: performance.now(),
      description: message
    });
  }
  // print perf info,
  function getPerfInfoString() {
    let result = "";
    let previousTime = 0;
    perfInfo.forEach((m) => {
      let prevDiff = 0;
      let firstDiff = 0;
      if (previousTime > 0) {
        firstDiff = (m.perf - perfInfo[0].perf).toFixed(2);
        prevDiff = (m.perf - previousTime).toFixed(2);
      }
      result += `${m.description}: ${prevDiff}ms (seit start: ${firstDiff}ms, ${m.date}), `;
      previousTime = m.perf;
    });
    // calculate timeleft until auction end
    let timeLeft = ebayArticleInfo.articleEndTime - perfInfo[perfInfo.length - 1].date;
    result += `timeLeft = ${timeLeft}ms (${ebayArticleInfo.articleEndTime} - ${perfInfo[perfInfo.length - 2].date})`;
    sendArticleLog({
      component: "Bieten",
      level: "Performance",
      message: result,
    });
  }

  async function initialize() {
    // first we check if the page is a expected Article Page
    let body = document.getElementById("Body");
    if (body == null) {
      console.log("Biet-O-Mat: skipping on this page; no Body element, window=%O", window);
      throw new Error("Biet-O-Mat: skipping on this page; no Body element");
    }
    let itemType = body.getAttribute("itemtype");
    if (itemType == null) {
      console.log("Biet-O-Mat: skipping on this page; no itemtype in body element");
      throw new Error("Biet-O-Mat: skipping on this page; no itemtype in body element");
    }
    if (itemType !== "https://schema.org/Product") {
      console.log("Biet-O-Mat: skipping on this page; invalid itemtype in body element (%s)", itemType);
      throw new Error("Biet-O-Mat: skipping on this page; invalid itemtype in body element");
    }
    if (ebayArticleInfo.hasOwnProperty('auctionEnded') && ebayArticleInfo.auctionEnded) {
      throw new Error("Biet-O-Mat: skipping on this page; bidding already performed.");
    }

    // parse article information
    parsePage();
    // check if the same article is already handled by another tab
    const result = await browser.runtime.sendMessage({
      action: 'getArticleInfo',
      articleId: ebayArticleInfo.articleId
    });
    // our tab id is available through the browser event, if our and their tabId is different, it means
    // the tab is open in another window
    if (typeof result !== 'undefined' || result.hasOwnProperty('tabId')) {
      if (result.hasOwnProperty('data') && result.data.tabId != null && result.tabId !== result.data.tabId) {
        throw new Error(`Biet-O-Matic: Stopping execution on this page, already active in another tab (${result.data.tabId}).`);
      }
    }
    return "Successfully initialized";
  }

  function replacer(key, value) {
    if (key === "articleAuctionState")
      return '<REMOVED>';
    else
      return value;
  }

  /*
   * MAIN
   */

  // handle reload of the tab,
  handleReload();
  initialize()
    .then(result => {
      console.log("init done: %O", result);
      if (result != null) {
        console.debug("Biet-O-Matic: %s - Article Info: %s", result, JSON.stringify(ebayArticleInfo, replacer));
        extendPage();
        monitorChanges();
        // send info to extension popup directly after initialization
        browser.runtime.sendMessage({
          action: 'ebayArticleUpdated',
          detail: ebayArticleInfo
        }).catch(e => {
          console.warn("Biet-O-Matic: sendMessage(ebayArticleUpdated) failed: %s", e.message);
        });
        registerEvents();
      }
    })
    .catch(e => {
      console.warn("Init failed: %s", e.message);
    });
})();