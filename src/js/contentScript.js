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
import $ from "jquery";
import EbayParser from "./EbayParser.js";
import "../css/contentScript.css";

// auction states as communicated to the overview page
const auctionEndStates = {
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
      de: ["Sie wurden überboten", "Mindestpreis wurde noch nicht erreicht"],
      en: ["TODO123XXXX"]
    }
  },
  unknown: {
    id: null,
    human: browser.i18n.getMessage('generic_unknown'),
  }
};

class EbayArticle {
  constructor() {
    this.articleId = null;
    this.articleEndTime = null;
    this.perfInfo = [];
  }

  // return the information to be shared with the popup
  get() {
    const result = {};
    Object.keys(this).sort().forEach(key => {
      if (key === 'perfInfo' || key === 'ebayParser') return;
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
      this.ebayParser = new EbayParser(window.location.href);
      this.ebayParser.init(oldInfo);
      info = this.ebayParser.parsePage();
    } catch (e) {
      console.log("Biet-O-Matic: EbayParser failed: %s", e.message);
      return;
    }
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
        return Promise.resolve({detail: this.get()});
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
    if (this.articlePlatform === 'ebay.com')
      buttonDiv.style.width = '8.7rem';
    else
      buttonDiv.style.width = '280px';
    buttonDiv.style.height = '18px';
    buttonDiv.style.align = 'center';
    buttonDiv.style.marginTop = '10px';
    let buttonInput = document.createElement("input");
    buttonInput.id ="BomAutoBid";
    buttonInput.classList.add('tgl', 'tgl-skewed');
    buttonInput.type = 'checkbox';
    buttonInput.disabled = true;
    buttonDiv.appendChild(buttonInput);
    let buttonLabel = document.createElement("label");
    buttonLabel.classList.add('tgl-btn');
    let offText = EbayArticle.getTranslation('generic_autoBid', '.Auto-Bid') + ' ' +
      EbayArticle.getTranslation('generic_inactive', '.inactive');
    let onText = EbayArticle.getTranslation('generic_autoBid', '.Auto-Bid') + ' ' +
      EbayArticle.getTranslation('generic_active', '.active');
    buttonLabel.setAttribute('data-tg-off', offText);
    buttonLabel.setAttribute('data-tg-on', onText);
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
    //this.activateAutoBidButton();
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
        t.title = EbayArticle.getTranslation('popup_enterMinAmount', '.Enter at least $1', minBidValue.toString());
        buttonInput.checked =  false;
      } else {
        t.title = EbayArticle.getTranslation('popup_minIncreaseReached', '.Minimum reached');
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
   * determine the auction end state by checking text determined by parsePageRefresh() against regex
   */
  static getAuctionEndState(ebayArticleInfo) {
    // check if the given string matches the given endState
    function matches(endState, messageToCheck) {
      if (!auctionEndStates.hasOwnProperty(endState)) {
        console.warn("Biet-O-Matic: getAuctionEndState() Invalid endState: " + endState);
        return false;
      }
      const strings = auctionEndStates[endState].strings;
      for (let lang in strings) {
        const messages = strings[lang];
        for (let message in messages) {
          if (messageToCheck.includes(message)) {
            console.log("Biet-O-Matic: getAuctionEndState() Status determined from lang=%s, message=%s", lang, message);
            return true;
          }
        }
      }
    }
    if (ebayArticleInfo.hasOwnProperty('articleAuctionStateText')) {
      for (const key in auctionEndStates) {
        if (matches(key, ebayArticleInfo.articleAuctionStateText))
          return key;
      }
    }
    return auctionEndStates.unknown;
  }


  /*
   * Detect changes on the page (by user) via event listeners
   * - #MaxBidId: (Bid input)
   * - #prcIsum_bidPrice: Current price of the article
   * - #BomAutoBid: AutoBid
   */
  async monitorChanges() {
    const maxBidInput = await EbayArticle.waitFor('#MaxBidId', 2000);
    const bomAutoBid = await EbayArticle.waitFor('#BomAutoBid', 2000)
      .catch(e => {
        throw new Error("Biet-O-Matic: monitorChanges() cannot find BomAutoBid button, aborting");
      });
    // max bid input changed?
    if (maxBidInput == null) {
      return;
    } else {
      maxBidInput.addEventListener('change', (e) => {
        const maxBidInputNew = document.getElementById('MaxBidId');
        const bomAutoBidNew = document.getElementById('BomAutoBid');
        if (maxBidInputNew != null) {
          // replace , with .
          let maxBidInputValue = Number.parseFloat(maxBidInputNew.value.replace(/,/, '.'));
          if (Number.isNaN(maxBidInputValue))
            maxBidInputValue = 0;
          this.articleMaxBid = maxBidInputValue;
          // update minimum bid
          let minBidValue = null;
          if (maxBidInputNew.getAttribute('aria-label') != null) {
            minBidValue = maxBidInputNew.getAttribute('aria-label')
              .replace(/\n/g, "")
              .replace(/\s+/g, " ");
            minBidValue = EbayParser.parsePriceString(minBidValue).price;
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
          } else if (this.hasOwnProperty('articleMinimumBid') && maxBidInputValue > 0 &&
            maxBidInputValue < this.articleMinimumBid) {
            console.log("Biet-O-Matic: monitorChanges() updated maxBid %s to %s (minimum bid price)",
              maxBidInputValue, this.articleMinimumBid);
            maxBidInputValue = Number.parseFloat(this.articleMinimumBid.toString());
            maxBidInputNew.value = maxBidInputValue.toLocaleString('de-DE',
              {useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2});
            this.articleMaxBid = maxBidInputValue;
          } else {
            if (!Number.isNaN(maxBidInputValue)) {
              maxBidInputNew.value = maxBidInputValue.toLocaleString('de-DE',
                {useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
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
              let info = this.ebayParser.parsePageRefresh();
              Object.assign(this, info);
              this.activateAutoBidButton(info.articleMaxBid, info.articleMinimumBid);
              // send info to extension popup about new price
              browser.runtime.sendMessage({
                action: 'ebayArticleUpdated',
                detail: this
              }).catch((e) => {
                console.warn(`Biet-O-Matic: sendMessage(ebayArticleUpdated) failed: ${e.message}`);
              });
            } else {
              // send trigger to extension popup, so it can refresh the date (timeleft)
              browser.runtime.sendMessage({
                action: 'ebayArticleRefresh',
                articleId: this.articleId
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
      // check window/group autoBid status
      let autoBidInfo = await browser.runtime.sendMessage({action: 'getAutoBidState', articleId: this.articleId});
      if (autoBidInfo == null || typeof autoBidInfo === 'undefined') {
        throw {
          component: "Bietvorgang",
          level: "Interner Fehler",
          message: "Konnte autoBidEnabled Option nicht prüfen"
        };
      }
      // ensure window autoBid is enabled
      if (autoBidInfo.autoBidEnabled === false) {
        console.debug("Biet-O-Matic: doBid() abort, Window autoBid is off");
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: "Automatisches bieten für Fenster inaktiv"
        };
      }
      // ensure Group autoBid is enabled
      if (autoBidInfo.groupAutoBid === false) {
        console.debug("Biet-O-Matic: doBid() abort, Group %s autoBid is off", autoBidInfo.groupName);
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: `Automatisches bieten für Gruppe ${autoBidInfo.groupName} inaktiv`
        };
      }
      // ensure article autoBid is checked
      if (autoBidInfo.articleAutoBid === false) {
        console.debug("Biet-O-Matic: doBid() abort, Article autoBid is off");
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: "Automatisches bieten für diesen Artikel inaktiv"
        };
      }
      // enable test mode if specified by popup
      if (autoBidInfo.simulation) {
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
      console.info("Biet-O-Matic: Performing bid for article %s", this.articleId);
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
      const confirmButton = await EbayArticle.waitFor('#confirm_button', 2000)
        .catch((e) => {
          console.log("Biet-O-Matic: Bidding failed: Confirm Button missing!");
          throw {
            component: "Bietvorgang",
            level: "Fehler beim bieten",
            message: "Element #confirm_body konnte innerhalb von 2s nicht gefunden werden!"
          };
        });

      /*
       Phase 3: Confirm the bid
       We want to perform the confirmation of the bid as close as possible to the end
       We set a timeout which will perform the bid ~2 seconds before the auction ends
       */

      // contact popup to check if we should perform the bid earlier (multiple articles could end at the same time)
      let modifiedEndTime = this.articleEndTime;
      const ebayArticleGetAdjustedBidTimeResult = await browser.runtime.sendMessage({
        action: 'ebayArticleGetAdjustedBidTime',
        articleId: this.articleId,
      });
      // result format {"articleEndTime":1578180835000,"adjustmentReason":"Bietzeit um 6s angepasst, da Gefahr der Überschneidung mit Artikel 223821015319."}
      if (ebayArticleGetAdjustedBidTimeResult == null || !ebayArticleGetAdjustedBidTimeResult.hasOwnProperty('articleEndTime')) {
        console.log("Biet-O-Matic: Unable to get ebayArticleGetAdjustedBidTime result!");
      } else {
        if (ebayArticleGetAdjustedBidTimeResult.hasOwnProperty('adjustmentReason')) {
          modifiedEndTime = ebayArticleGetAdjustedBidTimeResult.articleEndTime;
          EbayArticle.sendArticleLog(this.articleId, {
            component: "Bietvorgang",
            level: "Info",
            message: ebayArticleGetAdjustedBidTimeResult.adjustmentReason,
          });
        }
      }

      this.storePerfInfo("Phase3: Warten auf Bietzeitpunkt");
      const wakeUpInMs = (modifiedEndTime - Date.now()) - 2500;
      await EbayArticle.wait(wakeUpInMs);

      // check again if autobid is enabled (except if we should bid for all articles anyway)
      autoBidInfo = await browser.runtime.sendMessage({action: 'getAutoBidState', articleId: this.articleId});
      if (autoBidInfo == null || typeof autoBidInfo === 'undefined' || !autoBidInfo.hasOwnProperty('autoBidEnabled')) {
        throw {
          component: "Bietvorgang",
          level: "Interner Fehler",
          message: "Konnte autoBidEnabled Option nicht erneut prüfen"
        };
      }
      if (autoBidInfo.hasOwnProperty('autoBidEnabled') && autoBidInfo.autoBidEnabled === false) {
        console.info("Biet-O-Matic: doBid() abort, Window autoBid is now off.");
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: "Automatisches bieten wurde kurz vor der Gebot Bestätigung deaktiviert."
        };
      }
      if (autoBidInfo.hasOwnProperty('grouAutoBid') && autoBidInfo.groupAutoBid === false) {
        console.info("Biet-O-Matic: doBid() abort, Group autoBid is now off.");
        throw {
          component: "Bietvorgang",
          level: "Abbruch",
          message: "Automatisches bieten für die Artikel Gruppe wurde kurz vor der Gebot Bestätigung deaktiviert."
        };
      }

      // Note: After closing the modal, the page will reload and the content script reinitialize!
      if (simulate) {
        // close modal
        if (closeButton != null) closeButton.click();
        console.info("Biet-O-Matic: Test bid performed for Article %s", this.articleId);
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
        console.info("Biet-O-Matic: Bid submitted for Article %s", this.articleId);
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
      //console.log("Biet-O-Matic: doBid() aborted: %s", err.message);
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
      component: "Bietvorgang",
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
   * Note: We also send the minimal article info parsed by handleReload
   *       So the popup has the latest state information without refreshing
   */
  static async sendAuctionEndState(ebayArticleInfo, simulate = false) {
    await browser.runtime.sendMessage({
      action: 'ebayArticleSetAuctionEndState',
      articleId: ebayArticleInfo.articleId,
      detail: ebayArticleInfo
    });
    return true;
  }

  /*
   * handle reload: for various reasons the page can reload or go even to a different page
   * - article ended and redirects to a recommended article -> redirect back
   * - reload when a modal was closed  -> resume bidding
   */
  static async handleReload() {
    const ebayParser = new EbayParser();
    const ebayArticleInfo = ebayParser.parsePageRefresh();
    if (!ebayArticleInfo.hasOwnProperty('articleId')) {
      console.debug("Biet-O-Matic: handleReload() Aborting, no articleId found: %s", JSON.stringify(ebayArticleInfo));
      return ebayArticleInfo;
    }
    // determine auction state - if any yet
    let currentState = EbayArticle.getAuctionEndState(ebayArticleInfo);

    // info related to previous bidding
    const bidInfo = JSON.parse(window.sessionStorage.getItem(`bidInfo:${ebayArticleInfo.articleId}`));
    // info from sync storage
    const articleStoredInfo = await browser.storage.sync.get(ebayArticleInfo.articleId);

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
    if (settings != null && typeof settings !== 'undefined' && settings.hasOwnProperty('simulation')) {
      simulate = settings.simulation;
      if (currentState.id !== auctionEndStates.unknown.id && simulate) {
        if (bidInfo != null && ebayArticleInfo.articleBidPrice > bidInfo.maxBid)
          currentState = auctionEndStates.overbid;
        else if (bidInfo != null && ebayArticleInfo.articleBidPrice <= bidInfo.maxBid)
          currentState = auctionEndStates.purchased;
      }
    }

    /*
     * Retrieve stored article info from popup
     * - if null returned, then the article is not of interest (no bid yet)
     * - if auctionEndState from stored result is incomplete (e.g. state.unknown), then send updated state
     * The popup can then use the result to decide e.g. to stop the automatic bidding
     */
    if (articleStoredInfo !== auctionEndStates.unknown.id && typeof articleStoredInfo !== 'undefined' && articleStoredInfo.hasOwnProperty(ebayArticleInfo.articleId)) {
      const data = articleStoredInfo[ebayArticleInfo.articleId];
      /*
       * Note: auctionEndState is set by sendAuctionEndState and only used here to inform the popup about
       * the auction end state
       */
      if (data.hasOwnProperty('auctionEndState') &&
        (currentState.id !== auctionEndStates.unknown.id && data.auctionEndState === auctionEndStates.unknown.id)) {
        // send updated end state
        ebayArticleInfo.auctionEndState = currentState.id;
        await EbayArticle.sendAuctionEndState(ebayArticleInfo, simulate)
          .catch(e => {
            console.warn(`Biet-O-Matic: handleReload() Sending Auction End State failed: ${e.message}`);
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
        ebayArticleInfo.auctionEndState = currentState.id;
        console.debug("Biet-O-Matic: Setting auctionEnded now. state=%s (%d)",
          ebayArticleInfo.articleAuctionStateText, currentState.id);
        await EbayArticle.sendAuctionEndState(ebayArticleInfo, simulate).catch(e => {
          console.warn(`Sending initial auction end state failed: ${e.message}`);
        });
        window.sessionStorage.removeItem(`bidInfo:${ebayArticleInfo.articleId}`);
        // set this, so the script will not trigger parsing further down
        ebayArticleInfo.auctionEnded = true;
      } else {
        // todo bidInfo should probably be deleted in some cases, to ensure that when a page was reloaded after
        //  the bidding procedure was triggered once, the bidding can still be done
      }
    } else {
      console.debug("Biet-O-Matic: handleReload(%s) No bidInfo in sessionStorage: %s",
        ebayArticleInfo.articleId, JSON.stringify(bidInfo));
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

  toString () {
    let str = '';
    String.prototype.trunc =
      function(n){
        return this.substr(0,n-1)+(this.length>n?'...':'');
      };
    for (let p in this) {
      if (this.hasOwnProperty(p)) {
        let v = null;
        if (this[p] != null)
          v  = (this[p] || '').toString().trunc(64);
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
          ebayArticle.monitorChanges().catch(e => {
            console.warn(`Biet-O-Matic: monitorChanges() failed: ${e.message}`);
          });
        } catch (e) {
          console.warn(`Biet-O-Matic: Internal Error while post-initializing: ${e.message}`);
        }
      })
      .catch(e => {
        console.error(`Biet-O-Matic: Article Init failed: ${e.message}`);
      });
  }).catch(e => {
    console.warn(`Biet-O-Matic: handleReload() failed: ${e.message}`);
  });
})();