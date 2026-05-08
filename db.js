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

  // Admin permission is intentionally not editable from the MVP UI. Marcos stays admin for now.
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
  deleteRegisteredUser
};
