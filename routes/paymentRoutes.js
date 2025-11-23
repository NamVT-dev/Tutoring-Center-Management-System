const express = require("express");
const authController = require("../controllers/authController");
const paymentController = require("../controllers/paymentController");

const route = express.Router();

route.get("/confirm-payment", paymentController.handlePaymentWebhook);
route.use(authController.protect);
route.get("/my-payments", paymentController.getMyPayments);
route.get("/:id", paymentController.getOneByMember);

module.exports = route;
