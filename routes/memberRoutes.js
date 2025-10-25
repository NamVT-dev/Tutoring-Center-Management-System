const express = require("express");
const courseCtrl = require("../controllers/courseController");
const route = express.Router();

route.get("/courses",courseCtrl.listCourses);
route.get("/courses/:id", courseCtrl.getCourse);

module.exports = route;