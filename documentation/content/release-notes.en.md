---
title: "Release Notes"
bookToc: true
weight: 2
type: "docs"
---

# Release Notes

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