const Email = require("./email"); 
const Student = require("../models/studentModel");

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
  const classInfo = await enrollment.populate("class", "name startAt weeklySchedules");
  if (!contact) return;

  const data = {
    classInfo: classInfo.class,
    enrollment: classInfo,
    studentName: contact.studentName,
  };
  const subject = `Giữ chỗ thành công cho học viên ${contact.studentName} - Lớp ${data.enrollment.class.name}.Thời hạn: ${data.enrollment.holdExpiresAt}. Vui lòng thanh toán.`;
  

  new Email(contact.user, data)
  .send("holdCreated", subject)
  .catch(err => console.error("LỖI GỬI MAIL (Hold Created):", err.message));
};


exports.notifyPaymentConfirmed = async (studentId, enrollment) => {
  const contact = await getContactInfo(studentId);
  const classInfo = await enrollment.populate("class","name startAt weeklySchedules");
  if (!contact) return;

  const data = {
    classInfo: classInfo.class,
    studentName: contact.studentName,
    enrollment: classInfo
  };
  const subject = `Xác nhận đăng ký thành công cho học viên ${contact.studentName} - Lớp ${data.enrollment.class.name}`;

  new Email(contact.user, data)
  .send("paymentConfirmed", subject)
  .catch(err => console.error("LỖI GỬI MAIL (Hold Created):", err.message));

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
    .catch(err => console.error("LỖI GỬI MAIL (Canceled):", err.message));

};