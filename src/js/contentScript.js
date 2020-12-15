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
import EbayParser from "./EbayParser.js";
import BomStorage from "./BomStorage.js";
import "../css/contentScript.css";

class EbayArticle {
  constructor() {
    this.articleId = null;
    this.articleEndTime = null;
    this.perfInfo = [];
  }

  // return the information to be shared with the popup
  get() {
    const result = {};
    Object.keys(this)
      .sort()
      .forEach((key) => {
        if (key === "perfInfo") return;
        result[key] = this[key];
      });
    return result;
  }

  /*
   * Initialize the EbayArticle object
   * - check if the page is in expected format
   * - parse the page
   */
  async init(oldInfo) {
    // parse article information
    let info;
    try {
      let ebayParser = new EbayParser(window.location.href);
      await ebayParser.init(oldInfo);
      info = ebayParser.parsePage();
      ebayParser.cleanup();
    } catch (e) {
      throw new Error("EbayParser failed: " + e);
    }
    // check if the same article is already handled by another tab
    const result = await browser.runtime.sendMessage({
      action: "getArticleInfo",
      articleId: info.articleId,
    });
    // our tab id is available through the browser event, if our and their tabId is different, it means
    // the tab is open in another window
    if (typeof result !== "undefined" || result.hasOwnProperty("tabId")) {
      if (result.hasOwnProperty("data") && result.data.tabId != null && result.tabId !== result.data.tabId) {
        throw new Error(`Stopping execution on this page, already active in another tab (${result.data.tabId}).`);
      }
    }

    if (info.articleId == null) return Promise.reject("Parsing page information failed: articleId null");

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
        return Promise.resolve({ detail: this.get() });
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
    const bidButton = document.getElementById("bidBtn_btn");
    if (bidButton == null || typeof bidButton === "undefined") {
      // this is expected to happen: e.g. finished auctions
      console.log("Biet-O-Matic: Do not extend page, no bid button found.");
      return;
    }

    // add button below (de)/right (com) of bid button
    let buttonDiv = document.getElementById("BomAutoBidDiv");
    if (buttonDiv != null) buttonDiv.remove();

    buttonDiv = document.createElement("div");
    buttonDiv.id = "BomAutoBidDiv";

    buttonDiv.style.width = "100%";
    buttonDiv.style.align = "center";
    buttonDiv.style.marginTop = "10px";

    const div = document.createElement("div");
    div.style.height = "30px";
    let buttonInput = document.createElement("input");
    buttonInput.id = "BomAutoBid";
    buttonInput.classList.add("tgl", "tgl-skewed");
    buttonInput.type = "checkbox";
    buttonInput.disabled = true;
    div.appendChild(buttonInput);
    let buttonLabel = document.createElement("label");
    buttonLabel.classList.add("tgl-btn");
    let offText =
      EbayArticle.getTranslation("generic_autoBid", ".Auto-Bid") +
      " " +
      EbayArticle.getTranslation("generic_inactive", ".inactive");
    let onText =
      EbayArticle.getTranslation("generic_autoBid", ".Auto-Bid") +
      " " +
      EbayArticle.getTranslation("generic_active", ".active");
    buttonLabel.setAttribute("data-tg-off", offText);
    buttonLabel.setAttribute("data-tg-on", onText);
    buttonLabel.setAttribute("for", "BomAutoBid");
    div.appendChild(buttonLabel);

    const span = document.createElement("span");
    span.id = "BomAutoBidHint";
    span.innerText = EbayArticle.getTranslation(
      "cs_bomAutoBidHint",
      ".Please ensure group and global auto-bid are also enabled."
    );
    span.style.fontSize = "small";
    span.style.display = "none";

    buttonDiv.appendChild(div);
    buttonDiv.appendChild(span);

    //mainContent.appendChild(button);
    bidButton.parentNode.insertBefore(buttonDiv, bidButton.nextSibling);

    // complement with info from sync storage
    window.bomStorage
      .get(this.articleId)
      .then((result) => {
        if (Object.keys(result).length === 1) {
          let storInfo = result[this.articleId];
          console.debug("Biet-O-Matic: extendPage() Found info for Article %s in storage: %O", this.articleId, result);
          this.updateMaxBidInfo(storInfo);
        }
      })
      .catch((e) => {
        console.log("Biet-O-Matic: extendPage(), storage.get failed: " + e);
      });
    this.activateAutoBidButton();
  }

  /*
   * set new MaxBidInput value and autoBid checked status
   */
  updateMaxBidInfo(storageInfo) {
    // id=MaxBidId defined by eBay
    const maxBidInput = document.getElementById("MaxBidId");
    // id=BomAutoBid defined by us
    const autoBidInput = document.getElementById("BomAutoBid");

    if (maxBidInput != null) {
      if (storageInfo.articleMaxBid != null) {
        try {
          if (typeof storageInfo.articleMaxBid === "string")
            storageInfo.articleMaxBid = Number.parseFloat(storageInfo.articleMaxBid.toString());
          maxBidInput.value = storageInfo.articleMaxBid.toLocaleString("de-DE", {
            useGrouping: false,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        } catch (e) {
          console.warn(
            "Biet-O-Matic: updateMaxBidInfo() Failed to parse, info.articleMaxBid=%s (%s)",
            storageInfo.articleMaxBid,
            typeof storageInfo.articleMaxBid
          );
          maxBidInput.value = storageInfo.articleMaxBid.toString();
        }
      } else {
        storageInfo.articleMaxBid = this.articleMaxBid;
      }
      if (autoBidInput != null) {
        if (storageInfo.articleAutoBid != null) {
          autoBidInput.checked = storageInfo.articleAutoBid;
        }
      }
      // Note do not merge storage into this, because this would overwrite potentially updated local values
      //Object.assign(this, storageInfo);
      this.activateAutoBidButton(storageInfo.articleMaxBid, null);
    }
  }

  /*
   * Control the auto bid button:
   * - uncheck if the value is lower than the minimum or current price of the item
   */
  activateAutoBidButton(maxBidValue, minBidValue = null) {
    const bomAutoBid = document.getElementById("BomAutoBid");
    const bomAutoBidHint = document.getElementById("BomAutoBidHint");
    if (bomAutoBid == null) {
      console.warn("activateAutoBidButton() ButtonInput invalid - should not happen!?");
      return;
    }
    // if minBidValue not specified, use the items minimumBidValue
    if (minBidValue == null && this.hasOwnProperty("articleMinimumBid")) {
      minBidValue = this.articleMinimumBid;
    }
    // convert maxBidValue to float if needed
    if (typeof maxBidValue === "string") {
      maxBidValue = maxBidValue.replace(/,/, ".");
      maxBidValue = Number.parseFloat(maxBidValue);
    }
    console.debug(
      "Biet-O-Matic: activateAutoBidButton() maxBidValue=%s (%s), minBidValue=%s (%s)",
      maxBidValue,
      typeof maxBidValue,
      minBidValue,
      typeof minBidValue
    );

    // maxBid < minBid or maxBid < bidPrice , then disable autoBid
    if (maxBidValue < minBidValue || maxBidValue < this.articleBidPrice) {
      console.log("Biet-O-Matic: activateAutoBidButton() Disabled autoBid because bid lower than required price.");
      bomAutoBid.disabled = false;
    }
    bomAutoBid.disabled = false;

    // show autoBid hint if autoBid enabled
    if (bomAutoBid.checked) {
      bomAutoBidHint.style.display = "block";
    } else {
      bomAutoBidHint.style.display = "none";
    }
  }

  /*
   * Detect changes on the page (by user) via event listeners
   * - #MaxBidId: (Bid input)
   * - #prcIsum_bidPrice: Current price of the article
   * - #BomAutoBid: AutoBid
   */
  async monitorChanges() {
    const maxBidInput = await EbayArticle.waitFor("#MaxBidId", 2000).catch(() => {
      throw new Error("monitorChanges() cannot find MaxBidInput button, aborting");
    });
    const bomAutoBid = await EbayArticle.waitFor("#BomAutoBid", 2000).catch(() => {
      throw new Error("monitorChanges() cannot find BomAutoBid button, aborting");
    });
    // max bid input changed?
    if (maxBidInput == null) {
      return;
    } else {
      maxBidInput.addEventListener("change", () => {
        const maxBidInputNew = document.getElementById("MaxBidId");
        const bomAutoBidNew = document.getElementById("BomAutoBid");
        if (maxBidInputNew != null) {
          // replace , with .
          let maxBidInputValue = Number.parseFloat(maxBidInputNew.value.replace(/,/, "."));
          if (Number.isNaN(maxBidInputValue)) maxBidInputValue = 0;
          this.articleMaxBid = maxBidInputValue;
          // update minimum bid
          let minBidValue = null;
          if (maxBidInputNew.getAttribute("aria-label") != null) {
            minBidValue = maxBidInputNew.getAttribute("aria-label").replace(/\n/g, "").replace(/\s+/g, " ");
            minBidValue = EbayParser.parsePriceString(minBidValue).price;
            this.articleMinimumBid = minBidValue;
          }
          // check if bid > buy-now price (sofortkauf), then we update the maxBid with buyPrice
          if (this.hasOwnProperty("articleBuyPrice") && maxBidInputValue >= this.articleBuyPrice) {
            console.log(
              "Biet-O-Matic: monitorChanges() updated maxBid %s to %s (sofortkauf price)",
              maxBidInputValue,
              this.articleBuyPrice
            );
            // set to 1 cent less, to prevent unfriendly redirection by eBay
            maxBidInputValue = Number.parseFloat(this.articleBuyPrice.toString()) - 0.01;
            maxBidInputNew.value = maxBidInputValue.toLocaleString("de-DE", {
              useGrouping: false,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            this.articleMaxBid = maxBidInputValue;
          } else {
            if (!Number.isNaN(maxBidInputValue)) {
              maxBidInputNew.value = maxBidInputValue.toLocaleString("de-DE", {
                useGrouping: false,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
            }
          }
          this.activateAutoBidButton(maxBidInputValue, minBidValue);
          // inform popup about the local change
          browser.runtime
            .sendMessage({
              action: "ebayArticleMaxBidUpdated",
              articleId: this.articleId,
              detail: {
                articleMaxBid: maxBidInputValue,
                articleAutoBid: bomAutoBidNew.checked,
                articleMinimumBid: minBidValue,
              },
            })
            .then((result) => {
              if (!result) {
                console.warn("Biet-O-Matic: Cannot set maxBid value, BE has not added this item yet.");
              }
            })
            .catch((e) => {
              console.warn("Biet-O-Matic: sendMessage(ebayArticleMaxBidUpdated) failed: %O", e);
            });
        }
      });
    }
    // inform popup about autoBid changes
    if (bomAutoBid != null) {
      bomAutoBid.addEventListener("change", () => {
        const maxBidInputNew = document.getElementById("MaxBidId");
        const bomAutoBidNew = document.getElementById("BomAutoBid");
        const bomAutoBidHint = document.getElementById("BomAutoBidHint");
        if (bomAutoBidNew != null) {
          // replace , with .
          let maxBidInputValue = Number.parseFloat(maxBidInputNew.value.replace(/,/, "."));
          if (Number.isNaN(maxBidInputValue)) maxBidInputValue = 0;
          this.articleMaxBid = maxBidInputValue;
          if (bomAutoBidNew.checked) {
            // if maxBid is lower than required, adjust it to minimum
            const maxBidInputNew = document.getElementById("MaxBidId");
            if (this.hasOwnProperty("articleMinimumBid") && maxBidInputValue < this.articleMinimumBid) {
              console.log(
                "Biet-O-Matic: monitorChanges() updated maxBid %s to %s (minimum bid price)",
                maxBidInputValue,
                this.articleMinimumBid
              );
              maxBidInputValue = Number.parseFloat(this.articleMinimumBid.toString());
              maxBidInputNew.value = maxBidInputValue.toLocaleString("de-DE", {
                useGrouping: false,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              this.articleMaxBid = maxBidInputValue;
            }
            // show autoBid hint if autoBid enabled
            bomAutoBidHint.style.display = "inline";
          } else {
            bomAutoBidHint.style.display = "none";
          }
          browser.runtime
            .sendMessage({
              action: "ebayArticleMaxBidUpdated",
              articleId: this.articleId,
              detail: {
                articleMaxBid: maxBidInputValue,
                articleAutoBid: bomAutoBidNew.checked,
              },
            })
            .then((result) => {
              if (!result) {
                console.warn("Biet-O-Matic: Cannot enable autoBid, BE has not added this item yet.");
                bomAutoBidNew.checked = !bomAutoBidNew.checked;
              }
            })
            .catch((e) => {
              console.warn("Biet-O-Matic: sendMessage(ebayArticleMaxBidUpdated) failed: %O", e);
            });
        }
      });
    }

    /*
     * Ebay automatically updates certain elements.
     * The sooner the Article is ending, the faster the refresh occurs.
     * We use this to update the price information.
     */
    // article current price
    // Note: the itemprop=price content is not refreshed, only the text!
    const articleBidPrice = document.getElementById("prcIsum_bidPrice");
    if (articleBidPrice != null) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "childList") {
            const timeLeftInSeconds = (this.articleEndTime - Date.now()) / 1000;
            if (timeLeftInSeconds <= 30) {
              console.debug("Biet-O-Matic: Mutation received: %d seconds left", timeLeftInSeconds);
              // TODO: show/update countdown to autobid
            }
            let oldN = mutation.removedNodes;
            let newN = mutation.target;
            oldN = oldN[0];
            if (typeof oldN !== "undefined" && oldN.textContent !== newN.textContent) {
              let ebayParser = new EbayParser();
              let info = ebayParser.parsePageRefresh();
              Object.assign(this, info);
              info = null;
              ebayParser.cleanup();
              // if the price changed and is higher than the maxBid, then disable autoBid button
              this.activateAutoBidButton(this.articleMaxBid, this.articleMinimumBid);
              // send info to extension popup about new price
              browser.runtime
                .sendMessage({
                  action: "ebayArticleUpdated",
                  detail: this,
                })
                .catch((e) => {
                  console.warn("Biet-O-Matic: sendMessage(ebayArticleUpdated) failed: " + e);
                });
            } else {
              // send trigger to extension popup, so it can refresh the date (timeleft)
              browser.runtime
                .sendMessage({
                  action: "ebayArticleRefresh",
                  articleId: this.articleId,
                })
                .catch((e) => {
                  console.warn("Biet-O-Matic: sendMessage(ebayArticleRefresh) failed - reloading page!: " + e);
                  location.reload();
                });
            }
          }
        });
      });
      observer.observe(articleBidPrice, {
        childList: true,
      });
    }
  }

  // https://stackoverflow.com/questions/5525071/how-to-wait-until-an-element-exists
  static waitFor(selector, timeout = 3000) {
    return new Promise(function (resolve, reject) {
      waitForElementToDisplay(selector, 250, timeout);
      function waitForElementToDisplay(selector, interval, timeout) {
        if (timeout <= 0) {
          reject(`waitFor(${selector}), timeout expired!`);
        } else if (document.querySelector(selector) != null) {
          resolve(document.querySelector(selector));
        } else {
          setTimeout(function () {
            waitForElementToDisplay(selector, interval, timeout - interval);
          }, interval);
        }
      }
    });
  }

  /*
   * Inform popup about auction end state. It might not be the final state though.
   * This function will likely be called multiple times
   * Note: We also send the minimal article info parsed by handleReload
   *       So the popup has the latest state information without refreshing
   */
  static async sendAuctionEndState(ebayArticleInfo) {
    await browser.runtime.sendMessage({
      action: "ebayArticleSetAuctionEndState",
      articleId: ebayArticleInfo.articleId,
      detail: ebayArticleInfo,
    });
    return true;
  }

  /*
   * handle reload: for various reasons the page can reload or go even to a different page
   * - article ended and redirects to a recommended article -> redirect back
   * - reload when a modal was closed  -> resume bidding
   */
  static async handleReload() {
    // initialize BomStorage object to access item info properly
    const options = await browser.storage.sync.get({ enableLocalMode: null });
    let enableLocalMode = false;
    if (
      options.hasOwnProperty("enableLocalMode") &&
      options.enableLocalMode != null &&
      options.enableLocalMode !== ""
    ) {
      enableLocalMode = options.enableLocalMode;
    }
    window.bomStorage = new BomStorage(enableLocalMode);

    let ebayParser = new EbayParser();
    const ebayArticleInfo = ebayParser.parsePageRefresh();
    ebayParser.data = null;
    ebayParser = null;
    if (!ebayArticleInfo.hasOwnProperty("articleId")) {
      console.debug("Biet-O-Matic: handleReload() Aborting, no articleId found: %s", JSON.stringify(ebayArticleInfo));
      return ebayArticleInfo;
    }
    // determine auction state - if any yet
    const currentState = EbayParser.getAuctionEndState(ebayArticleInfo);
    // info from sync storage
    const articleStoredInfo = await window.bomStorage.get(ebayArticleInfo.articleId);

    /*
     * Retrieve stored article info from popup
     * - if null returned, then the article is not of interest (no bid yet)
     * - if auctionEndState from stored result is incomplete (e.g. state.unknown), then send updated state
     * The popup can then use the result to decide e.g. to stop the automatic bidding
     */

    if (
      articleStoredInfo != null &&
      typeof articleStoredInfo !== "undefined" &&
      articleStoredInfo.hasOwnProperty(ebayArticleInfo.articleId)
    ) {
      const data = articleStoredInfo[ebayArticleInfo.articleId];
      /*
       * Note: auctionEndState is set by sendAuctionEndState and only used here to inform the popup about
       * the auction end state
       */
      if (
        data.hasOwnProperty("auctionEndState") &&
        currentState.id !== EbayParser.auctionEndStates.unknown.id &&
        data.auctionEndState === EbayParser.auctionEndStates.unknown.id
      ) {
        // send updated end state
        ebayArticleInfo.auctionEndState = currentState.id;
        await EbayArticle.sendAuctionEndState(ebayArticleInfo).catch((e) => {
          console.warn("Biet-O-Matic: handleReload() Sending Auction End State failed: " + e);
        });
      }
    }

    return ebayArticleInfo;
  }

  //region i18n
  static getTranslation(i18nKey, defaultText = "", params = null) {
    let translatedText = browser.i18n.getMessage(i18nKey, params);
    // use provided default text, if specified
    if (translatedText === "") {
      if (defaultText !== "") {
        return defaultText;
      } else {
        return i18nKey;
      }
    } else {
      return translatedText;
    }
  }
  //endregion

  toString() {
    let str = "";
    String.prototype.trunc = function (n) {
      return this.substr(0, n - 1) + (this.length > n ? "..." : "");
    };
    for (let p in this) {
      if (this.hasOwnProperty(p)) {
        let v = null;
        if (this[p] != null) v = (this[p] || "").toString().trunc(64);
        str += `${p}=${v} (${typeof this[p]})\n`;
      }
    }
    return str;
  }
}

/*
 * MAIN
 */

(function () {
  "use strict";
  console.debug("Biet-O-Matic: Content Script starting.");
  /*
   * check if the contentScript was already loaded
   * - reload can happen also due to basic ebay functionality, e.g. Image fullscreen view
   */
  if (document.getElementById("BomAutoBid") != null) {
    console.debug("Biet-O-Matic: RELOADED EXTENSION, window=%O", window);
    // return value will be passed back to executeScript
    return false;
  }

  EbayArticle.handleReload()
    .then((reloadInfo) => {
      const ebayArticle = new EbayArticle();
      ebayArticle
        .init(reloadInfo)
        .then(() => {
          try {
            console.debug("Biet-O-Matic: Initialized - Article Info: %s", ebayArticle.toString());
            ebayArticle.extendPage();
            ebayArticle.monitorChanges().catch((e) => {
              console.warn("Biet-O-Matic: monitorChanges() failed: " + e);
            });
          } catch (e) {
            console.warn("Biet-O-Matic: Internal Error while post-initializing: " + e);
          }
        })
        .catch((e) => {
          console.error("Biet-O-Matic: Article Init failed: " + e);
        });
    })
    .catch((e) => {
      console.warn("Biet-O-Matic: handleReload() failed: " + e);
    });
})();
