const webpack = require("webpack"),
  path = require("path"),
  fileSystem = require("fs"),
  env = require("./utils/env"),
  CleanWebpackPlugin = require("clean-webpack-plugin").CleanWebpackPlugin,
  CopyWebpackPlugin = require("copy-webpack-plugin"),
  HtmlWebpackPlugin = require("html-webpack-plugin"),
  WriteFilePlugin = require("write-file-webpack-plugin");

const fileExtensions = ["jpg", "jpeg", "png", "gif", "eot", "otf", "svg", "ttf", "woff", "woff2"];

let manifestFile = path.join(__dirname, "src", "manifest.json");
let buildPath = path.join(__dirname, "build");
if (env.BROWSER === 'firefox') {
  buildPath = path.join(__dirname, "build-firefox");
  manifestFile = path.join(__dirname, "src", "manifest_firefox.json");
}
const options = {
  mode: process.env.NODE_ENV || "production",
  optimization: {
    minimize: true,
    runtimeChunk: false,
    moduleIds: 'named'
  },
  entry: {
    contentScript: {import: path.join(__dirname, "src", "js", "contentScript.js")},
    contentScript_offer: path.join(__dirname, "src", "js", "contentScript_offer.js"),
    popup: path.join(__dirname, "src", "js", "popup.js"),
    options: path.join(__dirname, "src", "js", "options.js"),
    parser: path.join(__dirname, "src", "js", "EbayParser.js"),
    storage: path.join(__dirname, "src", "js", "BomStorage.js")
  },
  output: {
    path: buildPath,
    filename: '[name].bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        use: ['file-loader?name=[name].[ext]']
      },
      {
        test: /\.html$/,
        use: ['html-loader'],
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    // clean the build folder
    new CleanWebpackPlugin({
      verbose: false,
      cleanAfterEveryBuildPatterns: [path.join(__dirname, "documentation", "public", "**")],
    }),
    // expose and write the allowed env vars on the compiled bundle
    new webpack.EnvironmentPlugin({
      npm_package_Version: '0.0.0',
      NODE_ENV: 'production', // use 'development' unless process.env.NODE_ENV is defined
      DEBUG: true
    }),
    new webpack.DefinePlugin({
      'BOM_VERSION': JSON.stringify(process.env.npm_package_version),
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: manifestFile,
          to: path.join(buildPath, "manifest.json"),
          transform: function (content, path) {
            // generates the manifest file using the package.json informations
            return Buffer.from(JSON.stringify({
              version: process.env.npm_package_version,
              ...JSON.parse(content.toString())
            }))
          }
        }
      ]
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "popup.de.html"),
      filename: "popup.de.html",
      chunks: ['popup']
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "popup.en.html"),
      filename: "popup.en.html",
      chunks: ['popup']
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "options.html"),
      filename: "options.html",
      chunks: ['options']
    }),
    new WriteFilePlugin(),
    // Ignore all locale files of moment.js
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    new CopyWebpackPlugin({
      patterns: [
        {
          from:  path.resolve(__dirname, "src", "js", "background.js"),
          to: buildPath,
          flatten: true
        },
        {
          from:  path.resolve(__dirname, "node_modules", "webextension-polyfill", "dist", "browser-polyfill.js"),
          to: path.resolve(buildPath, 'vendor'),
          flatten: true
        },
        {
          from:  path.resolve(__dirname, "src", "icon48.png"),
          to: buildPath,
          flatten: true
        },
        {
          from:  path.resolve(__dirname, "src", "icon128.png"),
          to: buildPath,
          flatten: true
        },
        {
          from:  path.resolve(__dirname, "src", "_locales"),
          to: path.join(buildPath, "_locales")  
        }
      ]
    }),
  ]
};

// always include source-map
options.devtool = "cheap-module-source-map";

module.exports = options;