const express = require("express");
const attendanceController = require("../controllers/attendanceController");
const route = express.Router();

route.post("/start-session/:classId", attendanceController.createSession);
module.exports = route;
