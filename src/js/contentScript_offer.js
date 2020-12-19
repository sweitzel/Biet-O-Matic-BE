/*
 * contentScript_offer.js - Ebay Offer Page Handler
 * ===================================================
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

import browser from "webextension-polyfill";

class EbayOffer {
  constructor() {
    this.articleId = null;
    this.articleMaxBid = null;
    this.articleEndTime = null;
    this.bidTime = 5;
    this.perfInfo = [];
  }

  // return the information to be shared with the popup
  get() {
    const result = {};
    Object.keys(this).sort().forEach(key => {
      if (key === 'perfInfo') return;
      result[key] = this[key];
    });
    return result;
  }

  /*
   * Initialize the offer class
   */
  async init() {
    let info = {};

    // determine info from URL
    let url = new URL(window.location.href);
    info.articleId = url.searchParams.get("item");
    info.articleMaxBid = url.searchParams.get("maxbid");
    info.articleEndTime = null;
    // modified bid time (bid collision prevention)
    info.modifiedEndTime = null; 
    info.bidTime = 5;

    if (info.articleId == null) {
      // check if this is a offer status page, which appears after submitting an offer
      // this is detected by checking for div with id="st"
      const status = await EbayOffer.waitFor('div.st', 500);
      // item is not present in URL anymore, need to parse the HTML
      //   <input type="hidden" value="333716243884" name="item">
      const item = await EbayOffer.waitFor('input[name="item"]', 500);
      // send status to extension popup
      info.articleId = item.value;
      info.articleAuctionState = status.outerHTML;
      browser.runtime.sendMessage({
        action: 'ebayArticleUpdated',
        detail: {
          articleId: info.articleId,
          articleAuctionState: status.outerHTML
        }
      }).catch((e) => {
        console.warn("Biet-O-Matic: sendMessage(ebayArticleUpdated) failed: " + e);
      });
      throw new Error("Parsing page information failed: articleId null");
    }

    // Request article info from popup
    const result = await browser.runtime.sendMessage({
      action: 'getArticleInfo',
      articleId: info.articleId
    });
    if (typeof result == 'undefined') {
      throw new Error(`Init offer page failed: Popup did not have any info for article ${info.articleId}`);
    }
    info.articleEndTime = result.data.articleEndTime;

    if (Date.now() > info.articleEndTime) {
      throw new Error("Stopping execution on this page, article end time is in the past.");
    }

    // our tab id is available through the browser event, if our and their tabId is different, it means the tab is open in another window/tab
    // check if the same article is already handled by another tab
    if (result.hasOwnProperty('data') && result.data.offerTabId != null && result.tabId !== result.data.offerTabId) {
      throw new Error(`Stopping execution on this page, already active in another tab (${result.data.offerTabId}).`);
    }

    // determine bidTime from settings
    let options = await browser.storage.sync.get({bidTime: 0});
    if (options.hasOwnProperty('bidTime'))
      info.bidTime = options.bidTime;

    // contact popup to check if we should perform the bid earlier (multiple articles could end at the same time)
    info.modifiedEndTime = info.articleEndTime;
    const ebayArticleGetAdjustedBidTimeResult = await browser.runtime.sendMessage({
      action: 'ebayArticleGetAdjustedBidTime',
      articleId: info.articleId,
    });
    // result format {"articleEndTime":1578180835000,"adjustmentReason":"Bietzeit um 6s angepasst, da Gefahr der Überschneidung mit Artikel 123421015319."}
    if (ebayArticleGetAdjustedBidTimeResult == null || !ebayArticleGetAdjustedBidTimeResult.hasOwnProperty('articleEndTime')) {
      throw new Error("Unable to get ebayArticleGetAdjustedBidTime result - item probably unknown to popup!");
    } else {
      if (ebayArticleGetAdjustedBidTimeResult.hasOwnProperty('adjustmentReason') && ebayArticleGetAdjustedBidTimeResult.adjustmentReason != null) {
        info.modifiedEndTime = ebayArticleGetAdjustedBidTimeResult.articleEndTime;
        EbayOffer.sendArticleLog(info.articleId, {
          component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
          level: "Info",
          message: ebayArticleGetAdjustedBidTimeResult.adjustmentReason,
        });
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
      if (request.action === "GetOfferTabInfo") {
        console.log("Biet-O-Matic: Event.GetArticleInfo received");
        return Promise.resolve({articleId: this.articleId});
      } else {
        return Promise.reject("Biet-O-Matic: Unsupported action.");
      }
    });
  }

  /*
   * Every 5 seconds:
   * - update countdown until bid
   */
  regularAction() {
    const timerInterval = 5_000;
    let keepRunning = true;
    try {
      const confirmButton = document.getElementsByName('confirmbid');
      if (confirmButton == null || typeof confirmButton === 'undefined' || confirmButton.length === 0) {
        console.debug("Biet-O-Matic: Abort regularAction(), no confirm button found.");
        return;
      }
      // update countdown
      const timeLeftInSeconds = Math.round((this.modifiedEndTime - Date.now()) / 1000);
      const bidTimeSeconds = timeLeftInSeconds - this.bidTime;
      if (bidTimeSeconds > 0) {
        confirmButton[0].value = EbayOffer.getTranslation('cs_bidInSeconds', '.Automatic bidding in $1s', [bidTimeSeconds]);
        document.title = EbayOffer.getTranslation('cs_bidInSecondsShort', '.Bidding in $1s', [bidTimeSeconds]);
      } else {
        keepRunning = false;
        confirmButton[0].value = EbayOffer.getTranslation('cs_bidding', '.Bidding');
        document.title = EbayOffer.getTranslation('cs_bidding', '.Bidding');
      }
    } catch (e) {
      console.warn("Biet-O-Matic: regularAction() Internal Error: " + e);
    } finally {
      if (keepRunning) {
        window.setTimeout(() => {
          this.regularAction();
        }, timerInterval);  
      } else {
        console.log("Biet-O-Matic: Abort regularAction(), auction bid time reached.");
      }
    }
  }

  // schedule the confirmation at proper time
  scheduleConfirmAction() {
    this.storePerfInfo(EbayOffer.getTranslation('cs_phase2', '.Waiting for bid'));
    const timeToBid = this.modifiedEndTime - Date.now() - (this.bidTime * 1000)
    window.setTimeout((expectedExecutionTime) => {
      this.confirmBid(expectedExecutionTime)
        .catch(e => {
          console.warn("Biet-O-Matic: confirmBid() aborted: " + e.message);
          EbayOffer.sendArticleLog(this.articleId, e);
        });
    }, timeToBid, Date.now() + timeToBid);
  }

  // confirm the bid after performing pre-checks
  // - this function will be called at the bidTime
  // - we have to check if the autoBid is still active (single purchase group)
  async confirmBid(expectedExecutionTime) {
    this.storePerfInfo(EbayOffer.getTranslation('cs_phase3', '.Preparing'));

    // check timer precision. Main concern are late timers (more than 1s).
    try {
      const deviation = Date.now() - expectedExecutionTime;
      if (deviation > 1100) {
        console.info("Biet-O-Matic: confirmBid() setTimeout deviation = %s ms late", deviation);
        EbayOffer.sendArticleLog(this.articleId, {
          component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
          level: "Warn",
          message: EbayOffer.getTranslation("cs_biddingLate", ".The confirm timer has been late $1 ms.", [deviation])
        });
      }
    } catch (e) {
      console.warn("Biet-O-Matic: confirmBid() internal error: " + e);
    }

    // check window/group autoBid status
    let autoBidInfo = await browser.runtime.sendMessage({action: 'getAutoBidState', articleId: this.articleId});
    if (autoBidInfo == null || typeof autoBidInfo === 'undefined' || !autoBidInfo.hasOwnProperty('autoBidEnabled') ) {
      throw {
        component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
        level: EbayOffer.getTranslation('generic_internalError', '.Internal Error'),
        message: EbayOffer.getTranslation('cs_couldNotCheckAutoBidEnabledOption',
          '.Could not check autoBidEnabled Option.')
      };
    }
    // ensure Window autoBid is enabled
    if (autoBidInfo.autoBidEnabled === false) {
      console.debug("Biet-O-Matic: doBid() abort, Window autoBid is off");
      throw {
        component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
        level: EbayOffer.getTranslation('generic_cancel', '.Cancel'),
        message: EbayOffer.getTranslation('cs_autobidInactiveForWindow',
          '.Auto-bid is inactive for this window')
      };
    }
    // ensure Group autoBid is enabled
    if (autoBidInfo.groupAutoBid === false) {
      console.debug("Biet-O-Matic: doBid() abort, Group %s autoBid is off", autoBidInfo.groupName);
      throw {
        component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
        level: EbayOffer.getTranslation('generic_cancel', '.Cancel'),
        message: EbayOffer.getTranslation('cs_autobidInactiveForGroup',
          '.Auto-bid is inactive for group $1', autoBidInfo.groupName)
      };
    }
    // ensure Article autoBid is checked
    if (autoBidInfo.articleAutoBid === false) {
      console.debug("Biet-O-Matic: doBid() abort, Article autoBid is off");
      throw {
        component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
        level: EbayOffer.getTranslation('generic_cancel', '.Cancel'),
        message: EbayOffer.getTranslation('cs_autobidInactiveForArticle',
          '.Auto-bid is inactive for this article.')
      };
    }
    let simulate = false;
    if (autoBidInfo.simulation) {
      console.debug("Biet-O-Matic: Enable simulated bidding.");
      simulate = true;
    }

    // check bid-lock. When another article auction is still running for the same group, we cannot peform bid
    let bidLockInfo = await browser.runtime.sendMessage({action: 'getBidLockState', articleId: this.articleId});
    if (bidLockInfo == null || typeof bidLockInfo === 'undefined' || !bidLockInfo.hasOwnProperty('bidIsLocked')) {
      throw {
        component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
        level: EbayOffer.getTranslation('generic_internalError', '.Internal Error'),
        message: EbayOffer.getTranslation('cs_couldNotCheckBidLock',
          '.Could not check if bidding is locked')
      };
    }
    if (bidLockInfo.bidIsLocked) {
      console.debug("Biet-O-Matic: doBid() abort, bidding is locked");
      // update title & button
      document.title = EbayOffer.getTranslation('cs_biddingAbort', '.Bidding aborted'); 
      EbayOffer.waitFor('input[name="confirmbid"]', 1000)
        .then(confirmButton => {
          confirmButton.value = EbayOffer.getTranslation('cs_biddingAbort', '.Bidding aborted');
        });
      throw {
        component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
        level: EbayOffer.getTranslation('generic_cancel', '.Cancel'),
        message: bidLockInfo.message
      };
    }

    // get confirm button   
    const confirmButton = document.getElementsByName('confirmbid');
    if (confirmButton == null || typeof confirmButton === 'undefined' || confirmButton.length === 0) {
      console.log("Biet-O-Matic: Bidding failed: Confirm Button missing!");
      throw {
        component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
        level: EbayOffer.getTranslation('cs_problemWithBidding', '.Problem submitting the bid'),
        message: EbayOffer.getTranslation('cs_errorCannotFindBidButton',
          '.Bid button could not be found!')
      };
    }

    if (simulate) {
      EbayOffer.sendArticleLog(this.articleId, {
        component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
        level: "Info",
        message: "Bid not sent (test mode active)",
      });
    } else {
      confirmButton[0].click();
    }
    this.storePerfInfo(EbayOffer.getTranslation('cs_phase4', '.Bid submitted'));

    // Note: The page will now redirect to offer.ebay.xx again, so this content script should reload.

    // finally also send performance info to popup
    this.sendBidPerfInfo();
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
    message.component = EbayOffer.getTranslation('generic_unknown', '.Unknown');
    message.level = EbayOffer.getTranslation('generic_internalError', '.Internal Error');
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
    }).catch(e => {
      console.warn("Biet-O-Matic: sendArticleLog(%s), Cannot sendMessage: %s", articleId, e.message);
    });
  }

  /*
   * store timing data in array - can be sent to popup
  */
  storePerfInfo(message) {
    console.debug("Biet-O-Matic: storePerfInfo() Message=%s", message);
    this.perfInfo.push({
      date: Date.now(),
      perf: performance.now(),  // https://developer.mozilla.org/de/docs/Web/API/Performance/now
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
    result += `timeLeft = ${timeLeft}ms (${this.articleEndTime} - ${this.perfInfo[this.perfInfo.length - 1].date})`;
    EbayOffer.sendArticleLog(this.articleId, {
      component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
      level: EbayOffer.getTranslation('generic_performance', '.Performance'),
      message: result
    });
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
  console.debug("Biet-O-Matic: Content Script starting.");
  const ebayOffer = new EbayOffer();
  ebayOffer.init()
    .then(() => {
      try {
        ebayOffer.storePerfInfo(EbayOffer.getTranslation('cs_phase1', 'Offer tab initialized'));
        ebayOffer.regularAction();
        ebayOffer.scheduleConfirmAction();
      } catch (e) {
        console.warn("Biet-O-Matic: Internal Error while post-initializing: " + e);
      }
    })
    .catch((e) => {
      console.error("Biet-O-Matic: EbayOffer Init failed: %O (%s)", e, typeof e);
      const url = new URL(window.location.href);
      const articleId = url.searchParams.get("item");
      if (articleId != null) {
        EbayOffer.sendArticleLog(articleId, {
          component: EbayOffer.getTranslation('cs_bidding', '.Bidding'),
          level: EbayOffer.getTranslation('generic_internalError', '.Internal Error'),
          message: e.message,
        });  
      }
    });
})();