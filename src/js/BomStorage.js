/*
 * Storage.js - Biet-O-Matic BE Storage Wrapper
 * ===================================================
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

import browser from "webextension-polyfill";

class BomStorage {
  constructor(useLocalStorage = false) {
    // sync storage: 100kb minus some buffer 
    this.quotaBytes = 100 * 1024 - 1024;
    this.storageArea = "sync";
    if (useLocalStorage) {
      // local storage: 5MB minus some buffer
      this.quotaBytes = 5 * 1024 * 1024 - 1024;
      this.storageArea = "local"
    }
    console.log(`Biet-O-Matic: Storage initialized with type: ${this.storageArea}, quota ${this.quotaBytes} bytes.`);
  }

  // Note: getBytesInUse is not supported for Firefox storage.local
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/getBytesInUse
  async getBytesInUse() {
    let bytesInUse = 0;
    if (this.storageArea === "local") {
      if ('getBytesInUse' in browser.storage.local) {
        bytesInUse = browser.storage.local.getBytesInUse();
      } else {
        const localData = await browser.storage.local.get();
        bytesInUse = new TextEncoder().encode(
          Object.entries(localData)
            .map(([key, value]) => key + JSON.stringify(value))
            .join('')
        ).length;  
      }
    } else {
      if ('getBytesInUse' in browser.storage.local) {
        bytesInUse = await browser.storage.sync.getBytesInUse();
      } else {
        const syncData = await browser.storage.sync.get();
        bytesInUse = new TextEncoder().encode(
          Object.entries(syncData)
            .map(([key, value]) => key + JSON.stringify(value))
            .join('')
        ).length;  
      }
    }
    return bytesInUse;
  }

  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/get
  async get(keys) {
    if (this.storageArea === "local")
      return await browser.storage.local.get(keys);
    else
      return await browser.storage.sync.get(keys);
  }

  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/set
  async set(keys) {
    if (this.storageArea === "local")
      return await browser.storage.local.set(keys);
    else
      return await browser.storage.sync.set(keys);
  }

  async remove(keys) {
    if (this.storageArea === "local")
      return await browser.storage.local.remove(keys);
    else
      return await browser.storage.sync.remove(keys);
  }

  async removeConfig(keys) {
    return await browser.storage.sync.remove(keys);
  }

  async getConfig(keys) {
    return await browser.storage.sync.get(keys);
  }

  async setConfig(keys) {
    return await browser.storage.sync.set(keys);
  }
};

export default BomStorage;