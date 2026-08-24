const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const createError = require("http-errors");
const path = require("path");

const { allRoutes } = require("./router/router");

dotenv.config();

class Application {
  #app = express();

  #DB_URI = process.env.APP_DB;

  constructor() {
    this.configServer();
    this.connectToDB();
    this.initClientSession();
    this.configRoutes();
    this.errorHandling();
  }

  connectToDB() {
    mongoose
      .connect(this.#DB_URI)
      .then(() => {
        console.log("MongoDB connected!!");
      })
      .catch((err) => {
        console.log("Failed to connect to MongoDB", err);
      });
  }

  configServer() {
    this.#app.use(
      cors({
        credentials: true,
        origin: process.env.ALLOW_CORS_ORIGIN,
      }),
    );

    this.#app.use(express.json());
    this.#app.use(express.urlencoded({ extended: true }));

    this.#app.use(express.static(path.join(__dirname, "..")));
  }

  initClientSession() {
    this.#app.use(cookieParser(process.env.COOKIE_PARSER_SECRET_KEY));
  }

  configRoutes() {
    this.#app.use("/api", allRoutes);
  }

  errorHandling() {
    this.#app.use((req, res, next) => {
      next(createError.NotFound("آدرس مورد نظر یافت نشد"));
    });

    this.#app.use((error, req, res, next) => {
      const serverError = createError.InternalServerError();

      const statusCode = error.status || serverError.status;

      const message = error.message || serverError.message;

      return res.status(statusCode).json({
        statusCode,
        message,
      });
    });
  }

  getApp() {
    return this.#app;
  }
}

module.exports = Application;
