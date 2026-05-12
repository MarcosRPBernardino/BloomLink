try {
  require("dotenv").config();
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") {
    throw error;
  }
}

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const webPush = require("web-push");
const {
  dbPath,
  initializeDatabase,
  findRegisteredUserByName,
  listRegisteredUsers,
  getRegisteredUserById,
  getAdminUserCount,
  createRegisteredUser,
  updateRegisteredUserPermissions,
  setRegisteredUserDisabled,
  resetRegisteredUserPin,
  deleteRegisteredUser
} = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Registered users are persistent in SQLite. Online users stay in memory because they are live socket sessions.
const users = new Map();
const pushSubscriptionsByUserId = new Map();

// Stock requests are still in memory for this MVP phase; only registered users are persisted in Phase 2A.
const stockRequests = new Map();

initializeDatabase();

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@bloomlink.live";
const pushNotificationsEnabled = Boolean(vapidPublicKey && vapidPrivateKey);

if (pushNotificationsEnabled) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn("Web Push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/push/public-key", (req, res) => {
  res.json({
    publicKey: vapidPublicKey
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

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

function canManageStockRequests(user) {
  return (
    user?.permissions?.admin === true ||
    user?.permissions?.manager === true ||
    user?.currentRole === "Manager"
  );
}

function storePushSubscription(userId, subscription) {
  if (!subscription?.endpoint) {
    throw new Error("Invalid push subscription.");
  }

  if (!pushSubscriptionsByUserId.has(userId)) {
    pushSubscriptionsByUserId.set(userId, new Map());
  }

  pushSubscriptionsByUserId.get(userId).set(subscription.endpoint, subscription);
}

async function sendStockPushNotification(user, request) {
  if (!pushNotificationsEnabled) {
    return;
  }

  const userSubscriptions = pushSubscriptionsByUserId.get(user.id);

  if (!userSubscriptions || userSubscriptions.size === 0) {
    return;
  }

  const payload = JSON.stringify({
    title: "🚨 Stock Request",
    body: `${request.location} needs ${request.item}`,
    url: "https://bloomlink.live"
  });

  for (const [endpoint, subscription] of userSubscriptions.entries()) {
    try {
      await webPush.sendNotification(subscription, payload);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        userSubscriptions.delete(endpoint);
      } else {
        console.error("Push notification failed:", error.message);
      }
    }
  }
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
    defaultRole: user.defaultRole,
    disabled: user.disabled
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

function isAdminSocket(socket) {
  const user = users.get(socket.id);

  return user?.permissions?.admin === true;
}

function emitAdminUsers(socket) {
  socket.emit("admin:users:list", listRegisteredUsers().map(getPublicRegisteredUser));
}

function handleAdminAction(socket, action) {
  // Admin actions are validated on the server, so hiding the UI is not the security boundary.
  if (!isAdminSocket(socket)) {
    socket.emit("admin:error", {
      message: "Admin permission is required."
    });
    return;
  }

  try {
    action();
    emitAdminUsers(socket);
  } catch (error) {
    socket.emit("admin:error", {
      message: error.message || "Admin action failed."
    });
  }
}

function removeOnlineSessionsForRegisteredUser(registeredUserId) {
  for (const [socketId, user] of users.entries()) {
    if (user.id === registeredUserId) {
      io.to(socketId).emit("user:account_deleted", {
        message: "Your account was deleted by an admin."
      });
      users.delete(socketId);
    }
  }

  broadcastUsers();
}

function invalidateOnlineSessionsForRegisteredUser(registeredUserId) {
  for (const [socketId, user] of users.entries()) {
    if (user.id === registeredUserId) {
      io.to(socketId).emit("user:session_invalidated", {
        message: "Your account was updated by an admin. Please log in again."
      });
      users.delete(socketId);
    }
  }

  broadcastUsers();
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

    if (registeredUser.disabled) {
      socket.emit("user:login_failed", {
        message: "This user is disabled."
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
    socket.user = user;

    socket.emit("user:session_started", getPublicOnlineUser(user));
    socket.emit("stock:update", getStockRequests());
    broadcastUsers();
  });

  socket.on("user:restore_session", (data) => {
    console.log("Attempting restore", {
      registeredUserId: data?.registeredUserId,
      currentRole: data?.currentRole,
      currentLocation: data?.currentLocation
    });

    const registeredUser = getRegisteredUserById(data?.registeredUserId);

    if (!registeredUser || registeredUser.disabled) {
      console.log("Restore failed", {
        userFound: Boolean(registeredUser),
        disabled: Boolean(registeredUser?.disabled)
      });
      socket.emit("user:restore_failed", {
        message: "Saved session is no longer valid."
      });
      return;
    }

    if (!registeredUser.allowedRoles.includes(data?.currentRole)) {
      console.log("Restore failed", {
        roleAllowed: false
      });
      socket.emit("user:restore_failed", {
        message: "Saved role is no longer allowed."
      });
      return;
    }

    const user = createOnlineUser(socket, registeredUser, {
      currentRole: data.currentRole,
      currentLocation: data.currentLocation
    });
    users.set(socket.id, user);
    socket.user = user;
    socket.data.registeredUser = registeredUser;

    console.log("Restore success", {
      userId: user.id,
      name: user.name
    });

    socket.emit("user:restore_success", {
      registeredUser: getPublicRegisteredUser(registeredUser),
      onlineUser: getPublicOnlineUser(user)
    });
    socket.emit("stock:update", getStockRequests());
    broadcastUsers();
  });

  socket.on("user:logout", () => {
    const user = users.get(socket.id);

    if (user) {
      console.log("Logout received", {
        userId: user.id,
        name: user.name
      });
      users.delete(socket.id);
      broadcastUsers();
    }

    socket.user = null;
    socket.data.registeredUser = null;
    socket.emit("user:logged_out");
  });

  socket.on("push:subscribe", (subscription) => {
    const user = users.get(socket.id);

    if (!user) {
      socket.emit("push:error", {
        message: "Start your shift before enabling push notifications."
      });
      return;
    }

    if (!pushNotificationsEnabled) {
      socket.emit("push:error", {
        message: "Push notifications are not configured on the server."
      });
      return;
    }

    try {
      storePushSubscription(user.id, subscription);
      socket.emit("push:subscribed");
    } catch (error) {
      socket.emit("push:error", {
        message: error.message || "Could not save push subscription."
      });
    }
  });

  socket.on("admin:users:list", () => {
    handleAdminAction(socket, () => {});
  });

  socket.on("admin:user:create", (data) => {
    handleAdminAction(socket, () => {
      createRegisteredUser({
        name: data?.name,
        pin: data?.pin,
        manager: data?.manager === true,
        chef: data?.chef === true
      });
    });
  });

  socket.on("admin:user:update", (data) => {
    handleAdminAction(socket, () => {
      const adminUser = users.get(socket.id);
      const userId = String(data?.id || "").trim();

      if (userId === adminUser.id) {
        throw new Error("You cannot update your own manager or chef permissions.");
      }

      updateRegisteredUserPermissions(userId, {
        manager: data?.manager === true,
        chef: data?.chef === true
      });
      invalidateOnlineSessionsForRegisteredUser(userId);
    });
  });

  socket.on("admin:user:disable", (data) => {
    handleAdminAction(socket, () => {
      const adminUser = users.get(socket.id);
      const userId = String(data?.id || "").trim();

      if (userId === adminUser.id) {
        throw new Error("You cannot disable your own account.");
      }

      setRegisteredUserDisabled(userId, true);
      invalidateOnlineSessionsForRegisteredUser(userId);
    });
  });

  socket.on("admin:user:enable", (data) => {
    handleAdminAction(socket, () => {
      setRegisteredUserDisabled(data?.id, false);
    });
  });

  socket.on("admin:user:reset_pin", (data) => {
    handleAdminAction(socket, () => {
      const userId = String(data?.id || "").trim();

      resetRegisteredUserPin(userId, data?.pin);
      invalidateOnlineSessionsForRegisteredUser(userId);
    });
  });

  socket.on("admin:user:delete", (data) => {
    handleAdminAction(socket, () => {
      const adminUser = users.get(socket.id);
      const userId = String(data?.id || "").trim();
      console.log("Delete request from:", socket.user?.name);
      console.log("Target user id:", userId);

      const targetUser = getRegisteredUserById(userId);

      if (!targetUser) {
        throw new Error("User not found or already deleted");
      }

      if (targetUser.id === adminUser.id) {
        throw new Error("You cannot delete your own account.");
      }

      if (targetUser.permissions.admin && getAdminUserCount() <= 1) {
        throw new Error("You cannot delete the last admin user.");
      }

      deleteRegisteredUser(userId);
      removeOnlineSessionsForRegisteredUser(targetUser.id);
    });
  });

  socket.on("stock:create", (data) => {
    const requester = users.get(socket.id);

    if (!requester || !data?.location || !data?.item) {
      return;
    }

    console.log("stock:create received", requester.name, requester.currentRole);

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

    const eligibleRecipients = getOnlineUsers().filter((user) => {
      if (user.id === requester.id) {
        return false;
      }

      return isEligibleStockRecipient(user);
    });

    console.log(
      "eligible recipients",
      eligibleRecipients.map((user) => `${user.name}/${user.currentRole}`)
    );

    for (const user of eligibleRecipients) {
      console.log("stock:alert emitted to", user.name);
      io.to(user.socketId).emit("stock:alert", request);
      sendStockPushNotification(user, request).catch((error) => {
        console.error("Stock push notification failed:", error.message);
      });
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

  socket.on("stock:clear_completed", () => {
    const user = users.get(socket.id);
    const hasPermission = canManageStockRequests(user);

    console.log("Clear completed received");
    console.log("Delete permission", hasPermission);

    if (!hasPermission) {
      return;
    }

    let removedCount = 0;

    for (const [requestId, request] of stockRequests.entries()) {
      if (request.status === "delivered" || request.status === "cancelled") {
        stockRequests.delete(requestId);
        removedCount += 1;
      }
    }

    console.log("Completed removed count", removedCount);
    broadcastStockRequests();
  });

  socket.on("stock:delete_request", (data) => {
    const user = users.get(socket.id);
    const requestId = String(data?.requestId || "").trim();
    const hasPermission = canManageStockRequests(user);
    const requestFound = stockRequests.has(requestId);

    console.log("Delete request received", requestId);
    console.log("Delete permission", hasPermission);
    console.log("Request found", requestFound);

    if (!hasPermission) {
      return;
    }

    if (!requestFound) {
      return;
    }

    stockRequests.delete(requestId);
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
  console.log(`SQLite database: ${dbPath}`);
});
