const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const User = require("../models/userModel");

function isValidDayIndex(n) {
  return Number.isInteger(n) && n >= 0 && n <= 6;
}

function asDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

//body nhận về 2 kiểu {"days" :[0,1,2,3,4,5,6]} ,
// { "days": [{ "dayOfWeek":1,
// "effective":{ "start":"2025-10-01","end":"2025-12-31"} }, 3, 5] }

const updateMyAvailabilityDays = catchAsync(async (req, res, next) => {
  //const teacherId = req.user.id;
  const teacherId = "68e01abbc1e0643a71331525";
  const payload = req.body?.days;
  if (!Array.isArray(payload) || payload.length === 0) {
    return next(
      new AppError("days phải là mảng ngày trong tuần (0 = CN... 6 =th7)", 400)
    );
  }

  const normalized = [];
  for (const item of payload) {
    if (typeof item === "number") {
      if (!isValidDayIndex(item))
        throw new AppError(`dayOfWeek không hợp lệ: ${d}`, 400);
      normalized.push({ dayOfWeek: item, allowed: true });
    } else if (item && typeof item === "object") {
      const d = item.dayOfWeek;
      if (!isValidDayIndex(d))
        throw new AppError(`dayOfWeek không hợp lệ: ${d}`, 400);
      let effStart = null,
        effEnd = null;
      if (item.effective?.start) {
        effStart = asDateOrNull(item.effective.start);
        if (!effStart) throw new AppError("effective.start không hợp lệ", 400);
      }
      if (item.effective?.end) {
        effEnd = asDateOrNull(item.effective.end);
        if (!effEnd) throw new AppError("effective.end không hợp lệ", 400);
      }
      if (effStart && effEnd && effEnd < effStart) {
        throw new AppError("effective.end phải >= effective.start", 400);
      }
      normalized.push({
        dayOfWeek: d,
        allowed: item.allowed !== false,
        effective:
          effStart || effEnd
            ? { start: effStart || undefined, end: effEnd || undefined }
            : undefined,
      });
    } else {
      throw new AppError(
        "Mỗi phần tử trong days phải là số (0..6) hoặc object {dayOfWeek,...}",
        400
      );
    }
  }
  const map = new Map();
  for (const it of normalized) map.set(it.dayOfWeek, it);
  const compact = [...map.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  const allowedCount = compact.filter((x) => x.allowed !== false).length;
  if (allowedCount < 3) {
    return next(
      new AppError("Phải đăng ký ít nhất 3 ngày có thể dạy/tuần", 400)
    );
  }
  const teacher = await User.findOneAndUpdate(
    { _id: teacherId, role: "teacher" },
    { $set: { availability: compact } },
    { new: true, runValidators: true, context: "query" }
  )
    .select("username email role availability")
    .lean();

  if (!teacher) return next(new AppError("Không tìm thấy giáo viên", 404));

  res.status(200).json({ status: "success", data: { teacher } });
});

module.exports = {
  updateMyAvailabilityDays,
};
