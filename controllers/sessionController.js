const Session = require("../models/sessionModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");
const { Types } = require("mongoose");
const { Teacher } = require("../models/userModel");
const Course = require("../models/courseModel");
const { canTeachCourse } = require("../services/schedulingService");

const checkConflict = async (sessionId, teacherId, roomId, startAt, endAt) => {

  const conflictQuery = {
    _id: { $ne: new Types.ObjectId(sessionId) },
    status: { $in: ["scheduled", "published"] },
    $or: [
      {
        teacher: teacherId,
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
      },
      {
        room: roomId,
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
      },
    ],
  };


  const existingConflict = await Session.findOne(conflictQuery)
    .populate("teacher", "_id")
    .populate("room", "_id")
    .populate("class", "name")
    .lean();
  if (!existingConflict) {
    return null; 
  }

  if (
    existingConflict.teacher &&
    existingConflict.teacher._id.toString() === teacherId.toString()
  ) {
    return new AppError(
      `Xung đột lịch: Giáo viên đã có lịch (lớp ${existingConflict.class?.name}) vào thời này.`,
      409
    );
  }

  if (
    existingConflict.room &&
    existingConflict.room._id.toString() === roomId.toString()
  ) {
    return new AppError(
      `Xung đột lịch: Phòng học đã có lịch (lớp ${existingConflict.class?.name}) vào thời gian này.`,
      409
    );
  }

  return null;
};

exports.updateSession = catchAsync(async (req, res, next) => {
  const sessionId = req.params.id;

  const allowedUpdates = {};
  if (req.body.startAt) allowedUpdates.startAt = new Date(req.body.startAt);
  if (req.body.endAt) allowedUpdates.endAt = new Date(req.body.endAt);
  if (req.body.teacher) allowedUpdates.teacher = req.body.teacher;
  if (req.body.room) allowedUpdates.room = req.body.room;
  if (req.body.status) allowedUpdates.status = req.body.status;

  if (Object.keys(allowedUpdates).length === 0) {
    return next(new AppError("Vui lòng cung cấp dữ liệu cần cập nhật", 400));
  }

  const session = await Session.findById(sessionId).populate("course");
  if (!session) {
    return next(new AppError("Không tìm thấy buổi học này", 404));
  }
  session.depopulate('teacher');
  session.depopulate('room');

  const isRescheduling =
    allowedUpdates.startAt || allowedUpdates.teacher || allowedUpdates.room;

  if (isRescheduling && allowedUpdates.status !== "canceled") {
    const newStartAt = allowedUpdates.startAt || session.startAt;
    const newEndAt = allowedUpdates.endAt || session.endAt;
    const newTeacherId = (allowedUpdates.teacher || session.teacher).toString();
    const newRoomId = (allowedUpdates.room || session.room).toString();

    if (newEndAt <= newStartAt) {
      return next(new AppError("Giờ kết thúc phải sau giờ bắt đầu", 400));
    }

    if (allowedUpdates.teacher) {
      const teacher = await Teacher.findById(newTeacherId).lean();
      const course = session.course;
      if (!teacher) {
        return next(
          new AppError("Không tìm thấy giáo viên mới (ID không đúng)", 404)
        );
      }
      if (!course) {
        return next(
          new AppError("Lỗi: Không tìm thấy khóa học của buổi này", 500)
        );
      }
      const isQualified = canTeachCourse(teacher, course);
      if (!isQualified) {
        return next(
          new AppError(
            "Xung đột kỹ năng: Giáo viên này không đủ điều kiện (skill) để dạy khóa học này.",
            400
          )
        );
      }
    }

    const teacherObjectId = new Types.ObjectId(newTeacherId);
    const roomObjectId = new Types.ObjectId(newRoomId);
    const conflictError = await checkConflict(
      sessionId,
      teacherObjectId,
      roomObjectId,
      newStartAt,
      newEndAt
    );

    if (conflictError) {
      return next(conflictError);
    }
  }

  const updatedSession = await Session.findByIdAndUpdate(
    sessionId,
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  ).populate("teacher room class", "name profile.fullname");

  res.status(200).json({
    status: "success",
    data: {
      session: updatedSession,
    },
  });
});
