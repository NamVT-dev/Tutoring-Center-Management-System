const Session = require("../models/sessionModel");
const { Types } = require("mongoose");
const AppError = require("./appError");

exports.checkConflict = async (
  sessionId,
  teacherId,
  roomId,
  startAt,
  endAt
) => {
  const conflictQuery = {
    _id: { $ne: new Types.ObjectId(sessionId) },
    status: { $in: ["scheduled", "published"] },
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
    $or: [{ teacher: teacherId }, { room: roomId }],
  };

  const existingConflict = await Session.findOne(conflictQuery)
    .populate("class", "name")
    .lean();

  if (!existingConflict) return null;

  if (existingConflict.teacher?.toString() === teacherId.toString()) {
    return new AppError(
      `Xung đột: Giáo viên đã có lịch (lớp ${existingConflict.class?.name})`,
      409
    );
  }
  if (existingConflict.room?.toString() === roomId.toString()) {
    return new AppError(
      `Xung đột: Phòng đã có lịch (lớp ${existingConflict.class?.name})`,
      409
    );
  }
  return null;
};
