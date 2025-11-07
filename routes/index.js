const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const teacherRoutes = require("./teacherRoutes");
const testRoutes = require("./testRoutes");
const categoryRoutes = require("./categoryRoutes");
const memberRoutes = require("./memberRoutes");
const scheduleRoutes = require("./scheduleRoutes");
const attendanceRoutes = require("./attendenceRoutes");
const route = express.Router();

route.use("/auth", authRoutes);
route.use("/admin", adminRoutes);
route.use("/teacher", teacherRoutes);
route.use("/test", testRoutes);
route.use("/categories", categoryRoutes);
route.use("/", memberRoutes);
route.use("/schedule", scheduleRoutes);
route.use("/attendence", attendanceRoutes);

module.exports = route;
