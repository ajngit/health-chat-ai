// app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const userRoutes = require("./Routes/userRoutes");
const chatRoutes = require("./Routes/chatRoutes");
const adminRoutes = require("./Routes/adminRoutes");
const connectDb = require("./dbConfig");
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: ["http://localhost:4200","http://localhost:1433","https://harvest-hub-nine.vercel.app"],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use("/", userRoutes);
app.use("/", chatRoutes);
app.use("/", adminRoutes);

connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
