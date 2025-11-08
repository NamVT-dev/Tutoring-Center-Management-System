const express = require("express");
const paymentCtrl = require("../controllers/paymentController");

const route = express.Router();

route.post("/webhook", paymentCtrl.handlePaymentWebhook);

module.exports = route;