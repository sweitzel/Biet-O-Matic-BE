/*
 * contentScript.js - Ebay Article Page handler
 * ===================================================
 * - Parse information from the article page and informs the background thread
 * - Place automatic bids
 * - Note: Whenever the page reloads, the contentScript will reinitialize
 *
 * By Sebastian Weitzel, sebastian.weitzel@gmail.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

(function() {
  'use strict';

  // check if the contentScript was already loaded (each Tab will get its own window object)
  // return value will be passed back to executeScript
  if (window.hasRun === true)
    return true;
  window.hasRun = true;

  // Object containing determined Information from Ebay Article Page
  let ebayArticleInfo = Object.create(null);

  /*
   * Parse information from Ebay Article page
   */
  function parsePage() {
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
        '#mainContent > div:nth-child(1) > table > tbody > tr:nth-child(6) > td > div > div:nth-child(2) > div.u-flL.w29.vi-price-np > span',
        '#prcIsum'                     // sofortkauf
      ]],
      ['articlePaymentMethods', ['#payDet1']],
      ['articleShippingCost', ['#fshippingCost']],
      ['articleAuctionState', [
        '#w1-5-_msg',
        '#w1-4-_msg',
        '#msgPanel > div > div'
      ]],
      ['articleBidCount', ['#qty-test']],
      ['articleMinimumBid', ['#MaxBidId']]
    ]);
    parseInfoArray.forEach(parseInfoEntry);
  }

  function parseInfoEntry(value, key, map) {
    for (let v of value) {
      let domEntry = document.querySelector(v);
      //console.log("%O", domEntry);
      if (domEntry != null) {
        let value = null;
        if (key === "articleEndTime") {
          value = parseEndTime(domEntry);
        } else if (key === "articleBidPrice") {
          // get price
          let price = domEntry.getAttribute("content");
          let currency = null;
          if (price != null && typeof price !== 'undefined') {
            value = parseFloat(price);
          } else {
            // use regular expression to parse info, e.g.
            // US $1,000.12
            // GBP 26.00
            // EUR 123,00
            value = domEntry.textContent.trim();
            value = value.replace(/\n/g, "");
            value = value.replace(/\s+/g, " ");
            let regex = /^([A-Z]{2,3}(?:\s[$]?))([0-9,]+)(?:.|,)([0-9]{2})$/;
            let result = [];
            if (value.match(regex)) {
              result = value.match(regex);
              let p1 = result[2].replace(/,/, '');
              let p2 = result[3];
              value = parseFloat(`${p1}.${p2}`);
              currency = result[1].trim();
              if (currency === "US $") {
                currency = "USD";
              }
            } else {
              console.log('Biet-O-Matic: parseInfoEntry(%s) failed domEntry=%O, regex=%O', key, domEntry, regex);
              value = '-1';
            }
          }
          // get currency itemprop=priceCurrency
          if (currency == null) {
            currency = document.querySelectorAll('[itemprop="priceCurrency"]');
            if (currency.length === 1) {
              ebayArticleInfo.articleCurrency = currency[0].getAttribute("content");
            }
          } else {
            // determined above
            ebayArticleInfo.articleCurrency = currency;
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
          value = parsePriceString(value);
        } else if (key === "articleBidCount") {
          //console.debug("articleBidCount=%s", domEntry.textContent.trim());
          value = parseInt(domEntry.textContent.trim(), 10);
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
  function activateAutoBidButton(maxBidValue, minBidValue) {
    let buttonInput = document.getElementById('BomAutoBid');
    if (buttonInput == null) {
      console.warn("ButtonInput invalid - shouldnt happen");
      return;
    }
    buttonInput.disabled = true;

    // if no maxBid entered or maxBid < minBid, then autoBid button disabled (cannot be activated)
    if ((minBidValue *1 >= ebayArticleInfo.articleBidPrice && maxBidValue *1 < minBidValue *1) ||
      maxBidValue *1 <= ebayArticleInfo.articleBidPrice) {
      // no bid, or bid too low
      buttonInput.disabled = true;
      buttonInput.checked = false;
    } else {
      buttonInput.disabled = false;
    }
  }

  /*
   * Detect changes on the page (by user) via event listeners
   * - #MaxBidId: (Bid input)
   * - #prcIsum_bidPrice: Current price of the article
   * - #BomAutoBid: AutoBid
   */
  function monitorChanges() {
    let maxBidInput = document.getElementById('MaxBidId');
    let bomAutoBid = document.getElementById('BomAutoBid');
    // max bid
    if (maxBidInput != null) {
      maxBidInput.addEventListener('input', (e) => {
        let bomAutoBidNew = document.getElementById('BomAutoBid');
        let maxBidInputNew = document.getElementById('MaxBidId');
        if (maxBidInputNew != null) {
          //updateMaxBidInput(maxBidInputNew.value);
          // replace , with .
          let maxBidInputValue = maxBidInputNew.value.replace(/,/, '.');
          maxBidInputValue = Number.parseFloat(maxBidInputValue);
          ebayArticleInfo.articleMaxBid = maxBidInputValue;
          // update minimumbid
          let minBidValue = null;
          if (maxBidInputNew.getAttribute('aria-label') != null) {
            minBidValue = maxBidInputNew.getAttribute('aria-label')
              .replace(/\n/g, "")
              .replace(/\s+/g, " ");
            minBidValue = parsePriceString(minBidValue);
            ebayArticleInfo.articleMinimumBid = minBidValue;
          }
          activateAutoBidButton(maxBidInputValue, minBidValue);
          // inform popup
          browser.runtime.sendMessage({
            action: 'ebayArticleMaxBidUpdated',
            detail: {
              maxBid: maxBidInputValue,
              autoBid: bomAutoBidNew.checked,
              minBid: minBidValue
            }
          });
        }
      });
    }
    // BomAutoBid
    if (bomAutoBid != null) {
      bomAutoBid.addEventListener('change', (e) => {
        let bomAutoBidNew = document.getElementById('BomAutoBid');
        let maxBidInputNew = document.getElementById('MaxBidId');
        if (bomAutoBidNew != null) {
          // inform popup
          browser.runtime.sendMessage({
            action: 'ebayArticleMaxBidUpdated',
            detail: {
              maxBid: parseFloat(maxBidInputNew.value),
              autoBid: bomAutoBidNew.checked
            }
          });
        }
        // TEST ONLY
        /*if (bomAutoBidNew.checked) {
          doBid();
        }*/
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
            console.log("Mutation received %s: %d seconds left",
              Date.now().toLocaleString( 'de-DE'),
              (ebayArticleInfo.articleEndTime - Date.now())/1000);
            //console.debug("Biet-O-Matic: Attributes changed: type=%s old=%s, new=%s mut=%O",
            //  mutation.type, mutation.oldValue, mutation.target.textContent, mutation);
            let oldN = mutation.removedNodes;
            let newN = mutation.target;
            oldN=oldN[0];
            if (typeof oldN !== 'undefined' && oldN.textContent !== newN.textContent) {
              // price changed
              ebayArticleInfo.articleBidPrice = parsePriceString(newN.textContent);
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
                minBidValue = parsePriceString(minBidValue);
                ebayArticleInfo.articleMinimumBid = minBidValue;
              }
              activateAutoBidButton(maxBidInput.value, minBidValue);
              // send info to extension popup about new price
              browser.runtime.sendMessage({
                action: 'ebayArticleUpdated',
                detail: ebayArticleInfo
              });
            } else {
              // send trigger to extension popup, so it can refresh the date (timeleft)
              browser.runtime.sendMessage({
                action: 'ebayArticleRefresh',
              }).catch((e) => {
                console.warn("Biet-O-Matic: sendMessage(ebayArticleRefresh) failed: %O", e);
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

  function parsePriceString(price) {
    price = price
      .replace(/\n/g, "")
      .replace(/\s+/g, " ");
    let regex = /([A-Z]{2,3}(?:\s[$]?))([0-9,]+)(?:.|,)([0-9]{2})/;
    let result = [];
    if (price.match(regex)) {
      result = price.match(regex);
      let p1 = result[2].replace(/,/, '');
      let p2 = result[3];
      price = parseFloat(`${p1}.${p2}`).toFixed(2);
    }
    return Number.parseFloat(price.toString());
  }

  /*
   * set new MaxBidInput value and autoBid checked status
   */
  function updateMaxBidInfo(info) {
    let maxBidInput = document.getElementById('MaxBidId');
    let autoBidInput = document.getElementById('BomAutoBid');
    if (maxBidInput != null) {
      if (info.maxBid != null) {
        try {
          maxBidInput.value = info.maxBid.toLocaleString('de-DE');
        } catch (e) {
          console.log("updateMaxBidInfo failed to parse %O", maxBidInput.value);
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
      activateAutoBidButton(info.maxBid);
    }
  }

  /*
   * Perform a Bid for an Article
   * - perform bid only if autoBid is checked
   * Note: Time checking has to be performed externally!
   */
  async function doBid(test = true) {
    const maxBidInput = document.getElementById('MaxBidId');
    const autoBidInput = document.getElementById('BomAutoBid');
    if (autoBidInput == null || autoBidInput.checked === false) {
      console.log("Biet-O-Matic: doBid() aborted, autoBid is off, %O", autoBidInput);
      return;
    }

    console.log("Biet-O-Matic: Performing bid for article %s: Bid=%s", ebayArticleInfo.articleId, maxBidInput.value);
    // press bid button
    const bidButton =  document.getElementById('bidBtn_btn');
    if (bidButton == null) {
      console.warn("Biet-O-Matic: Article %s - Unable to get Bid Button!", ebayArticleInfo.articleId);
      return;
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

    // initiate bid
    bidButton.click();

    // wait for modal to open: vilens-modal-wrapper
    let modalBody = await waitFor('#MODAL_BODY')
      .catch((e) => {
        console.warn("Biet-O-Matic: Waiting for Bidding Modal timed out: %s", e.toString());
      });
    // modal close button
    const closeButton = document.querySelector('.vilens-modal-close');

    const statusMsg = document.getElementById('STATUS_MSG');
    //console.log("Status: obj=%O, msg=%s", statusMsg, statusMsg.textContent);
    // e.g. 'Bieten Sie mindestens EUR 47,50.'

    // some bidding issue, send status to popup (keep modal open, in case user wants to manually correct bid)
    if (statusMsg != null) {
      console.log("Biet-O-Matic: Bidding failed: Error reported by eBay: %s", statusMsg.textContent);
      return;
    }

    // get confirm button
    const confirmButton = document.getElementById('confirm_button');
    if (confirmButton == null) {
      console.log("Biet-O-Matic: Bidding failed: Confirm Button missing!");
      return;
    }

    // Note: After closing the modal, the page will reload and the content script reinitialize!

    if (test) {
      // close modal
      if (closeButton != null) {
        closeButton.click();
      }
      // send info to popup about (almost) successful bid
    } else {
      // confirm the bid
      console.log("Biet-O-Matic: Bid submitted for Article %s", ebayArticleInfo.articleId);
      // send info to popup
    }
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
   * MAIN
   */

  let body = document.getElementById("Body");
  if (body === null) {
    throw new Error("Biet-O-Mat: skipping on this page; no Body element, window=%O", window);
  }
  let itemType = body.getAttribute("itemtype");
  if ( itemType === null ) {
    throw new Error("Biet-O-Mat: skipping on this page; no itemtype in body element");
  }
  if ( itemType !== "https://schema.org/Product"  ) {
    throw new Error(`Biet-O-Mat: skipping on this page; invalid itemtype in body element (${itemType})`);
  }

  parsePage();
  console.debug("Biet-O-Mat: %O", ebayArticleInfo);
  extendPage();
  monitorChanges();

  // send info to extension popup directly after initialization
  browser.runtime.sendMessage({
    action: 'ebayArticleUpdated',
    detail: ebayArticleInfo
  });

  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // return ebayArticleInfo back to Popup script
    if (request.action === "GetArticleInfo") {
      return Promise.resolve({detail: ebayArticleInfo});
    }
    // receive updated MaxBid info from Popup - update the document
    if (request.action === "UpdateArticleMaxBid") {
      console.log("Biet-O-Matic: onMessage(UpdateArticleMaxBid) request=%O, sender=%O, sendResponse=%O", request, sender, sendResponse);
      updateMaxBidInfo(request.detail);
    }
  });

  // TODO remove
  browser.runtime.sendMessage({ action: 'isAutoBidEnabled' })
    .then((result) => {
      console.log("Result: %O", result);
    });

})();