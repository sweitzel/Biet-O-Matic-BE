/*
 * EbayParser.js - eBay Article Page parser
 * ===================================================
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

import $ from "jquery";

class EbayParser {
  /*
   * parse from document or html string
   */
  constructor(url, htmlString = null) {
    this.url = url;
    if (htmlString == null) {
      this.data = document;
    } else {
      // Note: DOMParser fails on ebay page
      let parser = new DOMParser();
      const doc = document.implementation.createHTMLDocument("eBay Article");
      doc.documentElement.innerHTML = htmlString;
      this.data = doc;
    }
  }

  /*
   * Initialize the EbayArticle object
   * - check if the page is in expected format
   */
  init(oldInfo) {
    // first we check if the page is a expected Article Page
    const body = this.data.getElementById("Body");
    if (body == null) {
      console.info("Biet-O-Mat: skipping on this page; no Body element, window=%O", window);
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
  }

  /*
   * Parse information from Ebay Article page and return the result object
   */
  parsePage() {
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
      ['articleImage', ['#icImg']]
    ]);
    for (let item of parseInfoArray) {
      let info = this.parseInfoEntry(item[0], item[1]);
      result = Object.assign({}, result, info);
    }
    // save platform
    const regex = /(?:www|cgi)\.(ebay\..*?)\//i;
    if (regex.test(this.url)) {
      result.articlePlatform = this.url.match(regex)[1];
    } else {
      console.log("Biet-O-Matic: Platform could not be determined from URL: %s", this.url);
      result.articlePlatform = 'ebay.de';
    }

    return result;
  }

  /*
   * When the mutation observer is called, the script will check for changed values
   * - maxBid
   * - minBid
   * - bidCount / bidPrice
   * - auctioNEndState
   */
  parsePageRefresh() {
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
      let info = this.parseInfoEntry(item[0], item[1]);
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
    if (regex.test(price)) {
      result = price.match(regex);
      let p1 = result[2].replace(/,/, '');
      let p2 = result[3];
      price = parseFloat(`${p1}.${p2}`).toFixed(2);
      currency = result[1].trim();
      if (currency === "US $")
        currency = "USD";
      return {
        price: Number.parseFloat(price.toString()),
        currency: currency
      };
    } else {
      return null;
    }
  }

  /*
   * parse a specific DOM element from the current page
   * returns {key: value} which can be assigned to the instance or used otherwise
   */
  parseInfoEntry(key, value = []) {
    const result = {};
    for (let v of value) {
      const domEntry = this.data.querySelector(v);
      if (domEntry != null) {
        let value = null;
        if (key === "articleEndTime") {
          value = EbayParser.parseEndTime(domEntry);
        } else if (key === "articleBidPrice") {
          /*
           * It would be easy to just take the price from the content attribute
           *   however when the price gets updated on the page, the content attribute does not.
           */
          //const priceFromContent = domEntry.getAttribute("content");
          const priceFromText = EbayParser.parsePriceString(domEntry.textContent.trim());
          let currency = null;
          if (priceFromText != null) {
            currency = priceFromText.currency;
            value = priceFromText.price;
          }
          // fallback, get currency from itemprop=priceCurrency
          if (currency == null) {
            currency = this.data.querySelectorAll('[itemprop="priceCurrency"]');
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
            value = EbayParser.parsePriceString(domEntry.textContent.trim()).price;
          }
          // get currency from itemprop=priceCurrency if not already defined from bidPrice
          if (!result.hasOwnProperty('articleCurrency')) {
            let currency = this.data.querySelectorAll('[itemprop="priceCurrency"]');
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
          value = EbayParser.parsePriceString(value).price;
        } else if (key === "articleBidCount") {
          //console.debug("articleBidCount=%s", domEntry.textContent.trim());
          value = parseInt(domEntry.textContent.trim(), 10);
        } else if (key === "articleAuctionState") {
          try {
            // attempt to sanitize the html
            value = EbayParser.cleanupHtmlString(domEntry.outerHTML);
          } catch (e) {
            console.log("Biet-O-Matic: cleanupHtmlString() Internal error: %s", e.message);
            value = domEntry.outerHTML;
          }
          result.articleAuctionStateText = $(value)[0].textContent.trim()
            .replace(/\n/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[\s\|-]+$/g, '');
        } else if (key === 'articleImage') {
          // store primary Image URL
          value = domEntry.src;
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
    if (timems != null) {
      return parseInt(timems.getAttribute('timems'), 10);
    }
    // ebay.de still only has ugly date string which needs to be parsed
    let months = {
      'Jan': 0,
      'Feb': 1,
      'Mär': 2,
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
    let regex = /^[(]?([0-9]{2})\.\s(.+)\.\s([0-9]{4})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})\s+([A-Z]{3})[)]?$/i;
    if (regex.test(text)) {
      let m = text.match(regex);
      // new Date(year, monthIndex [, day [, hour [, minutes [, seconds [, milliseconds]]]]]);
      let date = new Date(parseInt(m[3], 10), months[m[2]],
        parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10));
      //console.debug("Biet-O-Matic: Input Date=%O, regexMatch=%O, date=%O", text, m, date);
      return date.valueOf();
    } else {
      console.warn("Biet-O-Matic: Unable to parse date from Input Date=%s", text);
    }
    return null;
  }

  //region Status HTML Cleanup
  /*
   * parse html string via jquery and only keep whitelisted elements
   * http://booden.net/ContentCleaner.aspx
   * - elements: div, span
   * - tags: class, style, id
   * - a href add target _blank
   */
  static cleanupHtmlString(htmlString) {
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
    attributesAllowed.span = "|id|class|style|";
    attributesAllowed.a = "|class|href|name|target|";
    //console.log("Before: %s", $(jqHtml).html());
    try {
      htmlString = htmlString.replace(/(\r\n|\n|\r)/gm, '');
      htmlString = htmlString.replace(/\t+/gm, '');
      const jqHtml = $(htmlString);
      $(jqHtml).removeComments();
      EbayParser.clearUnsupportedTagsAndAttributes($(jqHtml), tagsAllowed, attributesAllowed);
      return $(jqHtml).get(0).outerHTML;
    } catch (e) {
      console.warn("Biet-O-Matic: Failed to cleanup status: %s", e.message);
      return htmlString;
    }
  }

  static clearUnsupportedTagsAndAttributes(obj, tagsAllowed, attributesAllowed, emptyTagsAllowed = '|div|br|hr|') {
    $(obj).children().each(function () {
      //recursively down the tree
      const el = $(this);
      EbayParser.clearUnsupportedTagsAndAttributes(el, tagsAllowed, attributesAllowed, emptyTagsAllowed);
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
      }
    });
  }
//endregion
}
export default EbayParser;