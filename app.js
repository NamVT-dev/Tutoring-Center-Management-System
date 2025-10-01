const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");

const AppError = require("./utils/appError");

const globalErrorHandler = require("./controllers/errorController");

const registedRoutes = require("./routes");

//Start app express
const app = express();

//Implament cors
app.use(
  cors({
    origin: process.env.FRONT_END_URI || "*",
    credentials: true,
  })
);
// Serving static files
app.use(express.static(path.join(__dirname, "public")));

// Set security HTTP header
app.use(helmet());

//Logging
app.use(morgan("dev"));

//Body parser
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

//Data sanitize against NoSQL query injection
app.use(mongoSanitize());

//Data sanitize against XSS
app.use(xss());

app.use(compression());

app.use(registedRoutes);

app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
