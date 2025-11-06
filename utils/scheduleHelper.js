const crypto = require("crypto");
const moment = require("moment-timezone");

function buildScheduleSignature(courseId, weeklySchedules) {
  const norm = weeklySchedules
    .map((s) => ({
      d: s.dayOfWeek,
      s: s.startMinute,
      e: s.endMinute,
      r: String(s.room),
      t: String(s.teacher),
    }))
    .sort(
      (a, b) =>
        a.d - b.d ||
        a.s - b.s ||
        a.e - b.e ||
        a.r.localeCompare(b.r) ||
        a.t.localeCompare(b.t)
    );

  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ c: String(courseId), slots: norm }))
    .digest("hex");
}

function computeClassStartEndExact({
  timezone,
  weeklySchedules,
  totalSessions,
  firstWeekOffset = 1,
}) {
  const slots = [...weeklySchedules].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute
  );
  const slotsPerWeek = slots.length;
  const baseWeek = moment
    .tz(timezone)
    .startOf("week")
    .add(firstWeekOffset, "week");

  const firstWeekStarts = slots.map((s) =>
    baseWeek.clone().day(s.dayOfWeek).add(s.startMinute, "minutes").toDate()
  );
  const startAt = new Date(
    Math.min(...firstWeekStarts.map((d) => d.getTime()))
  );

  const lastIndex = totalSessions - 1;
  const weekIndex = Math.floor(lastIndex / slotsPerWeek);
  const slotIndex = lastIndex % slotsPerWeek;
  const lastSlot = slots[slotIndex];
  const lastDay = baseWeek
    .clone()
    .add(weekIndex, "week")
    .day(lastSlot.dayOfWeek)
    .add(lastSlot.endMinute, "minutes")
    .toDate();

  return { startAt, endAt: lastDay };
}
module.exports = {
  buildScheduleSignature,
  computeClassStartEndExact,
};
