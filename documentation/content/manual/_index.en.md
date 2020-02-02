---
title: "Manual"
bookToc: true
weight: 1
type: "docs"
---

# Manual

## Quick-Start

After Biet-O-Matic BE (hereafter referred to as "BE") is added to the Browser it is immediately ready for
use without additional configuration. The only requirement is that you are already logged in to the eBay site
as the active authentication in the browser is a proxy for BE to place bids.

Basic Usage:

* Open the BE overview page by clicking on the BE icon (auction hammer on yellow background see image below)
    * The icon is usually visible in the browser menu bar, where the address entry is also located.
* The BE overview page opens as a "pinned" tab to the far left of all open tabs in the window where you activated the extension.
    * The pinned icon contains a white 'B' on a red background when the automatic bidding mode is INNACTIVE for the current window,
    * or a white 'B' on a green background if the automatic bidding mode is ACTIVE for the window.
    * Note: The overview page must remain open for automatic bidding to work. Closing this tab will result in no bids for any groups.

{{< image src="/extension_status.en.png" alt="Plug-in Icon" >}}  {{< image src="/overview_page.en.png" alt="Overview Page/Tab" >}}
	
* Open an eBay item in a new browser tab
    * You can enter a maximum bid directly on the item page.
      This will also "save" the item in the overview page - and it will remain there even if the item tab is closed.
	* NOTE that the "Place bid" display on the item page will reflect the state of the "bid active" status of that item via an overlay from BE  
{{< image src="/bid_overlay.en.png" alt="Overview Page/Tab" >}}	  
    * Or you enter the bid for the item directly on the BE overview page:
        * Group: By default, all items appear in the default group titled "Other Auctions". Simply enter a new group name next to an item and it will move to a new group with the name you specify.
        * Your Maximum Bid: Defines the maximum bid that BE will submit for the item just before the auction ends.
        * Item "Active" Mode: Activates the auto-bid mode for the item. If it is inactive, BE will not automatically bid on this item!
	* NOTE that if you do not enter a maximum bid value on the BE overview page OR on the item page itself, or move an item to a custom bid group closing the item tab will remove it from the BE overview.
* For an item to be auctioned, a maximum bid must be entered and the item must be have auto-bid enabled.

In addition, the group auto-bid mode and the auto-bid mode for the window have to be active:

{{< image src="/features_be_groups.en.png" alt="Overview Page Features" >}}

### Group Auto-Bid Mode
The user can define per article group whether articles from this group are to be auctioned automatically.
The group auto-bid is inactive by default and must be activated for each desired group by clicking on the Group Auto-Bid toggle button.

### Window Auto-Bid Mode
The window auto-bid mode determines whether BE should bid for items automatically at all.
This is a kind of "emergency stop" switch, by which you can make sure, that no unintentional bidding on auctions
is done by BE.

> Only one window at a time can activate the Window auto-bid mode.
> BE automatically deactivates the Window auto-bid mode in other windows if the user activates it in the current window.

This also ensures the support of several computers. You can therefore use BE on different computers (e.g. to correct maximum bids),
but only one of the computers will automatically place bids.

For more information please have a look at the function documentation (see menu on the left).

## Requirements

### Supported eBay platforms
{{< hint info >}}
Only www.ebay.de and www.ebay.com are supported by Bid-O-Matic BE.
{{< /hint >}}

Even though only ebay.com and ebay.de are supported by BE, you can still use this extension.
It is possible to perform national and international shopping via ebay.com.

### Accurate System Clock
BE uses the system clock to execute tasks at certain times. It is especially important that the maximum bid is received
on eBay before the auction ends - and on the other hand not too early - so that other bidders don't get into a bidding war.

Therefore please make sure that your PC automatically synchronizes the time with the internet time. Since Windows 7 this
function is built in and active by default. However, it can happen that the preconfigured update interval is not sufficient
(for example, if the hardware timer is inaccurate) and an adjustment is necessary.

By the way, BE has no technical possibility to correct the time on its own - the browser does not have the necessary
authorizations for this.

### Deactivate Computer Standby
When BE should perform automated bidding, it is important that the computer which is intended to perform the bidding
will be running. Some computers will automatically go to sleep when they are "inactive", so please check your computer
settings. BE has no technical means to wakeup the computer from it.

On some browsers BE will try to prevent computer sleep, however the safest is to configure your computer accordingly.
You can chose to deactivate this sleep prevention, in the internal BE options. 

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

![Data Export](/be_export.de.png)

## Internal configuration parameters

> Internal options should generally only be changed in case of problems. 

By right clicking on the BE symbol and selecting the menu item "Options" (Chrome/IE) or "Manage Extension" (Firefox)
you can access the internal parameters of BE.

The following parameters currently exist:

* Do not prevent system from sleeping
    * When this is enabled, BE is instructed not to prevent the PC from entering sleep mode.
    * Please remember that BE can only place bids automatically when the computer is running.
* Do not background-refresh closed items
    * When enabled, BE will not automatically update information for items that are not currently open in a tab.
    * Note that this can be useful in case you notice BE crashing due to memory issues, when BE is running unattended for long times.