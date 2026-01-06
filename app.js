const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// routes
const authRoutes = require("./routes/auth");
const questionRoutes = require("./routes/question");
const matchRoutes = require("./routes/match");
const practiceMatchRoutes = require("./routes/practicematch");
const friendRoutes = require("./routes/friend");
const adminRoutes = require("./routes/admin");
const notificationRoutes = require("./routes/notification");
const notificationScheduler = require("./cronJobs/notification");

const app = express();
const server = http.createServer(app);

// static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// socket.io
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.set("io", io);

// middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/question", questionRoutes);
app.use("/api/practice", practiceMatchRoutes);
app.use("/api/friend", friendRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", notificationRoutes);

require("./controller/pvpController")(io);

// test route
app.get("/", (req, res) => {
  res.json({ success: true, message: "Server is up and running" });
});

// 🔹 CONNECT MONGOOSE (separate)
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    notificationScheduler.init();
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// 🔹 START SERVER (separate)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
