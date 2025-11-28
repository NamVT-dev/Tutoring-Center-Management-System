const Email = require("./email");
const Student = require("../models/studentModel");
const { Teacher } = require("../models/userModel");
const Notification = require("../models/notificationModel");

const getContactInfo = async (studentId) => {
  try {
    const student = await Student.findById(studentId).populate({
      path: "user",
      select: "email profile.fullname profile.phoneNumber",
    });

    if (!student || !student.user) {
      throw new Error(`Không tìm thấy user cho student ${studentId}`);
    }
    return {
      user: student.user, // Object User
      phone: student.user.profile.phoneNumber,
      studentName: student.name,
    };
  } catch (error) {
    console.error(`Error fetching contact info: ${error.message}`);
    return null;
  }
};

const sendSMS = async (phone, message) => {
  try {
    console.log(`[SMS SIMULATION] To: ${phone} | Message: ${message}`);
  } catch (error) {
    console.error(`Error sending SMS: ${error.message}`);
  }
};

exports.notifyHoldCreated = async (studentId, enrollment) => {
  const contact = await getContactInfo(studentId);
  const classInfo = await enrollment.populate(
    "class",
    "name startAt weeklySchedules"
  );
  if (!contact) return;

  const data = {
    classInfo: classInfo.class,
    enrollment: classInfo,
    studentName: contact.studentName,
  };
  const subject = `Giữ chỗ thành công cho học viên ${contact.studentName} - Lớp ${data.enrollment.class.name}.Thời hạn: ${data.enrollment.holdExpiresAt}. Vui lòng thanh toán.`;

  new Email(contact.user, data)
    .send("holdCreated", subject)
    .catch((err) => console.error("LỖI GỬI MAIL (Hold Created):", err.message));
};

exports.notifyPaymentConfirmed = async (studentId, enrollment) => {
  const contact = await getContactInfo(studentId);
  const classInfo = await enrollment.populate(
    "class",
    "name startAt weeklySchedules"
  );
  if (!contact) return;

  const data = {
    classInfo: classInfo.class,
    studentName: contact.studentName,
    enrollment: classInfo,
  };
  const subject = `Xác nhận đăng ký thành công cho học viên ${contact.studentName} - Lớp ${data.enrollment.class.name}`;

  new Email(contact.user, data)
    .send("paymentConfirmed", subject)
    .catch((err) => console.error("LỖI GỬI MAIL (Hold Created):", err.message));
};

exports.notifyHoldCanceled = async (studentId, enrollment) => {
  const contact = await getContactInfo(studentId);
  const classInfo = await enrollment.populate("class");
  if (!contact) return;

  const data = {
    className: classInfo.class.name,
    studentName: contact.studentName,
  };
  const subject = `Giữ chỗ đã hết hạn - Lớp ${data.className} - Học viên: ${contact.studentName}`;

  new Email(contact.user, data)
    .send("holdCanceled", subject)
    .catch((err) => console.error("LỖI GỬI MAIL (Canceled):", err.message));
};
exports.notifyTeacherAssigned = async (teacherId, classDoc) => {
  try {
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return;

    const schedules = classDoc.weeklySchedules.map((s) => {
      const startH = Math.floor(s.startMinute / 60)
        .toString()
        .padStart(2, "0");
      const startM = (s.startMinute % 60).toString().padStart(2, "0");
      const endH = Math.floor(s.endMinute / 60)
        .toString()
        .padStart(2, "0");
      const endM = (s.endMinute % 60).toString().padStart(2, "0");

      const days = [
        "Chủ Nhật",
        "Thứ 2",
        "Thứ 3",
        "Thứ 4",
        "Thứ 5",
        "Thứ 6",
        "Thứ 7",
      ];

      return `${days[s.dayOfWeek]} (${startH}:${startM} - ${endH}:${endM})`;
    });

    const data = {
      teacherName: teacher.profile.fullname,
      className: classDoc.name,
      classCode: classDoc.classCode,
      startDate: new Date(classDoc.startAt).toLocaleDateString("vi-VN"),
      endDate: new Date(classDoc.endAt).toLocaleDateString("vi-VN"),
      schedules: schedules,
    };

    const subject = `[MỜI GIẢNG DẠY] Lớp ${data.className} - Vui lòng xác nhận`;

    await new Email(teacher, data).send("classAssigned", subject);

    // console.log(`>> Đã gửi mail mời dạy cho GV: ${teacher.email}`);
  } catch (err) {
    console.error(`LỖI GỬI MAIL GV (${teacherId}):`, err.message);
  }
};
exports.createSystemNotification = async ({
  recipientId,
  recipientGroup,
  title,
  body,
  type = "system",
  priority = 5,
  linkId,
  linkModel = "SubstituteRequest",
  io,
}) => {
  try {
    const notifPayload = {
      title,
      body,
      type,
      priority,
      isRead: false,
      data: { linkId, linkModel },
    };

    if (recipientId) notifPayload.recipientId = recipientId;
    else if (recipientGroup) notifPayload.recipientGroup = recipientGroup;

    const notif = await Notification.create(notifPayload);

    if (io) {
      if (recipientId) {
        io.to(recipientId.toString()).emit("new_notification", notif);
      } else if (recipientGroup) {
        io.to(recipientGroup).emit("new_notification", notif);
      }
    }
    return notif;
  } catch (error) {
    console.error("Notification Error:", error);
  }
};
