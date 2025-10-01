const mongoose = require("mongoose");
const validator = require("validator");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      required: [true, "Xin hãy cung cấp tên tài khoản"],
    },
    email: {
      type: String,
      required: [true, "Xin hãy cung cấp email của bạn"],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, "Email không hợp lệ"],
    },
    profile: {
      photo: {
        type: String,
        default:
          "https://res.cloudinary.com/dmskqrjiu/image/upload/v1742210170/users/default.jpg.jpg",
      },
      phoneNumber: {
        type: String,
        unique: true,
        required: [true, "Xin hãy cung cấp số điện thoại của bạn"],
        validate: [validator.isMobilePhone, "Số điện thoại không hợp lệ"],
      },
      dob: {
        type: Date,
        required: [true, "Xin hãy cung cấp ngày sinh"],
      },
      gender: {
        type: String,
        enum: ["male", "female"],
      },
    },
    student: {
      type: [mongoose.Schema.ObjectId],
      ref: "User",
    },
    role: {
      type: String,
      enum: ["student", "admin", "teacher", "parent"],
      default: "student",
    },
    class: {
      type: [String],
    },
    level: {
      type: String,
    },
    salary: {
      type: [String],
    },
    avaiable: {
      type: String,
    },
    password: {
      type: String,
      required: [true, "Xin hãy đặt mật khẩu"],
      minlength: [8, "Mật khẩu phải chứa ít nhất 8 ký tự"],
      validate: [
        validator.isStrongPassword,
        "Mật khẩu phải chứa ít nhất 8 ký tự, bao gồm ký tự đặc biệt, chữ in hoa và số",
      ],
      select: false,
    },
    passwordConfirm: {
      type: String,
      required: [true, "Xin hãy xác nhận mật khẩu"],
      validate: {
        validator: function (el) {
          return el === this.password;
        },
        message: "Mật khẩu không trùng khớp",
      },
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    confirmPin: String,
    confirmPinExpires: Date,
    active: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true }
);
const User = mongoose.model("User", userSchema, "users");

module.exports = User;
