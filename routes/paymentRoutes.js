const express = require("express");
const authController = require("../controllers/authController");
const paymentController = require("../controllers/paymentController");

const route = express.Router();

route.use(authController.protect);
route.get("/", paymentController.getAllPayments);
route.get("/:id", paymentController.getOne);

module.exports = route;
