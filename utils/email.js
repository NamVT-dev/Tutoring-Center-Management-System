const nodemailer = require("nodemailer");
const pug = require("pug");
const htmlToText = require("html-to-text");

module.exports = class Email {
  constructor(user, data) {
    this.to = user.email;
    this.firstName = user.profile.fullname.split(" ")[0];
    this.data = data;
    this.from = `TutorCenter <${process.env.SMTP_USER}>`;
  }

  newTransport() {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAUTH2",
        user: process.env.SMTP_USER,
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      },
    });
  }

  // Send the actual email
  async send(template, subject) {
    // 1) Render HTML based on a pug template
    const html = pug.renderFile(
      `${__dirname}/../public/email/${template}.pug`,
      {
        firstName: this.firstName,
        subject,
        ...this.data,
      }
    );

    // 2) Define email options
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html,
      text: htmlToText.convert(html, {
        wordwrap: 130,
      }),
    };

    // 3) Create a transport and send email
    await this.newTransport().sendMail(mailOptions);
  }

  async sendWelcome() {
    await this.send("welcome", "Chào mừng tới với TutorCenter!");
  }

  async sendConfirmEmail() {
    await this.send(
      "emailConfirm",
      `${this.firstName}, mã pin của bạn là ${this.data?.pin}, vui lòng xác nhận địa chỉ email của bạn`
    );
  }

  async sendPasswordReset() {
    await this.send(
      "passwordReset",
      "Cài lại mật khẩu trên TutorCenter (khả dụng trong 10p)"
    );
  }

  async sendTestRegisterSuccess() {
    await this.send(
      "testRegisterSuccess",
      "Đăng ký test thành công, hãy truy cập vào đường link để thực hiện bài test"
    );
  }

  async sendTestResult() {
    await this.send(
      "testResult",
      "Điểm thi của bạn đã có! Cùng xem kết quả và lộ trình học sắp tới"
    );
  }

  async sendStaffWelcome() {
    await this.send(
      "staffWelcome",
      "Tài khoản nhân viên TutorCenter đã được tạo!"
    );
  }

  async sendTeacherWelcome() {
    await this.send(
      "teacherWelcome",
      "Tài khoản giáo viên TutorCenter đã được tạo!"
    );
  }
};
