
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const playerSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: false,
      trim: true,
    },
    lastName: {
      type: String,
      required: false,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // bcrypt-hashed password
    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: false,
    },
    country: {
      type: String,
      required: false,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: false,
    },

    profileImage: {
      type: String,
      default: null,
    },

    // "PR" = personal record / high score
    pr: {
      practice: {
        easy: { type: Number, default: 1000 },
        medium: { type: Number, default: 1000 },
        hard: { type: Number, default: 1000 },
      },
      pvp: {
        easy: { type: Number, default: 1000 },
        medium: { type: Number, default: 1000 },
        hard: { type: Number, default: 1000 },
      },
    }, 

    fcmToken: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

playerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

playerSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Player", playerSchema);
