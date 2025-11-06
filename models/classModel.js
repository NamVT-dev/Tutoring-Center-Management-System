const mongoose = require("mongoose");

const weeklySlotSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    startMinute: { type: Number, min: 0, max: 1439, required: true },
    endMinute: { type: Number, min: 1, max: 1440, required: true },
    effective: {
      start: Date,
      end: Date,
    },
    // tuỳ chọn khoá cứng phòng/GV cho slot này
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const oneOffScheduleSchema = new mongoose.Schema(
  {
    startAt: { type: Date, required: true }, // UTC
    endAt: { type: Date, required: true }, // UTC
    timezone: { type: String, default: "Asia/Bangkok" },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: {
      type: String,
      enum: ["extra", "cancel", "reschedule"],
      default: "extra",
    },
  },
  { _id: false }
);

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  classCode: {
    type: String,
    unique: true,
    index: true,
  },
  course: {
    type: mongoose.Schema.ObjectId,
    ref: "Course",
  },
  progress: String,
  weeklySchedules: [weeklySlotSchema],
  // Buổi phát sinh theo ngày cụ thể (bù/huỷ/đổi)
  oneOffSchedules: [oneOffScheduleSchema],
  startAt: {
    type: Date,
    index: true,
  },
  endAt: {
    type: Date,
    index: true,
  },
  minStudent: Number,
  maxStudent: Number,
  learningMaterial: String,
  // Ưu tiên GV chính (nếu có)
  preferredTeacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User" },
  scheduleSignature: {
    type: String,
    unique: true,
    sparse: true },
  createdByJob: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ScheduleJob",
    index: true,
  },
  status: {
    type: String,
    enum: ["approved", "archived", "canceled"],
    default: "approved",
    index: true,
  },
});
const Class = mongoose.model("Class", classSchema, "classes");

module.exports = Class;
