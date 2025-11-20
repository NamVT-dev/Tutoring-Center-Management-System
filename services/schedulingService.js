const moment = require("moment-timezone");
const { User } = require("../models/userModel");
const Room = require("../models/roomModel");
const Course = require("../models/courseModel");
const Center = require("../models/centerModel");
const Class = require("../models/classModel");
const Session = require("../models/sessionModel");
const Student = require("../models/studentModel");
const Category = require("../models/categoryModel");
const ScheduleJob = require("../models/scheduleJobModel");
const Enrollment = require("../models/enrollmentModel");
const { Teacher } = require("../models/userModel");
const mongoose = require("mongoose");
const { LEVEL_INDEX, LEVEL_ORDER } = require("../utils/levels");
const {
  computeClassStartEndExact,
  buildScheduleSignature,
  buildClassCode,
} = require("../utils/scheduleHelper");

class SchedulerContext {
  constructor(jobId, io) {
    this.jobId = jobId;
    this.io = io;

    // cache
    this.allTeachers = [];
    this.allRooms = [];
    this.allCourses = {};
    this.allCategories = {};
    this.centerConfig = null;
    this.maxAvailableCapacity = 0;

    // state tạm thời cho Greedy
    this.scheduleState = { teachers: {}, rooms: {} };

    // báo cáo
    this.successfulAssignments = [];
    this.failedClasses = [];
    this.scheduleWarnings = [];
  }

  // logging thống nhất
  async updateJob(stage, message, dataToSave = {}, isError = false) {
    const job = await ScheduleJob.findById(this.jobId);
    if (!job) return;

    console.log(`[Job ${this.jobId}][${stage}]: ${message}`);
    job.logs.push({ stage, message, isError });

    if (dataToSave.status) job.status = dataToSave.status;
    if (dataToSave.inputAnalysis) job.inputAnalysis = dataToSave.inputAnalysis;
    if (dataToSave.draftSchedule) job.draftSchedule = dataToSave.draftSchedule;
    if (dataToSave.resultReport) job.resultReport = dataToSave.resultReport;

    await job.save();

    if (this.io) {
      this.io.emit("job_update", { jobId: this.jobId, stage, message });
    }
  }
}

async function runAutoScheduler(jobId, io) {
  const ctx = new SchedulerContext(jobId, io);
  let job = await ScheduleJob.findById(jobId);
  if (!job) return;

  try {
    await ctx.updateJob("START", "Bắt đầu chạy thuật toán", {
      status: "running",
    });
    await ctx.updateJob(
      "LOAD",
      "Đang tải tài nguyên (GV, ROOM, COURSE, CONFIG)"
    );
    await loadResources(ctx);

    if (ctx.allTeachers.length === 0 || ctx.allRooms.length === 0) {
      throw new Error("Không có giáo viên hoặc phòng học nào đang hoạt động.");
    }
    if (
      !Array.isArray(ctx.centerConfig?.activeDaysOfWeek) ||
      ctx.centerConfig.activeDaysOfWeek.length === 0 ||
      !Array.isArray(ctx.centerConfig?.shifts) ||
      ctx.centerConfig.shifts.length === 0
    ) {
      throw new Error(
        "Cấu hình trung tâm thiếu 'activeDaysOfWeek' hoặc 'shifts'."
      );
    }

    await ctx.updateJob(
      "ANALYZE",
      `Đang phân tích nhu cầu từ ${job.intakeStartDate.toDateString()}...`
    );
    const { virtualClassList, pendingList, demandList } =
      await createVirtualClassList(ctx, {
        intakeStartDate: job.intakeStartDate,
        intakeEndDate: job.intakeEndDate,
      });

    await ctx.updateJob(
      "ANALYZE_DONE",
      `Phân tích xong. Tạo ${virtualClassList.length} lớp ảo.`,
      { inputAnalysis: { demandList, virtualClassList, pendingList } }
    );

    if (virtualClassList.length === 0) {
      await ctx.updateJob(
        "DRAFT_READY",
        "Không có nhu cầu, kết thúc. Chờ Admin duyệt.",
        {
          status: "draft",
        }
      );
      if (io) io.emit("job_complete", { jobId });
      return;
    }

    // SCHEDULE
    await ctx.updateJob(
      "SCHEDULE_START",
      `Bắt đầu xếp lịch cho ${virtualClassList.length} lớp...`
    );
    initializeScheduleState(ctx);

    // Prefill lịch thật đã có từ Class.weeklySchedules để chặn xung đột
    await prefillExistingWeeklySchedules(ctx);

    const sortedClassList = greedySortClasses(virtualClassList);
    const totalCount = sortedClassList.length;

    for (const [index, currentClass] of sortedClassList.entries()) {
      const course = currentClass.courseInfo;
      const requiredSlotsCount = course.sessionsPerWeek || 1;
      const classAssignmentsFound = [];
      let isPossible = true;
      let failureReasonCode = null;

      let lockedTeacherId = currentClass.preferredTeacher || null;

      for (let i = 0; i < requiredSlotsCount; i++) {
        const placementResult = findPossiblePlacements(
          ctx,
          currentClass,
          classAssignmentsFound,
          lockedTeacherId
        );
        // nếu khóa GV mà không hợp lệ -> mở khóa 1 lần và thử lại
        if (
          placementResult.failureReason === "LOCKED_TEACHER_UNAVAILABLE" &&
          lockedTeacherId
        ) {
          lockedTeacherId = null;
          const retry = findPossiblePlacements(
            ctx,
            currentClass,
            classAssignmentsFound,
            null
          );
          if (retry.placements?.length) {
            placementResult.placements = retry.placements;
            // giữ failureReason = null
          } else {
            isPossible = false;
            failureReasonCode = retry.failureReason || "ALL_SLOTS_TAKEN";
            break;
          }
        }
        if (placementResult.placements.length > 0) {
          const sortedPlacements = greedySortPlacements(
            ctx,
            placementResult.placements,
            currentClass
          );
          const bestPlacement = sortedPlacements[0];

          if (!lockedTeacherId) {
            lockedTeacherId = String(bestPlacement.teacher._id);
          }

          applyAssignment(ctx, currentClass.id, bestPlacement);
          classAssignmentsFound.push(bestPlacement);
        } else {
          isPossible = false;
          failureReasonCode =
            placementResult.failureReason || "ALL_SLOTS_TAKEN";
          break;
        }
      }

      if (isPossible) {
        // Lưu nhóm assignment data
        currentClass.lockedTeacherId = lockedTeacherId;
        const allAssignmentData = classAssignmentsFound.map((bestPlacement) => {
          const assignmentData = {
            virtualClassId: currentClass.id,
            courseId: currentClass.courseInfo._id,
            courseName: `${currentClass.courseInfo.category.name} ${currentClass.courseInfo.level}`,
            studentCount: currentClass.studentCount,
            day: bestPlacement.day,
            shiftName: bestPlacement.shift,
            startMinute: bestPlacement.shiftInfo.startMinute,
            endMinute:
              bestPlacement.shiftInfo.startMinute +
              currentClass.courseInfo.durationInMinutes,
            teacher: lockedTeacherId,
            room: bestPlacement.room._id,
            violatesAvailability: bestPlacement.violatesAvailability,
          };
          if (bestPlacement.violatesAvailability) {
            ctx.scheduleWarnings.push({
              classInfo: assignmentData.courseName,
              teacherName:
                bestPlacement.teacher.profile.fullname ||
                String(bestPlacement.teacher._id),
              message: `Bị xếp vào ca ${bestPlacement.shift} (Ngày ${bestPlacement.day}) mà GV không đăng ký.`,
            });
          }
          return assignmentData;
        });

        ctx.successfulAssignments.push(allAssignmentData);
      } else {
        // rollback các slot tạm
        for (const placementToRevert of classAssignmentsFound) {
          revertAssignment(ctx, currentClass.id, placementToRevert);
        }
        ctx.failedClasses.push({
          classInfo: `${currentClass.courseInfo.category.name} ${currentClass.courseInfo.level}`,
          studentCount: currentClass.studentCount,
          reasonCode: failureReasonCode,
          reasonMessage:
            getFailureMessage(failureReasonCode) +
            ` (Không tìm đủ ${requiredSlotsCount} buổi/tuần)`,
        });
      }

      if ((index + 1) % 5 === 0 || index + 1 === totalCount) {
        await ctx.updateJob(
          "SCHEDULE_PROGRESS",
          `Đang xếp lịch... (${index + 1}/${totalCount})`
        );
      }
    }

    // DRAFT
    const successCount = ctx.successfulAssignments.length;
    const successRate = totalCount > 0 ? successCount / totalCount : 1.0;
    const finalReport = {
      successfulCount: successCount,
      failedCount: ctx.failedClasses.length,
      failedClasses: ctx.failedClasses,
      warnings: ctx.scheduleWarnings,
    };

    await ctx.updateJob(
      "DRAFT_READY",
      `Đã xếp lịch xong. Tỷ lệ: ${successCount}/${totalCount}.`,
      {
        status: "draft",
        draftSchedule: ctx.successfulAssignments,
        resultReport: finalReport,
      }
    );

    if (successRate < job.successThreshold) {
      await ctx.updateJob(
        "DRAFT_READY",
        `Cảnh báo: Tỷ lệ thành công ${(successRate * 100).toFixed(2)}% thấp hơn ngưỡng ${(job.successThreshold * 100).toFixed(2)}%`,
        {},
        true
      );
    }

    if (io) io.emit("job_complete", { jobId });
  } catch (error) {
    console.error(`Lỗi Job ${jobId}:`, error);
    try {
      job = await ScheduleJob.findById(jobId);
      if (job) {
        job.logs.push({
          stage: "ERROR",
          message: error.message,
          isError: true,
        });
        job.status = "system_error";
        await job.save();
      }
      if (ctx.io) ctx.io.emit("job_error", { jobId, error: error.message });
    } catch (dbError) {
      console.error(
        `[Job ${jobId}] Lỗi kép! Không thể lưu trạng thái lỗi:`,
        dbError
      );
    }
    await Center.findOneAndUpdate({ key: "default" }, { isScheduling: false });
  }
}

async function finalizeSchedule(jobId) {
  const job = await ScheduleJob.findById(jobId);
  if (!job || job.status !== "draft") {
    throw new Error('Job này không ở trạng thái "draft" để chốt.');
  }
  const draftSchedule = job.draftSchedule;
  if (!draftSchedule || draftSchedule.length === 0) {
    throw new Error("Không có lịch nháp để chốt.");
  }

  // Đọc lại config/courses để tính sessions
  const centerConfig = await Center.findOne({ key: "default" }).lean();
  const timezone = centerConfig?.timezone || "Asia/Bangkok";

  let anchor = job.classStartAnchor
    ? moment.tz(job.classStartAnchor, timezone).startOf("day")
    : moment.tz(timezone).startOf("day");
  // Gom courseIds (unique)
  const courseIds = new Set();
  draftSchedule.forEach((group) => {
    if (group[0]?.courseId) courseIds.add(String(group[0].courseId));
  });
  const courses = await Course.find({ _id: { $in: Array.from(courseIds) } });
  const courseMap = Object.fromEntries(courses.map((c) => [String(c._id), c]));

  // Idempotency: nếu đã từng finalize cho job này → không cho chạy lại
  const existingByJob = await Class.findOne({ createdByJob: jobId }).lean();
  if (existingByJob) {
    throw new Error(
      "Job này đã được finalize trước đó (phát hiện createdByJob)."
    );
  }

  // Freeze check trước khi tạo:
  // build occupancy từ Class.weeklySchedules hiện có (không lấy những class canceled)
  const currentOccupancy = await buildWeeklyOccupancyFromClasses({
    excludeJobId: jobId,
  });

  // Validate mọi assignment trong draftSchedule không trùng với occupancy hiện tại
  for (const group of draftSchedule) {
    for (const a of group) {
      const teacherKey = `${a.teacher}::${a.day}::${a.shiftName}`;
      const roomKey = `${a.room}::${a.day}::${a.shiftName}`;
      if (currentOccupancy.teacherSlots.has(teacherKey)) {
        throw new Error(
          `Freeze check: Trùng slot GV hiện có (teacher=${a.teacher}, day=${a.day}, shift=${a.shiftName}).`
        );
      }
      if (currentOccupancy.roomSlots.has(roomKey)) {
        throw new Error(
          `Freeze check: Trùng slot ROOM hiện có (room=${a.room}, day=${a.day}, shift=${a.shiftName}).`
        );
      }
    }
  }

  // Transaction
  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      const classesToCreate = [];

      for (const assignmentGroup of draftSchedule) {
        const first = assignmentGroup[0];
        if (!first) continue;
        const course = courseMap[String(first.courseId)];
        if (!course) continue;

        const weeklySchedules = assignmentGroup.map((a) => ({
          dayOfWeek: a.day,
          startMinute: a.startMinute,
          endMinute: a.endMinute,
          room: a.room,
          teacher: a.teacher,
        }));
        const scheduleSignature = buildScheduleSignature(
          course._id,
          weeklySchedules
        );
        const { startAt, endAt } = computeClassStartEndExact({
          timezone,
          weeklySchedules,
          totalSessions: course.session,
          anchorDate: anchor,
        });
        const classCode = await buildClassCode(course);

        classesToCreate.push({
          name: `${first.courseName} | ${weeklySchedules.length}b/tuần`,
          classCode,
          course: course._id,
          weeklySchedules,
          preferredTeacher: first.teacher,
          maxStudent: first.studentCount,
          minStudent: course.minStudent,
          status: "approved",
          createdByJob: jobId,
          scheduleSignature,
          startAt,
          endAt,
        });
      }

      const createdClasses = classesToCreate.length
        ? await Class.insertMany(classesToCreate, { session: mongoSession })
        : [];

      const teacherClassMap = new Map();
      for (const newClass of createdClasses) {
        const classId = newClass._id;
        const teacherIdsInClass = new Set();

        if (newClass.preferredTeacher) {
          teacherIdsInClass.add(newClass.preferredTeacher.toString());
        }

        newClass.weeklySchedules.forEach((slot) => {
          if (slot.teacher) {
            teacherIdsInClass.add(slot.teacher.toString());
          }
        });

        for (const teacherId of teacherIdsInClass) {
          if (!teacherClassMap.has(teacherId)) {
            teacherClassMap.set(teacherId, []);
          }
          teacherClassMap.get(teacherId).push(classId);
        }
      }

      const teacherUpdateOps = [];
      for (const [teacherId, classIds] of teacherClassMap.entries()) {
        teacherUpdateOps.push({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(teacherId) },
            update: { $addToSet: { class: { $each: classIds } } },
          },
        });
      }

      if (teacherUpdateOps.length > 0) {
        await Teacher.bulkWrite(teacherUpdateOps, { session: mongoSession });
      }

      // Tạo sessions theo tuần kế tiếp
      const today = moment.tz(timezone).startOf("day");
      if (anchor.isBefore(today)) anchor = today.clone();
      const sessionsToCreate = [];

      for (const newClass of createdClasses) {
        const course = courseMap[String(newClass.course)];
        if (!course) continue;

        const totalSessions = course.session;
        const slotsPerWeek = newClass.weeklySchedules.length;
        const numWeeks = Math.ceil(totalSessions / Math.max(1, slotsPerWeek));

        let baseStartDate = anchor.clone();
        for (let i = 0; i < numWeeks; i++) {
          for (const [slotIndex, slot] of newClass.weeklySchedules.entries()) {
            const linearIndex = i * slotsPerWeek + slotIndex;
            if (linearIndex >= totalSessions) break;

            // Ngày đầu tiên khớp dayOfWeek trên/ sau anchor
            let firstWeekSlotDate = baseStartDate.clone().day(slot.dayOfWeek);
            if (firstWeekSlotDate.isBefore(baseStartDate)) {
              firstWeekSlotDate.add(1, "week");
            }
            const sessionDate = firstWeekSlotDate.clone().add(i, "weeks");

            const startAt = moment
              .tz(
                {
                  year: sessionDate.year(),
                  month: sessionDate.month(),
                  date: sessionDate.date(),
                  hour: 0,
                  minute: 0,
                  second: 0,
                },
                timezone
              )
              .add(slot.startMinute, "minutes")
              .toDate();

            const endAt = moment
              .tz(
                {
                  year: sessionDate.year(),
                  month: sessionDate.month(),
                  date: sessionDate.date(),
                  hour: 0,
                  minute: 0,
                  second: 0,
                },
                timezone
              )
              .add(slot.endMinute, "minutes")
              .toDate();

            sessionsToCreate.push({
              class: newClass._id,
              course: newClass.course,
              teacher: slot.teacher,
              room: slot.room,
              startAt,
              endAt,
              timezone,
              status: "scheduled",
              createdByJob: jobId, // idempotency flag
              sessionNo: linearIndex + 1,
            });
          }
        }
      }

      if (sessionsToCreate.length) {
        await Session.insertMany(sessionsToCreate, { session: mongoSession });
      }

      // Cập nhật job → completed
      job.status = "completed";
      job.logs.push({
        stage: "COMPLETED",
        message: `Hoàn tất! Đã tạo ${classesToCreate.length} lớp và ${sessionsToCreate.length} buổi.`,
      });
      await job.save({ session: mongoSession });
    });

    // Trả về dữ liệu đã populate để hiển thị
    const createdClasses = await Class.find({ createdByJob: jobId })
      .populate("course", "name level")
      .populate("weeklySchedules.teacher", "profile.fullname")
      .populate("weeklySchedules.room", "name capacity");

    return {
      createdClasses,
      createdSessionsCount: await Session.countDocuments({
        createdByJob: jobId,
      }),
    };
  } finally {
    mongoSession.endSession();
  }
}

async function loadResources(ctx) {
  ctx.allTeachers = [];
  ctx.allRooms = [];
  ctx.allCourses = {};
  ctx.allCategories = {};
  ctx.centerConfig = null;
  ctx.maxAvailableCapacity = 0;

  const teacherPromise = User.find({ role: "teacher" }).lean();
  const roomPromise = Room.find({ status: "active" }).lean();
  const coursePromise = Course.find().populate("category").lean();
  const centerPromise = Center.findOne({ key: "default" }).lean();
  const categoryPromise = Category.find().lean();

  const [teachers, rooms, coursesArray, centerConfig, categoriesArray] =
    await Promise.all([
      teacherPromise,
      roomPromise,
      coursePromise,
      centerPromise,
      categoryPromise,
    ]);

  ctx.allTeachers = teachers || [];
  ctx.allRooms = rooms || [];
  ctx.centerConfig = centerConfig || {};
  ctx.maxAvailableCapacity = ctx.allRooms.length
    ? Math.max(...ctx.allRooms.map((r) => r.capacity || 0))
    : 0;

  ctx.allCourses = (coursesArray || []).reduce((acc, c) => {
    acc[String(c._id)] = c;
    return acc;
  }, {});
  ctx.allCategories = (categoriesArray || []).reduce((acc, c) => {
    acc[String(c._id)] = c;
    return acc;
  }, {});
}
async function findDemandFromNewTesters(
  ctx,
  course,
  intakeStartDate,
  intakeEndDate
) {
  const { _id: courseId, category, inputMinScore, inputMaxScore } = course;

  const matchFilter = {
    tested: true,
    enrolled: false,
    category: category._id,
    testResultAt: {
      $gte: new Date(intakeStartDate),
      $lte: new Date(moment(intakeEndDate).endOf("day")),
    },
    testScore: { $gte: inputMinScore, $lte: inputMaxScore },
  };

  const demandResult = await Student.aggregate([
    { $match: matchFilter },
    { $count: "studentCount" },
  ]);
  return demandResult.length ? demandResult[0].studentCount : 0;
}

async function findDemandFromWaitingStudents(ctx, course, intakeStartDate) {
  const { _id: courseId, category, level } = course;
  const currentLevelIndex = LEVEL_INDEX[level];
  if (currentLevelIndex === undefined || currentLevelIndex === 0) {
    return 0;
  }
  const previousLevel = LEVEL_ORDER[currentLevelIndex - 1];

  const previousCourseIds = Object.values(ctx.allCourses)
    .filter(
      (c) =>
        c.level === previousLevel &&
        String(c.category?._id) === String(category._id)
    )
    .map((c) => c._id);

  if (previousCourseIds.length === 0) return 0;

  const endedClasses = await Class.find({
    course: { $in: previousCourseIds },
    status: { $ne: "canceled" },
    endAt: { $lt: new Date(intakeStartDate) },
  })
    .select("_id")
    .lean();

  const endedClassIds = endedClasses.map((c) => c._id);
  if (endedClassIds.length === 0) return 0;

  const completedEnrollments = await Enrollment.find({
    class: { $in: endedClassIds },
    status: "confirmed",
  })
    .select("student")
    .lean();
  const completedStudentIds = [
    ...new Set(completedEnrollments.map((e) => e.student)),
  ];
  if (completedStudentIds.length === 0) return 0;

  const targetLevelIndex = LEVEL_INDEX[level];

  const waitingStudents = await Student.find({
    _id: { $in: completedStudentIds },
    enrolled: false,
    "learningGoal.targetScore": { $exists: true },
  }).lean();

  let waitingCount = 0;
  for (const student of waitingStudents) {
    const goalTargetIndex = LEVEL_INDEX[student.learningGoal.targetScore];
    if (goalTargetIndex !== undefined && goalTargetIndex >= targetLevelIndex) {
      waitingCount++;
    }
  }

  return waitingCount;
}
async function createVirtualClassList(ctx, { intakeStartDate, intakeEndDate }) {
  const coursesToAnalyze = Object.values(ctx.allCourses);
  const virtualClassList = [];
  const pendingList = [];
  const demandList = [];
  let classCounter = 1;

  for (const course of coursesToAnalyze) {
    const {
      _id: courseId,
      category,
      level,
      inputMinScore,
      inputMaxScore,
      minStudent,
      maxStudent,
      name,
    } = course;

    const newStudentCount = await findDemandFromNewTesters(
      ctx,
      course,
      intakeStartDate,
      intakeEndDate
    );
    const waitingStudentCount = await findDemandFromWaitingStudents(
      ctx,
      course,
      intakeStartDate
    );
    const studentCount = newStudentCount + waitingStudentCount;

    demandList.push({
      courseName: name,
      targetLevel: level,
      inputRange: `${inputMinScore} - ${inputMaxScore}`,
      foundStudents: studentCount,
      details: `(New: ${newStudentCount}, Waiting: ${waitingStudentCount})`
    });

    if (studentCount < minStudent) {
      pendingList.push({
        courseName: `${name} (Level ${level})`,
        studentCount,
        minRequired: minStudent,
      });
      continue;
    }

    let remaining = studentCount;
    const effectiveMax = Math.min(
      maxStudent,
      ctx.maxAvailableCapacity || maxStudent
    );

    while (remaining >= minStudent) {
      const classSize = Math.max(Math.min(remaining, effectiveMax), minStudent);
      virtualClassList.push({
        id: `virtual_${classCounter++}`,
        courseId: courseId,
        courseInfo: course,
        studentCount: classSize,
        preferredTeacher: null,
      });
      remaining -= classSize;
    }

    if (remaining > 0) {
      pendingList.push({
        courseName: `${name} (Level ${level})`,
        studentCount: remaining,
        minRequired: minStudent,
      });
    }
  }

  return { virtualClassList, pendingList, demandList };
}
function initializeScheduleState(ctx) {
  ctx.scheduleState = { teachers: {}, rooms: {} };
  const days = ctx.centerConfig.activeDaysOfWeek;

  for (const teacher of ctx.allTeachers) {
    const tid = String(teacher._id);
    ctx.scheduleState.teachers[tid] = {};
    for (const day of days) {
      ctx.scheduleState.teachers[tid][day] = { workload: 0 };
      for (const shift of ctx.centerConfig.shifts) {
        ctx.scheduleState.teachers[tid][day][shift.name] = null;
      }
    }
  }

  for (const room of ctx.allRooms) {
    const rid = String(room._id);
    ctx.scheduleState.rooms[rid] = {};
    for (const day of days) {
      ctx.scheduleState.rooms[rid][day] = {};
      for (const shift of ctx.centerConfig.shifts) {
        ctx.scheduleState.rooms[rid][day][shift.name] = null;
      }
    }
  }
}

async function prefillExistingWeeklySchedules(ctx) {
  const existingClasses = await Class.find({
    status: { $ne: "canceled" },
  })
    .select("weeklySchedules createdByJob")
    .lean();

  for (const c of existingClasses) {
    // không chặn chính job hiện tại
    if (String(c.createdByJob || "") === String(ctx.jobId)) continue;

    for (const slot of c.weeklySchedules || []) {
      const day = slot.dayOfWeek;
      const shiftName = findShiftNameByMinute(
        ctx.centerConfig,
        slot.startMinute,
        slot.endMinute
      );
      if (!shiftName) continue;

      // Mark teacher busy
      const tid = String(slot.teacher);
      if (ctx.scheduleState.teachers[tid]?.[day]?.hasOwnProperty(shiftName)) {
        ctx.scheduleState.teachers[tid][day][shiftName] = "__OCCUPIED__";
      }

      // Mark room busy
      const rid = String(slot.room);
      if (ctx.scheduleState.rooms[rid]?.[day]?.hasOwnProperty(shiftName)) {
        ctx.scheduleState.rooms[rid][day][shiftName] = "__OCCUPIED__";
      }
    }
  }
}

function findShiftNameByMinute(centerConfig, startMinute, endMinute) {
  for (const s of centerConfig.shifts) {
    const fits =
      startMinute >= s.startMinute &&
      endMinute <= s.endMinute &&
      endMinute - startMinute <= s.endMinute - s.startMinute;
    if (fits) return s.name;
  }
  return null;
}

function greedySortClasses(classList) {
  return [...classList].sort((a, b) => {
    if (a.preferredTeacher && !b.preferredTeacher) return -1;
    if (!a.preferredTeacher && b.preferredTeacher) return 1;

    if (a.studentCount > b.studentCount) return -1;
    if (a.studentCount < b.studentCount) return 1;

    const durationA = a.courseInfo.durationInMinutes;
    const durationB = b.courseInfo.durationInMinutes;
    if (durationA > durationB) return -1;
    if (durationA < durationB) return 1;

    return 0;
  });
}

function findPossiblePlacements(
  ctx,
  currentClass,
  existingAssignments = [],
  lockedTeacherId = null
) {
  const placements = [];
  const course = currentClass.courseInfo;
  const days = ctx.centerConfig.activeDaysOfWeek;
  const shifts = ctx.centerConfig.shifts;
  let allSlotsTaken = true;

  // Skill filter (mặc định pass nếu không có cấu trúc)
  const skilledTeachersAll = ctx.allTeachers.filter((t) => {
    return canTeachCourse(t, course);
  });
  let skilledTeachers = skilledTeachersAll;
  if (lockedTeacherId) {
    skilledTeachers = skilledTeachersAll.filter(
      (t) => String(t._id) === String(lockedTeacherId)
    );
    if (skilledTeachers.length === 0) {
      return { placements: [], failureReason: "LOCKED_TEACHER_UNAVAILABLE" };
    }
  }

  if (skilledTeachers.length === 0) {
    return { placements: [], failureReason: "NO_TEACHER_SKILL" };
  }

  // Room đủ sức chứa
  const capacityRooms = ctx.allRooms.filter(
    (r) => (r.capacity || 0) >= currentClass.studentCount
  );
  if (capacityRooms.length === 0) {
    return { placements: [], failureReason: "NO_ROOM_CAPACITY" };
  }

  for (const day of days) {
    for (const shift of shifts) {
      // ca phải đủ dài cho duration
      if (shift.endMinute - shift.startMinute < course.durationInMinutes)
        continue;

      // spacing (P1): không cho 2 buổi sát ngày (min gap = 1)
      if (violatesSpacing(existingAssignments, day, 1)) continue;

      // không trùng day/shift của chính lớp này
      const alreadyUsed = existingAssignments.some(
        (a) => a.day === day && a.shift === shift.name
      );
      if (alreadyUsed) continue;

      for (const teacher of skilledTeachers) {
        const tid = String(teacher._id);
        if (ctx.scheduleState.teachers[tid]?.[day]?.[shift.name] !== null)
          continue;

        let violatesAvailability = false;
        const teacherAvailability = teacher.availability?.find(
          (a) => a.dayOfWeek === day
        );
        if (
          !teacherAvailability ||
          !teacherAvailability.shifts?.includes(shift.name)
        ) {
          violatesAvailability = true;
        }

        for (const room of capacityRooms) {
          const rid = String(room._id);
          if (ctx.scheduleState.rooms[rid]?.[day]?.[shift.name] !== null)
            continue;

          allSlotsTaken = false;
          placements.push({
            day,
            shift: shift.name,
            shiftInfo: shift,
            teacher,
            room,
            violatesAvailability,
          });
        }
      }
    }
  }

  if (allSlotsTaken) {
    return { placements: [], failureReason: "ALL_SLOTS_TAKEN" };
  }
  return { placements, failureReason: null };
}

function greedySortPlacements(ctx, placements, currentClass) {
  return [...placements].sort((a, b) => {
    let scoreA = 0,
      scoreB = 0;

    // phạt ép lịch (mềm nhưng nặng)
    if (a.violatesAvailability) scoreA -= 1000;
    if (b.violatesAvailability) scoreB -= 1000;

    // ưu tiên preferredTeacher
    if (currentClass.preferredTeacher) {
      if (String(a.teacher._id) === String(currentClass.preferredTeacher))
        scoreA += 100;
      if (String(b.teacher._id) === String(currentClass.preferredTeacher))
        scoreB += 100;
    }

    // cân bằng theo ngày
    const wA =
      ctx.scheduleState.teachers[String(a.teacher._id)][a.day].workload;
    const wB =
      ctx.scheduleState.teachers[String(b.teacher._id)][b.day].workload;
    if (wA >= 2) scoreA -= 50;
    if (wB >= 2) scoreB -= 50;

    // giờ vàng
    if (a.shiftInfo.startMinute < 720) scoreA += 10;
    if (b.shiftInfo.startMinute < 720) scoreB += 10;

    // phòng vừa sức chứa hơn
    const diffA = (a.room.capacity || 0) - currentClass.studentCount;
    const diffB = (b.room.capacity || 0) - currentClass.studentCount;
    if (diffA < diffB) scoreA += 1;
    if (diffB < diffA) scoreB += 1;

    return scoreB - scoreA;
  });
}

function applyAssignment(ctx, classId, placement) {
  const { day, shift, teacher, room } = placement;
  const tid = String(teacher._id);
  const rid = String(room._id);

  ctx.scheduleState.teachers[tid][day][shift] = classId;
  ctx.scheduleState.teachers[tid][day].workload++;
  ctx.scheduleState.rooms[rid][day][shift] = classId;
}

function revertAssignment(ctx, classId, placement) {
  const { day, shift, teacher, room } = placement;
  const tid = String(teacher._id);
  const rid = String(room._id);

  if (ctx.scheduleState.teachers[tid][day][shift] === classId) {
    ctx.scheduleState.teachers[tid][day][shift] = null;
    ctx.scheduleState.teachers[tid][day].workload--;
  }
  if (ctx.scheduleState.rooms[rid][day][shift] === classId) {
    ctx.scheduleState.rooms[rid][day][shift] = null;
  }
}

function getFailureMessage(reasonCode) {
  switch (reasonCode) {
    case "NO_TEACHER_SKILL":
      return "Không tìm thấy giáo viên nào có kỹ năng phù hợp.";
    case "NO_ROOM_CAPACITY":
      return "Không tìm thấy phòng học nào đủ sức chứa.";
    case "ALL_SLOTS_TAKEN":
      return "Tất cả giáo viên và phòng học phù hợp đều đã kín lịch.";
    default:
      return "Lỗi không xác định.";
  }
}

function canTeachCourse(teacher, course) {
  const catId = String(course.category?._id || course.category);
  const level = String(course.level || "").trim();

  if (Array.isArray(teacher.skills) && teacher.skills.length) {
    return teacher.skills.some((s) => {
      if (String(s.category) !== catId) return false;

      if (s.anyLevel) return true;

      const lvls = Array.isArray(s.levels) ? s.levels : [];
      if (lvls.includes(level)) return true;

      if (s.includeLowerLevels && lvls.length) {
        const maxIdx = Math.max(...lvls.map((lv) => LEVEL_INDEX[lv] ?? -1));
        const targetIdx = LEVEL_INDEX[level] ?? -1;
        return targetIdx !== -1 && targetIdx <= maxIdx;
      }
      return false;
    });
  }

  return false;
}

function violatesSpacing(existingAssignments, newDay, minGapDays = 1) {
  if (!existingAssignments.length) return false;
  for (const a of existingAssignments) {
    const d = Math.abs(a.day - newDay);
    const wrap = Math.min(d, 7 - d);
    if (wrap < minGapDays + 1) return true;
  }
  return false;
}

async function buildWeeklyOccupancyFromClasses({ excludeJobId } = {}) {
  const classes = await Class.find({ status: { $ne: "canceled" } })
    .select("weeklySchedules createdByJob")
    .lean();
  const teacherSlots = new Set();
  const roomSlots = new Set();

  for (const c of classes) {
    if (excludeJobId && String(c.createdByJob || "") === String(excludeJobId))
      continue;
    for (const s of c.weeklySchedules || []) {
      const shiftName = "ANY";
      const tKey = `${s.teacher}::${s.dayOfWeek}::${shiftName}`;
      const rKey = `${s.room}::${s.dayOfWeek}::${shiftName}`;
      teacherSlots.add(tKey);
      roomSlots.add(rKey);
    }
  }
  return { teacherSlots, roomSlots };
}

module.exports = {
  runAutoScheduler,
  finalizeSchedule,
  canTeachCourse,
};
