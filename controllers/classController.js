const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { buildPaginatedQuery } = require("../utils/queryHelper");
const Class = require("../models/classModel");
const Session = require("../models/sessionModel");
const Center = require("../models/centerModel");
const mongoose = require("mongoose");
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


  const includeSet = new Set(String(include || "").split(",").map((s) => s.trim()).filter(Boolean));
  const populate = [];
  if (!include) includeSet.add("teacher"), includeSet.add("room");
  if (includeSet.has("course")) populate.push({ path: "course", select: "name level category" });
  if (includeSet.has("teacher")) populate.push({ path: "weeklySchedules.teacher", select: "profile.fullname" });
  if (includeSet.has("room")) populate.push({ path: "weeklySchedules.room", select: "name capacity" });

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