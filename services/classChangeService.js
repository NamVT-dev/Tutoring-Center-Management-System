const moment = require("moment-timezone");
const mongoose = require("mongoose");
const Class = require("../models/classModel");
const Session = require("../models/sessionModel");
const Course = require("../models/courseModel");
const {Teacher} = require("../models/userModel");
const { canTeachCourse } = require("../services/schedulingService");
const AppError = require("../utils/appError");

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}
function overlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

async function loadTargets(classId, scope) {
  const filter = { class: classId };
  if (scope?.onlyStatus?.length) filter.status = { $in: scope.onlyStatus };

  let targets = await Session.find(filter)
    .select("_id sessionNo startAt endAt status timezone teacher")
    .lean();

  if (
    Number.isInteger(scope?.fromSessionNo) ||
    Number.isInteger(scope?.toSessionNo)
  ) {
    const from = scope.fromSessionNo ?? 1;
    const to = scope.toSessionNo ?? Number.MAX_SAFE_INTEGER;
    targets = targets.filter((s) => s.sessionNo >= from && s.sessionNo <= to);
  }
  if (Array.isArray(scope?.sessionNos) && scope.sessionNos.length) {
    const setNos = new Set(scope.sessionNos.map(Number));
    targets = targets.filter((s) => setNos.has(s.sessionNo));
  }
  if (Array.isArray(scope?.dayOfWeek) && scope.dayOfWeek.length) {
    const set = new Set(scope.dayOfWeek.map(Number));
    targets = targets.filter((s) =>
      set.has(moment.tz(s.startAt, s.timezone).day())
    );
  }
  return targets;
}

/**
 * Preview thay giáo viên
 */
async function previewChangeTeacher({
  classId,
  newTeacher,
  scope = {},
  check = { skill: true, conflict: true },
}) {
  if (!isValidId(classId)) throw new AppError("ID lớp không hợp lệ", 400);
  if (!isValidId(newTeacher))
    throw new AppError("ID giáo viên mới không hợp lệ", 400);

  const clazz = await Class.findById(classId).lean();
  if (!clazz) throw new AppError("Không tìm thấy lớp", 404);

  const teacher = await Teacher.findById(newTeacher).lean();
  if (!teacher) throw new AppError("Không tìm thấy giáo viên mới", 404);

  const course = await Course.findById(clazz.course).lean();
  if (!course) throw new AppError("Không tìm thấy khóa học của lớp", 400);

  // skill check
  if (check?.skill && !canTeachCourse(teacher, course)) {
    return {
      summary: { totalSessions: 0, toUpdate: 0, unchanged: 0, blocked: 0 },
      toUpdate: [],
      unchanged: [],
      blocked: [{ reason: "NO_SKILL_GLOBAL", teacher: String(newTeacher) }],
    };
  }

  const targets = await loadTargets(classId, scope);
  const total = targets.length;

  let toUpdate = [],
    unchanged = [],
    blocked = [];
  if (check?.conflict && total) {
    const minStart = new Date(
      Math.min(...targets.map((x) => x.startAt.getTime()))
    );
    const maxEnd = new Date(Math.max(...targets.map((x) => x.endAt.getTime())));
    const occupied = await Session.find({
      teacher: newTeacher,
      status: { $ne: "canceled" },
      startAt: { $lt: maxEnd },
      endAt: { $gt: minStart },
    })
      .select("_id startAt endAt")
      .lean();

    for (const s of targets) {
      const clash = occupied.some((o) =>
        overlap(s.startAt, s.endAt, o.startAt, o.endAt)
      );
      if (clash) {
        blocked.push({
          sessionId: s._id,
          sessionNo: s.sessionNo,
          reason: "TEACHER_BUSY",
        });
      } else if (String(s.teacher) === String(newTeacher)) {
        unchanged.push({ sessionId: s._id, sessionNo: s.sessionNo });
      } else {
        toUpdate.push({
          sessionId: s._id,
          sessionNo: s.sessionNo,
          fromTeacher: s.teacher,
          toTeacher: newTeacher,
        });
      }
    }
  } else {
    toUpdate = targets
      .filter((s) => String(s.teacher) !== String(newTeacher))
      .map((s) => ({
        sessionId: s._id,
        sessionNo: s.sessionNo,
        fromTeacher: s.teacher,
        toTeacher: newTeacher,
      }));
    unchanged = targets
      .filter((s) => String(s.teacher) === String(newTeacher))
      .map((s) => ({ sessionId: s._id, sessionNo: s.sessionNo }));
  }

  return {
    summary: {
      totalSessions: total,
      toUpdate: toUpdate.length,
      unchanged: unchanged.length,
      blocked: blocked.length,
    },
    toUpdate,
    unchanged,
    blocked,
  };
}

/**
 * Apply thay giáo viên (dùng lại preview)
 */
async function applyChangeTeacher({
  classId,
  newTeacher,
  scope = {},
  check = { skill: true, conflict: true },
  updatePreferred = false,
  allowBlocked = false,
}) {
  const preview = await previewChangeTeacher({
    classId,
    newTeacher,
    scope,
    check,
  });

  if (preview.blocked?.length && !allowBlocked) {
    throw new AppError(
      `Có ${preview.blocked.length} phiên xung đột (TEACHER_BUSY). Bật allowBlocked=true để bỏ qua.`,
      409
    );
  }

  const ids = (preview.toUpdate || []).map((x) => x.sessionId);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (ids.length) {
        await Session.updateMany(
          { _id: { $in: ids } },
          { $set: { teacher: newTeacher } },
          { session }
        );
      }
      if (updatePreferred) {
        await Class.findByIdAndUpdate(
          classId,
          { $set: { preferredTeacher: newTeacher } },
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }

  return {
    updatedSessions: ids.length,
    skippedUnchanged: preview.unchanged?.length || 0,
    blocked: preview.blocked || [],
    preferredTeacherUpdated: !!updatePreferred,
  };
}

module.exports = { previewChangeTeacher, applyChangeTeacher };
