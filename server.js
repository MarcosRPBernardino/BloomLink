const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

const users = new Map();
const stockRequests = new Map();

app.use(express.static(path.join(__dirname, "public")));

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOnlineUsers() {
  return Array.from(users.values()).filter((user) => user.online);
}

function getStockRequests() {
  return Array.from(stockRequests.values()).sort((a, b) => a.createdAt - b.createdAt);
}

function broadcastUsers() {
  io.emit("users:update", getOnlineUsers());
}

function broadcastStockRequests() {
  io.emit("stock:update", getStockRequests());
}

function isEligibleStockRecipient(user) {
  if (!user || user.status === "on_break") {
    return false;
  }

  // Stock alerts are filtered on the server. Staff can create requests, but they do not receive alerts.
  return (
    user.permissions?.admin === true ||
    user.permissions?.manager === true ||
    user.currentRole === "Manager" ||
    user.currentRole === "KP" ||
    user.currentRole === "Stock Runner"
  );
}

function getSafeUserPayload(socket, data) {
  const currentRole = data.currentRole || "Staff";

  return {
    id: socket.id,
    name: String(data.name || "Unknown").trim() || "Unknown",
    // For this MVP, permissions are derived server-side from the selected role.
    permissions: {
      admin: false,
      manager: currentRole === "Manager",
      chef: false
    },
    currentRole,
    currentLocation: data.currentLocation || "Kitchen",
    currentChannel: data.currentChannel || "All",
    status: data.status || "available",
    online: true
  };
}

io.on("connection", (socket) => {
  socket.on("user:connect", (data) => {
    const user = getSafeUserPayload(socket, data || {});
    users.set(socket.id, user);

    socket.emit("stock:update", getStockRequests());
    broadcastUsers();
  });

  socket.on("stock:create", (data) => {
    const requester = users.get(socket.id);

    if (!requester || !data?.location || !data?.item) {
      return;
    }

    const request = {
      id: createId("stock"),
      location: data.location,
      item: data.item,
      requestedBy: {
        id: requester.id,
        name: requester.name
      },
      status: "pending",
      assignedTo: null,
      responses: [],
      createdAt: Date.now(),
      deliveredAt: null
    };

    stockRequests.set(request.id, request);

    for (const user of getOnlineUsers()) {
      if (user.id === requester.id) {
        continue;
      }

      if (isEligibleStockRecipient(user)) {
        io.to(user.id).emit("stock:alert", request);
      }
    }

    broadcastStockRequests();
  });

  socket.on("stock:response", (data) => {
    const user = users.get(socket.id);
    const request = stockRequests.get(data?.requestId);
    const action = data?.action;

    if (!user || !request || action !== "on_my_way") {
      return;
    }

    // Assignment locking happens here: the first on_my_way wins, later claims are rejected.
    if (action === "on_my_way" && request.assignedTo) {
      socket.emit("stock:claim_failed", {
        requestId: request.id,
        message: "This request has already been assigned."
      });
      broadcastStockRequests();
      return;
    }

    request.responses.push({
      userId: user.id,
      userName: user.name,
      action,
      createdAt: Date.now()
    });

    request.assignedTo = {
      id: user.id,
      name: user.name
    };
    request.status = "assigned";

    broadcastStockRequests();
  });

  socket.on("stock:delivered", (data) => {
    const user = users.get(socket.id);
    const request = stockRequests.get(data?.requestId);

    if (!user || !request || request.status === "delivered") {
      return;
    }

    // Only the assigned user can complete the request.
    if (!request.assignedTo || request.assignedTo.id !== user.id) {
      return;
    }

    request.status = "delivered";
    request.deliveredAt = Date.now();

    broadcastStockRequests();
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);

    if (user) {
      user.online = false;
      users.delete(socket.id);
      broadcastUsers();
    }

    socket.broadcast.emit("user:disconnect", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`BloomLink Stock MVP server running on port ${PORT}`);
});
