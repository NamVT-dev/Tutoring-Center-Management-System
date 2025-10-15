const express = require("express");
const authController = require("../controllers/authController");
const testController = require("../controllers/testController");
const route = express.Router();

route.use(authController.protect);
route.post("/register-test", testController.registerTest);

module.exports = route;
