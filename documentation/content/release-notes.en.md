---
title: "Release Notes"
bookToc: true
weight: 2
type: "docs"
---

# Release Notes

## Bid-O-Matic BE Version 0.5
This version contains a rewrite of the bidding process, which should help to reduce situations where bids where not submitted reliably.
The bidding process is now running via the "offer.ebay.com" page, instead of the eBay item page.

Other changes:

- The storage destination can be changed from "sync" to "local" via a newly introduced configuration parameter.
  This "local" storage allows to store much more items with BE (theoretically over 1000, but this was not tested).
  It does not support the syncronisation of data between your different browser sessions.
- The support for groups can now be deactivated via a new configuration parameTer.
  This should simplify the user interface for users which do not need groups.
- The storage can now be imported to a file (backup) and also be imported from it again.

### Bid-O-Matic BE Version 0.5.1
{{< hint info>}}
Released on Saturday, 2020-10-11
{{< /hint >}}

- Minor update for Firefox release preparation

### Bid-O-Matic BE Version 0.5.0
{{< hint info>}}
Released on Saturday, 2020-10-03
{{< /hint >}}

- Complete rewrite of bidding proces
- Added export/import functionality
- New configuration parameter to select the storage area:
  - Default is still the "sync" storage (100kb)
  - Alternatively the "local" storage (5MB) can be used
- New configuration parameter to adjust the bid time (default is five (5) Seconds before the action end)
- Item seller is now processed and displayed in the overview table when compact mode is inactive
- Added keyboard shortcuts for window automatic mode (ALT + a), Configuration (ALT + o) and Compact View (ALT + c).
  If it doesn't work, [each browser unfortunately uses different key modifiers](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/accesskey).

## Bid-O-Matic BE Version 0.4
Bid-O-Matic is now available for all larger browser platforms. 

### Bid-O-Matic BE Version 0.4.7
{{< hint info>}}
Published on Tuesday, 2020-03-03
{{< /hint >}}

* Fix date parsing of auction end date in March (german only)

### Bid-O-Matic BE Version 0.4.6
{{< hint info>}}
Published on Friday, 2020-02-28
{{< /hint >}}

* From item page, only allow activation of item auto-bid when BE already added the item.
  This could lead to losing the setting and thus bidding issues.
* From item page, allow activation of item auto-bid without defining maximum bid.
  The price will be adjusted to the minimum acceptable bid price at that moment. 
* Improve group chooser by resetting filter on focus. This allows selection of all groups.

### Bid-O-Matic BE Version 0.4.5
{{< hint info>}}
Published on Thursday, 2020-02-20
{{< /hint >}}

* Change minimum Firefox version to 57.
* Add support for cleaning up items (Broom icon on overview page).
* Fix group autoBid text display.
* Add info messages for adding items from watchlist.
* Add error message if save operation fails.
* Add option "Enable Compact Saving" to allow managing more items with BE.
    * see [Internal configuration parameters]({{< ref "/manual#internal-configuration-parameters" >}})
* Add display of free sync storage after BE loaded.
    * \> 80% yellow, \> 95% red

### Bid-O-Matic BE Version 0.4.4
{{< hint info>}}
Published on Thursday, 2020-02-13
{{< /hint >}}

* Problem with item field updates fixed
  * The contentScript would use the stored information instead of the fresh parsed
* Fixed problem with auction end-time calculation that did not take into account the time zone differences between ebay.de and the user's PC.
  * Solved by parsing the auction end time from the eBay Raptor JS info.
* Changed bidding time from 2.5s to 3s before auction ends
* Refresh of table contents corrected
* Background update of the articles changed again.
  * Update every hour if auction end > 12 hours, otherwise every 5min
  * Updating is now sequential instead of parallel to avoid performance issues

### Bid-O-Matic BE Version 0.4.3
{{< hint info>}}
Published on Sunday, 2020-02-08
{{< /hint >}}

* Add support for adding items from ebay watch list.
    * This will add all items on the watch list to a group named "Watch List"
    * BE is not able to remove items from the Watch List. Please use ebay functionality.
* Change interval for regular clock check to from each minute to 3..10 minutes (random)
* Add internal parameter to turn regular clock check off.
* Add internal parameter to override ebay platform (only used for watch list sync)
* Do not redraw overview table if tab/window not active.
* Adjust item background refresh interval based on when the item is ending.
* Redraw overview table when tab becomes active.
* Fix issue with BE overview page activation which could get stuck before.

### Bid-O-Matic BE Version 0.4.2
{{< hint info>}}
Published on Sunday, 2020-02-02
{{< /hint >}}

* Added support for detection of the time difference of the system where BE is running and the ebay server.
    * BE will display a warning message on the overview page if the time difference is larger than a second.
* Added internal options to disable background update and sleep mode prevention
    * For more information also check out [the manual]({{< relref "/manual#internal-configuration-parameters" >}})
* Optimization of article groups
    * Groups can now be selected also when they have been just added.
    * Groups are only kept once in memory on the overview page.

### Bid-O-Matic BE Version 0.4.1
{{< hint info>}}
Published on Friday, 2020-01-31
{{< /hint >}}

* Fixes a problem with memory management that could cause BE to crash under certain circumstances.
* Resolves problem regarding tab management.

## Bid-O-Matic BE Version 0.3
This BE Version is the first one, which is multilingual. Besides German it now also supports English language.
Furthermore ebay.com support was tested as well and should work without major issues. 

Other major changes in this version:
* For closed items (no tab open), a data update is performed in the background every minute.
    * The update process is visualized (rotating '+')
    * An update only takes place if automatic mode is active for the current window.
* Changes to item information are highlighted by color (yellow) in the table. 
* Article images are now displayed on the overview page
* Added option for compact display, this hides images and makes the table rows a bit narrower.
* Added support for English.
    * Language is automatically set by the browser display language and cannot be manually defined.
* Article group field now allows selection from existing groups.
* Unused article groups are automatically deleted after 7 days.
* BE overview page opens automatically after an update, but only, 
  if the auto-bid mode was active for the window before the update.
  This ensures that automatic bidding can continue in absence after a BE update has taken place.
* Bid-Lock implemented to ensure that not multiple items from the same group are purchased,
  if the auctions for the items end close to each other (10s), also see [Features]({{< relref "/manual/features#avoidance-of-double-purchases-auction-collision" >}})
* If the browser supports it, BE will prevent the computer from entering sleep mode when global auto-bid is active.

### Bid-O-Matic BE Version 0.3.4
{{< hint info>}}
Published on Tuesday, 2020-01-27
{{< /hint >}}

* Adds the possibility to bid on all items from a group.
  The default is still that one item is auctioned per group. 
* Changes the default for groups automatic mode to "Active"
* Removes flickering of the group auto-bid button.
* Fixes a problem when opening the BE overview page, which could cause multiple over pages to be open at the same time.

### Bid-O-Matic BE Version 0.3.3
{{< hint info>}}
Published on Tuesday, 2020-01-21
{{< /hint >}}

* Fixes an issue with opening the overview page. It could be opened multiple times before.
* Fixes an issue with flickering Group Auto-Bid button
* Documentation update, Quick-Start Guide added

### Bid-O-Matic BE Version 0.3.2
{{< hint info>}}
Published on Sunday, 2020-01-19 
{{< /hint >}}

* First stable 0.3 version (for major changes, see above)
* Minor adjustments:
    * Display of payment methods on the overview page when the mouse is moved over the price column
    * "No group" renamed "Other Auctions"
    * "Other Auctions" group is placed at the front of the list
    * Maximum bid can now be deleted and is set to 0 instead of always jumping to the minimum bid.
    * Fixed problem when an item tab was closed and then restored.

## Bid-O-Matic BE Version 0.2
This version branch has not much in common with the previous version. Both the source code and the
Use of BE was renewed.

The following changes are particularly noteworthy:

* Support for bidding groups:  
    * Articles can now be divided into groups. A new column has been added to the article table of the
    BE overview page added. You can now enter any name you like here to create order in the 
    different articles.
    * Each group has its own "automatic mode" switch. This must be activated in addition to the article and 
    window switch must be active for BE to bid automatically for items from the group.
    * The group switch can be switched on or off by clicking on the group line with the mouse. 
* Tab Management:
    * Tabs can now be closed and reopened by the user via a new icon in the overview page.
    * BE opens item tabs automatically 60 seconds before the auction ends if the automatic function for this item
    is activated (Window+Group+Article).
* Session synchronization:
    * BE stores information centrally [^1] so that it can access it again from any other computer.
    * Entered maximum bids, group membership or automatic mode settings (item and group) are
      also stored
    * Only one browser window can keep the automatic mode active at the same time.
     As soon as automatic mode is activated in the current window, it is deactivated in other windows - even on
     other computers.
* Extended event logging:
    * BE now saves changes to article parameters in addition to bidding events. For example, a
    Log created if the item price has been updated or the maximum bid has been changed by the user.
* Adjustment of the handling of items which end close to each other:
    * Now ensures that auctions within the same group are always at least 15 seconds apart.
    lie. However, it still has to be tested whether this is sufficient or could be too much.
* Link to the donation page
    * To ensure that B-O-M BE will be maintained and expanded in the future, the donation option
    integrated. Currently this is possible through the GitHub platform, where different donation levels are possible.

### Bid-O-Matic BE Version 0.2.2
{{< hint info>}}
Published on Monday, 2020-01-06
{{< /hint >}} 
* First stable 0.2 release

## Bid-O-Matic BE Version 0.1
These are the first prototype versions, which were released in December 2019. These versions
were only made available to a limited circle of users to collect first opinions and test experiences
and prepare it for the first stable release.

[^1]: This requires that the browser synchronisation feature has been activated.