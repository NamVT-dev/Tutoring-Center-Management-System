const express = require("express");
const notificationController = require("../controllers/notificationController");
const authController = require("../controllers/authController");
const route = express.Router();

route.use(authController.protect);
route.get("/", notificationController.getAllNotifications);
route.get("/:id", notificationController.getOne);

route.use(authController.restrictTo("admin"));
route.post("/", notificationController.createOne);
route.patch("/:id", notificationController.updateOne);
route.delete("/:id", notificationController.deleteOne);

module.exports = route;
