var webpack = require("webpack"),
  config = require("../webpack.config");

delete config.chromeExtensionBoilerplate;

webpack(
  config,
  (err, stats) => { // Stats Object
    'use strict';
    if (err)
      throw err;
    if (stats.hasErrors())
      console.log("Errors: stats=%s", stats);
    // Done processing
  });