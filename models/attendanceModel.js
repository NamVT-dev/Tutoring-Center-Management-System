const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  class: {
    type: mongoose.Schema.ObjectId,
    ref: "Class",
  },
  schedule: String,
  student: {
    type: [mongoose.Schema.ObjectId],
    ref: "User",
  },
  status: String,
  note: String,
});
const Attendance = mongoose.model(
  "Attendance",
  attendanceSchema,
  "attendances"
);

module.exports = Attendance;
