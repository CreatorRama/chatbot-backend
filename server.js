require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai"); 

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));
  
// Define Chat Schema
const ChatSchema = new mongoose.Schema({
  userId: String,
  messages: [{ role: String, content: String }]
}, { collection: "chat_history" });

const Chat = mongoose.model("Chat", ChatSchema);

// Handle AI Chat Requests using Gemini API
app.post("/chat", async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ error: "Missing userId or message" });
    }

    // Fetch previous messages from database
    let chat = await Chat.findOne({ userId });
    if (!chat) chat = new Chat({ userId, messages: [] });

    chat.messages.push({ role: "user", content: message });

    try {
      // Initialize Gemini chat
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      
      // Convert chat history to Gemini format
      const geminiMessages = chat.messages.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      }));
      
      // Start chat and send message
      const chatSession = model.startChat({
        history: geminiMessages.slice(0, -1), // All messages except the latest
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });
      
      const result = await chatSession.sendMessage(message);
      const botResponse = result.response.text();
      
      const botMessage = {
        role: "assistant",
        content: botResponse
      };

      chat.messages.push(botMessage);
      await chat.save();

      res.json({ reply: botMessage.content });
    } catch (apiError) {
      console.error("Gemini API Error:", apiError);
      
      // Fallback to mock response if API fails
      const mockResponse = `I'm sorry, I'm currently experiencing connection issues. Your message was: "${message}". Please try again later.`;
      
      const fallbackMessage = {
        role: "assistant",
        content: mockResponse
      };
      
      chat.messages.push(fallbackMessage);
      await chat.save();
      
      res.json({ reply: fallbackMessage.content });
    }
  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: error.message });
  }
});


app.post("/logout", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    await Chat.deleteOne({ userId }); // Delete chat history from MongoDB

    res.json({ message: "Chat history deleted, user logged out." });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});




const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));