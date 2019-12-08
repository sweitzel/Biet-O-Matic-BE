/*
 * background.js - Mainly for setup of event listeners
 * ===================================================
 *
 * By Sebastian Weitzel, sebastian.weitzel@gmail.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

let BomTab = (function () {
  'use strict';
  let debug = true;
  // LISTENERS

  //add listeners for message requests from other extension pages (biet-o-matic.html)
  browser.runtime.onMessage.addListener((request, sender) => {
    if (debug) {
      console.debug('runtime.onMessage listener fired: request=%O, sender=%O', request, sender);
    }
  });
}()); // end BomTab

async function openBomTab(param) {
  // query tab for specified or current window with extension URL
  let tabs = await browser.tabs.query({
    windowId: (param && 'windowId' in param) ? param.windowId : browser.windows.WINDOW_ID_CURRENT,
    url: browser.extension.getURL('biet-o-matic.html')
  });
  for (let i = 0; i < tabs.length; i++) {
    if (i > 0) {
      await browser.tabs.remove(tabs[i].id);
      console.debug("Closed additional BOM instance (tab=%d)", tabs[i].id);
      continue;
    }
    // if open, ensure it is pinned (user might have accidentally un-pinned it)
    let params = { };
    params.pinned = true;
    params.highlighted = true;
    params.active = true;
    // autoDiscardable not supported by all browsers, so we check it exists
    if ('autoDiscardable' in tabs[i]) {
      params.autoDiscardable = false;
    }
    await browser.tabs.update(tabs[i].id, params)
      .then(console.debug("openBomTab(): tab with id %d updated (pinned...)", tabs[i].id))
      .catch(err => console.warn('openBomTab() failed to update tab err=%O', err));
  }
  // if no BOM tab is open, create one
  if (tabs.length === 0) {
    await browser.tabs.create({
      url: browser.extension.getURL('biet-o-matic.html'),
      windowId: (param && 'windowId' in param) ? param.windowId : browser.windows.WINDOW_ID_CURRENT,
      pinned: true,
      index: 0
    });
  }
}

/*
* Activate or Open BomTab when extension action is clicked
*   this calls the openBomTab with tabs.tab as parameter
*/
browser.browserAction.onClicked.addListener(openBomTab);