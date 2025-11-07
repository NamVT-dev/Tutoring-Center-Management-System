const crypto = require("crypto");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
function idOf(x) {
  if (!x) return "null";
  if (typeof x === "string") return x;
  if (x instanceof mongoose.Types.ObjectId) return x.toString();
  if (x._id) return idOf(x._id);
  return String(x);
}
function buildScheduleSignature(courseId, weeklySchedules) {
  const cid = idOf(courseId);
  for (const s of weeklySchedules) {
    if (!s.teacher || !s.room) {
      throw new Error(
        "weeklySchedules slots must have both teacher and room to build signature"
      );
    }
  }
  const norm = weeklySchedules
    .map((s) => ({
      d: s.dayOfWeek,
      s: s.startMinute,
      e: s.endMinute,
      r: idOf(s.room),
      t: idOf(s.teacher),
    }))
    .sort(
      (a, b) =>
        a.d - b.d ||
        a.s - b.s ||
        a.e - b.e ||
        a.r.localeCompare(b.r) ||
        a.t.localeCompare(b.t)
    );

  const payload = JSON.stringify({ c: cid, slots: norm });

  return crypto.createHash("sha256").update(payload).digest("hex");
}

function computeClassStartEndExact({
  timezone,
  weeklySchedules,
  totalSessions,
  anchorDate,
}) {
  const slots = [...weeklySchedules].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute
  );
  const slotsPerWeek = slots.length;
  const anchor = moment.tz(anchorDate, timezone).startOf("day");
  // 1) Buổi đầu tiên: với mỗi slot, tìm ngày trong tuần TRÊN/SAU anchor
  const firstStartMoments = slots.map((s) => {
    // Lấy ngày 's.dayOfWeek' trong tuần của anchor
    let d = anchor.clone().day(s.dayOfWeek);
    // Nếu rơi TRƯỚC anchor (trong cùng tuần), nhảy sang tuần kế
    if (d.isBefore(anchor)) d.add(1, "week");

    // Lắp giờ/phút theo startMinute
    const dt = moment
      .tz(
        {
          year: d.year(),
          month: d.month(),
          date: d.date(),
          hour: 0,
          minute: 0,
          second: 0,
        },
        timezone
      )
      .add(s.startMinute, "minutes");

    return dt;
  });

  // Buổi đầu là MIN của các slot đầu tuần
  const firstStart = firstStartMoments.reduce((min, cur) =>
    cur.isBefore(min) ? cur : min
  );

  const lastIndex = totalSessions - 1;
  const weekOffset = Math.floor(lastIndex / slotsPerWeek);
  const slotIndex = lastIndex % slotsPerWeek;
  const lastSlot = slots[slotIndex];

  let firstWeekLastSlotDay = anchor.clone().day(lastSlot.dayOfWeek);
  if (firstWeekLastSlotDay.isBefore(anchor))
    firstWeekLastSlotDay.add(1, "week");

  // Cộng thêm 'weekOffset' tuần để ra đúng tuần cuối
  const lastSessionDay = firstWeekLastSlotDay.clone().add(weekOffset, "weeks");

  const endAt = moment
    .tz(
      {
        year: lastSessionDay.year(),
        month: lastSessionDay.month(),
        date: lastSessionDay.date(),
        hour: 0,
        minute: 0,
        second: 0,
      },
      timezone
    )
    .add(lastSlot.endMinute, "minutes");

  return {
    startAt: firstStart.toDate(),
    endAt: endAt.toDate(),
  };
}
function buildClassCode(course) {
  const cat = String(course?.category?.name || "CAT").toUpperCase().replace(/\s+/g, "");
  const lvl = String(course?.level || "LVL").replace(/\s+/g, "");
  const now = moment().format("YYYYMMDD-HHmm");
  const rnd = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${cat}-${lvl}-${now}-${rnd}`;
}
module.exports = {
  buildScheduleSignature,
  computeClassStartEndExact,
  buildClassCode
};
