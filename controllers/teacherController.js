const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { Teacher } = require("../models/userModel");
const Center = require("../models/centerModel");
const Category = require("../models/categoryModel");
const { LEVEL_ORDER } = require("../utils/levels");
const Session = require("../models/sessionModel");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const Class = require("../models/classModel");
const Enrollment = require("../models/enrollmentModel");
const factory = require("./handlerFactory");

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
  if (!cfg.isAvailabilityOpen) {
    return next(
      new AppError(
        "Hệ thống đang KHÓA đăng ký lịch rảnh. Vui lòng liên hệ Admin nếu cần thay đổi gấp.",
        403
      )
    );
  }
  const definedShiftNames = new Set(
    (cfg.shifts || []).map((s) => String(s.name).toUpperCase())
  );
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
    if (!Array.isArray(s.shifts) || s.shifts.length === 0)
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
    if (r.effective) prev.effective = r.effective;
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
    .select("email availability skills")
    .lean();

  if (!teacher) return next(new AppError("Không tìm thấy giáo viên", 404));

  res.status(200).json({ status: "success", data: { teacher } });
});

const updateTeacherSkills = catchAsync(async (req, res, next) => {
  const teacherId = req.params.id;
  const { skills } = req.body;

  if (!Array.isArray(skills))
    return next(new AppError("skills phải là mảng không rỗng", 400));

  const normalizedSkills = [];
  const categoryIdsToValidate = [];

  for (const skill of skills) {
    if (!skill.category || !mongoose.Types.ObjectId.isValid(skill.category)) {
      return next(new AppError("Mỗi skill phải có 'category' ID hợp lệ", 400));
    }

    const levels = skill.levels || [];
    if (!Array.isArray(levels)) {
      return next(new AppError(`Trường 'levels' phải là mảng`, 400));
    }
    const LEVEL_SET = new Set(LEVEL_ORDER);
    const invalidLevels = levels.filter((l) => !LEVEL_SET.has(l));
    if (invalidLevels.length > 0) {
      return next(
        new AppError(`Các level không hợp lệ: ${invalidLevels.join(", ")}`, 400)
      );
    }

    categoryIdsToValidate.push(skill.category);
    normalizedSkills.push({
      category: skill.category,
      levels: levels,
      includeLowerLevels: !!skill.includeLowerLevels,
      anyLevel: !!skill.anyLevel,
    });
  }

  const uniqueCategoryIds = [...new Set(categoryIdsToValidate)];
  const foundCategoriesCount = await Category.countDocuments({
    _id: { $in: uniqueCategoryIds },
  });
  if (foundCategoriesCount !== uniqueCategoryIds.length) {
    return next(new AppError("category ID không tồn tại", 400));
  }

  const teacher = await Teacher.findOneAndUpdate(
    { _id: teacherId, role: "teacher" },
    {
      $set: {
        skills: normalizedSkills,
        teachCategories: [],
      },
    },
    { new: true, runValidators: true }
  )
    .select("email skills availability")
    .populate("skills.category", "name")
    .lean();

  if (!teacher) return next(new AppError("Không tìm thấy giáo viên", 404));

  res.status(200).json({
    status: "success",
    message: "Cập nhật kỹ năng dạy thành công",
    data: { teacher },
  });
});

const getMyClasses = catchAsync(async (req, res, next) => {
  const teacherId = req.user.id;

  const teacher = await Teacher.findById(teacherId)
    .select("class")
    .populate({
      path: "class",
      populate: {
        path: "course",
        select: "name level",
      },
    });

  if (!teacher) {
    return next(new AppError("Không tìm thấy hồ sơ giáo viên", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      teacher,
    },
  });
});

const getMySchedule = catchAsync(async (req, res, next) => {
  const teacherId = req.user.id;
  const timezone = "Asia/Ho_Chi_Minh";

  let { startDate, endDate } = req.query;
  const start = startDate
    ? moment.tz(startDate, timezone).startOf("day")
    : moment.tz(timezone).startOf("day");

  const end = endDate
    ? moment.tz(endDate, timezone).endOf("day")
    : start.clone().add(7, "days").endOf("day");

  const sessions = await Session.find({
    teacher: teacherId,
    status: { $in: ["scheduled", "published"] },
    startAt: {
      $gte: start.toDate(),
      $lte: end.toDate(),
    },
  })
    .populate({
      path: "class",
    })
    .populate({
      path: "room",
    })
    .sort({ startAt: 1 });

  res.status(200).json({
    status: "success",
    results: sessions.length,
    data: {
      sessions,
    },
  });
});

const getStudentClassDetail = catchAsync(async (req, res, next) => {
  const classId = req.params.id;
  const teacher = req.user;

  const [classInfo, sessions, enrollments] = await Promise.all([
    Class.findById(classId)
      .populate("course", "name level description")
      .populate("preferredTeacher", "profile.fullname")
      .lean(),

    Session.find({
      class: classId,
      status: { $in: ["scheduled", "published"] },
    })
      .populate("room", "name")
      .populate("teacher", "profile.fullname")
      .sort({ sessionNo: 1, startAt: 1 })
      .lean(),

    Enrollment.find({
      class: classId,
      status: "confirmed",
    })
      .select("student paidAt")
      .populate("student")
      .lean(),
  ]);

  if (!classInfo) {
    return next(new AppError("Không tìm thấy lớp học", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      classInfo,
      sessions,
      enrollments,
    },
  });
});

const getOneTeacher = factory.getOne(
  Teacher,
  "class",
  "-availability -updatedAt -passwordChangedAt -__v"
);

module.exports = {
  registerShiftAvailability,
  updateTeacherSkills,
  getMyClasses,
  getMySchedule,
  getStudentClassDetail,
  getOneTeacher,
};
