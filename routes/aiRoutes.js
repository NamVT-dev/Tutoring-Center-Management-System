const express = require("express");
const aiController = require("../controllers/aiController");
const authController = require("../controllers/authController");

const route = express.Router();

route.post("/chat", aiController.chatAi);

route.use(authController.protect);
route.use(authController.restrictTo("back-end"));
route.get("/embedding", aiController.embeddingAllRequireData);

module.exports = route;
