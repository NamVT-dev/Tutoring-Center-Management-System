const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session",
    required: true,
  },
  student: {
    type: [mongoose.Schema.ObjectId],
    ref: "User",
  },
  status: { type: String, enum: ["present", "absent"], default: "absent" },
  note: String,
});
const Attendance = mongoose.model(
  "Attendance",
  attendanceSchema,
  "attendances"
);

module.exports = Attendance;
