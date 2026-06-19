const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "bloomlink.db");
const db = new Database(dbPath);

const seedUsers = [
  {
    id: "user_marcos",
    name: "Marcos",
    pin: "1111",
    admin: 1,
    manager: 1,
    chef: 1,
    allowedRoles: ["Manager"],
    defaultRole: "Manager"
  },
  {
    id: "user_carlos",
    name: "Carlos",
    pin: "2222",
    admin: 0,
    manager: 1,
    chef: 0,
    allowedRoles: ["Manager"],
    defaultRole: "Manager"
  },
  {
    id: "user_ana",
    name: "Ana",
    pin: "3333",
    admin: 0,
    manager: 0,
    chef: 0,
    allowedRoles: ["Staff", "KP", "Stock Runner"],
    defaultRole: "Staff"
  },
  {
    id: "user_joao",
    name: "Jo\u00e3o",
    pin: "4444",
    admin: 0,
    manager: 0,
    chef: 0,
    allowedRoles: ["Staff", "KP", "Stock Runner"],
    defaultRole: "KP"
  },
  {
    id: "user_rafael",
    name: "Rafael",
    pin: "5555",
    admin: 0,
    manager: 0,
    chef: 1,
    allowedRoles: ["Chef", "Staff", "KP", "Stock Runner"],
    defaultRole: "Chef"
  }
];

const stockItemsByCategory = {
  "Cups & Containers": [
    "12oz Cups",
    "8oz Cups",
    "Clear Cups",
    "12oz Lids",
    "8oz Lids",
    "Clear Lids",
    "A\u00e7a\u00ed Bowl 12oz",
    "A\u00e7a\u00ed Bowl 8oz",
    "A\u00e7a\u00ed Lids",
    "Soup Container",
    "Soup Lids",
    "2oz Container (Jam/Cream)",
    "2oz Lids (Jam/Cream)"
  ],
  Packaging: [
    "Takeaway Box (Closed)",
    "Takeaway Box (Open)",
    "Salad Container (Clear)",
    "Large Takeaway Bag",
    "Small Takeaway Bag",
    "Front Film Paper Bag",
    "Cling Film"
  ],
  "Service & Counter": [
    "Napkins",
    "White Greaseproof Paper",
    "Brown Greaseproof Paper",
    "Wooden Stirrers",
    "Wooden Knife",
    "Wooden Fork",
    "Wooden Spoon",
    "Till Roll",
    "Handheld Card Machine Roll"
  ],
  "Cleaning & Waste": [
    "50L Bin Bags (Black)",
    "Compostable Bin Bags"
  ],
  "Coffee & Hot Chocolate": [
    "Coffee Beans",
    "Decaf Coffee",
    "Chocolate Powder",
    "Marshmallows"
  ],
  Tea: [
    "Tea (Black Tea)",
    "Decaf Tea",
    "Earl Grey Tea",
    "Green Tea",
    "Ginger Lemon Tea",
    "Rooibos Tea",
    "Mixed Berries Tea",
    "Camomile Tea",
    "Apple Tea",
    "Peppermint Tea"
  ],
  "Dairy & Dairy Alternatives": [
    "Butter",
    "Full Fat Milk",
    "Low Fat Milk",
    "Oat Milk",
    "Almond Milk",
    "Soy Milk",
    "Coconut Milk"
  ],
  "Syrups & Sweeteners": [
    "Hazelnut Syrup",
    "Vanilla Syrup",
    "Sugar-Free Vanilla Syrup",
    "Caramel Syrup",
    "Brown Sugar",
    "White Sugar",
    "Sweetener"
  ],
  Seasoning: [
    "Salt",
    "Pepper"
  ],
  "Ice Cream & A\u00e7a\u00ed": [
    "A\u00e7a\u00ed Mix",
    "Ice Cream Mix",
    "Ice Cream Cones",
    "Ice Cream Tubs",
    "Strawberry Topping (Ice Cream)",
    "Blueberry Topping (Ice Cream)",
    "Chocolate Topping (Ice Cream)"
  ],
  Ice: [
    "Ice"
  ]
};

function mapUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    pin: String(row.pin),
    permissions: {
      admin: row.admin === 1,
      manager: row.manager === 1,
      chef: row.chef === 1
    },
    allowedRoles: JSON.parse(row.allowedRoles),
    defaultRole: row.defaultRole,
    disabled: row.disabled === 1,
    createdAt: row.createdAt
  };
}

function createStockItemId(category, name) {
  const slug = `${category}_${name}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `stock_${slug}`;
}

function getStockCatalogEntries() {
  return Object.entries(stockItemsByCategory).flatMap(([category, items]) =>
    items.map((name) => ({
      id: createStockItemId(category, name),
      name,
      category
    }))
  );
}

function mapStockItemRow(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    currentQuantity: row.current_quantity,
    updatedAt: row.updated_at
  };
}

function mapStockLogRow(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    previousQuantity: row.previous_quantity,
    newQuantity: row.new_quantity,
    changedByUserId: row.changed_by_user_id,
    changedByName: row.changed_by_name,
    changedAt: row.changed_at,
    reason: row.reason
  };
}

function mapTemporaryStockPermissionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    grantedByUserId: row.granted_by_user_id,
    grantedByName: row.granted_by_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

function getRoleConfig({ manager, chef }) {
  if (manager === true) {
    return {
      allowedRoles: ["Manager"],
      defaultRole: "Manager"
    };
  }

  if (chef === true) {
    return {
      allowedRoles: ["Chef", "Staff", "KP", "Stock Runner"],
      defaultRole: "Chef"
    };
  }

  return {
    allowedRoles: ["Staff", "KP", "Stock Runner"],
    defaultRole: "Staff"
  };
}

function initializeDatabase() {
  // Database initialization is kept in one place so server startup always creates the local schema.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      admin INTEGER NOT NULL DEFAULT 0,
      manager INTEGER NOT NULL DEFAULT 0,
      chef INTEGER NOT NULL DEFAULT 0,
      allowedRoles TEXT NOT NULL,
      defaultRole TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      current_quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_count_logs (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      changed_by_user_id TEXT NOT NULL,
      changed_by_name TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      reason TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS temporary_stock_permissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      granted_by_user_id TEXT NOT NULL,
      granted_by_name TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  seedStockItems();
  cleanupOldStockCountLogs();
  cleanupExpiredTemporaryStockPermissions();

  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;

  if (userCount > 0) {
    return;
  }

  // Seeding only runs when the users table is empty, so existing local users are not overwritten.
  const insertUser = db.prepare(`
    INSERT INTO users (
      id,
      name,
      pin,
      admin,
      manager,
      chef,
      allowedRoles,
      defaultRole,
      disabled,
      createdAt
    )
    VALUES (
      @id,
      @name,
      @pin,
      @admin,
      @manager,
      @chef,
      @allowedRoles,
      @defaultRole,
      0,
      @createdAt
    )
  `);

  const insertMany = db.transaction((users) => {
    for (const user of users) {
      insertUser.run({
        ...user,
        allowedRoles: JSON.stringify(user.allowedRoles),
        createdAt: new Date().toISOString()
      });
    }
  });

  insertMany(seedUsers);
}

function seedStockItems() {
  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO stock_items (
      id,
      name,
      category,
      current_quantity,
      updated_at
    )
    VALUES (?, ?, ?, 0, ?)
  `);

  const now = new Date().toISOString();
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertItem.run(item.id, item.name, item.category, now);
    }
  });

  insertMany(getStockCatalogEntries());
}

function listStockItems() {
  const rows = db.prepare("SELECT * FROM stock_items").all();
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  return getStockCatalogEntries()
    .map((catalogItem) => rowsById.get(catalogItem.id))
    .filter(Boolean)
    .map(mapStockItemRow);
}

function listStockCountLogsForExport() {
  const rows = db.prepare("SELECT * FROM stock_count_logs ORDER BY changed_at DESC").all();

  return rows.map(mapStockLogRow);
}

function updateStockItemQuantities(changes, changedByUser) {
  const normalizedChanges = Array.isArray(changes) ? changes : [];
  const now = new Date().toISOString();
  const getItem = db.prepare("SELECT * FROM stock_items WHERE id = ?");
  const updateItem = db.prepare(`
    UPDATE stock_items
    SET current_quantity = ?,
        updated_at = ?
    WHERE id = ?
  `);
  const insertLog = db.prepare(`
    INSERT INTO stock_count_logs (
      id,
      item_id,
      item_name,
      previous_quantity,
      new_quantity,
      changed_by_user_id,
      changed_by_name,
      changed_at,
      reason
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateMany = db.transaction((items) => {
    for (const change of items) {
      const itemId = String(change?.id || "").trim();
      const nextQuantity = Number(change?.currentQuantity);

      if (!itemId || !Number.isInteger(nextQuantity) || nextQuantity < 0) {
        throw new Error("Stock quantities must be whole numbers greater than or equal to 0.");
      }

      const existingItem = getItem.get(itemId);

      if (!existingItem) {
        throw new Error("Stock item not found.");
      }

      if (existingItem.current_quantity === nextQuantity) {
        continue;
      }

      updateItem.run(nextQuantity, now, itemId);
      insertLog.run(
        `stock_log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        existingItem.id,
        existingItem.name,
        existingItem.current_quantity,
        nextQuantity,
        changedByUser.id,
        changedByUser.name,
        now,
        "Manual stock count"
      );
    }
  });

  updateMany(normalizedChanges);

  return {
    items: listStockItems()
  };
}

function deductStockItemForDelivery(itemName, changedByUser) {
  const normalizedItemName = String(itemName || "").trim();

  if (!normalizedItemName) {
    return null;
  }

  const now = new Date().toISOString();
  const getItem = db.prepare("SELECT * FROM stock_items WHERE name = ? COLLATE NOCASE LIMIT 1");
  const updateItem = db.prepare(`
    UPDATE stock_items
    SET current_quantity = ?,
        updated_at = ?
    WHERE id = ?
  `);
  const insertLog = db.prepare(`
    INSERT INTO stock_count_logs (
      id,
      item_id,
      item_name,
      previous_quantity,
      new_quantity,
      changed_by_user_id,
      changed_by_name,
      changed_at,
      reason
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deductItem = db.transaction(() => {
    const existingItem = getItem.get(normalizedItemName);

    if (!existingItem) {
      return null;
    }

    const nextQuantity = Math.max(0, existingItem.current_quantity - 1);

    updateItem.run(nextQuantity, now, existingItem.id);
    insertLog.run(
      `stock_log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      existingItem.id,
      existingItem.name,
      existingItem.current_quantity,
      nextQuantity,
      changedByUser.id,
      changedByUser.name,
      now,
      "Delivered from container"
    );

    return {
      itemId: existingItem.id,
      previousQuantity: existingItem.current_quantity,
      newQuantity: nextQuantity
    };
  });

  return deductItem();
}

function cleanupOldStockCountLogs() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  db.prepare("DELETE FROM stock_count_logs WHERE changed_at < ?").run(cutoff.toISOString());
}

function cleanupExpiredTemporaryStockPermissions() {
  const result = db
    .prepare("DELETE FROM temporary_stock_permissions WHERE expires_at <= ?")
    .run(new Date().toISOString());

  return result.changes;
}

function listActiveTemporaryStockPermissions() {
  cleanupExpiredTemporaryStockPermissions();

  const rows = db
    .prepare("SELECT * FROM temporary_stock_permissions WHERE expires_at > ? ORDER BY expires_at ASC")
    .all(new Date().toISOString());

  return rows.map(mapTemporaryStockPermissionRow);
}

function getActiveTemporaryStockPermissionForUser(userId) {
  cleanupExpiredTemporaryStockPermissions();

  const row = db
    .prepare(`
      SELECT *
      FROM temporary_stock_permissions
      WHERE user_id = ?
        AND expires_at > ?
      ORDER BY expires_at DESC
      LIMIT 1
    `)
    .get(userId, new Date().toISOString());

  return mapTemporaryStockPermissionRow(row);
}

function grantTemporaryStockPermission({ userId, grantedByUser, durationHours }) {
  const duration = Number(durationHours);
  const allowedDurations = [1, 2, 4, 8];

  if (!allowedDurations.includes(duration)) {
    throw new Error("Temporary stock access duration must be 1, 2, 4, or 8 hours.");
  }

  const targetUser = getRegisteredUserById(userId);

  if (!targetUser || targetUser.disabled) {
    throw new Error("User not found or disabled.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + duration * 60 * 60 * 1000);

  const savePermission = db.transaction(() => {
    db.prepare("DELETE FROM temporary_stock_permissions WHERE user_id = ?").run(targetUser.id);
    db.prepare(`
      INSERT INTO temporary_stock_permissions (
        id,
        user_id,
        user_name,
        granted_by_user_id,
        granted_by_name,
        expires_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `stock_permission_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      targetUser.id,
      targetUser.name,
      grantedByUser.id,
      grantedByUser.name,
      expiresAt.toISOString(),
      now.toISOString()
    );
  });

  savePermission();

  return getActiveTemporaryStockPermissionForUser(targetUser.id);
}

function revokeTemporaryStockPermission(id) {
  const result = db.prepare("DELETE FROM temporary_stock_permissions WHERE id = ?").run(id);

  if (result.changes === 0) {
    throw new Error("Temporary stock permission not found or already expired.");
  }
}

function findRegisteredUserByName(name) {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    return null;
  }

  // Login lookup is case-insensitive, but PIN validation stays as an exact string comparison.
  const row = db
    .prepare("SELECT * FROM users WHERE lower(name) = lower(?) LIMIT 1")
    .get(normalizedName);

  return mapUserRow(row);
}

function listRegisteredUsers() {
  const rows = db.prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE").all();

  return rows.map(mapUserRow);
}

function getRegisteredUserById(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);

  return mapUserRow(row);
}

function getAdminUserCount() {
  return db.prepare("SELECT COUNT(*) AS count FROM users WHERE admin = 1").get().count;
}

function createRegisteredUser({ name, pin, manager, chef }) {
  const trimmedName = String(name || "").trim();
  const trimmedPin = String(pin || "").trim();

  if (!trimmedName || !trimmedPin) {
    throw new Error("Name and PIN are required.");
  }

  const existingUser = findRegisteredUserByName(trimmedName);

  if (existingUser) {
    throw new Error("A user with this name already exists.");
  }

  const permissions = {
    admin: false,
    manager: manager === true,
    chef: chef === true
  };
  const roleConfig = getRoleConfig(permissions);
  const id = `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  db.prepare(`
    INSERT INTO users (
      id,
      name,
      pin,
      admin,
      manager,
      chef,
      allowedRoles,
      defaultRole,
      disabled,
      createdAt
    )
    VALUES (?, ?, ?, 0, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    trimmedName,
    trimmedPin,
    permissions.manager ? 1 : 0,
    permissions.chef ? 1 : 0,
    JSON.stringify(roleConfig.allowedRoles),
    roleConfig.defaultRole,
    new Date().toISOString()
  );

  return getRegisteredUserById(id);
}

function updateRegisteredUserPermissions(id, { manager, chef }) {
  const existingUser = getRegisteredUserById(id);

  if (!existingUser) {
    throw new Error("User not found.");
  }

  const nextPermissions = {
    admin: existingUser.permissions.admin,
    manager: manager === true,
    chef: chef === true
  };

  // Admin permission is intentionally not editable from the user-management UI.
  const roleConfig = getRoleConfig(nextPermissions);

  // Permission changes also rewrite role access so login/start shift stays backend-controlled.
  db.prepare(`
    UPDATE users
    SET manager = ?,
        chef = ?,
        allowedRoles = ?,
        defaultRole = ?
    WHERE id = ?
  `).run(
    nextPermissions.manager ? 1 : 0,
    nextPermissions.chef ? 1 : 0,
    JSON.stringify(roleConfig.allowedRoles),
    roleConfig.defaultRole,
    id
  );

  return getRegisteredUserById(id);
}

function setRegisteredUserDisabled(id, disabled) {
  const existingUser = getRegisteredUserById(id);

  if (!existingUser) {
    throw new Error("User not found.");
  }

  db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(disabled ? 1 : 0, id);

  return getRegisteredUserById(id);
}

function resetRegisteredUserPin(id, pin) {
  const trimmedPin = String(pin || "").trim();

  if (!trimmedPin) {
    throw new Error("PIN is required.");
  }

  const existingUser = getRegisteredUserById(id);

  if (!existingUser) {
    throw new Error("User not found.");
  }

  db.prepare("UPDATE users SET pin = ? WHERE id = ?").run(trimmedPin, id);

  return getRegisteredUserById(id);
}

function deleteRegisteredUser(id) {
  const existingUser = getRegisteredUserById(id);

  if (!existingUser) {
    throw new Error("User not found or already deleted");
  }

  const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  console.log("Delete user rows changed:", result.changes);

  if (result.changes === 0) {
    throw new Error("User not found or already deleted");
  }

  return existingUser;
}

module.exports = {
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
};
