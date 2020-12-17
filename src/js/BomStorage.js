/*
 * Storage.js - Biet-O-Matic BE Storage Wrapper
 * ===================================================
 *
 * By Sebastian Weitzel, sweitzel@users.noreply.github.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

import browser from "webextension-polyfill";

const quotaBytes = {
  "sync": 102_400,
  "local": 5_242_880
};

class BomStorage {

  constructor(useLocalStorage = false) {
    this.quotaBytes = quotaBytes.sync;
    this.storageArea = "sync";
    if (useLocalStorage) {
      this.quotaBytes = quotaBytes.local;
      this.storageArea = "local"
    }
    console.log(`Biet-O-Matic: Storage initialized with type: ${this.storageArea}, quota ${this.quotaBytes} bytes.`);
  }

  /*
   * show storage.local usage only when local mode is active
   * sync is always used
   */
  async updateDomMeters() {
    if (this.storageArea === "local") {
      this.updateDomMeter("local");
    } else {
      const localMeterDiv = document.getElementById("localMeterDiv");
      localMeterDiv.style.display = "none";
    }
    this.updateDomMeter("sync");
}

async updateDomMeter(area) {
  const meterDiv = document.getElementById(area + "MeterDiv");
  const meter = document.getElementById(area + "Meter");
  const bytesUsed = await this.getBytesInUse(area);
  const bytesUsedPct = ((bytesUsed / quotaBytes[area]) * 100).toFixed(2)
  meter.value = bytesUsedPct;
  meter.textContent = bytesUsedPct + "%";
  meterDiv.setAttribute("title", bytesUsedPct + "%");
  meterDiv.style.display = "block";
}

  // Note: getBytesInUse is not supported for Firefox storage.local
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/getBytesInUse
  async getBytesInUse(area = "") {
    if (area === "") area = this.storageArea
    let bytesInUse = 0;
    if (area === "local") {
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
      if ('getBytesInUse' in browser.storage.sync) {
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

  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/remove
  async remove(keys) {
    if (this.storageArea === "local")
      return await browser.storage.local.remove(keys);
    else
      return await browser.storage.sync.remove(keys);
  }

  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/clear
  async clear() {
    console.log("Biet-O-Matic: All data on browser.storage.%s area will be removed.", this.storageArea);
    if (this.storageArea === "local")
      return await browser.storage.local.clear();
    else
      return await browser.storage.sync.clear();
  }

  // export main storage to json file
  // https://stackoverflow.com/a/30800715
  async export() {
    const data = await this.get();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "text/json" }));
    const dt = new Date();
    a.download = `bom-be_export_${dt.toISOString()}.json`;
    document.body.appendChild(a); // required for firefox
    a.click();
    a.remove();
  }

  // import specific export file (overwrites all existing)
  async import() {
    const readFile = function(e) {
      const file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        var contents = e.target.result;
        fileInput.func(contents);
        document.body.removeChild(fileInput);
      }
      reader.readAsText(file)
    }
    const importData = function(data) {
      try {
        const json = JSON.parse(data);
        // count elements
        const count = Object.keys(json).length;
        // show confirmation dialog
        if (window.confirm(`Do you really want import ${count} elements?`)) { 
          this.set(json);
        }
      } catch(e) {
        console.log("Biet-O-Matic: Import failed: " + e.message);
      }
    }
    // load file dialog (bom-be*.json)
    const fileInput = document.createElement("input");
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.multiple = false;
    fileInput.style.display = 'none';
    fileInput.onchange = readFile;  
    fileInput.func = importData;
    document.body.appendChild(fileInput);
    fileInput.click();
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