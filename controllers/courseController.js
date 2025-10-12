const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { buildPaginatedQuery } = require("../utils/queryHelper");
const Course = require("../models/courseModel");
const Class = require("../models/classModel");
const Session = require("../models/sessionModel");

const createCourse = catchAsync(async (req, res, next) => {
  const {
    name,
    description,
    price,
    category,
    level,
    session,
    durationInMinutes,
    imageCover,
  } = req.body;
  if (!name) return next(new AppError("Thiếu name", 400));
  if (!Number.isInteger(+session) || +session < 1)
    return next(new AppError("session phải là số nguyên ≥ 1", 400));
  if (!Number.isInteger(+durationInMinutes) || +durationInMinutes < 15) {
    return next(new AppError("durationInMinutes phải ≥ 15", 400));
  }

  try {
    const course = await Course.create({
      name: String(name).trim(),
      description,
      price: price ?? undefined,
      category,
      level,
      session: +session,
      durationInMinutes: +durationInMinutes,
      imageCover,
    });
    res.status(201).json({ status: "success", data: { course } });
  } catch (err) {
    if (err.code === 11000)
      return next(new AppError(`Khoá học "${name}" đã tồn tại`, 409));
    throw err;
  }
});

const updateCourse = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const payload = { ...req.body };
  if (payload.name !== undefined) payload.name = String(payload.name).trim();
  if (payload.session !== undefined) payload.session = +payload.session;
  if (payload.durationInMinutes !== undefined)
    payload.durationInMinutes = +payload.durationInMinutes;

  try {
    const course = await Course.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
      context: "query",
    });
    if (!course) return next(new AppError("Không tìm thấy khoá học", 404));
    res.json({ status: "success", data: { course } });
  } catch (err) {
    if (err.code === 11000)
      return next(new AppError(`Tên khoá học đã tồn tại`, 409));
    throw err;
  }
});

const getCourse = catchAsync(async (req, res, next) => {
  const course = await Course.findById(req.params.id).lean();
  if (!course) return next(new AppError("Không tìm thấy khoá học", 404));
  res.json({ status: "success", data: { course } });
});

const listCourses = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    level,
    category,
    minPrice,
    maxPrice,
  } = req.query;

  const filters = {};
  if (level) filters.level = level;
  if (category) filters.category = category;
  if (minPrice || maxPrice) {
    filters.price = {};
    if (minPrice) filters.price.$gte = +minPrice;
    if (maxPrice) filters.price.$lte = +maxPrice;
  }

  const { finalQuery, paginationOptions } = buildPaginatedQuery({
    query: req.query,
    filters,
    searchFields: ["name", "description", "category", "level"],
    page: Number(page),
    limit: Number(limit),

    select:
      "name description price category level session durationInMinutes imageCover createdAt",
    sort: req.query.sort || "name",
  });

  const [total, courses] = await Promise.all([
    Course.countDocuments(finalQuery),
    Course.find(finalQuery)
      .skip(paginationOptions.skip)
      .limit(paginationOptions.limit)
      .select(paginationOptions.select)
      .sort(paginationOptions.sort)
      .lean(),
  ]);

  res.status(200).json({
    status: "success",
    results: courses.length,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit || 10)),
    data: { courses },
  });
});

const deleteCourse = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // chặn xoá nếu đang được dùng
  const [existClass, existSession] = await Promise.all([
    Class.exists({ course: id }),
    Session.exists({
      course: id,
      status: "scheduled",
      endAt: { $gte: new Date() },
    }),
  ]);
  if (existClass)
    return next(
      new AppError("Khoá học đang được sử dụng bởi Class. Không thể xoá.", 409)
    );
  if (existSession)
    return next(
      new AppError("Khoá học đang có Session sắp diễn ra. Không thể xoá.", 409)
    );

  const deleted = await Course.findByIdAndDelete(id);
  if (!deleted) return next(new AppError("Không tìm thấy khoá học", 404));

  res.json({
    status: "success",
    message: "Đã xoá khoá học",
    data: { courseId: id },
  });
});

module.exports = {
  createCourse,
  updateCourse,
  listCourses,
  getCourse,
  deleteCourse,
};
