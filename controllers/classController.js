const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { buildPaginatedQuery } = require("../utils/queryHelper");
const Class = require("../models/classModel");
const Session = require("../models/sessionModel");
const Center = require("../models/centerModel");
const Course = require("../models/courseModel");
const {
  previewChangeTeacher,
  applyChangeTeacher,
} = require("../services/classChangeService");

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
      includeSet.add("course"));
  if (includeSet.has("course"))
    populate.push({ path: "course", select: "name level category" });
  if (includeSet.has("teacher"))
    populate.push({
      path: "weeklySchedules.teacher",
      select: "profile.fullname",
    });
  if (includeSet.has("room"))
    populate.push({ path: "weeklySchedules.room", select: "name capacity" });

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

  const classSelect =
    select ||
    "name classCode status course startAt endAt minStudent maxStudent preferredTeacher weeklySchedules createdAt";

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
