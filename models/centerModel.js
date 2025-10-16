const mongoose = require("mongoose");

const shiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ["morning", "afternoon", "evening"],
      require: true,
    },
    startMinute: {
      type: Number,
      min: 0,
      max: 1439,
      required: true,
    },
    endMinute: {
      type: Number,
      min: 1,
      max: 1440,
      required: true,
      validate: {
        validator: function (v) {
          return v > this.startMinute;
        },
        message: "endMinute > startMinute",
      },
    },
  },
  { _id: false }
);

const dayShiftSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
      required: true, // 0=CN, 6=Th7
    },
    shifts: [
      {
        type: String,
        enum: ["morning", "afternoon", "evening"],
      },
    ],
  },
  { _id: false }
);

const centerSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: "default",
    },
    timezone: {
      type: String,
      default: "Asia/Bangkok",
    },
    activeDaysOfWeek: {
      type: [Number], // 0=CN .. 6=Th7
      default: [1, 2, 3, 4, 5, 6, 0],
      validate: (v) => v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    },
    // Quy định khung giờ cho 3 ca cố định
    shifts: {
      type: [shiftSchema],
      required: true,
      default: [
        { name: "morning", startMinute: 480, endMinute: 720 }, // 8h-12h
        { name: "afternoon", startMinute: 780, endMinute: 1020 }, // 13h-17h
        { name: "evening", startMinute: 1080, endMinute: 1320 }, // 18h-22h
      ],
    },

    dayShifts: {
      type: [dayShiftSchema],
    },
  },
  { minimize: false }
);
const Center = mongoose.model("Center", centerSchema, "centers");

module.exports = Center;
