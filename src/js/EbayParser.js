/*
 * EbayParser.js - eBay Article Page parser
 * ===================================================
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

import browser from "webextension-polyfill";
import $ from "jquery";

class EbayParser {
  /*
   * parse from document or html string
   */
  constructor(url, htmlString = null) {
    this.url = url;
    if (htmlString == null) {
      this.data = document;
      this.createdFromHtml = false;
    } else {
      // Note: DOMParser fails on ebay page
      let doc = document.implementation.createHTMLDocument("eBay Article");
      doc.documentElement.innerHTML = htmlString;
      this.data = doc;
      this.createdFromHtml = true;
    }
  }

  /*
   * Initialize the EbayArticle object
   * - check if the page is in expected format
   */
  async init(oldInfo) {
    // first we check if the page is a expected Article Page
    const body = this.data.getElementById("Body");
    if (body == null) {
      console.info("Biet-O-Mat: skipping on this page; no Body element, data=%O", this.data);
      throw new Error("Biet-O-Mat: skipping on this page; no Body element");
    }
    const itemType = body.getAttribute("itemtype");
    if (itemType == null) {
      console.info("Biet-O-Mat: skipping on this page; no itemtype in body element");
      throw new Error("Biet-O-Mat: skipping on this page; no itemtype in body element");
    }
    if (itemType !== "https://schema.org/Product") {
      let msg = `Biet-O-Mat: skipping on this page; unexpected itemtype in body element: ${itemType}`;
      console.info(msg);
      throw new Error(msg);
    }
    if (typeof oldInfo !== "undefined" && oldInfo.auctionEnded) {
      throw new Error("Biet-O-Mat: skipping on this page; bidding already performed.");
    }
    let globalOptions = await browser.storage.sync.get({enableCompactSaving: false});
    this.enableCompactSaving = globalOptions.enableCompactSaving;
  }

  cleanup() {
    // todo check if this is a good way to cleanup the document for memory leak prevention
    if (this.createdFromHtml) {
      $(this.data).empty();
    }
    this.data = null;
  }

  /*
   * Parse information from Ebay Article page and return the result object
   */
  parsePage() {
    const result = {};
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
        'div.vi-price-np > span',      // ended auction
      ]],
      ['articleBuyPrice', [
        '#prcIsum'                     // sofortkauf
      ]],
      ['articlePaymentMethods', ['#payDet1']],
      ['articleShippingCost', ['#fshippingCost']],
      ['articleShippingMethods', ['#fShippingSvc']],
      ['articleAuctionState', ['#msgPanel']],
      ['articleBidCount', ['#qty-test']],
      ['articleMinimumBid', ['#MaxBidId']],
      ['articleImage', ['#icImg']],
      ['articleSeller', ['#RightSummaryPanel']]
    ]);
    for (const item of parseInfoArray) {
      const info = this.parseInfoEntry(item[0], item[1]);
      Object.assign(result, info);
    }
    // save platform
    const regex = /(?:www|cgi)\.(ebay\..*?)\//i;
    if (regex.test(this.url)) {
      result.articlePlatform = this.url.match(regex)[1];
    } else {
      console.log("Biet-O-Matic: Platform could not be determined from URL: %s", this.url);
      result.articlePlatform = 'ebay.de';
    }
    //console.debug("Biet-O-Matic: EbayParser.parsePage() result=%O", result);
    return result;
  }

  /*
   * When the mutation observer is called, the script will check for changed values
   * - maxBid
   * - minBid
   * - bidCount / bidPrice
   * - auctionEndState
   */
  parsePageRefresh() {
    let result = {};
    // DOM Element Parsing
    const parseInfoArray = new Map([
      ['articleId', ['#descItemNumber']],
      ['articleBidPrice', [
        '#prcIsum_bidPrice',  // normal running article
        '.vi-VR-cvipPrice',   // auction just ended (orig_cvip=false)
      ]],
      ['articleBidCount', ['#qty-test']],
      ['articleMinimumBid', ['#MaxBidId']],
      ['articleAuctionState', ['#msgPanel']],
    ]);
    for (const item of parseInfoArray) {
      const info = this.parseInfoEntry(item[0], item[1]);
      Object.assign(result, info);
    }
    return result;
  }

  /*
   * Parse price from domValue
   * - regular expression to parse price from text
   * - uses priceCurrency for currency
   * returns {currency: "EUR", price: 0.01}
   */
  static parsePriceString(domEntry, currencySelector) {
    const result = {
      price: null,
      currency: null
    };
    if (typeof currencySelector !== 'undefined' && currencySelector.length >= 1) {
      result.currency = currencySelector[0].getAttribute("content");
    }
    let price;
    if (typeof domEntry !== 'string') {
      price = domEntry.textContent.trim()
        .replace(/\n/g, "")
        .replace(/\s+/g, " ");
    } else {
      // handed over domEntry is just a text
      price = domEntry;
    }
    // use regular expression to parse info, e.g.
    // US $1,000.12 (on ebay.com)
    // US $1.100,00 (on ebay.de)
    // GBP 26.00
    // EUR 123,00
    const regex = /(.*?)([0-9,\\.]+)(?:.|,)([0-9]{2})/;
    if (regex.test(price)) {
      const rexres = price.match(regex);
      let p1 = rexres[2].replace(/[,\\.]/, '');
      let p2 = rexres[3];
      result.price = Number.parseFloat(`${p1}.${p2}`);
    } else {
      // fallback get price from
      result.price = Number.parseFloat(domEntry.getAttribute("content"));
    }
    return result;
  }

  /*
   * parse a specific DOM element from the current page
   * returns {key: value} which can be assigned to the instance or used otherwise
   */
  parseInfoEntry(key, selectors = []) {
    const result = {};
    for (const selector of selectors) {
      let domEntry = this.data.querySelector(selector);
      try {
        if (domEntry != null) {
          let value = null;
          if (key === "articleEndTime") {
            try {
              // determine auction end time from ebay raptor javascript object
              // this is more reliable (time zone of user) because the ebay time is in UTC.
              for (let script of this.data.scripts) {
                if (script.src === "" && script.type === "text/javascript") {
                  const regex = /"endTime":([0-9]{13}),/
                  if (regex.test(script.text)) {
                    value = Number.parseInt(script.text.match(regex)[1], 10);
                    console.debug("Biet-O-Matic: articleEndTime determined from raptor js: %s", value);
                    break;
                  }
                }
              }
            } catch(e) {
              console.log("Biet-O-Matic: Cannot parse endTime from raptor js: " + e);
            }
            if (value == null) {
              // parse traditionally via timems (good) or text field (bad)
              value = EbayParser.parseEndTime(domEntry);
            }
          } else if (key === "articleSeller") {
            try {
              for (let script of this.data.scripts) {
                if (script.src === "" && script.type === "text/javascript") {
                  const regex = /"entityId":"(.*?)",/
                  if (regex.test(script.text)) {
                    value = script.text.match(regex)[1];
                    console.debug("Biet-O-Matic: articleSeller determined from raptor js: %s", value);
                    break;
                  }
                }
              }
            } catch(e) {
              console.log("Biet-O-Matic: Cannot parse entityId from raptor js: " + e);
            }
          } else if (key === "articleBidPrice" || key === 'articleBuyPrice') {
            /*
             * It would be easy to just take the price from the content attribute
             *   however when the price gets updated on the page, the content attribute does not.
             */
            const priceInfo = EbayParser.parsePriceString(domEntry, this.data.querySelectorAll('[itemprop="priceCurrency"]'));
            value = priceInfo.price;
            if (!result.hasOwnProperty('articleCurrency'))
              result.articleCurrency = priceInfo.currency;
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
            value = EbayParser.parsePriceString(value).price;
          } else if (key === "articleBidCount") {
            //console.debug("articleBidCount=%s", domEntry.textContent.trim());
            value = Number.parseInt(domEntry.textContent.trim(), 10);
          } else if (key === "articleAuctionState") {
            // artcleAuctionState is quite large, allow optionally to only store the innerText
            if (this.enableCompactSaving) {
              value = domEntry.textContent
                .trim()
                .replace(/\n/g, '')
                .replace(/\s+/g, ' ')
                .replace(/[\s-\|]+$/g, '');
            } else {
              try {
                // attempt to sanitize the html
                EbayParser.cleanupHtmlString(domEntry);
              } catch (e) {
                console.log("Biet-O-Matic: cleanupHtmlString() Internal error: %s", e.message);
              } finally {
                value = domEntry.outerHTML;
              }
              //result.articleAuctionStateText = $(value).find('span.msgTextAlign')[0].innerText.trim();
              result.articleAuctionStateText = $(value)[0].textContent
                .trim()
                .replace(/\n/g, '')
                .replace(/\s+/g, ' ')
                .replace(/[\s-\|]+$/g, '');
            }
          } else if (key === 'articleImage') {
            // store primary Image URL
            value = domEntry.src;
          } else if (key === 'articlePaymentMethods') {
            try {
              const methods = [];
              // get text and join with image alt attributes
              const textMethod = domEntry.textContent.trim()
                .replace(/\n/g, "")
                .replace(/\s+/g, " ");
              if (textMethod.trim().length > 0)
                methods.push(textMethod.split(','));
              // get images from 'img' alt attributes
              let t = $(domEntry, "div");
              if (typeof t !== 'undefined' && t.length === 1) {
                let res =  $(t).find('img');
                if (typeof res !== 'undefined' && res.length > 0) {
                  const D=$;
                  $(res).each((index, element) => {
                    methods.push(D(element).attr('alt').toString());
                  });
                }
                t = null;
              } else {
                console.log("Biet-O-Matic: Could not parse articlePaymentMethods images, t=%O", t);
              }
              value = methods.join(', ');
            } catch(e) {
              console.log("Biet-O-Matic: Failed to parse articlePaymentMethods: " + e);
            }
          } else {
            value = domEntry.textContent.trim();
            // replace newline and multiple spaces
            value = value
              .replace(/\n/g, "")
              .replace(/\s+/g, " ");
          }
          result[key] = value;
          value = null;
          // the first success aborts the loop over the selectors
          break;
        } else {
          console.debug("Biet-O-Matic: parseInfoEntry() No value found for key %s, selector=%s", key, selector);
        }
      } catch(err) {
        console.log("parseInfoEntry(%s) Internal Error: %s", key, err);
      } finally {
        domEntry = null;
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
    if (timems != null) {
      return parseInt(timems.getAttribute('timems'), 10);
    }
    // ebay.de still only has ugly date string which needs to be parsed
    let months = {
      'Jan': 0,
      'Feb': 1,
      'Mrz': 2,
      'Apr': 3,
      'Mai': 4,
      'Jun': 5,
      'Jul': 6,
      'Aug': 7,
      'Sep': 8,
      'Okt': 9,
      'Nov': 10,
      'Dez': 11
    };
    let text = domValue.textContent.trim();
    text = text.replace(/\n/g, ' ');
    // domValue.innerText:
    //   normal Article: "Restzeit:↵4T 00Std ↵(08. Dez. 2019 17:30:42 MEZ)"
    //   ended Article: "01. Dez. 2019 12:35:50 MEZ"
    let regex = /^[(]?([0-9]{2})\.\s(.+)\.\s([0-9]{4})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})\s+([A-Z]{3,4})[)]?$/i;
    if (regex.test(text)) {
      let m = text.match(regex);
      const year = parseInt(m[3], 10);
      const month = months[m[2]];
      const day = parseInt(m[1], 10);
      const hour = parseInt(m[4], 10);
      const minute = parseInt(m[5], 10);
      const second = parseInt(m[6], 10);
      const tz = m[7];
      // new Date(year, monthIndex [, day [, hour [, minutes [, seconds [, milliseconds]]]]]);
      const date = new Date(year, month, day, hour, minute, second);
      //console.debug("Biet-O-Matic: Input Date=%O, regexMatch=%O, date=%O", text, m, date);
      return date.valueOf();
    } else {
      console.warn("Biet-O-Matic: Unable to parse date from Input Date=%s", text);
    }
    return null;
  }

  /*
   * determine the auction end state by checking text determined by parsePage() against regex
   */
  static getAuctionEndState(ebayArticleInfo) {
    try {
      if (ebayArticleInfo == null || typeof ebayArticleInfo === 'undefined')
        return EbayParser.auctionEndStates.unknown;
      // check if the given string matches the given endState
      const matches = (endState, messageToCheck) => {
        if (!EbayParser.auctionEndStates.hasOwnProperty(endState)) {
          console.warn("Biet-O-Matic: getAuctionEndState() Invalid endState: " + endState);
          return false;
        }
        const strings = EbayParser.auctionEndStates[endState].strings;
        for (const lang of Object.keys(strings)) {
          const messages = strings[lang];
          for (const message of messages) {
            if (messageToCheck.includes(message)) {
              console.debug("Biet-O-Matic: getAuctionEndState(%s) Status determined from lang=%s, message=%s",
                ebayArticleInfo.articleId, lang, message);
              return true;
            }
          }
        }
      };
      if (ebayArticleInfo.hasOwnProperty('articleAuctionStateText') && ebayArticleInfo.articleAuctionStateText !== "") {
        for (const key of Object.keys(EbayParser.auctionEndStates)) {
          if (matches(key, ebayArticleInfo.articleAuctionStateText))
            return EbayParser.auctionEndStates[key];
        }
      } else if (!ebayArticleInfo.hasOwnProperty('articleAuctionStateText')
        && ebayArticleInfo.hasOwnProperty('articleAuctionState') && ebayArticleInfo.articleAuctionState !== "") {
        for (const key of Object.keys(EbayParser.auctionEndStates)) {
          if (matches(key, ebayArticleInfo.articleAuctionState))
            return EbayParser.auctionEndStates[key];
        }
      }
    } catch (e) {
      console.info("Biet-O-Matic: getAuctionEndState failed: " + e);
    }
    return EbayParser.auctionEndStates.unknown;
  }

  //region Status HTML Cleanup
  /*
   * parse html string via jquery and only keep whitelisted elements
   * http://booden.net/ContentCleaner.aspx
   * - elements: div, span
   * - tags: class, style, id
   * - a href add target _blank
   */
  static cleanupHtmlString(domEntry) {
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
          objChildNode = null;
        }
      );
    };

    const tagsAllowed = "|div|span|a|strong|br|";
    const attributesAllowed = [];
    attributesAllowed.div = "|id|class|style|";
    attributesAllowed.span = "|id|class|style|";
    attributesAllowed.a = "|class|href|name|target|";
    //console.log("Before: %s", $(jqHtml).html());
    try {
      $(domEntry).removeComments();
      EbayParser.clearUnsupportedTagsAndAttributes(domEntry, tagsAllowed, attributesAllowed);
    } catch (e) {
      console.warn("Biet-O-Matic: Failed to cleanup status: " + e);
    }
  }

  static clearUnsupportedTagsAndAttributes(obj, tagsAllowed, attributesAllowed, emptyTagsAllowed = '|div|br|hr|') {
    $(obj).children().each(function () {
      //recursively down the tree
      let el = $(this);
      EbayParser.clearUnsupportedTagsAndAttributes(this, tagsAllowed, attributesAllowed, emptyTagsAllowed);
      try {
        const tag = el.tagName();
        // add target to links
        if (tag === 'a') {
          if (!el.get(0).attributes.target) {
            el.attr('target', '_blank');
          }
        }
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
              if (tag === 'span' && attrs[i].name.toLocaleLowerCase() === 'class') {
                if (attrs[i].textContent === 'statusRightContent') {
                  el.remove();
                }
              }
              try {
                if (attributesAllowed[tag] == null ||
                  attributesAllowed[tag].indexOf("|" + attrs[i].name.toLowerCase() + "|") < 0) {
                  el.removeAttr(attrs[i].name);
                }
              } catch (e) {
              } //Fix for IE, catch unsupported attributes like contenteditable and dataFormatAs
            }
          }
        }
      } catch (e) {
        throw new Error(e.message);
      } finally {
        el = null;
      }
    });
  }
//endregion

  /*
   * Determine time from ebay server and returns the difference to the local time in ms
   * The difference for a correctly synchronized PC would be around +100ms, due to the processing times.
   * - a positive value means the system time is ahead
   * - a negative value means the system time is behind ebay time
   */
  static async getEbayTimeDifference() {
    // first determine response time via HEAD method
    const started = Date.now()
    let responseHead = await fetch('https://viv.ebay.com/favicon.ico',
      {method: "GET", mode: "no-cors"});
    const delay = Date.now() - started;

    let responseGet = await fetch('https://viv.ebay.com/ws/eBayISAPI.dll?EbayTime');
    if (!responseGet.ok)
      throw new Error(`Failed to fetch ebay time(2): HTTP ${responseGet.status} - ${responseGet.statusText}`);
    // date header "date: Sat, 01 Feb 2020 22:51:17 GMT"
    const htmlString = await responseGet.text();
    let doc = document.implementation.createHTMLDocument("eBay Time");
    doc.documentElement.innerHTML = htmlString;
    // e.g. "Saturday, February 01, 2020 14:37:36 PST"
    //let e = $(doc).find('p.currTime');
    //if (typeof e == 'undefined' || e.length !== 1) {
    //  return null;
    //}
    //let ebayTime = e.get(0).textContent;
    // get time from the img tag instead of the obvious Date string because parsing is awful.
    let images = $(doc).find('img');
    let result = 0;
    for (let i = 0; i < images.length; i++) {
      // src: "https://rover.ebay.com/roversync/?site=0&stg=1&mpt=1580598619516"
      let match = images[i].src.match(/mpt=([0-9]+)$/);
      if (match == null)
        continue;
      // reduce time difference by 100ms which is the approximated ebay system processing time
      const diffTime =  (Date.now() - 100) - Number.parseInt(match[1], 10);
      console.debug("Biet-O-Matic: getEbayTimeDifference() networkDelay=%s, timeDiff=%s", delay, diffTime);
      result = diffTime - delay;
      break;
    }
    $(doc).empty();
    return result;
  }

  /*
   * Access the ebay watchlist and return the item ids
   * this is limited to 100 items
   */
  static async getWatchListItems(ebayPlatform = 'ebay.com') {
    let response = await fetch(`https://www.${ebayPlatform}/myb/WatchList?custom_list_id=WATCH_LIST&sort=ending_soon&items_per_page=100`);
    if (response.redirected) {
      throw new Error(browser.i18n.getMessage('popup_ebayLoginRequired', [ebayPlatform]));
    }
    if (!response.ok) {
      throw new Error(browser.i18n.getMessage('popup_ebayError', [ebayPlatform, response.status.toString(), response.statusText]));
    }
    const htmlString = await response.text();
    let doc = document.implementation.createHTMLDocument("eBay Watch List");
    doc.documentElement.innerHTML = htmlString;
    let result = [];
    // <input class="checkbox__custom-control checkbox__control item-checkbox" data-itemid="164047573456" data-variationid=""
    $(doc).find('input[data-itemid]').each((index, element) => {
      result.push(element.dataset.itemid);
    });
    return result;
  }

}
// Auction states as communicated to the overview page
// this is used to detect auction end state - non ideal but what are the alternatives?
EbayParser.auctionEndStates = {
  ended: {
    id: 0,
    human: browser.i18n.getMessage('generic_ended'),
    strings: {
      de: ["Dieses Angebot wurde beendet"],
      en: ["Bidding has ended on this item"]
    },
  },
  purchased: {
    id: 1,
    human: browser.i18n.getMessage('generic_purchased'),
    strings: {
      de: ["Sie waren der Höchstbietende"],
      en: ["You won this auction"]
    }
  },
  overbid: {
    id: 2,
    human: browser.i18n.getMessage('generic_overbid'),
    strings: {
      de: ["Sie wurden überboten", "Sie wurden gerade überboten.", "Mindestpreis wurde noch nicht erreicht", "Sie waren nicht der Höchstbietende bei dieser Auktion."],
      en: ["You've been outbid", "TODO456DEF", "You didn't win this auction."]
    }
  },
  unknown: {
    id: null,
    human: browser.i18n.getMessage('generic_stillUnknown'),
  }
};

export default EbayParser;