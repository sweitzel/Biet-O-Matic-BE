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

// auction states as communicated to the overview page
const auctionEndStates = {
  ended: 0,
  purchased: 1,
  overbid: 2,
  unknown: null
};

class EbayArticle {
  constructor() {
    this.articleId = null;
    this.perfInfo = [];
  }

  /*
   * Initialize the EbayArticle object
   * - check if the page is in expected format
   * - parse the page
   */
  async init(oldInfo) {
    // first we check if the page is a expected Article Page
    const body = document.getElementById("Body");
    if (body == null) {
      console.log("Biet-O-Mat: skipping on this page; no Body element, window=%O", window);
      throw new Error("Biet-O-Mat: skipping on this page; no Body element");
    }
    const itemType = body.getAttribute("itemtype");
    if (itemType == null) {
      console.log("Biet-O-Mat: skipping on this page; no itemtype in body element");
      throw new Error("Biet-O-Mat: skipping on this page; no itemtype in body element");
    }
    if (itemType !== "https://schema.org/Product") {
      let msg = `Biet-O-Mat: skipping on this page; unexpected itemtype in body element: ${itemType}`;
      console.log(msg);
      throw new Error(msg);
    }
    if (oldInfo.hasOwnProperty('auctionEnded') && oldInfo.auctionEnded) {
      throw new Error("Biet-O-Mat: skipping on this page; bidding already performed.");
    }

    // parse article information
    let info = EbayArticle.parsePage();

    // check if the same article is already handled by another tab
    const result = await browser.runtime.sendMessage({
      action: 'getArticleInfo',
      articleId: info.articleId
    });
    // our tab id is available through the browser event, if our and their tabId is different, it means
    // the tab is open in another window
    if (typeof result !== 'undefined' || result.hasOwnProperty('tabId')) {
      if (result.hasOwnProperty('data') && result.data.tabId != null && result.tabId !== result.data.tabId) {
        throw new Error(`Biet-O-Matic: Stopping execution on this page, already active in another tab (${result.data.tabId}).`);
      }
    }
    // assign the determined info to this Article instance
    Object.assign(this, info);

    this.registerEvents();
  }

  // events from popup
  registerEvents() {
    // event listener for messages from BE overview popup
    browser.runtime.onMessage.addListener((request, sender) => {
      // return ebayArticleInfo back to Popup script
      if (request.action === "GetArticleInfo") {
        console.log("Biet-O-Matic: Event.GetArticleInfo received");
        return Promise.resolve({detail: this});
      } else if (request.action === "UpdateArticleMaxBid") {
        // receive updated MaxBid info from Popup - update the document
        console.debug("Biet-O-Matic: onMessage(UpdateArticleMaxBid) request=%O, sender=%O", request, sender);
        this.updateMaxBidInfo(request.detail);
        return Promise.resolve(true);
      }
    });
  }

  /*
   * Extend Article Page with information from Biet-O-Matic:
   * - Max Bid for the article (and highlight if bid lower than current price)
   * - link to popup page
   * - option to define bid
   */
  extendPage() {
    const bidButton = document.getElementById('bidBtn_btn');
    if (bidButton == null || typeof bidButton === 'undefined') {
      // this is expected to happen: e.g. finished auctions
      console.log("Biet-O-Matic: Do not extend page, no bid button found.");
      return;
    }
    // add button right of bid button
    let buttonDiv = document.getElementById("BomAutoBidDiv");
    if (buttonDiv != null) buttonDiv.remove();
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

    // complement with info from sync storage
    browser.storage.sync.get(this.articleId).then((result) => {
      if (Object.keys(result).length === 1) {
        let storInfo = result[this.articleId];
        console.debug("Biet-O-Mat: extendPage() Found info for Article %s in storage: %O", this.articleId, result);
        this.updateMaxBidInfo(storInfo);
      }
    });
    this.activateAutoBidButton();
  }

  /*
   * set new MaxBidInput value and autoBid checked status
   */
  updateMaxBidInfo(info) {
    // id=MaxBidId defined by eBay
    const maxBidInput = document.getElementById('MaxBidId');
    // id=BomAutoBid defined by us
    const autoBidInput = document.getElementById('BomAutoBid');
    if (!info.hasOwnProperty('maxBid') && info.hasOwnProperty('articleMaxBid'))
      info.maxBid = info.articleMaxBid;
    if (!info.hasOwnProperty('autoBid') && info.hasOwnProperty('articleAutoBid'))
      info.autoBid = info.articleAutoBid;

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
      this.articleMaxBid = info.maxBid;
      this.articleAutoBid = info.autoBid;
      this.activateAutoBidButton(info.maxBid);
    }
  }

  /*
   * Activate the auto bid button if:
   * - a value has been entered in MaxBidId Input field
   * - the value is higher than the minimum or current price of the article
   */
  activateAutoBidButton(maxBidValue, minBidValue = null) {
    const buttonInput = document.getElementById('BomAutoBid');
    if (buttonInput == null) {
      console.warn("activateAutoBidButton() ButtonInput invalid - should not happen!?");
      return;
    }
    if (minBidValue == null && this.hasOwnProperty('articleMinimumBid')) {
      minBidValue = this.articleMinimumBid;
    }
    if (typeof maxBidValue === 'string') {
      maxBidValue = maxBidValue.replace(/,/, '.');
      maxBidValue = Number.parseFloat(maxBidValue);
    }
    console.debug("Biet-O-Matic: activateAutoBidButton(), maxBidValue=%s (%s), minBidValue=%s (%s)",
      maxBidValue, typeof maxBidValue,  minBidValue, typeof minBidValue);
    //let isMaxBidEntered = (Number.isNaN(maxBidValue) === false);
    const isMinBidLargerOrEqualBidPrice = (minBidValue >= this.articleBidPrice);
    const isMaxBidLargerOrEqualMinBid = (maxBidValue >= minBidValue);
    const isMaxBidLargerThanBidPrice = (maxBidValue > this.articleBidPrice);

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
  monitorChanges() {
    const maxBidInput = document.getElementById('MaxBidId');
    const bomAutoBid = document.getElementById('BomAutoBid');
    // max bid input changed?
    if (maxBidInput != null) {
      maxBidInput.addEventListener('change', (e) => {
        const bomAutoBidNew = document.getElementById('BomAutoBid');
        const maxBidInputNew = document.getElementById('MaxBidId');
        if (maxBidInputNew != null) {
          //updateMaxBidInput(maxBidInputNew.value);
          // replace , with .
          let maxBidInputValue = maxBidInputNew.value.replace(/,/, '.');
          maxBidInputValue = Number.parseFloat(maxBidInputValue);
          this.articleMaxBid = maxBidInputValue;
          // update minimum bid
          let minBidValue = null;
          if (maxBidInputNew.getAttribute('aria-label') != null) {
            minBidValue = maxBidInputNew.getAttribute('aria-label')
              .replace(/\n/g, "")
              .replace(/\s+/g, " ");
            minBidValue = EbayArticle.parsePriceString(minBidValue).price;
            this.articleMinimumBid = minBidValue;
          }
          // check if bid > buy-now price (sofortkauf), then we update the maxBid with buyPrice
          if (this.hasOwnProperty('articleBuyPrice') && maxBidInputValue >= this.articleBuyPrice) {
            console.log("Biet-O-Matic: monitorChanges() updated maxBid %s to %s (sofortkauf price)",
              maxBidInputValue, this.articleBuyPrice);
            // set to 1 cent less, to prevent unfriendly redirection
            maxBidInputValue = (Number.parseFloat(this.articleBuyPrice.toString()) - 0.01);
            maxBidInputNew.value = maxBidInputValue.toLocaleString('de-DE',
              {useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2});
            this.articleMaxBid = maxBidInputValue;
          } else {
            maxBidInputNew.value = maxBidInputValue.toLocaleString('de-DE',
              {useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2});
          }
          this.activateAutoBidButton(maxBidInputValue, minBidValue);
          // inform popup about the local change
          browser.runtime.sendMessage({
            action: 'ebayArticleMaxBidUpdated',
            articleId: this.articleId,
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
    // inform popup about autoBid changes
    if (bomAutoBid != null) {
      bomAutoBid.addEventListener('change', (e) => {
        const bomAutoBidNew = document.getElementById('BomAutoBid');
        if (bomAutoBidNew != null) {
          browser.runtime.sendMessage({
            action: 'ebayArticleMaxBidUpdated',
            articleId: this.articleId,
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
    const articleBidPrice = document.getElementById('prcIsum_bidPrice');
    if (articleBidPrice != null) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            const timeLeftInSeconds = (this.articleEndTime - Date.now()) / 1000;
            if (timeLeftInSeconds <= 30) {
              console.debug("Biet-O-Matic: Mutation received: %d seconds left", timeLeftInSeconds);
              this.doBid()
                .catch(e => {
                  console.info("Biet-O-Matic: doBid() was aborted: %s", e.message);
                  EbayArticle.sendArticleLog(this.articleId, e);
                });
            }
            let oldN = mutation.removedNodes;
            let newN = mutation.target;
            oldN=oldN[0];
            if (typeof oldN !== 'undefined' && oldN.textContent !== newN.textContent) {
              let info = EbayArticle.parsePageRefresh();
              Object.assign(this, info);
              this.activateAutoBidButton(info.articleMaxBid, info.articleMinimumBid);
              // send info to extension popup about new price
              browser.runtime.sendMessage({
                action: 'ebayArticleUpdated',
                detail: this
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
   * Parse information from Ebay Article page
   */
  static parsePage() {
    let result = {};
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
    for (let item of parseInfoArray) {
      let info = EbayArticle.parseInfoEntry(item[0], item[1]);
      result = Object.assign({}, result, info);
    }
    return result;
  }

  /*
 * Parse price from text
 * returns {currency: "EUR", price: 0.01}
 */
  static parsePriceString(price) {
    let currency = null;
    if (price == null) return null;
    price = price
      .replace(/\n/g, "")
      .replace(/\s+/g, " ");
    // use regular expression to parse info, e.g.
    // US $1,000.12
    // GBP 26.00
    // EUR 123,00
    const regex = /([A-Z]{2,3}(?:\s[$]?))([0-9,]+)(?:.|,)([0-9]{2})/;
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
   * parse a specific DOM element from the current page
   * returns {key: value} which can be assigned to the instance or used otherwise
   */
  static parseInfoEntry(key, value = []) {
    const result = {};
    for (let v of value) {
      const domEntry = document.querySelector(v);
      if (domEntry != null) {
        let value = null;
        if (key === "articleEndTime") {
          value = EbayArticle.parseEndTime(domEntry);
        } else if (key === "articleBidPrice") {
          // attempt to get price lazily from the content attribute
          let price = domEntry.getAttribute("content");
          let currency = null;
          if (price != null && typeof price !== 'undefined') {
            // this is the normal method for articles
            value = parseFloat(price);
          } else {
            let p = EbayArticle.parsePriceString(domEntry.textContent.trim());
            if (p != null) {
              currency = p.currency;
              value = p.price;
            }
          }
          // get currency from itemprop=priceCurrency
          if (currency == null) {
            currency = document.querySelectorAll('[itemprop="priceCurrency"]');
            if (currency.length >= 1) {
              result.articleCurrency = currency[0].getAttribute("content");
            }
          } else {
            // determined above
            result.articleCurrency = currency;
          }
        } else if (key === "articleBuyPrice") {
          // attempt to get price lazily from the content attribute
          let price = domEntry.getAttribute("content");
          if (price != null && typeof price !== 'undefined') {
            value = parseFloat(price);
          } else {
            value = EbayArticle.parsePriceString(domEntry.textContent.trim()).price;
          }
          // get currency from itemprop=priceCurrency if not already defined from bidPrice
          if (!result.hasOwnProperty('articleCurrency')) {
            let currency = document.querySelectorAll('[itemprop="priceCurrency"]');
            if (currency.length >= 1) {
              result.articleCurrency = currency[0].getAttribute("content");
            }
          }
        } else if (key === "articleDescription") {
          // some articles have long description, separated by <wbr>, concat the strings
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
          value = EbayArticle.parsePriceString(value).price;
        } else if (key === "articleBidCount") {
          //console.debug("articleBidCount=%s", domEntry.textContent.trim());
          value = parseInt(domEntry.textContent.trim(), 10);
        } else if (key === "articleAuctionState") {
          // todo it could be wise to sanitize the HTML, e.g. remove aria, style and id tags
          value = domEntry.outerHTML;
          result.articleAuctionStateText = domEntry.textContent.trim()
            .replace(/\n/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[\s\|]+$/g, '')
          value = EbayArticle.cleanupHtmlString(value);
        } else {
          value = domEntry.textContent.trim();
          // replace newline and multiple spaces
          value = value.replace(/\n/g, "");
          value = value.replace(/\s+/g, " ");
        }
        result[key] = value;
        break;
      } else {
        console.debug("Biet-O-Matic: parseInfoEntry() No value found for key %s, selector=%s", key, v);
      }
    }
    return result;
  }

  /*
 * Convert Ebay Time String (articleEndTime) to Date()
 * German: "(01. Dez. 2019\n							17:29:13 MEZ)"
 * English: 1575217753000 (Unix Epoch stored in attribute timems) (only on ebay.com right now)
 */
  static parseEndTime(domValue) {
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

  //region Status HTML Cleanup
  /*
   * parse html string via jquery and only keep whitelisted elements
   * http://booden.net/ContentCleaner.aspx
   * - elements: div, span
   * - tags: class, style, id
   */
  static cleanupHtmlString(html) {
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
      EbayArticle.clearUnsupportedTagsAndAttributes($(jqHtml), tagsAllowed, attributesAllowed);
      //console.log("After2: %s", $(jqHtml)[0].outerHTML);
      return $(jqHtml)[0].outerHTML;
    } catch(e) {
      console.warn("Biet-O-Matic: Failed to cleanup status: %s", e.message);
      return html;
    }
  }

  static clearUnsupportedTagsAndAttributes(obj, tagsAllowed, attributesAllowed, emptyTagsAllowed = '|div|br|hr|') {
    $(obj).children().each(function () {
      //recursively down the tree
      const el = $(this);
      EbayArticle.clearUnsupportedTagsAndAttributes(el, tagsAllowed, attributesAllowed, emptyTagsAllowed);
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
   * Send log information to popup - it will be persisted under the storage
   * - messageObject { component: s, message: s, level: s}
   * TODO: use HTML for good/bad indication
   */
  static sendArticleLog(articleId, messageObject) {
    const message = {};
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
      articleId: articleId,
      detail: {
        message: message
      },
    }).catch((e) => {
      console.warn("Biet-O-Matic: sendArticleLog(%s), Cannot sendMessage: %s", articleId, e.message);
    });
  }

  //region Bidding Related Functions
  /*
   * Trigger the Bid for an Article
   * - perform bid only if autoBid is checked (window + article) - this will also be repeated at the very end!
   * - Trigger time checking has to be performed externally!
   * - The bid is separated in two phases:
   *   Phase1: Prepare Bid (~10 seconds before end) -> inform popup setArticleStatus "Gebotsbgabe vorbereiten."
   *   Phase2: Confirm Bid (1..3 seconds before end) -> inform popup setArticleStatus "Gebotsabgabe erfolgt."
   */
  async doBid() {
    let simulate = false;
    let perfSnapshot = [];
    try {
      this.storePerfInfo("Initialisierung");
      // if end time reached, abort directly
      if ((this.hasOwnProperty('auctionEnded') && this.auctionEnded) || this.endTime <= Date.now()) {
        let t = Date.now() - this.endTime;
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: `Auktion bereits beendet.`
        };
      }
      /*
       * The following will ensure that the bid procedure will not be executed twice
       * due to mutation observer the function will be called again, even after the auction ended
       */
      let bidInfo = JSON.parse(window.sessionStorage.getItem(`bidInfo:${this.articleId}`));
      if (bidInfo != null) {
        if (bidInfo.hasOwnProperty('ended')) {
          // bid has ended
          console.debug("Biet-O-Matic: doBid(), bid already finished: %s", JSON.stringify(bidInfo));
        } else {
          // bid is already running
          console.debug("Biet-O-Matic: doBid(), bid is already running: %s", JSON.stringify(bidInfo));
        }
        return;
      }
      const autoBidInput = await EbayArticle.waitFor('#BomAutoBid', 1000)
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

      // set bidInfo to ensure the bidding is not executed multiple times
      if (bidInfo == null) {
        // bid not yet running (or not anymore after page refresh)
        bidInfo = {
          maxBid: this.articleMaxBid,
          endTime: this.articleEndTime,
          started: Date.now()
        };
        window.sessionStorage.setItem(`bidInfo:${this.articleId}`, JSON.stringify(bidInfo));
      }

      this.storePerfInfo("Phase1: Gebotsvorbereitung");
      console.log("Biet-O-Matic: Performing bid for article %s", this.articleId);
      EbayArticle.sendArticleLog(this.articleId, {
        component: "Bietvorgang",
        level: "Info",
        message: "Bietvorgang wird vorbereitet...",
      });
      // press bid button
      const bidButton = document.getElementById('bidBtn_btn');
      if (bidButton == null) {
        console.warn("Biet-O-Matic: Article %s - Unable to get Bid Button!", this.articleId);
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
      this.storePerfInfo("Phase2: Gebot abgeben");
      bidButton.click();
      // wait for modal to open: vilens-modal-wrapper
      const modalBody = await EbayArticle.waitFor('#MODAL_BODY', 5000)
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
      const confirmButton = await EbayArticle.waitFor('#confirm_button', 1000)
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
        articleId: this.articleId,
        articleEndTime: this.articleEndTime
      });
      if (modifiedEndTime == null) {
        console.warn("Biet-O-Matic: Unable to get ebayArticleGetAdjustedBidTime result!");
        modifiedEndTime = this.articleEndTime;
      } else {
        console.debug("Biet-O-Matic: Modified bidTime: %ds earlier.",
          (this.articleEndTime - modifiedEndTime) / 1000);
      }

      // todo: customizable bidding confirm time
      this.storePerfInfo("Phase3: Warten auf Bietzeitpunkt");
      const wakeUpInMs = (modifiedEndTime - Date.now()) - 2500;
      await EbayArticle.wait(wakeUpInMs);

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
        if (closeButton != null) closeButton.click();
        console.log("Biet-O-Matic: Test bid performed for Article %s", this.articleId);
        this.storePerfInfo("Phase3: Testgebot beendet");
        // send info to popup about (almost) successful bid
        let t = this.articleEndTime - Date.now();
        EbayArticle.sendArticleLog(this.articleId, {
          component: "Bietvorgang",
          level: "Erfolg",
          message: `Test-Bietvorgang (bis zur Bestätigung) ${t}ms vor Ablauf der Auktion abgeschlossen.`,
        });
      } else {
        // confirm the bid
        confirmButton.click();
        console.log("Biet-O-Matic: Bid submitted for Article %s", this.articleId);
        this.storePerfInfo("Phase3: Gebot wurde abgegeben");
        // send info to popup
        const t = this.articleEndTime - Date.now();
        EbayArticle.sendArticleLog(this.articleId, {
          component: "Bietvorgang",
          level: "Erfolg",
          message: `Bietvorgang ${t}ms vor Ablauf der Auktion abgeschlossen.`,
        });
      }
      // finally also send performance info to popup
      this.sendBidPerfInfo();
      // set bid process to "bidPerformed" - this
      bidInfo = JSON.parse(window.sessionStorage.getItem(`bidInfo:${this.articleId}`));
      if (bidInfo != null) {
        bidInfo.bidPerformed = Date.now();
        window.sessionStorage.setItem(`bidInfo:${this.articleId}`, JSON.stringify(bidInfo));
      }
    } catch (err) {
      // pass error through, will be forwarded to popup
      console.log("Biet-O-Matic: doBid() aborted: %s", err.message);
      throw err;
    } finally {
      //console.debug("Biet-O-Matic: doBid() reached the end.");
    }
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
   * store timing data in array - can be sent to popup
  */
  storePerfInfo(message) {
    console.debug("Biet-O-Matic: storePerfInfo() Message=%s", message);
    this.perfInfo.push({
      date: Date.now(),
      perf: performance.now(),
      description: message
    });
  }

  // print perf info,
  sendBidPerfInfo() {
    let result = "";
    let previousTime = 0;
    this.perfInfo.forEach(m => {
      let prevDiff = 0;
      let firstDiff = 0;
      if (previousTime > 0) {
        firstDiff = (m.perf - this.perfInfo[0].perf).toFixed(2);
        prevDiff = (m.perf - previousTime).toFixed(2);
      }
      result += `${m.description}: ${prevDiff}ms (seit start: ${firstDiff}ms, ${m.date}), `;
      previousTime = m.perf;
    });
    // calculate timeleft until auction end
    let timeLeft = this.articleEndTime - this.perfInfo[this.perfInfo.length - 1].date;
    result += `timeLeft = ${timeLeft}ms (${this.articleEndTime} - ${this.perfInfo[this.perfInfo.length - 2].date})`;
    EbayArticle.sendArticleLog(this.articleId, {
      component: "Bieten",
      level: "Performance",
      message: result,
    });
  }

  // remove articelAuctionState info value, its too long
  static replacer(key, value) {
    if (key === "articleAuctionState")
      return '<REMOVED>';
    else
      return value;
  }
  //endregion

  /*
   * Inform popup about auction end state. It might not be the final state though.
   * This function will likely be called multiple times
   */
  static async sendAuctionEndState(articleId, state, simulate = false) {
    if (state == null)
      throw new Error(`sendAuctionEndState(${articleId}): Cannot send, invalid state.`);
    await browser.runtime.sendMessage({
      action: 'ebayArticleSetAuctionEndState',
      articleId: articleId,
      detail: {auctionEndState: state}
    });
    // add the ended state to the log
    const stateText = Object.keys(auctionEndStates).find(key => auctionEndStates[key] === state);
    if (simulate) {
      console.debug("Biet-O-Matic: Simulation is on, returning random state: %s", stateText);
      EbayArticle.sendArticleLog(articleId, {
        component: "Bietvorgang",
        level: "Status",
        message: `Bietvorgang mit simuliertem Ergebnis beendet: ${stateText} (${state})`,
      });
    } else {
      EbayArticle.sendArticleLog(articleId, {
        component: "Bietvorgang",
        level: "Status",
        message: `Bietvorgang Status wurde aktualisiert: ${stateText} (${state})`,
      });
    }
    return true;
  }

  /*
   * When the mutation observer is called, the script will check for changed values
   * - maxBid
   * - minBid
   * - bidCount
   */
  static parsePageRefresh() {
    let result = {};
    // DOM Element Parsing
    const parseInfoArray = new Map([
      ['articleId', ['#descItemNumber']],
      ['articleBidPrice', [
        '#prcIsum_bidPrice',           // normal running article
        '#mainContent > div:nth-child(1) > table > tbody > tr:nth-child(6) > td > div > div:nth-child(2) > div.u-flL.w29.vi-price-np > span', // ended auction
      ]],
      ['articleBidCount', ['#qty-test']],
      ['articleMinimumBid', ['#MaxBidId']],
      ['articleAuctionState', ['#msgPanel']],
    ]);

    for (let item of parseInfoArray) {
      let info = EbayArticle.parseInfoEntry(item[0], item[1]);
      result = Object.assign({}, result, info);
    }
    return result;
  }

  /*
   * handle reload: for various reasons the page can reload or go even to a different page
   * - article ended and redirects to a recommended article -> redirect back
   * - reload when a modal was closed  -> resume bidding
   */
  static async handleReload() {
    const ebayArticleInfo = EbayArticle.parsePageRefresh();
    if (!ebayArticleInfo.hasOwnProperty('articleId')) {
      console.debug("Biet-O-Matic: handleReload() Aborting, no articleId found: %s", JSON.stringify(ebayArticleInfo));
      return ebayArticleInfo;
    }
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

    // info related to previous bidding
    const bidInfo = JSON.parse(window.sessionStorage.getItem(`bidInfo:${ebayArticleInfo.articleId}`));
    // info from sync storage
    const articleStoredInfo = browser.storage.sync.get(ebayArticleInfo.articleId);

    /*
     * retrieve settings from popup
     * if simulation is on, then we define bid status:
     * - if endPrice > bidPrice: overbid
     * - if endPrice <= bidprice: purchased
     */
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
        //state = Math.floor(Math.random() * (3));
        if (bidInfo != null && ebayArticleInfo.articleBidPrice > bidInfo.maxBid)
          state = auctionEndStates.overbid;
        else if (bidInfo != null && ebayArticleInfo.articleBidPrice <= bidInfo.maxBid)
          state = auctionEndStates.purchased;
        else
          state = auctionEndStates.unknown;
      }
    }

    /*
     * Retrieve stored article info from popup
     * - if null returned, then the article is not of interest (no bid yet)
     * - if articleState from stored result is incomplete (e.g. state.unknown), then send updated state
     * The popup can then use the result to decide e.g. to stop the automatic bidding
     */
    if (articleStoredInfo != null && typeof articleStoredInfo !== 'undefined' && articleStoredInfo.hasOwnProperty(ebayArticleInfo.articleId)) {
      const data = articleStoredInfo[ebayArticleInfo.articleId];
      // Note: auctionEndState is set&used only by handleReload, further below
      if (data.hasOwnProperty('auctionEndState') &&
        (state !== auctionEndStates.unknown && data.auctionEndState === auctionEndStates.unknown)) {
        // send updated end state
        EbayArticle.sendAuctionEndState(ebayArticleInfo.articleId, state, simulate).catch(e => {
          console.warn("Biet-O-Matic: handleReload() Sending Auction End State failed: %s", e.message);
        });
      }
    }

    /*
     * If bidInfo exists in sessionStorage, it means a bid process was started before reload
     * we will inform the popup about the state indicated now on the page
     */
    if (bidInfo != null) {
      console.debug("Biet-O-Matic: handleReload(%s) Found bidInfo in sessionStorage: %s",
        ebayArticleInfo.articleId, JSON.stringify(bidInfo));
      // go back to previous page (?)
      // remove bidinfo if the auction for sure ended
      if (bidInfo.hasOwnProperty('bidPerformed') || bidInfo.endTime <= Date.now()) {
        console.debug("Biet-O-Matic: Setting auctionEnded now. state=%s (%d)", ebayArticleInfo.articleAuctionStateText, state);
        EbayArticle.sendAuctionEndState(ebayArticleInfo.articleId, state, simulate).catch(e => {
          console.warn("Sending initial auction end state failed: %s", e.message);
        });
        window.sessionStorage.removeItem(`bidInfo:${ebayArticleInfo.articleId}`);
        // set this, so the script will not trigger parsing further down
        ebayArticleInfo.auctionEnded = true;
      } else {
        // todo bidInfo should probably be deleted in some cases, to ensure that when a page was reloaded after
        //  the bidding procedure was triggered once, the bidding can still be done
      }
    } else {
      console.debug("Biet-O-Matic: handleReload(%s) No bidInfo in sessionStorage",
        ebayArticleInfo.articleId, JSON.stringify(bidInfo));
    }
    return ebayArticleInfo;
  }

  toString () {
    let str = '';
    for (let p in this) {
      if (this.hasOwnProperty(p)) {
        str += p + '::' + this[p] + '\n';
      }
    }
    return str;
  }
}

/*
* MAIN
*/

(function () {
  'use strict';

  // check if the contentScript was already loaded (each Tab will get its own window object)
  // return value will be passed back to executeScript
  if (window.hasRun === true) {
    console.debug("Biet-O-Mat: RELOADED EXTENSION, window=%O", window);
    return true;
  }
  window.hasRun = true;

  EbayArticle.handleReload().then((reloadInfo) => {
    const ebayArticle = new EbayArticle();
    ebayArticle.init(reloadInfo)
      .then(() => {
        try {
          console.debug("Biet-O-Matic: Initialized - Article Info: %s", ebayArticle.toString());
          ebayArticle.extendPage();
          ebayArticle.monitorChanges();
          // send info to extension popup directly after initialization
          browser.runtime.sendMessage({
            action: 'ebayArticleUpdated',
            detail: ebayArticle
          }).catch(e => {
            console.warn("Biet-O-Matic: sendMessage(ebayArticleUpdated) failed: %s", e.message);
          });
        } catch (e) {
          console.warn("Biet-O-Matic: Internal Error while post-initializing: %s", e.message);
        }
      })
      .catch(e => {
        console.warn("Biet-O-Matic: Article Init failed: %s", e.message);
      });
  }).catch(e => {
    console.warn("Biet-O-Matic: handleReload() failed: %s", e.message);
  });

})();