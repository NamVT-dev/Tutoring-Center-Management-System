const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const CustomScheduleRequest = require("../models/customScheduleRequestModel");
const Student = require("../models/studentModel");
const Course = require("../models/courseModel");
const factory = require("./handlerFactory");
const APIFeatures = require("../utils/apiFeatures");

exports.getAllCustomRequests = catchAsync(async (req, res) => {
  const features = new APIFeatures(CustomScheduleRequest.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate()
    .search();

  const totalDocuments = await features.countDocuments(CustomScheduleRequest);

  const popOptions = [
    { path: "student", select: "name email user" },
    { path: "category", select: "name" },
    { path: "course", select: "name level" },
  ];

  const doc = await features.query.populate(popOptions);

  const limit = req.query.limit * 1 || 100;
  const totalPages = Math.ceil(totalDocuments / limit);

  res.status(200).json({
    status: "success",
    results: doc.length,
    totalPages,
    data: {
      data: doc,
    },
  });
});

exports.getOneCustomRequest = factory.getOne(CustomScheduleRequest, [
  { path: "student", select: "name email" },
  { path: "category", select: "name" },
  { path: "course", select: "name level" },
]);
exports.updateCustomRequest = catchAsync(async (req, res, next) => {
  const { status, adminNote } = req.body;
  const updates = {};

  if (status) {
    if (!["open", "processed", "closed"].includes(status)) {
      return next(new AppError(`Trạng thái "${status}" không hợp lệ.`, 400));
    }
    updates.status = status;
  }

  if (adminNote !== undefined) {
    updates.adminNote = adminNote;
  }

  if (Object.keys(updates).length === 0) {
    return next(
      new AppError("Vui lòng cung cấp 'status' hoặc 'adminNote'.", 400)
    );
  }

  const request = await CustomScheduleRequest.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).populate("student category course");

  if (!request) {
    return next(new AppError("Không tìm thấy yêu cầu với ID này.", 404));
  }

  res.status(200).json({
    status: "success",
    data: { request },
  });
});
exports.deleteOneCustomRequest = factory.deleteOne(CustomScheduleRequest);
exports.getCustomRequestSummary = catchAsync(async (req, res) => {
  const aggregationPipeline = [
    { $match: { status: "open" } },
    {
      $group: {
        _id: {
          targetId: { $ifNull: ["$course", "$category"] },
          targetType: {
            $cond: { if: "$course", then: "Course", else: "Category" },
          },
        },
        studentIds: { $addToSet: "$student" },
      },
    },
    {
      $project: {
        _id: 0,
        targetId: "$_id.targetId",
        targetType: "$_id.targetType",
        studentCount: { $size: "$studentIds" },
        students: "$studentIds",
      },
    },
    { $sort: { studentCount: -1 } },
    { $limit: 100 },
  ];

  const summary = await CustomScheduleRequest.aggregate(aggregationPipeline);

  await Student.populate(summary, {
    path: "students",
    select: "name profile.phoneNumber email",
  });

  const courseTargets = summary.filter((item) => item.targetType === "Course");

  if (courseTargets.length > 0) {
    await Course.populate(courseTargets, {
      path: "targetId",
      select: "name level",
    });
  }

  const finalResult = courseTargets.map((item) => {
    item.targetInfo = item.targetId;
    delete item.targetId;
    return item;
  });

  finalResult.sort((a, b) => b.studentCount - a.studentCount);

  res.status(200).json({
    status: "success",
    results: finalResult.length,
    data: finalResult,
  });
});
