const express = require("express");
const teacherController = require("../controllers/teacherController");
const authCtrl = require("../controllers/authController");
const { getCourseCategories } = require("../controllers/courseController");
const { getConfig } = require("../controllers/centerController")
const route = express.Router();

//auth for admin 
// route.use(authCtrl.protect);
// route.use(authCtrl.restrictTo("teacher"));

route.get("/categories",getCourseCategories);
route.get("/shift",getConfig);
route.patch("/register-shift", teacherController.registerShiftAvailability);
route.patch("/register-categories", teacherController.registerTeachCategories)
module.exports = route;
