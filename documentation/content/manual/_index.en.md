---
title: "Manual"
bookToc: true
weight: 1
type: "docs"
---

# Manual

## Quick-Start

When Biet-O-Matic BE (hereafter referred to as "BE") is added to the Browser it is immediately ready for use without additional configuration.
The only requirement is that you are already logged in to the eBay site as the active authentication in the browser is a proxy for BE to place bids.

Basic Usage:

- Open the BE overview page by clicking on the BE icon (auction hammer on yellow background, see image below)
  - The icon is usually visible in the browser menu bar, where the address entry is also located.
- The BE overview page opens as a "pinned" tab to the far left of all open tabs in the window where you activated the extension.
  - The pinned icon contains a white 'B' on a red background when the automatic bidding mode is INACTIVE for the current window,
  - or a white 'B' on a green background if the automatic bidding mode is ACTIVE for the window.
  - Note: The overview page must remain open for automatic bidding to work.
    Closing this tab will result in no bids for any groups.

{{< image src="/extension_status.en.png" alt="Plug-in Icon" >}}  
{{< image src="/overview_page.en.png" alt="Overview Page/Tab" >}}

- Open an eBay item in a new browser tab
  - You can press the "Auto-Bid" button to use the currently required minimum bid as your offer,
    or manually enter a maximum bid directly on the item page.
    This will also "save" the item in the overview page - and it will remain there even if the item tab is closed.
  - NOTE that the "Place bid" display on the item page will reflect the state of the "bid active" status of that item.
    This does not reflect the state of the Window Auto-Bid!

{{< image src="/bid_overlay.en.png" alt="Overview Page/Tab" >}}  

- Or you can enter the bid for the item directly on the BE overview page:
  - Group: By default, all items appear in the default group titled "Other Auctions".
    Simply enter a new group name next to an item and it will move to a new group with the name you specify.
  - Your Maximum Bid: Defines the maximum bid that BE will submit for the item just before the auction ends.
  - Item "Active" Mode: Activates the auto-bid mode for the item.
    If it is inactive, BE will not automatically bid on this item!
  - NOTE that if you do not enter a maximum bid value on the BE overview page OR on the item page itself,
    or move an item to a custom bid group; closing the item tab will remove it from the BE overview.
- For an item to be auctioned, a maximum bid must be entered and the item must be have auto-bid enabled.

In addition, the group auto-bid mode and the auto-bid mode for the window have to be active:

{{< image src="/features_be_groups.en.png" alt="Overview Page Features" >}}

### Group Auto-Bid Mode

The user can define per article group whether articles from this group are to be auctioned automatically.
The group auto-bid is *active* by default.

{{< hint info >}}
In case you do not need the Group functionality, you can deactivate it completely ([see here](#internal-configuration-parameters)).
{{< /hint >}}

### Window Auto-Bid Mode

The window auto-bid mode determines whether BE should bid for items automatically at all.
This is a kind of "emergency stop" switch, by which you can make sure, that no unintentional bidding on auctions is done by BE.

> Only one window at a time can activate the Window auto-bid mode.
> BE automatically deactivates the Window auto-bid mode in other windows if the user activates it in the current window.

This also ensures the support of several computers.
You can therefore use BE on different computers (e.g. to correct maximum bids), but only one of the computers will automatically place bids.

For more information please have a look at the function documentation (see menu on the left).

## Requirements

### Supported eBay platforms

{{< hint info >}}
Only www.ebay.de and www.ebay.com are supported by Bid-O-Matic BE.
If the Browser is set to German language, BE will automatically use the ebay.de platform.
For all other languages ebay.com will be used.
{{< /hint >}}

Even though only ebay.com and ebay.de are supported by BE, you can still use this extension.
It is possible to perform national and international shopping via ebay.com.

### Accurate System Clock

BE uses the system clock to execute tasks at certain times.
It is especially important that the maximum bid is received on eBay before the
auction ends - and on the other hand not too early - so that other bidders don't get into a bidding war.

Therefore please make sure that your PC automatically synchronizes the time with the internet time.
Since Windows 7 this function is built in and active by default.
However, it can happen that the preconfigured update interval is not sufficient
for example, if the hardware timer is inaccurate) and an adjustment is necessary.

By the way, BE has no technical possibility to correct the time on its own - the browser does not have the necessary permissions for this.
However BE regularly checks the clock precision and displays a warning message if the deviation is too large.

### Deactivate Computer Standby

When BE should perform automated bidding, it is important that the computer which is intended to perform the bidding keeps running.
Some computers will automatically go to sleep when they are "inactive", so please check your computer settings.
BE has no technical means to wakeup the computer from it.

On some browsers BE will try to prevent computer sleep, however the safest way is to configure your computer accordingly.
You can chose to deactivate this sleep prevention, in the internal BE options.+

{{< hint info >}}
The use of screensavers, turning off the monitor or locking your computer are fine.
These actions will not interfere with BE's bidding process.
{{< /hint >}}

## Extension Management

### Installation

The BE is installed using the browser extension store.
There is nothing special to note here.

### Update

BE is updated automatically by the browser at regular times.
It is not necessary to restart the browser to activate the update.

> If the global auto-bid was active in a window before the update,
> BE will start again automatically after the update so that bidding can continue automatically.

### De-installation

De-installing the BE is done via the browser.

By default BE will store all information in the "sync" storage area provided by the browser.
This storage will not be cleaned up when the extension is uninstalled (if the extension is installed somewhere else).

In case the "local" storage area is used, it will be cleaned upon deinstallation.

## Operation

See section [Features]({{< ref "/manual/features" >}})

## Stored data

### Item Information

- As soon a user enters a maximum bid or assigns a group for an item, it will be saved.
- The information about the stored items is saved by default in the `browser.storage.sync` area.
  That area is limited to a size of 100KB, which means about 50 items can be stored.
  The information is also available on other (own) computers if you have activated session synchronization.
- Alternatively, the items are saved in the `browser.storage.local` ("local" storage) area.
  That area is limited to a size of 5MB, which theoretically means a capacity for over 1000 items.

### Event Logs

- Event logs are saved in `window.localStorage` as soon as relevant events occur.
- Item bidding event logs contain information about the item and help the user, but also the support to check for problems.
- Item information events are created when information about an item has changed.
- Setting-change events are created when a setting (e.g. automatic mode) has changed.

{{< hint info >}}
All event logs are only stored locally and are not synchronized with other Computers.
{{< /hint >}}

## Data export

- The stored information can be exported to a file via the provided function.
- The information can also be imported again from the downloaded export file.
  Any preexisting data might be overwritten.

{{< hint info >}}
When you switched to "local" Storage, please make sure to backup your data regularly using the export functionality.
In comparison to the "sync" mode, your data is not stored in the cloud storage of your browser manufacturer which means a hardware defect can mean data loss.
{{< /hint >}}

## Internal configuration parameters

> Internal options should generally only be changed in case of problems.

By right clicking on the BE symbol and selecting the menu item "Options" (Chrome/IE) or "Manage Extension" (Firefox)
you can access the internal parameters of BE.

The following parameters currently exist:

- Do not prevent system from sleeping
  - When this is enabled, BE is instructed not to prevent the PC from entering sleep mode.
  - Please remember that BE can only place bids automatically when the computer is running.
- Disable background-refresh of closed items
  - When enabled, BE will not automatically update information for items that are not currently open in a tab.
  - Note that this can be useful in case you notice BE crashing due to memory issues, when BE is running unattended for long times.
- Disable regular clock check
  - If enabled, BE will not perform regular clock check against the eBay time.
- Disable Groups
  - If enabled, the functionality of managing groups will be deactivated.
    If groups are not needed, this will simplify the user interface.
- Enable Compact Saving
  - If enabled, BE will save the auction state as text instead of HTML.
    This will not look as nice in the table, but you can manage approximately twice as much items with BE before the storage is full.
- Enable local mode
  - If enabled, BE will store items in the "local" storage.
    By that BE can theoretically manage over 1000 items (this has never been tested).
    But this also means, that no information will be synchronized between your computers.
- Override eBay Platform
  - This is only relevant for the watch list synchronization.
  - By default BE uses ebay.de for german browser UI language, and ebay.com for all other languages.
- Bid time
  - Allows the adjustment of the bid time.
    The default setting is that ten (10) seconds before the auction ends, your bid will be submitted.
