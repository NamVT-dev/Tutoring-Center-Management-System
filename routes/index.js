const express = require("express");
const authRoutes = require("./authRoutes");
const adminRoutes= require("./adminRoutes");
const route = express.Router();

route.use("/auth", authRoutes);
route.use("/admin",adminRoutes);
module.exports = route;
