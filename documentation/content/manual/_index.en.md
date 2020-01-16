---
title: "Manual"
bookToc: true
weight: 1
type: "docs"
---

# Manual

## Requirements

### Supported eBay platforms
Only www.ebay.de and www.ebay.com are supported.

### Accurate System Clock
BE uses the system clock to execute tasks at certain times. It is especially important that the maximum bid is received
on eBay before the auction ends - and on the other hand not too early - so that other bidders don't get into a bidding war.

Therefore please make sure that your PC automatically synchronizes the time with the internet time. Since Windows 7 this
function is built in and active by default. However, it can happen that the preconfigured update interval is not sufficient
(for example, if the hardware timer is inaccurate) and an adjustment is necessary.

By the way, BE has no technical possibility to correct the time on its own - the browser does not have the necessary
authorizations for this.

## Extension Management
### Installation
The BE is installed using the browser extension store. There is nothing special to note here.

### Update
BE is updated automatically by the browser at regular times.
It is not necessary to restart the browser to activate the update.

> If the global auto-bid was active in a window before the update, BE will start again automatically after the update
> so that bidding can continue automatically.

### De-installation
De-installing the BE is done via the browser. When you delete the BE, the stored data is also deleted.

## Operation
See section [Features]({{< ref "/manual/features" >}})

## Stored data

### Item Information

* Information about an item are saved in the `browser.sync.storage` when the user enters a maximum bid or group for it.
* The information is also available on other (own) computers if the user has activated session synchronization.

### Event Logs

* Event logs are saved in `window.localStorage` as soon as relevant events occur.
* Item bidding event logs contain information about the item and help the user, but also the support to check for problems.
* Item information events are created when information about an item has changed.
* Setting-change events are created when a setting (e.g. automatic mode) has changed.

{{< hint info >}}
All event logs are only stored locally and are not synchronized with other Computers
{{< /hint >}}

## Data export
A data export for backup or archiving is currently not yet implemented.
However, it is possible to do this using the "Storage Area Explorer" extension.

> To help support analyze problems, it can be helpful to export this data for analysis manually in the support request.

{{< image src="be_export.de.png" alt="Data export" >}}