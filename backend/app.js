const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const bodyParser = require("body-parser");

dotenv.config();

// Process dates in UTC on the server regardless of host OS timezone
process.env.TZ = "UTC";

const { swaggerUi, swaggerSpec } = require("./swagger");
const { dateSerializationMiddleware } = require("./utils/dateSerializer");

// ================== Here Import Routes=================

const userRoute = require("./routers/user-routes/userRoutes");
const roleRoute = require("./routers/user-routes/roleRoutes");
const userRoleRoute = require("./routers/user-routes/userRoleRoutes");
const authRoute = require("./routers/user-routes/authRoutes");
const permissionRoute = require("./routers/user-routes/permissionRoutes");
const changePasswordRoutes = require("./routers/user-routes/passwordChangeRoutes");
const notificationRoute = require("./routers/user-routes/notificationRoutes");
const profileRoute = require("./routers/user-routes/profileRoutes");


// ================== Organization (Sector) Routes ==========================
const sectorRoute = require("./routers/sector-routes/sectorRoutes");

// ================== Location (Region / Zone / Woreda) Routes ==================
const adminAreaRoute = require("./routers/location-routes/adminAreaRoutes");

// ================== Company, License & Mineral Routes ==================
const companyRoutes = require("./routers/company-routes/companyRoutes");

// ================== Team Routes ==================
const teamRoutes = require("./routers/team-routes/teamRoutes");

// ================== Form (Checklist) Routes ==================
const formRoute = require("./routers/form-routes/formRoutes");

// ================== Inspection Schedules & Tasks ==================
const inspectionRoutes = require("./routers/inspection-routes/inspectionRoutes");
const { startScheduler } = require("./services/scheduleService");

// ================== Attachment Routes ==========================
const attachmentRoute = require("./routers/attachment-routes/attachmentRoute");

const app = express();
const appServer = http.createServer(app);

app.use(
  express.json({
    verify: (req, res, buf) => {
      if (!buf.length) return; // allow empty body
      try {
        JSON.parse(buf);
      } catch (e) {
        // Don't throw the error after sending response
        const error = new Error("Invalid JSON payload");
        error.status = 400;
        error.expose = true;
        throw error;
      }
    },
  }),
);

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// ===========Serve static files (PDFs, uploads)=====================
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders: (res, filePath) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      if (filePath.endsWith(".pdf")) {
        res.set("Content-Disposition", "inline");
      }
    },
  }),
);

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res, filePath) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    },
  }),
);

app.set("trust proxy", 1);

// ================== CORS Configuration ==================
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:4000",
  process.env.FRONTEND_URL,
].filter(Boolean);
const corsOptions = {
  origin: true, // Allow all origins for development
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

// Serialize all API date fields as ISO UTC strings
app.use(dateSerializationMiddleware);

// ================== Database Connection ==================
const { sequelize } = require("./models");

const connectWithRetry = async (retries = 10, delay = 5000) => {
  for (let i = 1; i <= retries; i++) {
    try {
      await sequelize.authenticate();
      console.log("✅ Database connected successfully");
      break;
    } catch (err) {
      console.error(`❌ DB connection failed (attempt ${i}/${retries}):`, err.message);
      if (i === retries) {
        console.error("Could not connect to DB after multiple attempts. Exiting...");
        process.exit(1);
      }
      await new Promise((res) => setTimeout(res, delay));
    }
  }
};

connectWithRetry();

// ================== Swagger Setup ==================
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ================== API Routes go here ==================

app.use("/api/users", userRoute);
app.use("/api/roles", roleRoute);
app.use("/api/user-roles", userRoleRoute);
app.use("/api/auth", authRoute);
app.use("/api/profile", profileRoute);

app.use("/api/change-password", changePasswordRoutes);
app.use("/api/auth/forgot-password", require("./routers/user-routes/forgotPasswordRoutes"));
app.use("/api/permissions", permissionRoute);
app.use("/api/notifications", notificationRoute);

// app.use("/api/issue-attachments", issueFileAttachmentRoutes);
// app.use("/api/attachments", fileAttachmentRoutes);

// ================== Api Organization (Sector) Routes =====================
app.use("/api/sector-nodes", sectorRoute);

// ================== Api Location Routes =====================
app.use("/api/admin-areas", adminAreaRoute);

// ================== Api Company, License & Mineral Routes =====================
app.use("/api/companies", companyRoutes.companies);
app.use("/api/licenses", companyRoutes.licenses);
app.use("/api/minerals", companyRoutes.minerals);
app.use("/api/mineral-categories", companyRoutes.mineralCategories);

// ================== Api Team Routes =====================
app.use("/api/teams", teamRoutes.teams);
app.use("/api/team-members", teamRoutes.members);

// ================== Api Form Routes =====================
app.use("/api/forms", formRoute);

// Inspection schedules and their tasks
app.use("/api/inspection-schedules", inspectionRoutes.schedules);
app.use("/api/inspections", inspectionRoutes.inspections);
app.use("/api/inspection-files", inspectionRoutes.fileLinks);

// ================== Api Attachment Routes =====================
app.use("/api/attachments", attachmentRoute);

// ================== Root Endpoint ==================
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Mining Inspection Management System API 🚀" });
});

// ================== Error Handler ==================
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ================== Start App Server ==================
const appPort = process.env.PORT || 4000;
appServer.listen(appPort, () => {
  console.log(` App server running at http://localhost:${appPort}`);
  startScheduler(); // creates the tasks of inspection schedules (hourly)
});

// ================== Socket.IO Setup ==================
const socketServer = http.createServer();
const io = new Server(socketServer, {
  cors: corsOptions,
});

const onlineUsers = new Map();

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    onlineUsers.set(userId, socket.id);
    console.log(` User ${userId} connected: ${socket.id}`);
  }

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    console.log(`User ${userId} disconnected`);
  });
});

const socketPort = process.env.SOCKET_PORT || 5000;
socketServer.listen(socketPort, () => {
  console.log(`Socket.IO server running at http://localhost:${socketPort}`);
});

// Make Socket.IO accessible globally
app.set("socketio", io);

module.exports = { appServer, io, onlineUsers };

// Expose the server using
// cloudflared tunnel --url http://localhost:4000
