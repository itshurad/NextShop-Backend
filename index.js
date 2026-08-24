const express = require("express");
const Application = require("./app/server.js");

const application = new Application();

module.exports = application.app;
