const express = require("express");
const adminController = require("../controllers/adminController");
const roomctrl = require("../controllers/roomController");
const courseCtrl = require("../controllers/courseController");
const centerCtrl = require("../controllers/centerController");
const authCtrl = require("../controllers/authController");
const categoryCtrl = require("../controllers/categoryController");
const classCtrl = require("../controllers/classController");
const route = express.Router();

//auth for admin
route.use(authCtrl.protect);
route.use(authCtrl.restrictTo("admin"));
//quan ly giao vien
route.get("/teachers", adminController.getListTeacher);
route.get("/teachers/:id", adminController.getTeacherDetail);
//quan ly room
route.post("/rooms", roomctrl.createRoom);
route.patch("/rooms/update/:id", roomctrl.updateRoom);
route.get("/rooms", roomctrl.listRoom);
route.delete("/rooms/:id/delete", roomctrl.deleteRoom);
//quan ly course
route.post("/courses", 
    courseCtrl.uploadCourseImage,     
    courseCtrl.processCourseImage,
    courseCtrl.createCourse);
route.patch("/courses/update/:id",
    courseCtrl.uploadCourseImage,   
    courseCtrl.processCourseImage,
    courseCtrl.updateCourse,
    );
route.get("/courses", courseCtrl.listCourses);
route.delete("/courses/:id/delete", courseCtrl.deleteCourse);
route.get("/courses/:id", courseCtrl.getCourse);
//quan ly center
route.get("/center/config", centerCtrl.getConfig);
route.patch("/center/config", centerCtrl.updateConfig);
//quan ly category
route.post("/categories", categoryCtrl.createCategory);
//quan ly class
route.get("/classes", classCtrl.listClasses);
route.get("/classes/:id", classCtrl.getClassDetail);
module.exports = route;
