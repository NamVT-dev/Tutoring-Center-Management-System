const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Center = require("../models/centerModel");

const getConfig = catchAsync(async (req, res) => {
  const cfg = await Center.findOne({ key: "default" }).lean();
  res.json({
    status: "success",
    data: { config: cfg },
  });
});
const isMinute = (x) => Number.isInteger(x) && x >= 0 && x <= 1440;

const updateConfig = catchAsync(async (req, res, next) => {
  const { timezone, activeDaysOfWeek, shifts } = req.body;

  if (
    activeDaysOfWeek &&
    !activeDaysOfWeek.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  ) {
    return next(
      new AppError("activeDaysOfWeek phải là mảng số trong [0..6]", 400)
    );
  }
  if (shifts) {
    for (const k of ["morning", "afternoon", "evening"]) {
      if (!shifts[k]) continue;
      const { startMinute, endMinute } = shifts[k];
      if (
        !isMinute(startMinute) ||
        !isMinute(endMinute) ||
        endMinute <= startMinute
      ) {
        return next(
          new AppError(`Shift ${k} không hợp lệ (startMinute/endMinute)`, 400)
        );
      }
    }
  }

  const payload = {};
  if (timezone !== undefined) payload.timezone = timezone;
  if (activeDaysOfWeek !== undefined)
    payload.activeDaysOfWeek = activeDaysOfWeek;
  if (shifts !== undefined) {
    payload.shifts = {};
    for (const k of ["morning", "afternoon", "evening"]) {
      payload.shifts[k] = shifts[k] || undefined;
    }
  }
  const cfg = await Center.findOneAndUpdate(
    { key: "default" },
    { $set: payload },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  res.json({
    status: "success",
    data: { config: cfg },
  });
});

module.exports = {
  getConfig,
  updateConfig,
};
