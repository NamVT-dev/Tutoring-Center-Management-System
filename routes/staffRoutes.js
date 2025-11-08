const express = require("express");
const adminController = require("../controllers/adminController");
const authController = require("../controllers/authController");

const route = express.Router();

route.use(authController.protect, authController.restrictTo("admin", "staff"));

route.get(
  "/account",
  adminController.accountFilterForStaff,
  adminController.getAllUserAccount
);

route.get("/account/:id", adminController.getOneUserAccount);

module.exports = route;
