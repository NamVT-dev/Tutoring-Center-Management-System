const express = require("express");
const courseCtrl = require("../controllers/courseController");
const authCtrl = require("../controllers/authController");
const studentCtrl = require("../controllers/studentController");
const route = express.Router();

route.get("/courses", courseCtrl.listCourses);
route.get("/courses/:id", courseCtrl.getCourse);

route.use(authCtrl.protect, authCtrl.restrictTo("member"));
route.get("/learner", studentCtrl.getAllMyStudent);
route.get("/learner/:id", studentCtrl.getOneStudent);
route.patch("/learner/:id", studentCtrl.updateStudent);

module.exports = route;
