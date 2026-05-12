const SERVER_URL = window.location.origin;

const locations = [
  "Kitchen",
  "Washing Area",
  "Front of House",
  "Container (Courtyard)",
  "Shack (Front)",
  "Floor (upstairs)"
];

const stockItems = [
  "12oz Cups",
  "8oz Cups",
  "Coffee Beans",
  "Milk",
  "Oat Milk",
  "Lids",
  "Napkins",
  "Sugar",
  "Till Roll"
];

const socket = io(SERVER_URL);

const state = {
  loggedInUser: null,
  currentUser: null,
  users: [],
  activeRequests: [],
  receivedAlerts: [],
  adminUsers: [],
  activeTab: "operations",
  alertsEnabled: false,
  audioContext: null,
  highlightedAlertIds: new Set(),
  pushEnabled: false,
  serviceWorkerRegistration: null
};

const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  shiftScreen: document.querySelector("#shiftScreen"),
  appScreen: document.querySelector("#appScreen"),
  operationsTab: document.querySelector("#operationsTab"),
  adminTab: document.querySelector("#adminTab"),
  operationsView: document.querySelector("#operationsView"),
  adminView: document.querySelector("#adminView"),
  connectionStatus: document.querySelector("#connectionStatus"),
  loginForm: document.querySelector("#loginForm"),
  shiftForm: document.querySelector("#shiftForm"),
  stockForm: document.querySelector("#stockForm"),
  userName: document.querySelector("#userName"),
  userPin: document.querySelector("#userPin"),
  currentRole: document.querySelector("#currentRole"),
  currentLocation: document.querySelector("#currentLocation"),
  requestLocation: document.querySelector("#requestLocation"),
  requestItem: document.querySelector("#requestItem"),
  loginError: document.querySelector("#loginError"),
  loggedUserName: document.querySelector("#loggedUserName"),
  currentUserInfo: document.querySelector("#currentUserInfo"),
  alertsStatus: document.querySelector("#alertsStatus"),
  enableAlertsButton: document.querySelector("#enableAlertsButton"),
  pushStatus: document.querySelector("#pushStatus"),
  enablePushButton: document.querySelector("#enablePushButton"),
  alertsMessage: document.querySelector("#alertsMessage"),
  adminPanel: document.querySelector("#adminPanel"),
  adminCreateUserForm: document.querySelector("#adminCreateUserForm"),
  adminNewUserName: document.querySelector("#adminNewUserName"),
  adminNewUserPin: document.querySelector("#adminNewUserPin"),
  adminNewUserManager: document.querySelector("#adminNewUserManager"),
  adminNewUserChef: document.querySelector("#adminNewUserChef"),
  adminError: document.querySelector("#adminError"),
  adminUsersList: document.querySelector("#adminUsersList"),
  usersList: document.querySelector("#usersList"),
  alertsList: document.querySelector("#alertsList"),
  requestsList: document.querySelector("#requestsList")
};

function fillSelect(select, values) {
  select.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setConnectionStatus(text, isConnected) {
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.className = `status-label ${isConnected ? "online" : "offline"}`;
}

function showScreen(screenName) {
  elements.loginScreen.classList.toggle("hidden", screenName !== "login");
  elements.shiftScreen.classList.toggle("hidden", screenName !== "shift");
  elements.appScreen.classList.toggle("hidden", screenName !== "app");
}

function showLoginError(message) {
  elements.loginError.textContent = message;
  elements.loginError.classList.remove("hidden");
}

function clearLoginError() {
  elements.loginError.textContent = "";
  elements.loginError.classList.add("hidden");
}

function showAlertsMessage(message) {
  elements.alertsMessage.textContent = message;
  elements.alertsMessage.classList.remove("hidden");
}

function clearAlertsMessage() {
  elements.alertsMessage.textContent = "";
  elements.alertsMessage.classList.add("hidden");
}

function resetSessionState() {
  state.loggedInUser = null;
  state.currentUser = null;
  state.receivedAlerts = [];
  state.adminUsers = [];
  state.activeTab = "operations";
}

function renderAlertsControl() {
  elements.alertsStatus.textContent = state.alertsEnabled ? "Alerts: Enabled" : "Alerts: Disabled";
  elements.alertsStatus.className = `status-label ${state.alertsEnabled ? "online" : "offline"}`;
  elements.enableAlertsButton.disabled = state.alertsEnabled;
  elements.pushStatus.textContent = state.pushEnabled ? "Push: Enabled" : "Push: Disabled";
  elements.pushStatus.className = `status-label ${state.pushEnabled ? "online" : "offline"}`;
  elements.enablePushButton.disabled = state.pushEnabled;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (!state.audioContext) {
    state.audioContext = new AudioContextClass();
  }

  return state.audioContext;
}

async function enableAlerts() {
  clearAlertsMessage();

  const audioContext = getAudioContext();

  if (!audioContext) {
    state.alertsEnabled = true;
    renderAlertsControl();
    return;
  }

  try {
    await audioContext.resume();
    state.alertsEnabled = true;
  } catch (error) {
    state.alertsEnabled = false;
    showAlertsMessage("Sound alerts are blocked. Tap Enable Alerts.");
  }

  renderAlertsControl();
}

function playAlertBeep() {
  const audioContext = getAudioContext();

  if (!audioContext || audioContext.state !== "running") {
    showAlertsMessage("Sound alerts are blocked. Tap Enable Alerts.");
    state.alertsEnabled = false;
    renderAlertsControl();
    return;
  }

  try {
    const pattern = [
      { start: 0, duration: 0.2, frequency: 920 },
      { start: 0.32, duration: 0.2, frequency: 980 },
      { start: 0.64, duration: 0.28, frequency: 1040 }
    ];

    for (const beep of pattern) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startTime = audioContext.currentTime + beep.start;
      const endTime = startTime + beep.duration;

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(beep.frequency, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.32, startTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, endTime);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startTime);
      oscillator.stop(endTime + 0.02);
    }
  } catch (error) {
    showAlertsMessage("Sound alerts are blocked. Tap Enable Alerts.");
  }
}

function vibrateForStockAlert() {
  if ("vibrate" in navigator) {
    navigator.vibrate([300, 100, 300, 100, 500]);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser.");
  }

  if (!state.serviceWorkerRegistration) {
    state.serviceWorkerRegistration = await navigator.serviceWorker.register("/service-worker.js");
  }

  return state.serviceWorkerRegistration;
}

async function getVapidPublicKey() {
  const response = await fetch("/api/push/public-key");
  const data = await response.json();

  if (!data.publicKey) {
    throw new Error("Push notifications are not configured on the server.");
  }

  return data.publicKey;
}

async function enablePushNotifications() {
  clearAlertsMessage();

  if (!("Notification" in window) || !("PushManager" in window)) {
    showAlertsMessage("Push notifications are not supported in this browser.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      showAlertsMessage("Push notifications were not allowed.");
      return;
    }

    const registration = await registerServiceWorker();
    const publicKey = await getVapidPublicKey();
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    socket.emit("push:subscribe", subscription.toJSON());
  } catch (error) {
    showAlertsMessage(error.message || "Could not enable push notifications.");
  }
}

function triggerStockAlertFeedback(requestId) {
  state.highlightedAlertIds.add(requestId);

  if (state.alertsEnabled) {
    clearAlertsMessage();
    playAlertBeep();
    vibrateForStockAlert();
  }

  setTimeout(() => {
    state.highlightedAlertIds.delete(requestId);
    renderAlerts();
  }, 4000);
}

function getRequestTitle(request) {
  return `${request.location} needs ${request.item}`;
}

function canCurrentUserRenderStockAlerts() {
  if (!state.currentUser || state.currentUser.status === "on_break") {
    return false;
  }

  return (
    state.currentUser.permissions?.admin === true ||
    state.currentUser.permissions?.manager === true ||
    state.currentUser.currentRole === "Manager" ||
    state.currentUser.currentRole === "KP" ||
    state.currentUser.currentRole === "Stock Runner"
  );
}

function isCurrentUserAdmin() {
  return state.currentUser?.permissions?.admin === true;
}

function showAdminError(message) {
  elements.adminError.textContent = message;
  elements.adminError.classList.remove("hidden");
}

function clearAdminError() {
  elements.adminError.textContent = "";
  elements.adminError.classList.add("hidden");
}

function renderTabs() {
  const canUseAdminTab = isCurrentUserAdmin();

  if (!canUseAdminTab && state.activeTab === "admin") {
    state.activeTab = "operations";
  }

  elements.adminTab.classList.toggle("hidden", !canUseAdminTab);
  elements.operationsView.classList.toggle("hidden", state.activeTab !== "operations");
  elements.adminView.classList.toggle("hidden", state.activeTab !== "admin" || !canUseAdminTab);
  elements.operationsTab.classList.toggle("active", state.activeTab === "operations");
  elements.adminTab.classList.toggle("active", state.activeTab === "admin");
}

function switchTab(tabName) {
  if (tabName === "admin" && !isCurrentUserAdmin()) {
    return;
  }

  state.activeTab = tabName;
  renderTabs();
}

function renderUsers() {
  if (state.users.length === 0) {
    elements.usersList.className = "list empty";
    elements.usersList.textContent = "No users online.";
    return;
  }

  elements.usersList.className = "list";
  elements.usersList.innerHTML = state.users
    .map(
      (user) => `
        <article class="row-card">
          <strong>${user.name}</strong>
          <span>${user.currentRole} at ${user.currentLocation}</span>
          <span>Channel: ${user.currentChannel}</span>
          <span class="status-label ${user.status === "on_break" ? "break" : "online"}">
            ${user.status === "on_break" ? "On break" : "Available"}
          </span>
        </article>
      `
    )
    .join("");
}

function renderAdminPanel() {
  if (!isCurrentUserAdmin()) {
    return;
  }

  if (state.adminUsers.length === 0) {
    elements.adminUsersList.className = "list empty";
    elements.adminUsersList.textContent = "No registered users loaded.";
    return;
  }

  elements.adminUsersList.className = "list";
  elements.adminUsersList.innerHTML = state.adminUsers
    .map((user) => {
      const managerText = user.permissions.manager ? "Remove manager" : "Make manager";
      const chefText = user.permissions.chef ? "Remove chef" : "Make chef";
      const statusText = user.disabled ? "Disabled" : "Enabled";
      const statusAction = user.disabled ? "Enable" : "Disable";
      const statusActionName = user.disabled ? "enable" : "disable";

      return `
        <article class="row-card admin-user-card">
          <div class="request-header">
            <strong>${user.name}</strong>
            <span class="status-label ${user.disabled ? "offline" : "online"}">${statusText}</span>
          </div>
          <span>Roles: ${user.allowedRoles.join(", ")}</span>
          <span>Default role: ${user.defaultRole}</span>
          <span>Permissions: admin ${user.permissions.admin ? "yes" : "no"}, manager ${user.permissions.manager ? "yes" : "no"}, chef ${user.permissions.chef ? "yes" : "no"}</span>
          <div class="admin-button-row">
            <button data-admin-action="toggle-manager" data-user-id="${user.id}">${managerText}</button>
            <button data-admin-action="toggle-chef" data-user-id="${user.id}">${chefText}</button>
            <button data-admin-action="${statusActionName}" data-user-id="${user.id}">${statusAction}</button>
            <button data-admin-action="reset-pin" data-user-id="${user.id}">Reset PIN</button>
            <button data-admin-action="delete" data-user-id="${user.id}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAlerts() {
  if (!canCurrentUserRenderStockAlerts()) {
    elements.alertsList.className = "list empty";
    elements.alertsList.textContent = "No alerts received yet.";
    return;
  }

  const actionableAlerts = state.receivedAlerts.filter(
    (request) => request.status === "pending" && !request.assignedTo
  );

  if (actionableAlerts.length === 0) {
    elements.alertsList.className = "list empty";
    elements.alertsList.textContent = "No alerts received yet.";
    return;
  }

  elements.alertsList.className = "list";
  elements.alertsList.innerHTML = actionableAlerts
    .map(
      (request) => `
        <article class="row-card alert-card ${state.highlightedAlertIds.has(request.id) ? "alert-card-highlight" : ""}">
          <strong>${getRequestTitle(request)}</strong>
          <span>Requested by ${request.requestedBy.name} at ${formatTime(request.createdAt)}</span>
          <div class="button-row">
            <button data-action="on_my_way" data-request-id="${request.id}" class="primary-button">On my way</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderRequests() {
  if (state.activeRequests.length === 0) {
    elements.requestsList.className = "list empty";
    elements.requestsList.textContent = "No stock requests yet.";
    return;
  }

  elements.requestsList.className = "list";
  elements.requestsList.innerHTML = state.activeRequests
    .map((request) => {
      const assignedToCurrentUser =
        state.currentUser && request.assignedTo && request.assignedTo.id === state.currentUser.id;
      const deliveredText = request.deliveredAt ? ` at ${formatTime(request.deliveredAt)}` : "";
      const assignmentText =
        request.status === "delivered"
          ? `Delivered by ${request.assignedTo.name}${deliveredText}`
          : request.assignedTo
            ? `Assigned to ${request.assignedTo.name}`
            : "Not assigned yet";

      return `
        <article class="row-card request-card">
          <div class="request-header">
            <strong>${getRequestTitle(request)}</strong>
            <span class="status-label ${request.status}">${request.status}</span>
          </div>
          <span>Requested by ${request.requestedBy.name} at ${formatTime(request.createdAt)}</span>
          <span>${assignmentText}</span>
          ${assignedToCurrentUser && request.status !== "delivered" ? `<button data-deliver-id="${request.id}" class="primary-button">Delivered</button>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderAll() {
  renderTabs();
  renderAlertsControl();
  renderUsers();
  renderAlerts();
  renderRequests();
  renderAdminPanel();

  if (state.currentUser) {
    elements.currentUserInfo.textContent =
      `${state.currentUser.name} - ${state.currentUser.currentRole} at ${state.currentUser.currentLocation}`;
  }
}

function loginUser(event) {
  event.preventDefault();
  clearLoginError();

  socket.emit("user:login", {
    name: elements.userName.value,
    pin: elements.userPin.value
  });
}

function startShift(event) {
  event.preventDefault();

  if (!state.loggedInUser) {
    alert("Log in before starting a shift.");
    return;
  }

  socket.emit("user:start_shift", {
    currentRole: elements.currentRole.value,
    currentLocation: elements.currentLocation.value
  });
}

function createStockRequest(event) {
  event.preventDefault();

  if (!state.currentUser) {
    alert("Start your shift before creating a stock request.");
    return;
  }

  socket.emit("stock:create", {
    location: elements.requestLocation.value,
    item: elements.requestItem.value
  });
}

function createAdminUser(event) {
  event.preventDefault();
  clearAdminError();

  socket.emit("admin:user:create", {
    name: elements.adminNewUserName.value,
    pin: elements.adminNewUserPin.value,
    manager: elements.adminNewUserManager.checked,
    chef: elements.adminNewUserChef.checked
  });

  elements.adminCreateUserForm.reset();
}

function handleListClick(event) {
  const responseButton = event.target.closest("[data-action]");
  const deliverButton = event.target.closest("[data-deliver-id]");

  if (responseButton) {
    socket.emit("stock:response", {
      requestId: responseButton.dataset.requestId,
      action: responseButton.dataset.action
    });
  }

  if (deliverButton) {
    socket.emit("stock:delivered", {
      requestId: deliverButton.dataset.deliverId
    });
  }
}

function handleAdminClick(event) {
  const button = event.target.closest("[data-admin-action]");

  if (!button) {
    return;
  }

  clearAdminError();

  const user = state.adminUsers.find((adminUser) => adminUser.id === button.dataset.userId);

  if (!user) {
    return;
  }

  if (button.dataset.adminAction === "toggle-manager") {
    socket.emit("admin:user:update", {
      id: user.id,
      manager: !user.permissions.manager,
      chef: user.permissions.chef
    });
  }

  if (button.dataset.adminAction === "toggle-chef") {
    socket.emit("admin:user:update", {
      id: user.id,
      manager: user.permissions.manager,
      chef: !user.permissions.chef
    });
  }

  if (button.dataset.adminAction === "disable") {
    socket.emit("admin:user:disable", {
      id: user.id
    });
  }

  if (button.dataset.adminAction === "enable") {
    socket.emit("admin:user:enable", {
      id: user.id
    });
  }

  if (button.dataset.adminAction === "reset-pin") {
    const nextPin = prompt(`Enter a new PIN for ${user.name}:`);

    if (nextPin !== null) {
      socket.emit("admin:user:reset_pin", {
        id: user.id,
        pin: nextPin
      });
    }
  }

  if (button.dataset.adminAction === "delete") {
    const confirmed = confirm("Are you sure you want to permanently delete this user?");

    if (confirmed) {
      console.log("Deleting user:", user.id, user.name);
      socket.emit("admin:user:delete", {
        id: user.id
      });
    }
  }
}

fillSelect(elements.currentLocation, locations);
fillSelect(elements.requestLocation, locations);
fillSelect(elements.requestItem, stockItems);
elements.currentLocation.value = "Shack (Front)";
elements.requestLocation.value = "Shack (Front)";
elements.requestItem.value = "12oz Cups";

socket.on("connect", () => {
  setConnectionStatus("Socket connected", true);
});

registerServiceWorker().catch(() => {
  // Push setup still works later from the Enable Push Notifications button if supported.
});

socket.on("disconnect", () => {
  setConnectionStatus("Socket disconnected", false);
});

socket.on("users:update", (users) => {
  state.users = users;
  renderUsers();
});

socket.on("user:login_success", (user) => {
  clearLoginError();
  state.loggedInUser = user;
  state.currentUser = null;
  state.receivedAlerts = [];
  fillSelect(elements.currentRole, user.allowedRoles);
  elements.currentRole.value = user.defaultRole;
  elements.loggedUserName.textContent = `Logged in as ${user.name}`;
  elements.shiftForm.classList.remove("hidden");
  showScreen("shift");
  renderAll();
});

socket.on("user:login_failed", (data) => {
  showLoginError(data.message || "Invalid name or PIN.");
  showScreen("login");
});

socket.on("user:session_started", (user) => {
  state.currentUser = user;
  state.receivedAlerts = [];
  state.activeTab = "operations";
  showScreen("app");
  if (isCurrentUserAdmin()) {
    socket.emit("admin:users:list");
  }
  renderAll();
});

socket.on("user:start_failed", (data) => {
  alert(data.message || "Could not start shift.");
});

socket.on("stock:alert", (request) => {
  if (!canCurrentUserRenderStockAlerts()) {
    return;
  }

  if (request.status !== "pending" || request.assignedTo) {
    return;
  }

  const alreadyAdded = state.receivedAlerts.some((alert) => alert.id === request.id);

  if (!alreadyAdded) {
    state.receivedAlerts.unshift(request);
    triggerStockAlertFeedback(request.id);
  }

  renderAlerts();
});

socket.on("stock:update", (requests) => {
  state.activeRequests = requests;
  // stock:update is public state. It updates Active Requests, but it never creates actionable alerts.
  state.receivedAlerts = state.receivedAlerts
    .map((alert) => requests.find((request) => request.id === alert.id) || alert)
    .filter((alert) => alert.status === "pending" && !alert.assignedTo);
  renderAll();
});

socket.on("stock:claim_failed", (data) => {
  alert(data.message || "This request has already been assigned.");
});

socket.on("push:subscribed", () => {
  state.pushEnabled = true;
  clearAlertsMessage();
  renderAlertsControl();
});

socket.on("push:error", (data) => {
  state.pushEnabled = false;
  showAlertsMessage(data.message || "Could not enable push notifications.");
  renderAlertsControl();
});

socket.on("admin:users:list", (users) => {
  state.adminUsers = users;
  clearAdminError();
  renderAdminPanel();
});

socket.on("admin:error", (data) => {
  showAdminError(data.message || "Admin action failed.");
});

socket.on("user:account_deleted", (data) => {
  alert(data.message || "Your account was deleted.");
  resetSessionState();
  showScreen("login");
});

socket.on("user:session_invalidated", (data) => {
  alert(data.message || "Your account was updated by an admin. Please log in again.");
  resetSessionState();
  showScreen("login");
});

elements.loginForm.addEventListener("submit", loginUser);
elements.shiftForm.addEventListener("submit", startShift);
elements.stockForm.addEventListener("submit", createStockRequest);
elements.enableAlertsButton.addEventListener("click", enableAlerts);
elements.enablePushButton.addEventListener("click", enablePushNotifications);
elements.alertsList.addEventListener("click", handleListClick);
elements.requestsList.addEventListener("click", handleListClick);
elements.adminCreateUserForm.addEventListener("submit", createAdminUser);
elements.adminUsersList.addEventListener("click", handleAdminClick);
elements.operationsTab.addEventListener("click", () => switchTab("operations"));
elements.adminTab.addEventListener("click", () => switchTab("admin"));
