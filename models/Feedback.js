import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },

    aiResponse: {
      type: String,
      required: true,
    },

    feedback: {
      type: String,
      enum: ["like", "dislike"],
      required: true,
    },

    mode: {
      type: String,
      default: "general",
    },
  },
  {
    timestamps: true,
  }
);

const Feedback = mongoose.model(
  "Feedback",
  feedbackSchema
);

export default Feedback;