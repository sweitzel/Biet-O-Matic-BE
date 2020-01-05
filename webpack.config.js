const webpack = require("webpack"),
  path = require("path"),
  fileSystem = require("fs"),
  env = require("./utils/env"),
  CleanWebpackPlugin = require("clean-webpack-plugin").CleanWebpackPlugin,
  CopyWebpackPlugin = require("copy-webpack-plugin"),
  HtmlWebpackPlugin = require("html-webpack-plugin"),
  WriteFilePlugin = require("write-file-webpack-plugin"),
  ZipPlugin = require('zip-webpack-plugin'),
  ShellPlugin = require('webpack-shell-plugin');
// load the secrets
var alias = {};

var secretsPath = path.join(__dirname, ("secrets." + env.NODE_ENV + ".js"));

var fileExtensions = ["jpg", "jpeg", "png", "gif", "eot", "otf", "svg", "ttf", "woff", "woff2"];

if (fileSystem.existsSync(secretsPath)) {
  alias["secrets"] = secretsPath;
}

var options = {
  mode: process.env.NODE_ENV || "production",
  entry: {
    contentScript: path.join(__dirname, "src", "js", "contentScript.js"),
    popup: path.join(__dirname, "src", "js", "popup.js"),
    background: path.join(__dirname, "src", "js", "background.js")
  },
  chromeExtensionBoilerplate: {
    notHotReload: ["contentScript"]
  },
  output: {
    path: path.join(__dirname, "build"),
    filename: "[name].bundle.js"
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        loader: "style-loader!css-loader",
        //exclude: /node_modules/
      },
      {
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        loader: "file-loader?name=[name].[ext]",
        //exclude: /node_modules/
      },
      {
        test: /\.html$/,
        loader: "html-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    alias: alias
  },
  plugins: [
    // clean the build folder
    new CleanWebpackPlugin({
      verbose: false,
      cleanAfterEveryBuildPatterns: [path.join(__dirname, "documentation", "public", "**")],
    }),
    // expose and write the allowed env vars on the compiled bundle
    new webpack.EnvironmentPlugin(["NODE_ENV"]),
    new webpack.DefinePlugin({
      'BOM_VERSION': JSON.stringify(process.env.npm_package_version),
    }),
    new CopyWebpackPlugin([{
      from: "src/manifest.json",
      transform: function (content, path) {
        // generates the manifest file using the package.json informations
        return Buffer.from(JSON.stringify({
          version: process.env.npm_package_version,
          ...JSON.parse(content.toString())
        }));
      }
    }]),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src", "popup.html"),
      filename: "popup.html",
      chunks: ["popup"]
    }),
    new WriteFilePlugin(),
    // Ignore all locale files of moment.js
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    new CopyWebpackPlugin([
      {
        from:  path.join(__dirname, "src", "_locales"),
        to: path.join(__dirname, "build", "_locales")
      }
    ]),
    new CopyWebpackPlugin([
      {
        from:  path.join(__dirname, "src", "*.png"),
        to: path.join(__dirname, "build"),
        flatten: true
      }
    ]),
    // Run hugo command after build
    new ShellPlugin({
      onBuildEnd: ['hugo.bat']
    }),
    new CopyWebpackPlugin([
      {
        from:  path.join(__dirname, "documentation", "public"),
        to: path.join(__dirname, "build", "doc")
      }
    ]),
    new ZipPlugin({
      path: path.join(__dirname),
      filename: "bom-be_" + process.env.npm_package_version + ".zip",
    })
  ]
};

// always include source-map
options.devtool = "inline-source-map";
/*
if (env.NODE_ENV === "development") {
  options.devtool = "source-map";
}
*/

module.exports = options;