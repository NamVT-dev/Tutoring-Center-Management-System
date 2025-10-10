const express = require("express");
const adminController = require("../controllers/adminController");
const roomctrl = require("../controllers/roomController");
const courseCtrl = require("../controllers/courseController");
const centerCtrl = require("../controllers/centerController");
const route = express.Router();
//quan ly giao vien
route.get("/teachers", adminController.getListTeacher);
route.get("/teachers/:id",adminController.getTeacherDetail);
//quan ly room
route.post("/rooms",roomctrl.createRoom);
route.patch("/rooms/update/:id",roomctrl.updateRoom);
route.get("/rooms",roomctrl.listRoom);
route.delete("/rooms/:id/delete",roomctrl.deleteRoom);
//quan ly course
route.post("/courses",courseCtrl.createCourse)
route.patch("/courses/update/:id",courseCtrl.updateCourse);
route.get("/courses",courseCtrl.listCourses);
route.delete("/courses/:id/delete",courseCtrl.deleteCourse);
route.get("/courses/:id",courseCtrl.getCourse);
//quan ly center
route.get("/center/config",centerCtrl.getConfig);
route.patch("/center/config",centerCtrl.updateConfig);
module.exports = route;