const express = require("express");
const teacherController = require("../controllers/teacherController");

const route = express.Router();

route.put("/availability", teacherController.updateMyAvailabilityDays);

module.exports = route;