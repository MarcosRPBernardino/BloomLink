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

const registeredUsers = [
  {
    id: "user_marcos",
    name: "Marcos",
    pin: "1111",
    permissions: { admin: true, manager: true, chef: true },
    allowedRoles: ["Manager"],
    defaultRole: "Manager"
  },
  {
    id: "user_carlos",
    name: "Carlos",
    pin: "2222",
    permissions: { admin: false, manager: true, chef: false },
    allowedRoles: ["Manager"],
    defaultRole: "Manager"
  },
  {
    id: "user_ana",
    name: "Ana",
    pin: "3333",
    permissions: { admin: false, manager: false, chef: false },
    allowedRoles: ["Staff", "KP", "Stock Runner"],
    defaultRole: "Staff"
  },
  {
    id: "user_joao",
    name: "João",
    pin: "4444",
    permissions: { admin: false, manager: false, chef: false },
    allowedRoles: ["Staff", "KP", "Stock Runner"],
    defaultRole: "Staff"
  },
  {
    id: "user_rafael",
    name: "Rafael",
    pin: "5555",
    permissions: { admin: false, manager: false, chef: true },
    allowedRoles: ["Chef", "Staff", "KP", "Stock Runner"],
    defaultRole: "Chef"
  }
];

app.use(express.static(path.join(__dirname, "public")));

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOnlineUsers() {
  return Array.from(users.values()).filter((user) => user.online);
}

function getPublicOnlineUser(user) {
  return {
    id: user.id,
    name: user.name,
    permissions: user.permissions,
    currentRole: user.currentRole,
    currentLocation: user.currentLocation,
    currentChannel: user.currentChannel,
    status: user.status,
    online: user.online
  };
}

function getStockRequests() {
  return Array.from(stockRequests.values()).sort((a, b) => a.createdAt - b.createdAt);
}

function broadcastUsers() {
  io.emit("users:update", getOnlineUsers().map(getPublicOnlineUser));
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

function findRegisteredUserByName(name) {
  const normalizedName = String(name || "").trim().toLowerCase();

  return registeredUsers.find((user) => user.name.toLowerCase() === normalizedName);
}

function pinMatches(user, pin) {
  const normalizedPin = String(pin || "").trim();

  return user?.pin === normalizedPin;
}

function getPublicRegisteredUser(user) {
  return {
    id: user.id,
    name: user.name,
    permissions: user.permissions,
    allowedRoles: user.allowedRoles,
    defaultRole: user.defaultRole
  };
}

function createOnlineUser(socket, registeredUser, data) {
  const currentRole = data.currentRole;

  return {
    id: registeredUser.id,
    socketId: socket.id,
    name: registeredUser.name,
    permissions: registeredUser.permissions,
    currentRole,
    currentLocation: data.currentLocation || "Kitchen",
    currentChannel: "All",
    status: "available",
    online: true
  };
}

io.on("connection", (socket) => {
  socket.on("user:login", (data) => {
    const receivedName = String(data?.name || "").trim();
    const registeredUser = findRegisteredUserByName(receivedName);
    const pinMatched = pinMatches(registeredUser, data?.pin);

    console.log("Login attempt", {
      receivedName,
      userFound: Boolean(registeredUser),
      pinMatched
    });

    if (!registeredUser || !pinMatched) {
      socket.emit("user:login_failed", {
        message: "Invalid name or PIN."
      });
      return;
    }

    socket.data.registeredUser = registeredUser;
    socket.emit("user:login_success", getPublicRegisteredUser(registeredUser));
  });

  socket.on("user:start_shift", (data) => {
    const registeredUser = socket.data.registeredUser;

    if (!registeredUser) {
      socket.emit("user:start_failed", {
        message: "Log in before starting a shift."
      });
      return;
    }

    if (!registeredUser.allowedRoles.includes(data?.currentRole)) {
      socket.emit("user:start_failed", {
        message: "This role is not allowed for your user."
      });
      return;
    }

    const user = createOnlineUser(socket, registeredUser, data || {});
    users.set(socket.id, user);

    socket.emit("user:session_started", getPublicOnlineUser(user));
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
        io.to(user.socketId).emit("stock:alert", request);
      }
    }

    broadcastStockRequests();
  });

  socket.on("stock:response", (data) => {
    const user = users.get(socket.id);
    const request = stockRequests.get(data?.requestId);
    const action = data?.action;

    if (!user || !request || action !== "on_my_way" || !isEligibleStockRecipient(user)) {
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
