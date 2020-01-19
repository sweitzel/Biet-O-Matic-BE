---
title: "Features"
bookFlatSection: false
type: docs
weight: 101
---

# Functions

## Overview page

### Groups
Groups can be used to organize different items by topics. This should not only increase the readability, 
but it also allows you to bid automatically for different items simultaneously with BE.

> Only one Item per group will be auctioned, after that the group automatic will be deactivated.  
> If it should be desired to bid for several items of a group, the group automatic can be manually re-activated again  
> Alternatively you can create smaller groups. In the extreme case, only one article per group, in order to be able to
> to auction off. 
 
{{< image src="features_be_gruppe.de.png" alt="Groups" >}}

* Items can be assigned to groups at any time
* Groups have a switch for the group auto-bid mode
    * The group auto-bid mode can be activated or deactivated by clicking on the group line in the overview table.
    * The status is represented by color as well as text (e.g. red color, text "automatic mode inactive").
* Groups are kept in the synchronized memory area. They are therefore also available in other browser windows and even 
  available from other computers.

### Items
Items are automatically added to the overview table as soon as an eBay item is displayed in a browser tab which is
opened in the same window. At this point, however, the item is not yet saved - this only happens as soon as the user
places a maximum bid, or also makes a group assignment. After the item has been saved, the tab can also be closed
and the item will remain in the table.

{{< image src="features_be_artikel_maxbid.de.gif" alt="Define item maximum bid" >}}

* The desired maximum bid for an item can be entered directly in the overview table.
  The updated value is also communicated back to the eBay item tab.
* If you enter a value which is lower than the minimum bid[^1], the entry will be automatically adjusted to the
  lowest possible value.
* If you enter a value which is higher than the buy-now price, the entry is automatically 
  reduced to the buy-now price, **minus 1 cent**.
* The field for the item auto-bid mode is only enabled for clicking, if the entered maximum bid is higher than
  the current item price + the increase step.
* Updates for Item attributes (e.g. price, number of bids etc) will be visualized by setting a yellow background color
  on the updated cells. That highlighting color will persist until the page is reloaded.

{{< hint info >}}
The item auto-bid mode is automatically deactivated if the item price goes above the defined maximum bid during the auction.
{{< /hint >}}

### Event logging
BE generates three types of logs:

#### Article related Event Log
{{< image src="features_be_artikelprotokoll.de.gif" alt="Item Event Log" >}}
This is the most important log for the user, which it records in a human readable form.
It logs what BE has done during the bidding process, or updates received for the item information.

#### Overview Page Event Log
This log is recorded in the Browser Console Log of the overview page and is usually available after a reload
of the page is deleted again. More experienced users can use this to track BE's internal operations.

#### eBay Item Page Event Log
This log is recorded in the Browser Console Log of the ebay article page.

{{< hint info >}}
For problem messages, at a minimum, the article should have an event log for articles that have created problems
can be provided. To do this, you can show the events by clicking on the '+' symbol. Then select all entries with the
the mouse (scroll all the way down to get all the entries) and then copy with the right mouse button.
{{< /hint >}}

### Simulation mode
If desired, the simulation mode can also be activated for testing without risk.
The only difference to the normal bid is that the bid is not confirmed shortly before the auction ends.

The simulation will not lead to deactivation of the auto-bid, as no purchased end-state will be simulated.

## Bidding Procedure
BE will bid on an item automatically if both the automatic mode for the item, the group in which the article is located
and the global automatic mode are active. 

If the article is not open, one minute before the auction ends BE opens the article in a new browser tab.
If the tab is already open, BE will reload the tab one minute before the auction ends.

The bidding process runs largely independently in the article browser tab as follows:
* A regular event triggered by eBay starts the bidding process 30 seconds before the auction ends
* It is checked whether all three auto-bid modes are activated and whether there are any auction collisions
* The corrected bidding time is determined
* The maximum bid is sent
* This opens a new sub window (modal), in which eBay expects a confirmation of the bid
* BE waits until the bidding time to confirm the bid

{{< hint info >}}
Note: Make sure that your computer does not go into sleep / standby mode. BE can put the computer
and therefore do not automatically bid.
{{< /hint >}}

### Avoidance of double purchases (auction collision)
> This section is only relevant if the option "Bid all items of this group" is inactive. The option will come in the next version.

By default, only one item from each group should be auctioned. This is ensured by the the program logic that if for an 
article a successful auction status is reported, the group auto-bid is deactivated.

However, this is problematic if multiple item auctions end at a similar time.
To prevent multiple items in a group from bidding, the following program logic is used:

* The bidding time, i.e. confirmation of the bid, is adjusted so that there are always at least 10 seconds between two 
  auctions.
* A bid-lock is imposed if an auction which has finished within 10s of the current auction 
  has an still undetermined auction status. 
  
{{< hint info >}}
The described program logic can lead to unsuccessful auctions because no bid was submitted in case two auctions end
in the same 10 second time window.
{{< /hint >}}

## eBay Item Page
When loading the eBay item page, BE enhances it with a button that enables the auto-bid mode for this item.
The maximum bid input field is also monitored in the background, and this value is checked and saved if necessary. 

{{< image src="features_be_artikelseite.de.gif" alt="Item Page" >}}

* A change of the maximum bid or the auto-bid inputs are forwarded to the overview page
* When entering a value which is lower than the minimum increase price, the entry is automatically adjusted to the
  lowest possible value.
* If you enter a value that is higher than the buy-it-now price, the entry is automatically 
  adjusted to the buy-now price, **minus 1 cent**.
* The button for the automatic mode on the article page refers only to the article. In addition, you also have to 
  enable the group auto-bid and the global auto-bid mode. Otherwise the article is not automatically auctioned. 

[^1]: The increment steps can also be looked up on eBay: https://www.ebay.com/help/buying/bidding/automatic-bidding?id=4014 