const mongoose = require("mongoose");
const dotenv = require("dotenv");

const http = require("http");
const { Server } = require("socket.io");

process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.log(err.name, err.message);
});

dotenv.config({ path: "./.env" });

const app = require("./app");
const cronJob = require("./utils/cronTask");

const DB = process.env.DATABASE;
mongoose.connect(DB).then(() => {
  console.log("DB connection successful!");
  cronJob();
});

const server = http.createServer(app);
const clientURL = process.env.FRONT_END_URI;
const io = new Server(server, {
  cors: {
    origin: clientURL,
    method: ["GET", "POST"],
    credentials: true,
  },
});

app.set("socketio", io);

io.on("connection", (socket) => {
  socket.on("join", (userData) => {
    if (!userData) return;

    const userId = userData._id || userData;
    console.log(`User ${userId} joined room.`);
    socket.join(userId.toString());

    if (userData.role === "admin" || userData.role === "staff") {
      socket.join("staff");
    }
  });
});
const port = process.env.PORT || 9999;
server.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

// cronJob();

process.on("unhandledRejection", (err) => {
  console.log("UNHANDLED REJECTION! 💥 Shutting down...");
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  console.log("👋 SIGTERM RECEIVED. Shutting down gracefully");
  server.close(() => {
    console.log("💥 Process terminated!");
  });
});
