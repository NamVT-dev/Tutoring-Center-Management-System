const mongoose = require("mongoose");

//log
const logEntrySchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
  },
  stage: String, // 'INIT', 'LOAD', 'ANALYZE', 'SCHEDULE_START', 'SCHEDULE_PROGRESS', 'DRAFT_READY', 'FINALIZING', 'COMPLETED', 'ERROR'
  message: String,
  isError: {
    type: Boolean,
    default: false,
  },
});

//kết quả xếp lịch - lịch nháp
const assignmentSchema = new mongoose.Schema(
  {
    virtualClassId: String,
    courseId: {
      type: mongoose.Schema.ObjectId,
      ref: "Course",
    },
    courseName: String,
    studentCount: Number,
    day: Number,
    shiftName: String,
    startMinute: Number,
    endMinute: Number,
    teacher: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    room: {
      type: mongoose.Schema.ObjectId,
      ref: "Room",
    },
    violatesAvailability: {
      type: Boolean,
      default: false,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const scheduleJobSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      require: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "running",
        "draft",
        "finalizing",
        "completed",
        "system_error",
      ],
      default: "pending",
    },

    //dữ liệu đầu vào (GĐ1)
    intakeStartDate: Date,
    intakeEndDate: Date,
    successThreshold: Number,
    classStartAnchor: { type: Date, default: null },
    //phân tích đầu vào (GĐ 2 & 3)
    inputAnalysis: {
      demandList: {
        type: [Object],
        default: [],
      },
      virtualClassList: {
        type: [Object],
        default: [],
      },
      pendingList: {
        type: [Object],
        default: [],
      },
    },

    //bản nháp (GĐ4)
    draftSchedule: [[assignmentSchema]],

    //báo cáo kết quả (GĐ 5)
    resultReport: {
      successfulCount: Number,
      failedCount: Number,
      failedClasses: [Object],
      warnings: [Object],
    },

    logs: [logEntrySchema],
  },
  { timestamps: true }
);

const ScheduleJob = mongoose.model(
  "ScheduleJob",
  scheduleJobSchema,
  "schedule_jobs"
);
module.exports = ScheduleJob;
