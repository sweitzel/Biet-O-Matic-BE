// tiny wrapper with default env vars
module.exports = {
  BROWSER: (process.env.BROWSER || "chrome"),
  NODE_ENV: (process.env.NODE_ENV || "production"),
  PORT: (process.env.PORT || 3000)
};