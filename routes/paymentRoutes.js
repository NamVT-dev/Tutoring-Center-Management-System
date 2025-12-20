const express = require("express");
const authController = require("../controllers/authController");
const paymentController = require("../controllers/paymentController");

const route = express.Router();

route.get("/confirm-payment", paymentController.handlePayment);
route.use(authController.protect);
route.get("/my-payments", paymentController.getMyPayments);
route.get("/:id", paymentController.getOneByMember);

route.use(authController.restrictTo("admin", "staff"));
route.get("/refund-payment/:id", paymentController.refundPayment);

module.exports = route;
