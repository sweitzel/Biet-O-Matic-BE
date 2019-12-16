# Bid-O-Matic Browser Extension

Bid-O-Matic (BOM) Browser Extension (BE) is intended to improve the shopping experience for the eBay platform.
It adds an overview page which can be used to keep your auctions organized. Furthermore it can perform automated
bidding on your auctions, without you being present at your computer.

This page is mainly development related. For usage information please check the Extension Stores of the supported
browsers.

## Main Features
The following main features have been implemented:

* Article Overview Page
    * showing active eBay auction tabs in a nice table, along with summary information
    * show recently closed eBay auction tabs in a second table
* Automatic bidding on auctions
    * It can be configured if only one of the articles in the current window should be bid for (default), or all.
* Extend eBay article page
    * The input field is extended, so that the input will be used as maximum bid (used for automated bidding)
    * Add a "Auto Bid" button, which can only be activated if the minimum bid is reached
* Data synchronisation between your different browsers sessions, even on different computers
* Auction bidding events are stored in local storage and can be viewed easily in the overview article table
* Simulated bidding can be activated when Shift key is pressed while clicking the "Auto Bid" button. The auction
  will be automated to the last step, where the confirmation will not be done.

## Screenshots

- Overview Page

    ![](screenshots/bom_overview.png)

- Auction Log

    ![](screenshots/bom_log.png)

- Simulation mode

    ![](screenshots/bom_simulation.gif)

- Auction Page extension

    ![](screenshots/bom_page_extension.gif)


## I18N / Languages
The BE currently only supports German language.

## Getting Started
Contributors or testers can download the Extension from Github and install manually to their Browser. 
Please refer to the Browser instruction how to do that. End users should only install the BE via the Browsers Extension store.

## Supported Browsers
* Google Chrome (tested version >=78) todo: add link to Chrome Web Store