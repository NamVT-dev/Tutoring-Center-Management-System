const Session = require("../models/sessionModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const getTodayString = () => {
  return new Date().toISOString().slice(0, 10);
};

exports.createSession = catchAsync(async (req, res, next) => {
  const { teacher } = req.user;
  const { classId } = req.params;
  const session = await Session.find({
    teacher: teacher.id,
    class: classId,
    startAt: getTodayString(),
  });

  if (!session)
    return next(
      new AppError("Không tìm thấy session của class tương ứng", 404)
    );

  res.status(201).json({
    status: "success",
    data: session,
  });
});
