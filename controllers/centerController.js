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
const VALID_SHIFT_NAMES = ["morning", "afternoon", "evening"];

const updateConfig = catchAsync(async (req, res, next) => {
  const { timezone, activeDaysOfWeek, shifts, dayShifts } = req.body;
  const payload = {};

  const currentConfig = (await Center.findOne({ key: "default" }).lean()) || {};

  if (timezone !== undefined) payload.timezone = timezone;

  if (activeDaysOfWeek !== undefined) {
    if (
      !Array.isArray(activeDaysOfWeek) ||
      !activeDaysOfWeek.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ) {
      return next(
        new AppError(
          "activeDaysOfWeek phải là mảng số nguyên trong [0..6]",
          400
        )
      );
    }
    payload.activeDaysOfWeek = activeDaysOfWeek;

    if (dayShifts === undefined) {
      const set = new Set(activeDaysOfWeek);
      const curr = currentConfig.dayShifts || [];
      payload.dayShifts = curr.filter((r) => set.has(r.dayOfWeek));
    }
  }

  if (shifts !== undefined) {
    let normalizedShifts;

    // Chuẩn hóa đầu vào `shifts` từ object hoặc array về dạng array duy nhất
    if (Array.isArray(shifts)) {
      normalizedShifts = shifts;
    } else if (typeof shifts === "object" && shifts !== null) {
      normalizedShifts = Object.entries(shifts).map(
        ([name, { startMinute, endMinute }]) => ({
          name,
          startMinute,
          endMinute,
        })
      );
    } else {
      return next(new AppError("Định dạng shifts không hợp lệ.", 400));
    }

    const shiftsMap = new Map(
      currentConfig.shifts?.map((s) => [s.name, s]) || []
    );

    for (const shift of normalizedShifts.filter(Boolean)) {
      const name = String(shift.name || "").toLowerCase();
      if (!VALID_SHIFT_NAMES.includes(name)) continue; // Bỏ qua ca không hợp lệ

      const { startMinute, endMinute } = shift;
      if (
        !isMinute(startMinute) ||
        !isMinute(endMinute) ||
        endMinute <= startMinute
      ) {
        return next(
          new AppError(
            `Shift '${name}' không hợp lệ (startMinute/endMinute)`,
            400
          )
        );
      }
      shiftsMap.set(name, { name, startMinute, endMinute });
    }

    // Sắp xếp lại mảng ca theo thứ tự chuẩn và loại bỏ các ca không tồn tại
    payload.shifts = VALID_SHIFT_NAMES.map((name) =>
      shiftsMap.get(name)
    ).filter(Boolean);
  }

  if (dayShifts !== undefined) {
    if (!Array.isArray(dayShifts)) {
      return next(new AppError("dayShifts phải là mảng.", 400));
    }

    const cleanedDayShifts = [];
    for (const row of dayShifts) {
      const day = Number(row?.dayOfWeek);
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        return next(new AppError("dayOfWeek phải trong [0..6].", 400));
      }

      const uniqueShifts = [
        ...new Set(
          (row.shifts || [])
            .map((s) => String(s || "").toLowerCase())
            .filter((s) => VALID_SHIFT_NAMES.includes(s))
        ),
      ];

      cleanedDayShifts.push({ dayOfWeek: day, shifts: uniqueShifts });
    }

    payload.dayShifts = cleanedDayShifts.sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek
    );
  }
  const updatedConfig = await Center.findOneAndUpdate(
    { key: "default" },
    { $set: payload },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  res.json({
    status: "success",
    data: { config: updatedConfig },
  });
});

module.exports = {
  getConfig,
  updateConfig,
};
