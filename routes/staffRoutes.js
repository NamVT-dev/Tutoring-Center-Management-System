const express = require("express");
const adminController = require("../controllers/adminController");

const route = express.Router();

route.get(
  "/account",
  adminController.accountFilterForStaff,
  adminController.getAllUserAccount
);

route.get("/account/:id", adminController.getOneUserAccount);

module.exports = route;
