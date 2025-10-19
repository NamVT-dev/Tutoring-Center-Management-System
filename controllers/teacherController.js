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

  if (!Array.isArray(slots) || !slots.length)
    return next(new AppError("slots phải là mảng hợp lệ", 400));

  const cfg = await Center.findOne({ key: "default" }).lean();
  if (!cfg) {
    return next(new AppError("trung tâm chưa cấu hình ca hoạt động", 400));
  }
  const activeDays = new Set(cfg.activeDaysOfWeek || []);

  const normalized = [];
  for (const s of slots) {
    if (!isDay(s.dayOfWeek))
      return next(new AppError("dayOfWeek không hợp lệ", 400));
    if (!Array.isArray(s.shifts) || !s.shifts.length)
      return next(
        new AppError("shifts phải là mảng (morning/afternoon/evening)", 400)
      );
    if (!activeDays.has(s.dayOfWeek))
      return next(
        new AppError(
          `Ngày ${s.dayOfWeek} không nằm trong lịch hoạt động của trung tâm`,
          400
        )
      );

    const uniqShifts = [...new Set(s.shifts.map(String))];
    for (const sh of uniqShifts)
      if (!SHIFT_KEYS.has(sh))
        return next(new AppError(`Shift không hợp lệ: ${sh}`, 400));

    let eff;
    if (s.effective?.start || s.effective?.end) {
      const start = s.effective.start ? new Date(s.effective.start) : undefined;
      const end = s.effective.end ? new Date(s.effective.end) : undefined;
      if (end && start && end < start)
        return next(new AppError("effective.end phải >= effective.start", 400));
      eff = { start, end };
    }
    normalized.push({
      dayOfWeek: s.dayOfWeek,
      shifts: uniqShifts,
      effective: eff,
    });
  }

  // Gộp trùng ngày, giữ bản ghi cuối
  const compact = [
    ...new Map(normalized.map((i) => [i.dayOfWeek, i])).values(),
  ].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

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
