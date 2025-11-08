const mongoose = require("mongoose");

const customScheduleRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.ObjectId,
      ref: "Student", 
      required: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.ObjectId,
      ref: "Category",
      required: true,
    },
    course: {
      type: mongoose.Schema.ObjectId,
      ref: "Course",
    },
    preferredDays: {
      type: [Number], // [0..6]
      validate: (v) => v.every((d) => d >= 0 && d <= 6),
    },
    preferredShifts: {
      type: [String], 
    },
    note: String,
    status: {
      type: String,
      enum: ["open", "processed", "closed"],
      default: "open",
      index: true,
    },
    adminNote: String,
  },
  { timestamps: true }
);

const CustomScheduleRequest = mongoose.model(
  "CustomScheduleRequest",
  customScheduleRequestSchema,
  "custom_schedule_requests"
);

module.exports = CustomScheduleRequest;
