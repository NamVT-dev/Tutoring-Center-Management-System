const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");

const { generateRandomPin } = require("../utils/passwordUtils");
const { LEVEL_ORDER } = require("../utils/levels");

const availabilitySchema = new mongoose.Schema(
  {
    // 0=CN ... 6=Thứ 7
    // 0=00h00 ... 1439=23x60 + 59
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    shifts: [
      {
        type: String,
        // enum: ["S1", "S2", "S3","S4", "S5", "S6"],
        // required: true,
      },
    ],
    effective: {
      start: Date,
      end: Date,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Xin hãy cung cấp email của bạn"],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, "Email không hợp lệ"],
    },
    profile: {
      fullname: {
        type: String,
        required: [true, "Xin hãy cung cấp tên của bạn"],
        validate: {
          validator: function (val) {
            return val.length <= 50;
          },
          message: "Quá giới hạn số lượng kí tự",
        },
      },
      photo: {
        type: String,
        default:
          "https://res.cloudinary.com/dmskqrjiu/image/upload/v1742210170/users/default.jpg.jpg",
      },
      phoneNumber: {
        type: String,
        unique: true,
        required: [true, "Xin hãy cung cấp số điện thoại của bạn"],
        validate: {
          validator: function (val) {
            return validator.isMobilePhone(val, "vi-VN");
          },
          message: "Số điện thoại không hợp lệ",
        },
      },
      dob: {
        type: Date,
        required: [true, "Xin hãy cung cấp ngày sinh"],
        validate: {
          validator: function (val) {
            return validator.isBefore(val.toLocaleString());
          },
          message: "Ngày sinh không hợp lệ",
        },
      },
      gender: {
        type: String,
        enum: ["male", "female"],
      },
    },
    role: {
      type: String,
      enum: ["admin", "teacher", "member", "staff"],
      default: "member",
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
    confirmPin: {
      type: String,
      select: false,
    },
    confirmPinExpires: Date,
    active: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
    },
  },
  {
    discriminatorKey: "role",
    collection: "users",
    timestamps: true,
  }
);

userSchema.index({ role: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 12);

  this.passwordConfirm = undefined;
  next();
});

userSchema.pre("save", function (next) {
  if (!this.isModified("password") || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );

    return JWTTimestamp < changedTimestamp;
  }

  // False means NOT changed
  return false;
};

userSchema.methods.createConfirmPin = function () {
  const confirmPin = generateRandomPin(6);
  this.confirmPin = crypto
    .createHash("sha256")
    .update(confirmPin)
    .digest("hex");

  this.confirmPinExpires = Date.now() + 10 * 60 * 1000;

  console.log(confirmPin);
  return confirmPin;
};

userSchema.methods.confirmEmail = function (pin) {
  const hashedPin = crypto.createHash("sha256").update(pin).digest("hex");

  if (hashedPin !== this.confirmPin || Date.now() > this.confirmPinExpires)
    return false;

  this.active = true;
  this.confirmPin = undefined;
  this.confirmPinExpires = undefined;

  return true;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};
const User = mongoose.model("User", userSchema, "users");

exports.User = User;
const skillSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    levels: [
      {
        type: String,
        trim: true,
        enum: LEVEL_ORDER,
      },
    ],
    includeLowerLevels: { type: Boolean, default: false },
    anyLevel: { type: Boolean, default: false },
  },
  { _id: false }
);
const teacherSchema = new mongoose.Schema({
  class: {
    type: [mongoose.Schema.ObjectId],
    ref: "Class",
  },
  availability: [availabilitySchema],
  maxHoursPerDay: Number,
  maxHoursPerWeek: Number,
  salary: {
    type: [String],
  },
  teachCategories: {
    type: [mongoose.Schema.ObjectId],
    ref: "Category",
  },
  skills: { type: [skillSchema], default: [] },
  embedding: { type: [Number], select: false },
});

exports.Teacher = User.discriminator("teacher", teacherSchema);

const memberSchema = new mongoose.Schema({
  student: {
    type: [mongoose.Schema.ObjectId],
    ref: "Student",
  },
});

exports.Member = User.discriminator("member", memberSchema);

const staffSchema = new mongoose.Schema();
exports.Staff = User.discriminator("staff", staffSchema);
