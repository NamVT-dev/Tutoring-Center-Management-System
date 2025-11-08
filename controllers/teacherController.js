const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { User, Teacher } = require("../models/userModel");
const Center = require("../models/centerModel");
const Course = require("../models/courseModel");

const SHIFT_KEYS = new Set(["morning", "afternoon", "evening"]);
const isDay = (n) => Number.isInteger(n) && n >= 0 && n <= 6;

// Cho phép giáo viên đăng ký ca dạy theo config trung tâm.
const registerShiftAvailability = catchAsync(async (req, res, next) => {
  const teacherId = req.user.id;
  const { slots } = req.body;

  if (!Array.isArray(slots) || slots.length === 0)
    return next(new AppError("slots phải là mảng hợp lệ", 400));

  const cfg = await Center.findOne({ key: "default" }).lean();
  if (!cfg) {
    return next(new AppError("trung tâm chưa cấu hình ca hoạt động", 400));
  }
  const activeDays = new Set(cfg.activeDaysOfWeek || []);
  const definedShiftNames = new Set(
    (cfg.shifts || []).map((s) => String(s.name).toUpperCase())
  ); // ví dụ: S1..S6
  const allowedByDay = new Map(
    (cfg.dayShifts || []).map((r) => [
      r.dayOfWeek,
      new Set((r.shifts || []).map((s) => String(s).toUpperCase())),
    ])
  );

  const normalized = [];
  for (const s of slots) {
    const day = Number(s?.dayOfWeek);
    if (!isDay(day)) return next(new AppError("dayOfWeek không hợp lệ", 400));
    if (!Array.isArray(s.shifts) || !s.shifts.length === 0)
      return next(new AppError("shifts phải là mảng theo ca", 400));
    const uniq = Array.from(
      new Set(s.shifts.map((x) => String(x).trim().toUpperCase()))
    ).filter((n) => definedShiftNames.has(n));

    if (uniq.length === 0) {
      return next(
        new AppError(
          "Không có ca hợp lệ. Vui lòng dùng đúng tên ca trong cấu hình trung tâm",
          400
        )
      );
    }

    // Chỉ cho đăng ký ca được mở trong ngày đó (theo cfg.dayShifts)
    const allowedSet = allowedByDay.get(day) || new Set();
    const notAllowed = uniq.filter((n) => !allowedSet.has(n));
    if (notAllowed.length) {
      return next(
        new AppError(
          `Các ca không được mở cho ngày ${day}: ${notAllowed.join(", ")}`,
          400
        )
      );
    }

    // Khoảng hiệu lực (tuỳ chọn)
    let eff;
    if (s.effective?.start || s.effective?.end) {
      const start = s.effective.start ? new Date(s.effective.start) : undefined;
      const end = s.effective.end ? new Date(s.effective.end) : undefined;
      if (end && start && end < start) {
        return next(new AppError("effective.end phải >= effective.start", 400));
      }
      eff = { start, end };
    }

    normalized.push({ dayOfWeek: day, shifts: uniq, effective: eff });
  }

  // Gộp trùng ngày theo UNION ca (tránh mất dữ liệu)
  const byDay = new Map();
  for (const r of normalized) {
    const prev = byDay.get(r.dayOfWeek) || {
      dayOfWeek: r.dayOfWeek,
      shifts: new Set(),
      effective: r.effective,
    };
    r.shifts.forEach((x) => prev.shifts.add(x));
    if (r.effective) prev.effective = r.effective; // giữ bản ghi effective mới nhất
    byDay.set(r.dayOfWeek, prev);
  }
  const compact = Array.from(byDay.values())
    .map((v) => ({
      dayOfWeek: v.dayOfWeek,
      shifts: Array.from(v.shifts),
      effective: v.effective,
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  const teacher = await Teacher.findOneAndUpdate(
    { _id: teacherId, role: "teacher" },
    { $set: { availability: compact } },
    { new: true, runValidators: true }
  )
    .select("email availability teachCategories")
    .lean();

  if (!teacher) return next(new AppError("Không tìm thấy giáo viên", 404));

  res.status(200).json({ status: "success", data: { teacher } });
});

const registerTeachCategories = catchAsync(async (req, res, next) => {
  const teacherId = req.user.id;
  const { categories } = req.body;

  if (!Array.isArray(categories) || !categories.length)
    return next(new AppError("categories phải là mảng không rỗng", 400));

  const normalized = [...new Set(categories.map((s) => String(s).trim()))];
  const validCategories = await Course.distinct("category", {
    category: { $ne: null },
  });

  const invalid = normalized.filter((c) => !validCategories.includes(c));
  if (invalid.length)
    return next(
      new AppError(`Category không hợp lệ: ${invalid.join(", ")}`, 400)
    );

  const teacher = await Teacher.findOneAndUpdate(
    { _id: teacherId, role: "teacher" },
    { $set: { teachCategories: normalized } },
    { new: true, runValidators: true }
  )
    .select("email teachCategories availability")
    .lean();

  if (!teacher) return next(new AppError("Không tìm thấy giáo viên", 404));
  res.status(200).json({
    status: "success",
    message: "Cập nhật môn dạy thành công",
    data: { teacher },
  });
});

module.exports = {
  registerShiftAvailability,
  registerTeachCategories,
};
