const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const createError = require("http-errors");
const path = require("path");

dotenv.config();

class Application {
  #app = express();
  #PORT = process.env.PORT || 5000;
  #DB_URI = process.env.APP_DB;

  constructor() {
    this.createServer();
    this.connectToDB();
    this.configServer();
    this.initClientSession();
    this.configRoutes();
    this.errorHandling();
  }
  // ... بقیه متدها دقیقاً مثل قبل
  configRoutes() {
    // ایمپورت را می‌توانید مستقیماً همینجا هم انجام دهید
    const { allRoutes } = require("./router/router");
    this.#app.use("/api", allRoutes);
  }
  // ...
}

// کلاس را اینجا خروجی بگیرید (قبل از اینکه روترها در سطح فایل لود شوند)
module.exports = Application;