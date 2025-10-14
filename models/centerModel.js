const mongoose = require("mongoose");

const shiftSchema = new mongoose.Schema(
  {
    startMinute: { type: Number, min: 0, max: 1439, required: true },
    endMinute: { type: Number, min: 1, max: 1440, required: true },
  },
  { _id: false }
);

const centerSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "default" }, // singleton
  timezone: { type: String, default: "Asia/Bangkok" },
  activeDaysOfWeek: {
    type: [Number], // 0=CN .. 6=Th7
    default: [0, 1, 2, 3, 4, 5, 6], // mặc định: Th2..Cn
    validate: (v) => v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  },
  shifts: {
    morning: {
      type: shiftSchema,
      required: true,
      default: () => ({ startMinute: 8 * 60, endMinute: 12 * 60 }),
    },
    afternoon: {
      type: shiftSchema,
      required: true,
      default: () => ({ startMinute: 13 * 60, endMinute: 17 * 60 }),
    },
    evening: {
      type: shiftSchema,
      required: true,
      default: () => ({ startMinute: 18 * 60, endMinute: 22 * 60 }),
    },
  },
});
const Center = mongoose.model("Center", centerSchema, "centers");

module.exports = Center;
