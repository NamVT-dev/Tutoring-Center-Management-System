const mongoose = require("mongoose");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

const http = require("http");
const { Server } = require("socket.io");

const csvFilePath = path.join("public", "results.csv");

if (!fs.existsSync(csvFilePath)) {
  fs.writeFileSync(
    csvFilePath,
    "studentId,name,dob,category,testId,score,status\n"
  );
}

if (fs.existsSync(csvFilePath)) {
  const data = fs.readFileSync(csvFilePath, "utf8");
  if (!data.endsWith("\n")) {
    fs.appendFileSync(csvFilePath, "\n");
  }
}

process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.log(err.name, err.message);
});

dotenv.config({ path: "./.env" });

const app = require("./app");
const cronJob = require("./utils/cronTask");

const DB = process.env.DATABASE;
mongoose.connect(DB).then(() => console.log("DB connection successful!"));

const server = http.createServer(app);
const clientURL = process.env.FRONT_END_URI;
const io = new Server(server, {
  cors: {
    origin: clientURL,
    method: ["GET", "POST"],
    credentials: true
  }
});

app.set('socketio', io);

io.on('connection', (socket) => {
  console.log("người dùng đã kết nối:", socket.id);
  
  socket.on('disconnect', () => {
    console.log('Người dùng ngắt kết nối:', socket.id)
  });
});
const port = process.env.PORT || 9999;
server.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

cronJob();

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
