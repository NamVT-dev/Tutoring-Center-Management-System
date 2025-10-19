const express = require("express");
const categoryCtrl = require("../controllers/categoryController");
const route = express.Router();

route.get("/", categoryCtrl.getAllCategories);

module.exports = route;
