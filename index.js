require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bx9ca.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully!");

    const db = client.db("taskDb");
    const userCollection = db.collection("users");
    const taskCollection = db.collection("tasks");

    // WebSocket setup
    const server = require("http").createServer(app);
    const wss = new WebSocket.Server({ server });

    const connectedClients = new Set();

    wss.on("connection", (ws) => {
      console.log("Client connected");
      connectedClients.add(ws);

      ws.on("close", () => {
        console.log("Client disconnected");
        connectedClients.delete(ws);
      });
    });

    // Watch MongoDB for changes
    const changeStream = taskCollection.watch();
    changeStream.on("change", (change) => {
      console.log("Database Change Detected:", change);
      connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(change));
        }
      });
    });

    // API Routes
    app.get("/tasks", async (req, res) => {
      const { email } = req.query;

      const tasks = await taskCollection.find({ email }).toArray();
      res.send(tasks);
    });

    app.post("/tasks", async (req, res) => {
      const { name, status } = req.body;
      if (!name || !status) {
        return res.status(400).json({ error: "Name and status required" });
      }

      const result = await taskCollection.insertOne({ name, status });
      res.send(result);
    });

    app.put("/tasks/:id", async (req, res) => {
      const { id } = req.params;
      console.log("Request Params:", req.params); // Log the params

      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid or missing task ID" });
      }

      const { status } = req.body;
      if (!["todo", "in progress", "done"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const result = await taskCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      console.log("Task update result:", result);

      res.json({ message: "Task updated", result });
    });

    app.delete("/tasks/:id", async (req, res) => {
      console.log("Request Params:", req.params);

      const { id } = req.params;
      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid or missing task ID" });
      }

      await taskCollection.deleteOne({ _id: new ObjectId(id) });
      res.json({ message: "Task deleted" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/", (req, res) => {
      res.send("Add Task on your list");
    });

    // Start the WebSocket server along with Express
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run();
