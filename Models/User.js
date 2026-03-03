const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    UserName: { type: String, required: true },
    Email: { type: String, required: true, unique: true },
    Password: { type: String, required: true },
    Role: { type: Number, default: 0 },
    ImageURL: { type: String },
    IsActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// For compatibility with previous numeric UserID usage we expose a virtual
userSchema.virtual("UserID").get(function () {
  return this._id.toString();
});

userSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
    delete ret.Password;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);

