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
const VALID_SHIFT_NAMES = ["S1", "S2", "S3", "S4", "S5", "S6"];

const normalizeShiftName = (s) => {
  const up = String(s || "")
    .trim()
    .toUpperCase();
  return VALID_SHIFT_NAMES.includes(up) ? up : null;
};
const updateConfig = catchAsync(async (req, res, next) => {
  const { timezone, activeDaysOfWeek, shifts, dayShifts } = req.body;
  const payload = {};

  const currentConfig = (await Center.findOne({ key: "default" }).lean()) || {};

  let nextActiveDays = currentConfig.activeDaysOfWeek || [];
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
    // unique + sort tăng dần
    nextActiveDays = Array.from(new Set(activeDaysOfWeek)).sort(
      (a, b) => a - b
    );
    payload.activeDaysOfWeek = nextActiveDays;

    // nếu không gửi dayShifts mới, tự đồng bộ dayShifts theo ngày còn hoạt động
    if (dayShifts === undefined) {
      const set = new Set(nextActiveDays);
      const curr = currentConfig.dayShifts || [];
      const filtered = curr.filter((r) => set.has(r.dayOfWeek));

      // đảm bảo có record rỗng cho ngày mới thêm mà chưa có
      const have = new Set(filtered.map((r) => r.dayOfWeek));
      for (const d of nextActiveDays) {
        if (!have.has(d)) filtered.push({ dayOfWeek: d, shifts: [] });
      }
      payload.dayShifts = filtered.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    }
  }

  // 2) shifts (định nghĩa 6 ca S1..S6)
  if (shifts !== undefined) {
    let normalizedShifts;

    // chấp nhận array hoặc object map
    if (Array.isArray(shifts)) {
      normalizedShifts = shifts;
    } else if (typeof shifts === "object" && shifts !== null) {
      normalizedShifts = Object.entries(shifts).map(([name, v]) => ({
        name,
        startMinute: v?.startMinute,
        endMinute: v?.endMinute,
      }));
    } else {
      return next(new AppError("Định dạng shifts không hợp lệ.", 400));
    }

    // build map từ config hiện tại (giữ lại giá trị cũ nếu không gửi mới)
    const shiftsMap = new Map(
      (currentConfig.shifts || []).map((s) => [
        s.name.toUpperCase(),
        { ...s, name: s.name.toUpperCase() },
      ])
    );

    for (const s of normalizedShifts.filter(Boolean)) {
      const raw = normalizeShiftName(s.name);
      if (!raw) continue; // bỏ qua ca không hợp lệ
      const startMinute = Number(s.startMinute);
      const endMinute = Number(s.endMinute);
      if (
        !isMinute(startMinute) ||
        !isMinute(endMinute) ||
        endMinute <= startMinute
      ) {
        return next(
          new AppError(
            `Shift '${raw}' không hợp lệ (startMinute/endMinute)`,
            400
          )
        );
      }
      shiftsMap.set(raw, { name: raw, startMinute, endMinute });
    }

    // xuất ra theo thứ tự chuẩn, chỉ lấy các ca hợp lệ
    payload.shifts = VALID_SHIFT_NAMES.map((n) => shiftsMap.get(n)).filter(
      Boolean
    );

    // kiểm tra chồng lấn giờ giữa các ca
    for (let i = 0; i < payload.shifts.length; i++) {
      for (let j = i + 1; j < payload.shifts.length; j++) {
        const a = payload.shifts[i],
          b = payload.shifts[j];
        const overlap = !(
          a.endMinute <= b.startMinute || b.endMinute <= a.startMinute
        );
        if (overlap) {
          return next(
            new AppError(
              `Khoảng thời gian của ${a.name} chồng lấn ${b.name}`,
              400
            )
          );
        }
      }
    }
  }

  // 3) dayShifts
  if (dayShifts !== undefined) {
    if (!Array.isArray(dayShifts)) {
      return next(new AppError("dayShifts phải là mảng.", 400));
    }

    // hợp nhất theo dayOfWeek
    const byDay = new Map();
    for (const row of dayShifts) {
      const day = Number(row?.dayOfWeek);
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        return next(new AppError("dayOfWeek phải trong [0..6].", 400));
      }
      const rawShifts = Array.isArray(row?.shifts) ? row.shifts : [];
      const norm = rawShifts.map(normalizeShiftName).filter(Boolean);

      const prev = byDay.get(day) || new Set();
      norm.forEach((s) => prev.add(s));
      byDay.set(day, prev);
    }

    // nếu đồng thời cũng đổi activeDaysOfWeek, chỉ giữ ngày hoạt động
    const active =
      payload.activeDaysOfWeek || currentConfig.activeDaysOfWeek || [];

    const cleanedDayShifts = [];
    for (const d of active.sort((a, b) => a - b)) {
      const shiftsSet = byDay.get(d) || new Set();
      cleanedDayShifts.push({ dayOfWeek: d, shifts: Array.from(shiftsSet) });
    }

    const allowedShiftNames = new Set(
      (payload.shifts || currentConfig.shifts || []).map((s) =>
        s.name.toUpperCase()
      )
    );
    for (const r of cleanedDayShifts) {
      r.shifts = r.shifts.filter((n) => allowedShiftNames.has(n));
    }

    payload.dayShifts = cleanedDayShifts;
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
