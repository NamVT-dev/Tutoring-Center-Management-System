const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");
const { buildPaginatedQuery } = require("../utils/queryHelper");
const Class = require("../models/classModel");
const Session = require("../models/sessionModel");
const Center = require("../models/centerModel");
const { Teacher } = require("../models/userModel");
const factory = require("./handlerFactory");

const {
  previewChangeTeacher,
  applyChangeTeacher,
} = require("../services/classChangeService");
const Student = require("../models/studentModel");
const Attendance = require("../models/attendanceModel");
const Enrollment = require("../models/enrollmentModel");

function findShiftByName(centerConfig, shiftName) {
  return (centerConfig?.shifts || []).find((s) => s.name === shiftName) || null;
}

exports.listClasses = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    course,
    teacher,
    room,
    dayOfWeek,
    shift,
    startFrom,
    endTo,
    include,
  } = req.query;

  const filters = {};

  if (status) filters.status = status;

  if (course) {
    if (!mongoose.Types.ObjectId.isValid(course)) {
      return next(new AppError("ID của course không hợp lệ", 400));
    }
    filters.course = course;
  }

  if (teacher) {
    if (!mongoose.Types.ObjectId.isValid(teacher)) {
      return next(new AppError("ID của teacher không hợp lệ", 400));
    }
    filters["weeklySchedules.teacher"] = new mongoose.Types.ObjectId(teacher);
  }
  if (room) {
    if (!mongoose.Types.ObjectId.isValid(room)) {
      return next(new AppError("ID của room không hợp lệ", 400));
    }
    filters["weeklySchedules.room"] = new mongoose.Types.ObjectId(room);
  }
  if (dayOfWeek !== undefined) {
    const dow = Number(dayOfWeek);
    if (!Number.isNaN(dow)) {
      filters["weeklySchedules.dayOfWeek"] = dow;
    }
  }

  if (shift) {
    const centerConfig = await Center.findOne({ key: "default" }).lean();
    const s = findShiftByName(centerConfig, shift);
    if (!s) return next(new AppError("Tên shift không hợp lệ", 400));
    filters["weeklySchedules.startMinute"] = { $gte: s.startMinute };
    filters["weeklySchedules.endMinute"] = { $lte: s.endMinute };
  }

  if (startFrom || endTo) {
    filters.$and = [];
    if (startFrom) filters.$and.push({ endAt: { $gte: new Date(startFrom) } });
    if (endTo) filters.$and.push({ startAt: { $lte: new Date(endTo) } });
    if (filters.$and.length === 0) delete filters.$and;
  }

  const { finalQuery, paginationOptions } = buildPaginatedQuery({
    query: req.query,
    filters,
    search: search,
    searchFields: ["name", "classCode"],
    page: Number(page),
    limit: Number(limit),
    select:
      req.query.select ||
      "name classCode status course startAt endAt minStudent maxStudent weeklySchedules preferredTeacher createdAt",
    sort: req.query.sort || "startAt",
  });

  const includeSet = new Set(
    String(include || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const populate = [];
  if (!include)
    (includeSet.add("teacher"),
      includeSet.add("room"),
      includeSet.add("course"),
      includeSet.add("preferredTeacher"));
  if (includeSet.has("course"))
    populate.push({ path: "course", select: "name level category" });
  if (includeSet.has("teacher"))
    populate.push({
      path: "weeklySchedules.teacher",
      select: "profile.fullname",
    });
  if (includeSet.has("room"))
    populate.push({ path: "weeklySchedules.room", select: "name capacity" });
  if (includeSet.has("preferredTeacher")) {
    populate.push({ path: "preferredTeacher", select: "profile.fullname" });
  }
  const [total, classes] = await Promise.all([
    Class.countDocuments(finalQuery),
    Class.find(finalQuery)
      .skip(paginationOptions.skip)
      .limit(paginationOptions.limit)
      .select(paginationOptions.select)
      .sort(paginationOptions.sort)
      .populate(populate)
      .lean(),
  ]);

  res.status(200).json({
    status: "success",
    results: classes.length,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit || 10)),
    data: { classes },
  });
});
exports.getClassDetail = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const {
    include,
    select,
    withSessions = "true",
    sessionFrom,
    sessionTo,
    sessionLimit = 50,
    sessionSort,
    sessionSelect,
  } = req.query;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError("ID của class không hợp lệ", 400));
  }

  const includeSet = new Set(
    String(include || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  if (!include) {
    includeSet.add("teacher");
    includeSet.add("room");
    includeSet.add("course");
    includeSet.add("student");
  }

  const populate = [];
  if (includeSet.has("course")) {
    populate.push({ path: "course", select: "name level category session" });
  }
  if (includeSet.has("teacher")) {
    populate.push({
      path: "weeklySchedules.teacher",
      select: "profile.fullname email",
    });
  }
  if (includeSet.has("room")) {
    populate.push({ path: "weeklySchedules.room", select: "name capacity" });
  }
  if (includeSet.has("student")) {
    populate.push({
      path: "student",
    });
  }

  const classSelect =
    select ||
    "name classCode status course startAt endAt minStudent maxStudent preferredTeacher weeklySchedules createdAt student";

  const cls = await Class.findById(id)
    .select(classSelect)
    .populate(populate)
    .lean();
  if (!cls) {
    return next(new AppError("Không tìm thấy lớp", 404));
  }

  let sessions = [];
  if (withSessions === "true") {
    const sQuery = { class: id };
    if (sessionFrom || sessionTo) {
      sQuery.startAt = {};
      if (sessionFrom) sQuery.startAt.$gte = new Date(sessionFrom);
      if (sessionTo) sQuery.startAt.$lte = new Date(sessionTo);
      if (!Object.keys(sQuery.startAt).length) delete sQuery.startAt;
    }

    const sSort = sessionSort === "-startAt" ? { startAt: -1 } : { startAt: 1 };
    const sSelect =
      sessionSelect || "sessionNo startAt endAt status origin room teacher";

    sessions = await Session.find(sQuery)
      .select(sSelect)
      .sort(sSort)
      .limit(Number(sessionLimit) || 50)
      .populate({ path: "teacher", select: "profile.fullname" })
      .populate({ path: "room", select: "name capacity" })
      .lean();
  }

  res.status(200).json({
    status: "success",
    data: {
      class: cls,
      sessions,
    },
  });
});

exports.previewChangeTeacher = catchAsync(async (req, res) => {
  const result = await previewChangeTeacher({
    classId: req.params.id,
    newTeacher: req.body.newTeacher,
    scope: req.body.scope || {},
    check: req.body.check || { skill: true, conflict: true },
  });
  res.status(200).json({ status: "success", preview: result });
});

exports.applyChangeTeacher = catchAsync(async (req, res) => {
  const result = await applyChangeTeacher({
    classId: req.params.id,
    newTeacher: req.body.newTeacher,
    scope: req.body.scope || {},
    check: req.body.check || { skill: true, conflict: true },
    updatePreferred: !!req.body.updatePreferred,
    allowBlocked: !!req.body.allowBlocked,
  });
  res.status(200).json({ status: "success", applied: result });
});
exports.cancelClass = catchAsync(async (req, res, next) => {
  const classId = req.params.id;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const classToCancel = await Class.findById(classId).session(session);
    if (!classToCancel) {
      throw new AppError("Không tìm thấy lớp học", 404);
    }
    if (classToCancel.status === "canceled") {
      throw new AppError("Lớp này đã bị hủy trước đó", 400);
    }
    const hasConfirmed =
      classToCancel.student && classToCancel.student.length > 0;
    const hasHolding = classToCancel.reservedCount > 0;

    if (hasConfirmed || hasHolding) {
      throw new AppError(
        "Không thể hủy. Lớp đã có học viên (confirmed hoặc holding). Vui lòng chuyển học viên trước.",
        400
      );
    }
    classToCancel.status = "canceled";
    const teacherId = classToCancel.preferredTeacher;
    await Promise.all([
      // Lưu trạng thái Class
      classToCancel.save({ session }),

      // Hủy tất cả Sessions liên quan
      Session.updateMany(
        { class: classId },
        { $set: { status: "canceled" } },
        { session }
      ),

      // Gỡ lớp khỏi Giáo viên
      Teacher.findByIdAndUpdate(
        teacherId,
        { $pull: { class: classId } },
        { session }
      ),
    ]);
    await session.commitTransaction();
    res.status(200).json({
      status: "success",
      message: "Lớp học và các buổi học liên quan đã được hủy thành công.",
      data: {
        class: classToCancel,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});
exports.createClass = catchAsync(async (req, res) => {
  const doc = await Class.create(req.body);
  const teacher = await Teacher.findById(req.body.preferredTeacher);
  teacher.class.push(doc.id);
  teacher.save({ validateBeforeSave: false });

  res.status(201).json({
    status: "success",
    data: {
      data: doc,
    },
  });
});
exports.updateClass = factory.updateOne(Class);
exports.deleteClass = factory.deleteOne(Class);

exports.createManySession = factory.createMany(Session);

exports.addStudent = catchAsync(async (req, res, next) => {
  const addClass = await Class.findById(req.params.id).populate("course");
  if (!addClass) return next(new AppError("Không tìm thấy lớp học", 404));

  const student = await Student.findById(req.body.studentId);
  if (!student) return next(new AppError("Không tìm thấy học viên", 404));

  const enrollment = await Enrollment.findOne({
    student,
    status: { $ne: "canceled" },
  });
  if (!enrollment)
    return next(new AppError("Không tìm thấy enrollment của học viên", 404));

  enrollment.class = addClass.id;
  enrollment.status = "confirmed";
  await enrollment.save();

  if (addClass.student.includes(student.id))
    return next(new AppError("Lớp đã tồn tại học viên đó", 400));
  if (addClass.student.length >= addClass.course.maxStudent)
    return next(new AppError("Lớp học đã đạt số lượng tối đa", 400));

  //Add student to class
  addClass.student.push(student.id);
  await addClass.save();

  //Add class to student
  student.class.push(addClass.id);
  student.enrolled = true;
  await student.save();

  const attendances = await Attendance.find()
    .populate({
      path: "session",
      match: { class: req.params.id },
    })
    .exec();

  const filtered = attendances.filter((a) => !!a.session);
  filtered.forEach((a) => {
    a.attendance.push({
      student: student.id,
      status: "absent",
      note: "đăng kí muộn",
    });
    a.save();
  });

  res.status(200).json({
    status: "success",
    data: {
      class: addClass,
    },
  });
});

exports.removeStudent = catchAsync(async (req, res, next) => {
  const removeClass = await Class.findById(req.params.id);
  if (!removeClass) return next(new AppError("Không tìm thấy lớp", 404));
  const student = await Student.findById(req.body.studentId);
  if (!student) return next(new AppError("Không tìm thấy học viên", 404));
  if (removeClass.startAt.getTime() < Date.now())
    return next(new AppError("Lớp học đã diễn ra", 400));
  if (!removeClass.student.includes(student.id.toString()))
    return next(new AppError("Lớp học không có học viên này", 400));

  //Remove student from class
  removeClass.student = removeClass.student.filter(
    (s) => s.toString() !== student.id.toString()
  );
  await removeClass.save();

  //Remove class from student
  student.enrolled = false;
  student.class = student.class.filter(
    (cl) => cl.toString() !== removeClass.id.toString()
  );

  await student.save();

  //Change enrollment status
  const enrollment = await Enrollment.findOne({
    student: student,
    class: removeClass,
  });

  if (!enrollment)
    return next(
      new AppError(
        "Đã xóa học viên khỏi lớp nhưng không tìm thấy enrollment",
        400
      )
    );

  enrollment.status = "removed";
  await enrollment.save();

  res.status(200).json({
    status: "success",
    message: "Gỡ học viên khỏi lớp thành công!",
  });
});
