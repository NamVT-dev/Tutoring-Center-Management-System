const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const teacherRoutes = require("./teacherRoutes");
const testRoutes = require("./testRoutes");
const route = express.Router();

route.use("/auth", authRoutes);
route.use("/admin", adminRoutes);
route.use("/teacher", teacherRoutes);
route.use("/test", testRoutes);
module.exports = route;
