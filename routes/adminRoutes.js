const express = require("express");
const adminController = require("../controllers/adminController");

const route = express.Router();

route.get("/teachers", adminController.getListTeacher);
route.get("/teachers/:id",adminController.getTeacherDetail);


module.exports = route;