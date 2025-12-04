const express = require("express");
const complainController = require("../controllers/complainController");
const authController = require("../controllers/authController");

const route = express.Router();

route.use(authController.protect);
route.post("/", complainController.createOne);
route.get("/my-complain", complainController.getMyComplain);

route.use(authController.restrictTo("admin", "staff"));
route.get("/", complainController.getAll);
route.patch("/:id", complainController.updateOne);
route.get("/:id", complainController.getOne);
route.delete("/:id", complainController.deleteOne);

module.exports = route;
