const express = require("express");
const chatTestController = require("../controllers/chatTestController");

const route = express.Router();

route.post("/chatTest", chatTestController.chatTest);

module.exports = route;
