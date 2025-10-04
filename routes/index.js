const express = require("express");
const authRoutes = require("./authRoutes");

const route = express.Router();

route.use("/auth", authRoutes);

module.exports = route;
