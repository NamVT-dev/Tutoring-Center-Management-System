const express = require("express");
const authController = require("../controllers/authController");
const paymentController = require("../controllers/paymentController");

const route = express.Router();

route.use(authController.protect);
route.get("/my-payments", paymentController.getMyPayments);
route.get("/:id", paymentController.getOneByMember);
route.post("/webhook", paymentController.handlePaymentWebhook);

module.exports = route;
