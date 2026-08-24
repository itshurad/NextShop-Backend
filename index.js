const Application = require("./app/server.js");

const app = new Application();

module.exports = app.getApp();
