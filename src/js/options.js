// mozilla webextension polyfill for chrome
import browser from "webextension-polyfill";

// Saves options to chrome.storage
function save_options() {
  'use strict';
  let disableSleepPrevention = document.getElementById('disableSleepPrevention').checked;
  let disableArticleRefresh = document.getElementById('disableArticleRefresh').checked;
  let disableClockCheck = document.getElementById('disableClockCheck').checked;
  let enableCompactSaving = document.getElementById('enableCompactSaving').checked;
  let ebayPlatform = document.getElementById('ebayPlatform').value;
  browser.storage.sync.set({
    disableSleepPrevention: disableSleepPrevention,
    disableArticleRefresh: disableArticleRefresh,
    disableClockCheck: disableClockCheck,
    enableCompactSaving: enableCompactSaving,
    ebayPlatform: ebayPlatform
  })
    .then(() => {
      // Update status to let user know options were saved.
      let status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(function () {
        status.textContent = '';
      }, 1000);
    })
    .catch(e => {
      console.log("Unable to save: " + e);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  'use strict';
  browser.storage.sync.get({
    disableSleepPrevention: false,
    disableArticleRefresh: false,
    disableClockCheck: false,
    enableCompactSaving: false,
    ebayPlatform: null
  }).then((items) => {
    document.getElementById('disableSleepPrevention').checked = items.disableSleepPrevention;
    document.getElementById('disableArticleRefresh').checked = items.disableArticleRefresh;
    document.getElementById('disableClockCheck').checked = items.disableClockCheck;
    document.getElementById('enableCompactSaving').checked = items.enableCompactSaving;
    document.getElementById('ebayPlatform').value = items.ebayPlatform;
  }).catch(e => {
    console.log("Unable to load options: " + e);
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);