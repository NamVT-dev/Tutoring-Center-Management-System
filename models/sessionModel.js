const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },

    // Thời gian thực tế (UTC)
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true, index: true },
    timezone: { type: String, default: "Asia/Bangkok" },

    status: {
      type: String,
      enum: ["scheduled", "completed", "canceled"],
      default: "scheduled",
      index: true,
    },

    // Nguồn gốc: từ weekly hay one-off (tuỳ chọn)
    origin: { type: String, enum: ["weekly", "oneoff"], default: "weekly" },
  },
  { timestamps: true }
);

// Chống trùng GV/phòng theo thời gian: dùng query kiểm tra overlap trước khi insert
sessionSchema.index({ teacher: 1, startAt: 1, endAt: 1 });
sessionSchema.index({ room: 1, startAt: 1, endAt: 1 });
sessionSchema.index({ class: 1, startAt: 1 });

const Session = mongoose.model("Session", sessionSchema, "sessions");
module.exports = Session;
