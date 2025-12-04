const express = require("express");
const attendanceController = require("../controllers/attendanceController");
const authController = require("../controllers/authController");
const route = express.Router();

route.use(authController.protect);
route.get("/my-attendance", attendanceController.getWeeklyAttendance);

route.use(authController.restrictTo("teacher"));
route.get("/today-session", attendanceController.getTodaySession);
route.get("/", attendanceController.getAllAttendanceReport);
route.post("/start-session/:id", attendanceController.startSession);
route.patch("/take-attendance/:id", attendanceController.takeAttendance);

module.exports = route;
