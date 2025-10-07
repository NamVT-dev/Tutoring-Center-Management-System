const express = require("express");
const adminController = require("../controllers/adminController");
const roomctrl = require("../controllers/roomController");
const route = express.Router();
//quan ly giao vien
route.get("/teachers", adminController.getListTeacher);
route.get("/teachers/:id",adminController.getTeacherDetail);
//quan ly room
route.post("/rooms",roomctrl.createRoom);
route.patch("/rooms/update/:id",roomctrl.updateRoom);
route.get("/rooms",roomctrl.listRoom);
route.delete("/rooms/:id/delete",roomctrl.deleteRoom);
module.exports = route;