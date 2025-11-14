const Attendance = require("../models/attendanceModel");
const Session = require("../models/sessionModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.getTodaySession = catchAsync(async (req, res) => {
  const teacher = req.user;
  const day = new Date();

  const start = new Date(day.setHours(0, 0, 0, 0));
  const end = new Date(day.setHours(23, 59, 59, 999));

  const sessions = await Session.find({
    teacher: teacher.id,
    startAt: {
      $gte: start,
      $lte: end,
    },
  }).populate("class room");

  res.status(201).json({
    status: "success",
    data: sessions,
  });
});

exports.startSession = catchAsync(async (req, res, next) => {
  const session = await Session.findById(req.params.id).populate("class");
  if (!session || session.teacher.id.toString() !== req.user.id)
    return next(new AppError("Không tìm thấy session", 404));
  let attendance = await Attendance.findOne({ session: session.id });
  if (!attendance) {
    attendance = await Attendance.create({
      session: session.id,
      attendance: session.class.student.map((s) => ({
        student: s,
        status: "absent",
      })),
    });
  }

  res.status(201).json({
    status: "success",
    data: attendance,
  });
});

exports.takeAttendance = catchAsync(async (req, res, next) => {
  const attandanceSession = await Attendance.findById(req.params.id).populate(
    "session"
  );

  if (
    !attandanceSession ||
    attandanceSession.session.teacher.toString() !== req.user.id
  )
    return next(new AppError("Không tìm thấy session", 404));

  const { attendance } = req.body;
  attandanceSession.attendance = attendance;
  attandanceSession.save();
  res.status(200).json({
    status: "success",
    data: attendance,
  });
});

exports.getAllAttendanceReport = catchAsync(async (req, res) => {
  const attendances = await Attendance.find().populate({
    path: "session",
    match: { teacher: req.user.id },
  });
  const filtered = attendances.filter((a) => a.session);
  res.status(200).json({
    status: "success",
    data: filtered,
  });
});
