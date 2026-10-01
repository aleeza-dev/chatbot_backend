import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
  type: String,
  required: false,
  minlength: 6,
},

googleId: {
  type: String,
  unique: true,
  sparse: true,
},

avatar: {
  type: String,
  default: "",
},

authProvider: {
  type: String,
  enum: ["local", "google"],
  default: "local",
}
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

export default User;