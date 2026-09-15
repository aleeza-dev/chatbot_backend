const express = require("express");
const axios = require("axios");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    const response = await axios.post(
      `${process.env.NEXAAI_URL}/chat`,
      {
        message: message.trim(),
      },
      {
        timeout: 120000,
      }
    );

    res.json({
      response: response.data.response,
    });
  } catch (error) {
    console.error(
      "NexaAI Error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      message: "NexaAI could not generate a response.",
    });
  }
});

module.exports = router;