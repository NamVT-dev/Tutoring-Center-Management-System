const mongoose = require("mongoose");

const shiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      require: true,
      trim: true,
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
      default: "Asia/Ho_Chi_Minh",
    },
    activeDaysOfWeek: {
      type: [Number], // 0=CN .. 6=Th7
      default: [1, 2, 3, 4, 5, 6, 0],
      validate: (v) => v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    },
    // Quy định khung giờ cho 6 ca cố định
    shifts: {
      type: [shiftSchema],
      required: true,
      default: [
        { name: "S1", startMinute: 480, endMinute: 590 }, // 8h-9h50
        { name: "S2", startMinute: 600, endMinute: 710 }, // 10h-11h50
        { name: "S3", startMinute: 780, endMinute: 890 }, // 13h-14h50
        { name: "S4", startMinute: 900, endMinute: 1010 }, // 15h-16h50
        { name: "S5", startMinute: 1080, endMinute: 1190 }, // 18h-19h50
        { name: "S6", startMinute: 1200, endMinute: 1310 }, // 20h-21h50
      ],
    },

    dayShifts: {
      type: [dayShiftSchema],
    },
    isScheduling: { type: Boolean, default: false },
  },
  { minimize: false }
);
const Center = mongoose.model("Center", centerSchema, "centers");

module.exports = Center;
