const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session",
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ["in-progress", "closed"],
    default: "in-progress",
  },
  attendance: [
    {
      student: {
        type: mongoose.Schema.ObjectId,
        ref: "Student",
      },
      status: { type: String, enum: ["present", "absent"], default: "absent" },
      note: String,
    },
  ],
});

const Attendance = mongoose.model(
  "Attendance",
  attendanceSchema,
  "attendances"
);

module.exports = Attendance;
