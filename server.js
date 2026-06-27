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
const crypto = require("crypto");
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
  deleteRegisteredUser,
  listStockItems,
  listStockCountLogsForExport,
  updateStockItemQuantities,
  deductStockItemForDelivery,
  cleanupOldStockCountLogs,
  listActiveTemporaryStockPermissions,
  getActiveTemporaryStockPermissionForUser,
  grantTemporaryStockPermission,
  revokeTemporaryStockPermission,
  cleanupExpiredTemporaryStockPermissions
} = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Registered users are persistent in SQLite. Active shift state is process-local.
// A shift remains active until explicit logout, even if the phone/browser socket disconnects.
const activeShiftUsers = new Map();
const pushSubscriptionsByUserId = new Map();
const stockLogExportTokens = new Map();
const endedShiftUserIds = new Set();
const settings = {
  autoEndEnabled: false,
  autoEndTime: "21:00",
  lastAutoEndDate: null
};

// Stock requests are process-local operational state and reset when the server restarts.
const stockRequests = new Map();

initializeDatabase();
setInterval(cleanupOldStockCountLogs, 24 * 60 * 60 * 1000);
setInterval(() => {
  const expiredCount = cleanupExpiredTemporaryStockPermissions();

  if (expiredCount > 0) {
    console.log("temporary stock permissions expired", expiredCount);
    refreshStockAccessForActiveUsers();
    broadcastStockPermissionListToManagers();
  }
}, 60 * 1000);

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

app.get("/api/stock-count/logs.xlsx", (req, res) => {
  const token = String(req.query.token || "");
  const tokenRecord = stockLogExportTokens.get(token);
  stockLogExportTokens.delete(token);

  if (!tokenRecord || tokenRecord.expiresAt < Date.now()) {
    res.status(403).send("Invalid or expired export token.");
    return;
  }

  const user = activeShiftUsers.get(tokenRecord.userId);

  if (!canManageStockRequests(user)) {
    res.status(403).send("Manager or admin permission is required.");
    return;
  }

  const workbook = buildStockCountLogsXlsx();

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${getStockLogExportFileName()}"`);
  res.send(workbook);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getActiveShiftUsers() {
  return Array.from(activeShiftUsers.values());
}

function getPublicActiveShiftUser(user) {
  const pushRecord = pushSubscriptionsByUserId.get(user.id);
  const temporaryStockPermission = getActiveTemporaryStockPermissionForUser(user.id);

  return {
    id: user.id,
    name: user.name,
    permissions: user.permissions,
    allowedRoles: user.allowedRoles,
    currentRole: user.currentRole,
    currentLocation: user.currentLocation,
    currentChannel: user.currentChannel,
    status: user.status,
    connectionStatus: user.connectionStatus,
    lastSeen: user.lastSeen,
    startedAt: user.startedAt,
    pushStatus: {
      pushSubscribed: Boolean(pushRecord?.subscription),
      pushSubscriptionUpdatedAt: pushRecord?.updatedAt || null,
      lastPushSentAt: pushRecord?.lastPushSentAt || null,
      lastPushError: pushRecord?.lastPushError || null
    },
    stockCountAccess: {
      allowed: canAccessStockCount(user, temporaryStockPermission),
      temporary: Boolean(temporaryStockPermission),
      expiresAt: temporaryStockPermission?.expiresAt || null
    },
    online: user.connectionStatus === "connected"
  };
}

function getStockRequests() {
  return Array.from(stockRequests.values()).sort((a, b) => a.createdAt - b.createdAt);
}

function broadcastUsers() {
  const activeUsers = getActiveShiftUsers().map(getPublicActiveShiftUser);
  console.log("users:update active shift count", activeUsers.length);
  io.emit("users:update", activeUsers);
}

function broadcastStockRequests() {
  io.emit("stock:update", getStockRequests());
}

function emitStockCountData(socket) {
  socket.emit("stock_items:update", listStockItems());
}

function broadcastStockCountDataToStockUsers() {
  const items = listStockItems();

  for (const user of getActiveShiftUsers()) {
    if (canAccessStockCount(user) && user.connectionStatus === "connected" && user.socketId) {
      io.to(user.socketId).emit("stock_items:update", items);
    }
  }
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatExportDateTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getExcelColumnName(index) {
  let column = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }

  return column;
}

function buildTextCell(rowIndex, columnIndex, value, styleId = 0) {
  const cellRef = `${getExcelColumnName(columnIndex)}${rowIndex}`;
  const styleAttribute = styleId ? ` s="${styleId}"` : "";

  return `<c r="${cellRef}" t="inlineStr"${styleAttribute}><is><t>${escapeXml(value)}</t></is></c>`;
}

function buildNumberCell(rowIndex, columnIndex, value) {
  const cellRef = `${getExcelColumnName(columnIndex)}${rowIndex}`;
  const numberValue = Number(value) || 0;

  return `<c r="${cellRef}"><v>${numberValue}</v></c>`;
}

function buildStockCountWorksheet() {
  const headers = [
    "Changed At",
    "Changed By",
    "Item",
    "Previous Quantity",
    "New Quantity",
    "Reason"
  ];
  const rows = listStockCountLogsForExport().map((log) => [
    formatExportDateTime(log.changedAt),
    log.changedByName,
    log.itemName,
    log.previousQuantity,
    log.newQuantity,
    log.reason || ""
  ]);
  const allRows = [headers, ...rows];
  const lastRow = Math.max(allRows.length, 1);
  const lastColumn = getExcelColumnName(headers.length);
  const rowXml = allRows
    .map((row, rowIndex) => {
      const excelRowIndex = rowIndex + 1;
      const cells = row
        .map((value, cellIndex) => {
          const excelColumnIndex = cellIndex + 1;

          if (rowIndex > 0 && (cellIndex === 3 || cellIndex === 4)) {
            return buildNumberCell(excelRowIndex, excelColumnIndex, value);
          }

          return buildTextCell(excelRowIndex, excelColumnIndex, value, rowIndex === 0 ? 1 : 0);
        })
        .join("");

      return `<row r="${excelRowIndex}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="20" customWidth="1"/>
    <col min="2" max="2" width="18" customWidth="1"/>
    <col min="3" max="3" width="34" customWidth="1"/>
    <col min="4" max="5" width="18" customWidth="1"/>
    <col min="6" max="6" width="24" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
}

function buildStockCountLogsXlsx() {
  const files = [
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Stock History" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      path: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`
    },
    {
      path: "xl/worksheets/sheet1.xml",
      content: buildStockCountWorksheet()
    }
  ];

  return buildZip(files);
}

function getStockLogExportFileName() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  return `stock-count-log-${date}.xlsx`;
}

function createCrc32Table() {
  const table = [];

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const crc32Table = createCrc32Table();

function calculateCrc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.path);
    const dataBuffer = Buffer.from(file.content);
    const crc = calculateCrc32(dataBuffer);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const endRecord = Buffer.alloc(22);

  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localDirectory.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localDirectory, centralDirectory, endRecord]);
}

function createStockLogExportToken(user) {
  const token = crypto.randomBytes(24).toString("hex");

  stockLogExportTokens.set(token, {
    userId: user.id,
    expiresAt: Date.now() + 60 * 1000
  });

  return token;
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

function canAccessStockCount(user, existingTemporaryPermission = null) {
  if (!user) {
    return false;
  }

  return canManageStockRequests(user) || Boolean(existingTemporaryPermission || getActiveTemporaryStockPermissionForUser(user.id));
}

function canControlShifts(user) {
  return canManageStockRequests(user);
}

function getStockPermissionPayload() {
  return {
    permissions: listActiveTemporaryStockPermissions(),
    users: listRegisteredUsers()
      .filter((user) => !user.disabled)
      .map((user) => ({
        id: user.id,
        name: user.name
      }))
  };
}

function emitStockPermissionList(socket) {
  socket.emit("stock_permission:list", getStockPermissionPayload());
}

function broadcastStockPermissionListToManagers() {
  const payload = getStockPermissionPayload();

  for (const user of getActiveShiftUsers()) {
    if (canManageStockRequests(user) && user.connectionStatus === "connected" && user.socketId) {
      io.to(user.socketId).emit("stock_permission:list", payload);
    }
  }
}

function refreshStockAccessForActiveUsers() {
  for (const user of getActiveShiftUsers()) {
    if (user.connectionStatus === "connected" && user.socketId) {
      io.to(user.socketId).emit("user:stock_access_update", getPublicActiveShiftUser(user));
    }
  }

  broadcastUsers();
}

function createPushSubscriptionRecord(user, subscription) {
  if (!subscription?.endpoint) {
    throw new Error("Invalid push subscription.");
  }

  return {
    userId: user.id,
    name: user.name,
    subscription,
    currentRole: user.currentRole,
    currentLocation: user.currentLocation,
    status: user.status,
    permissions: user.permissions,
    updatedAt: Date.now()
  };
}

function storePushSubscription(user, subscription) {
  const record = createPushSubscriptionRecord(user, subscription);
  pushSubscriptionsByUserId.set(user.id, record);
  console.log("push subscription saved", user.name);
  console.log("push status updated", user.name);
}

function updatePushSubscriptionMetadata(user) {
  const record = pushSubscriptionsByUserId.get(user.id);

  if (!record) {
    return;
  }

  record.name = user.name;
  record.currentRole = user.currentRole;
  record.currentLocation = user.currentLocation;
  record.status = user.status;
  record.permissions = user.permissions;
  record.updatedAt = Date.now();
  console.log("push status updated", user.name);
}

function removePushSubscription(userId, name, reason) {
  const record = pushSubscriptionsByUserId.get(userId);

  if (!record) {
    return;
  }

  pushSubscriptionsByUserId.delete(userId);
  console.log("push subscription removed", name || record.name, reason);
  console.log("push status updated", name || record.name);
}

async function sendStockPushNotification(user, request) {
  return sendStockPushNotificationToActiveShiftUser(user, request);

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

async function sendStockPushNotificationToActiveShiftUser(user, request) {
  const record = pushSubscriptionsByUserId.get(user.id);

  if (!pushNotificationsEnabled) {
    console.log("push skipped", user.name, "push not configured");
    return;
  }

  if (!record?.subscription) {
    console.log("push skipped", user.name, "no subscription");
    return;
  }

  const payload = JSON.stringify({
    title: "\uD83D\uDEA8 Stock Request",
    body: `${request.location} needs ${request.item}`,
    requestId: request.id,
    url: "https://bloomlink.live",
    tag: `stock-${request.id}`
  });

  try {
    await webPush.sendNotification(record.subscription, payload);
    console.log("push sent to", user.name);
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      removePushSubscription(user.id, user.name, `expired ${error.statusCode}`);
    } else {
      console.error("Push notification failed:", error.message);
    }
  }
}

async function sendPushPayload(user, payload) {
  const record = pushSubscriptionsByUserId.get(user.id);

  if (!pushNotificationsEnabled) {
    console.log("push skipped", user.name, "push not configured");
    return false;
  }

  if (!record?.subscription) {
    console.log("push skipped", user.name, "no subscription");
    return false;
  }

  try {
    await webPush.sendNotification(record.subscription, JSON.stringify(payload));
    record.lastPushSentAt = Date.now();
    record.lastPushError = null;
    console.log("push status updated", user.name);
    broadcastUsers();
    return true;
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      removePushSubscription(user.id, user.name, `expired ${error.statusCode}`);
    } else {
      record.lastPushError = error.message || "Push failed";
      console.error("Push notification failed:", error.message);
      console.log("push status updated", user.name);
      broadcastUsers();
    }

    return false;
  }
}

async function sendStockPushNotificationToActiveShiftUser(user, request) {
  const record = pushSubscriptionsByUserId.get(user.id);

  if (!record?.subscription) {
    console.log("push skipped", user.name, "no subscription");
    return;
  }

  const sent = await sendPushPayload(user, {
    title: "\uD83D\uDEA8 Stock Request",
    body: `${request.location} needs ${request.item}`,
    requestId: request.id,
    url: "https://bloomlink.live",
    tag: `stock-${request.id}`,
    renotify: true
  });

  if (sent) {
    console.log("push sent to", user.name);
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

function createActiveShiftUser(socket, registeredUser, data) {
  const existingUser = activeShiftUsers.get(registeredUser.id);
  const currentRole = data.currentRole;
  const now = Date.now();

  return {
    id: registeredUser.id,
    socketId: socket.id,
    name: registeredUser.name,
    permissions: registeredUser.permissions,
    allowedRoles: registeredUser.allowedRoles,
    currentRole,
    currentLocation: data.currentLocation || "Kitchen",
    currentChannel: "All",
    status: "available",
    connectionStatus: "connected",
    lastSeen: now,
    startedAt: existingUser?.startedAt || now,
    autoEndedAt: existingUser?.autoEndedAt || null
  };
}

function getActiveShiftUserForSocket(socket) {
  if (socket.data.activeShiftUserId) {
    return activeShiftUsers.get(socket.data.activeShiftUserId);
  }

  return getActiveShiftUsers().find((user) => user.socketId === socket.id) || null;
}

function isAdminSocket(socket) {
  const user = getActiveShiftUserForSocket(socket);

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
  const user = activeShiftUsers.get(registeredUserId);

  if (user?.connectionStatus === "connected" && user.socketId) {
    io.to(user.socketId).emit("user:account_deleted", {
      message: "Your account was deleted by an admin."
    });
  }

  activeShiftUsers.delete(registeredUserId);
  removePushSubscription(registeredUserId, user?.name, "account deleted");
  broadcastUsers();
}

function invalidateOnlineSessionsForRegisteredUser(registeredUserId) {
  const user = activeShiftUsers.get(registeredUserId);

  if (user?.connectionStatus === "connected" && user.socketId) {
    io.to(user.socketId).emit("user:session_invalidated", {
      message: "Your account was updated by an admin. Please log in again."
    });
  }

  activeShiftUsers.delete(registeredUserId);
  removePushSubscription(registeredUserId, user?.name, "session invalidated");
  broadcastUsers();
}

function endActiveShiftForUser(userId, message) {
  const user = activeShiftUsers.get(userId);

  if (!user) {
    return null;
  }

  endedShiftUserIds.add(user.id);

  if (user.connectionStatus === "connected" && user.socketId) {
    io.to(user.socketId).emit("user:force_logout", {
      message
    });
    console.log("force logout sent to", user.name);
  }

  activeShiftUsers.delete(user.id);
  removePushSubscription(user.id, user.name, "shift ended");

  return user;
}

function getPublicSettings() {
  return {
    autoEndEnabled: settings.autoEndEnabled,
    autoEndTime: settings.autoEndTime,
    lastAutoEndDate: settings.lastAutoEndDate
  };
}

function getLocalDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isSameLocalCalendarDay(firstTimestamp, secondTimestamp) {
  const firstDate = new Date(firstTimestamp);
  const secondDate = new Date(secondTimestamp);

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function isPastAutoEndTime(nowTimestamp) {
  const [hours, minutes] = settings.autoEndTime.split(":").map(Number);
  const now = new Date(nowTimestamp);
  const autoEndAt = new Date(nowTimestamp);
  autoEndAt.setHours(hours, minutes, 0, 0);

  return now.getTime() >= autoEndAt.getTime();
}

async function sendAutoEndNotification(user) {
  const sent = await sendPushPayload(user, {
    title: "Shift ended",
    body: "Your BloomLink shift was automatically ended for today.",
    url: "https://bloomlink.live",
    tag: `shift-ended-${Date.now()}-${user.id}`,
    renotify: true
  });

  if (sent) {
    console.log("auto end notification sent", user.name);
  }
}

async function autoEndDueShifts() {
  const now = Date.now();
  const today = getLocalDateKey(now);

  if (!settings.autoEndEnabled || !isPastAutoEndTime(now)) {
    return;
  }

  if (settings.lastAutoEndDate === today) {
    console.log("auto end already fired today");
    return;
  }

  settings.lastAutoEndDate = today;
  console.log("auto end fired for date", today);

  let endedCount = 0;

  for (const user of getActiveShiftUsers()) {
    if (user.autoEndedAt || !isSameLocalCalendarDay(user.startedAt, now)) {
      continue;
    }

    user.autoEndedAt = now;
    await sendAutoEndNotification(user);

    if (user.connectionStatus === "connected" && user.socketId) {
      io.to(user.socketId).emit("user:force_logout", {
        message: "Your shift was automatically ended for today."
      });
      console.log("force logout sent to", user.name);
    }

    activeShiftUsers.delete(user.id);
    removePushSubscription(user.id, user.name, "auto end shift");
    endedShiftUserIds.add(user.id);
    endedCount += 1;
    console.log("auto end shift", user.name);
  }

  console.log("auto ended shifts count", endedCount);
  broadcastUsers();
  io.emit("settings:update", getPublicSettings());
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
    endedShiftUserIds.delete(registeredUser.id);
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

    endedShiftUserIds.delete(registeredUser.id);

    const user = createActiveShiftUser(socket, registeredUser, data || {});
    activeShiftUsers.set(registeredUser.id, user);
    socket.user = user;
    socket.data.activeShiftUserId = registeredUser.id;
    updatePushSubscriptionMetadata(user);

    console.log("active shift started", user.name);

    socket.emit("user:session_started", getPublicActiveShiftUser(user));
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

    if (endedShiftUserIds.has(registeredUser.id)) {
      console.log("Restore failed", {
        shiftEnded: true
      });
      socket.emit("user:restore_failed", {
        message: "Your previous shift was ended by a manager."
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

    const user = createActiveShiftUser(socket, registeredUser, {
      currentRole: data.currentRole,
      currentLocation: data.currentLocation
    });
    activeShiftUsers.set(registeredUser.id, user);
    socket.user = user;
    socket.data.registeredUser = registeredUser;
    socket.data.activeShiftUserId = registeredUser.id;
    updatePushSubscriptionMetadata(user);

    console.log("Restore success", {
      userId: user.id,
      name: user.name
    });

    socket.emit("user:restore_success", {
      registeredUser: getPublicRegisteredUser(registeredUser),
      onlineUser: getPublicActiveShiftUser(user)
    });
    socket.emit("stock:update", getStockRequests());
    broadcastUsers();
  });

  socket.on("user:logout", () => {
    const user = getActiveShiftUserForSocket(socket);

    if (user) {
      console.log("active shift logout", user.name);
      activeShiftUsers.delete(user.id);
      removePushSubscription(user.id, user.name, "logout");
      broadcastUsers();
    }

    socket.user = null;
    socket.data.registeredUser = null;
    socket.data.activeShiftUserId = null;
    socket.emit("user:logged_out");
  });

  socket.on("push:subscribe", (subscription) => {
    const user = getActiveShiftUserForSocket(socket);

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
      storePushSubscription(user, subscription);
      socket.emit("push:subscribed");
      broadcastUsers();
    } catch (error) {
      socket.emit("push:error", {
        message: error.message || "Could not save push subscription."
      });
    }
  });

  socket.on("push:status", () => {
    const user = getActiveShiftUserForSocket(socket);

    if (!user) {
      socket.emit("push:status_result", {
        subscribed: false,
        updatedAt: null,
        lastPushSentAt: null,
        lastPushError: "Start your shift before checking push status."
      });
      return;
    }

    const record = pushSubscriptionsByUserId.get(user.id);
    console.log("push status requested", user.name);
    console.log("push subscription exists", user.name, Boolean(record?.subscription));

    socket.emit("push:status_result", {
      subscribed: Boolean(record?.subscription),
      updatedAt: record?.updatedAt || null,
      lastPushSentAt: record?.lastPushSentAt || null,
      lastPushError: record?.lastPushError || null
    });
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
      const adminUser = getActiveShiftUserForSocket(socket);
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
      const adminUser = getActiveShiftUserForSocket(socket);
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
      const adminUser = getActiveShiftUserForSocket(socket);
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

  socket.on("admin:shift:end_user", (data) => {
    const requester = getActiveShiftUserForSocket(socket);

    if (!canControlShifts(requester)) {
      socket.emit("admin:error", {
        message: "Manager or admin permission is required."
      });
      return;
    }

    const userId = String(data?.userId || "").trim();

    if (!userId || userId === requester.id) {
      socket.emit("admin:error", {
        message: "You can only end another user's shift."
      });
      return;
    }

    const endedUser = endActiveShiftForUser(userId, "Your shift was ended by a manager.");

    if (!endedUser) {
      socket.emit("admin:error", {
        message: "Active shift not found."
      });
      return;
    }

    console.log("admin ended shift for", endedUser.name);
    broadcastUsers();
  });

  socket.on("admin:shift:end_all", (data) => {
    const requester = getActiveShiftUserForSocket(socket);

    if (!canControlShifts(requester)) {
      socket.emit("admin:error", {
        message: "Manager or admin permission is required."
      });
      return;
    }

    const keepSelf = data?.keepSelf !== false;
    let endedCount = 0;

    for (const user of getActiveShiftUsers()) {
      if (keepSelf && user.id === requester.id) {
        continue;
      }

      const endedUser = endActiveShiftForUser(user.id, "Your shift was ended by a manager.");

      if (endedUser) {
        endedCount += 1;
      }
    }

    console.log("admin ended all shifts", endedCount);
    broadcastUsers();
  });

  socket.on("settings:get", () => {
    const user = getActiveShiftUserForSocket(socket);

    if (!canControlShifts(user)) {
      socket.emit("settings:error", {
        message: "Manager or admin permission is required."
      });
      return;
    }

    socket.emit("settings:update", getPublicSettings());
  });

  socket.on("settings:update", (data) => {
    const user = getActiveShiftUserForSocket(socket);

    if (!canControlShifts(user)) {
      socket.emit("settings:error", {
        message: "Manager or admin permission is required."
      });
      return;
    }

    const nextTime = String(data?.autoEndTime || "").trim();

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextTime)) {
      socket.emit("settings:error", {
        message: "Auto end time must use HH:MM format."
      });
      return;
    }

    settings.autoEndEnabled = data?.autoEndEnabled === true;
    settings.autoEndTime = nextTime;

    if (!isPastAutoEndTime(Date.now())) {
      settings.lastAutoEndDate = null;
    }

    console.log("settings updated", getPublicSettings());
    io.emit("settings:update", getPublicSettings());
  });

  socket.on("stock_permission:list", () => {
    const user = getActiveShiftUserForSocket(socket);

    if (!canManageStockRequests(user)) {
      socket.emit("stock_permission:error", {
        message: "Manager or admin permission is required."
      });
      return;
    }

    emitStockPermissionList(socket);
  });

  socket.on("stock_permission:grant", (data) => {
    const user = getActiveShiftUserForSocket(socket);

    if (!canManageStockRequests(user)) {
      socket.emit("stock_permission:error", {
        message: "Manager or admin permission is required."
      });
      return;
    }

    try {
      grantTemporaryStockPermission({
        userId: data?.userId,
        grantedByUser: user,
        durationHours: data?.durationHours
      });
      broadcastStockPermissionListToManagers();
      refreshStockAccessForActiveUsers();
    } catch (error) {
      socket.emit("stock_permission:error", {
        message: error.message || "Could not grant stock access."
      });
    }
  });

  socket.on("stock_permission:revoke", (data) => {
    const user = getActiveShiftUserForSocket(socket);

    if (!canManageStockRequests(user)) {
      socket.emit("stock_permission:error", {
        message: "Manager or admin permission is required."
      });
      return;
    }

    try {
      revokeTemporaryStockPermission(data?.permissionId);
      broadcastStockPermissionListToManagers();
      refreshStockAccessForActiveUsers();
    } catch (error) {
      socket.emit("stock_permission:error", {
        message: error.message || "Could not revoke stock access."
      });
    }
  });

  socket.on("stock_items:get", () => {
    const user = getActiveShiftUserForSocket(socket);

    if (!canAccessStockCount(user)) {
      socket.emit("stock_items:error", {
        message: "Stock count access is required."
      });
      return;
    }

    emitStockCountData(socket);
  });

  socket.on("stock_items:update", (data) => {
    const user = getActiveShiftUserForSocket(socket);

    if (!canAccessStockCount(user)) {
      socket.emit("stock_items:error", {
        message: "Stock count access is required."
      });
      return;
    }

    try {
      updateStockItemQuantities(data?.changes, user);
      broadcastStockCountDataToStockUsers();
    } catch (error) {
      socket.emit("stock_items:error", {
        message: error.message || "Could not update stock quantities."
      });
    }
  });

  socket.on("stock_logs:export_request", () => {
    const user = getActiveShiftUserForSocket(socket);

    if (!canManageStockRequests(user)) {
      socket.emit("stock_items:error", {
        message: "Manager or admin permission is required."
      });
      return;
    }

    const token = createStockLogExportToken(user);

    socket.emit("stock_logs:export_ready", {
      url: `/api/stock-count/logs.xlsx?token=${token}`,
      fileName: getStockLogExportFileName()
    });
  });

  socket.on("stock:create", (data, callback) => {
    const requester = getActiveShiftUserForSocket(socket);

    if (!requester || !data?.location || !data?.item) {
      if (typeof callback === "function") {
        callback({
          ok: false,
          message: "Could not create stock request."
        });
      }
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
      assignedAt: null,
      deliveredAt: null
    };

    stockRequests.set(request.id, request);

    const eligibleRecipients = getActiveShiftUsers().filter((user) => {
      if (user.id === requester.id) {
        return false;
      }

      return (
        user.connectionStatus === "connected" &&
        Boolean(user.socketId) &&
        isEligibleStockRecipient(user)
      );
    });

    console.log(
      "eligible recipients",
      eligibleRecipients.map((user) => `${user.name}/${user.currentRole}`)
    );

    for (const user of eligibleRecipients) {
      console.log("stock:alert emitted to", user.name);
      io.to(user.socketId).emit("stock:alert", request);
    }

    const pushCandidates = getActiveShiftUsers();

    console.log("push subscribers count", pushSubscriptionsByUserId.size);

    for (const user of pushCandidates) {
      console.log("push candidate", user.name, user.currentRole, user.connectionStatus);

      if (user.id === requester.id) {
        console.log("push skipped", user.name, "request creator");
        continue;
      }

      if (user.status === "on_break") {
        console.log("push skipped", user.name, "on break");
        continue;
      }

      if (!isEligibleStockRecipient(user)) {
        console.log("push skipped", user.name, "not eligible");
        continue;
      }

      sendStockPushNotificationToActiveShiftUser(user, request).catch((error) => {
        console.error("Stock push notification failed:", error.message);
      });
    }

    broadcastStockRequests();

    if (typeof callback === "function") {
      callback({
        ok: true,
        request: {
          id: request.id,
          location: request.location,
          item: request.item
        }
      });
    }
  });

  socket.on("stock:response", (data) => {
    const user = getActiveShiftUserForSocket(socket);
    const request = stockRequests.get(data?.requestId);
    const action = data?.action;

    if (!user || !request || action !== "on_my_way" || !isEligibleStockRecipient(user)) {
      return;
    }

    // First On My Way wins. Subsequent assignments are rejected server-side.
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
    request.assignedAt = Date.now();

    broadcastStockRequests();
  });

  socket.on("stock:delivered", (data) => {
    const user = getActiveShiftUserForSocket(socket);
    const requestId = String(data?.requestId || "").trim();
    const request = stockRequests.get(requestId);
    const takenFromContainer = data?.takenFromContainer === true;
    const hasContainerAnswer = typeof data?.takenFromContainer === "boolean";
    const containerQuantity = Math.max(1, Math.floor(Number(data?.containerQuantity) || 1));

    console.log("stock delivered with container answer", requestId, {
      takenFromContainer: data?.takenFromContainer,
      containerQuantity
    });

    if (!hasContainerAnswer) {
      console.log("stock not decremented", "missing container answer");
      return;
    }

    if (!user || !request || request.status === "delivered") {
      return;
    }

    // Only the assigned user can complete the request.
    if (!request.assignedTo || request.assignedTo.id !== user.id) {
      return;
    }

    request.status = "delivered";
    request.deliveredAt = Date.now();

    if (takenFromContainer) {
      const deduction = deductStockItemForDelivery(request.item, user, containerQuantity);

      if (deduction) {
        broadcastStockCountDataToStockUsers();
      } else {
        console.log("stock not decremented", "stock item not found");
      }
    } else {
      console.log("stock not decremented", "user selected no");
    }

    broadcastStockRequests();
  });

  socket.on("stock:clear_completed", () => {
    const user = getActiveShiftUserForSocket(socket);
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
    const user = getActiveShiftUserForSocket(socket);
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
    const user = getActiveShiftUserForSocket(socket);

    if (user && user.socketId === socket.id) {
      user.connectionStatus = "disconnected";
      user.socketId = null;
      user.lastSeen = Date.now();
      console.log("socket disconnected but shift kept", user.name);
      console.log("push subscription kept after disconnect", user.name);
      broadcastUsers();
    }

    socket.broadcast.emit("user:disconnect", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`BloomLink Stock MVP server running on port ${PORT}`);
  console.log(`SQLite database: ${dbPath}`);
});

setInterval(() => {
  autoEndDueShifts().catch((error) => {
    console.error("Auto end shift check failed:", error.message);
  });
}, 5 * 60 * 1000);
