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
const SESSION_STORAGE_KEY = "bloomlinkSession";
const ALERTS_STORAGE_KEY = "bloomlinkAlertsEnabled";

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
  pushState: "not_enabled",
  settings: {
    autoEndEnabled: true,
    autoEndTime: "21:00",
    lastAutoEndDate: null
  },
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
  loginButton: document.querySelector("#loginButton"),
  shiftForm: document.querySelector("#shiftForm"),
  startShiftButton: document.querySelector("#startShiftButton"),
  logoutButton: document.querySelector("#logoutButton"),
  stockForm: document.querySelector("#stockForm"),
  sendRequestButton: document.querySelector("#sendRequestButton"),
  clearCompletedButton: document.querySelector("#clearCompletedButton"),
  shiftControls: document.querySelector("#shiftControls"),
  keepSelfConnected: document.querySelector("#keepSelfConnected"),
  endAllShiftsButton: document.querySelector("#endAllShiftsButton"),
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
  managerSettingsPanel: document.querySelector("#managerSettingsPanel"),
  autoEndEnabled: document.querySelector("#autoEndEnabled"),
  autoEndTime: document.querySelector("#autoEndTime"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  nextAutoEndText: document.querySelector("#nextAutoEndText"),
  settingsMessage: document.querySelector("#settingsMessage"),
  alertsMessage: document.querySelector("#alertsMessage"),
  adminPanel: document.querySelector("#adminPanel"),
  adminCreateUserForm: document.querySelector("#adminCreateUserForm"),
  adminCreateUserButton: document.querySelector("#adminCreateUserButton"),
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

function formatLastSeen(timestamp) {
  if (!timestamp) {
    return "unknown";
  }

  const secondsAgo = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (secondsAgo < 60) {
    return "just now";
  }

  const minutesAgo = Math.floor(secondsAgo / 60);

  if (minutesAgo < 60) {
    return `${minutesAgo} min ago`;
  }

  const hoursAgo = Math.floor(minutesAgo / 60);
  return `${hoursAgo} hr ago`;
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

function showSettingsMessage(message) {
  elements.settingsMessage.textContent = message;
  elements.settingsMessage.classList.remove("hidden");
}

function clearSettingsMessage() {
  elements.settingsMessage.textContent = "";
  elements.settingsMessage.classList.add("hidden");
}

function resetSessionState() {
  state.loggedInUser = null;
  state.currentUser = null;
  state.users = [];
  state.activeRequests = [];
  state.receivedAlerts = [];
  state.adminUsers = [];
  state.highlightedAlertIds.clear();
  state.activeTab = "operations";
}

function saveSession() {
  if (!state.loggedInUser || !state.currentUser) {
    return;
  }

  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      registeredUserId: state.loggedInUser.id,
      name: state.loggedInUser.name,
      permissions: state.loggedInUser.permissions,
      allowedRoles: state.loggedInUser.allowedRoles,
      defaultRole: state.loggedInUser.defaultRole,
      currentRole: state.currentUser.currentRole,
      currentLocation: state.currentUser.currentLocation,
      currentChannel: state.currentUser.currentChannel,
      status: state.currentUser.status
    })
  );
  console.log("Saved session");
}

function clearSavedSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem("bloomlink.session");
  console.log("Session cleared");
}

function getSavedSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
  } catch (error) {
    clearSavedSession();
    return null;
  }
}

function restoreSavedSession() {
  const savedSession = getSavedSession();

  if (!savedSession?.registeredUserId || !savedSession?.currentRole) {
    return;
  }

  console.log("Attempting restore");
  socket.emit("user:restore_session", savedSession);
}

function renderAlertsControl() {
  elements.alertsStatus.textContent = state.alertsEnabled ? "Alerts: Enabled" : "Alerts: Disabled";
  elements.alertsStatus.className = `status-label ${state.alertsEnabled ? "online" : "offline"}`;
  elements.enableAlertsButton.disabled = state.alertsEnabled;

  const pushLabels = {
    enabled: "Push: Enabled",
    not_enabled: "Push: Not enabled",
    blocked: "Push: Blocked",
    unsupported: "Push: Unsupported"
  };

  elements.pushStatus.textContent = pushLabels[state.pushState] || "Push: Not enabled";
  elements.pushStatus.className = `status-label ${state.pushState === "enabled" ? "online" : "offline"}`;
  elements.enablePushButton.textContent = "Enable Push Notifications";
  elements.enablePushButton.disabled = state.pushState === "unsupported" || state.pushState === "blocked";
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
    localStorage.setItem(ALERTS_STORAGE_KEY, "true");
    renderAlertsControl();
    return;
  }

  try {
    await audioContext.resume();
    state.alertsEnabled = true;
    localStorage.setItem(ALERTS_STORAGE_KEY, "true");
  } catch (error) {
    state.alertsEnabled = false;
    showAlertsMessage("Sound alerts are blocked. Tap Enable Alerts.");
  }

  renderAlertsControl();
}

function playAlertBeep() {
  const audioContext = getAudioContext();

  if (!audioContext || audioContext.state !== "running") {
    showAlertsMessage("Tap Enable Alerts again to unlock sound.");
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
    showAlertsMessage("Tap Enable Alerts again to unlock sound.");
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
    state.pushState = "unsupported";
    renderAlertsControl();
    showAlertsMessage("Push unsupported on this device/browser.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      state.pushState = permission === "denied" ? "blocked" : "not_enabled";
      renderAlertsControl();
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

async function refreshPushStatus() {
  if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) {
    state.pushState = "unsupported";
    renderAlertsControl();
    showAlertsMessage("Push unsupported on this device/browser.");
    return;
  }

  if (Notification.permission === "denied") {
    state.pushState = "blocked";
    renderAlertsControl();
    return;
  }

  if (Notification.permission !== "granted") {
    state.pushState = "not_enabled";
    renderAlertsControl();
    return;
  }

  try {
    const registration = await registerServiceWorker();
    const subscription = await registration.pushManager.getSubscription();
    state.pushState = subscription ? "enabled" : "not_enabled";
    state.pushEnabled = Boolean(subscription);
  } catch (error) {
    state.pushState = "not_enabled";
  }

  renderAlertsControl();
}

function requestBackendPushStatus() {
  if (state.currentUser) {
    socket.emit("push:status");
  }
}

function getNextAutoEndLabel(autoEndTime) {
  const [hours, minutes] = autoEndTime.split(":").map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const dayLabel =
    state.settings.lastAutoEndDate === todayKey || now.getTime() > next.getTime()
      ? "Tomorrow"
      : "Today";
  console.log("next auto end calculated", `${dayLabel} ${autoEndTime}`);
  return `${dayLabel} ${autoEndTime}`;
}

function renderSettings() {
  const canUseSettings = canControlShifts();
  elements.managerSettingsPanel.classList.toggle("hidden", !canUseSettings);

  if (!canUseSettings) {
    return;
  }

  elements.autoEndEnabled.checked = state.settings.autoEndEnabled;
  elements.autoEndTime.value = state.settings.autoEndTime;
  elements.nextAutoEndText.textContent = `Next auto end: ${getNextAutoEndLabel(state.settings.autoEndTime)}`;
}

function saveSettings() {
  clearSettingsMessage();
  socket.emit("settings:update", {
    autoEndEnabled: elements.autoEndEnabled.checked,
    autoEndTime: elements.autoEndTime.value
  });
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

  // stock:alert is emitted only after server-side eligibility checks.
  // The frontend keeps this guard mainly to prevent Staff from rendering actionable alerts.
  if (state.currentUser.currentRole === "Staff") {
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

function canRenderActionableStockAlert(request) {
  if (!canCurrentUserRenderStockAlerts()) {
    return false;
  }

  if (request.status !== "pending" || request.assignedTo) {
    return false;
  }

  return request.requestedBy?.id !== state.currentUser.id;
}

function canManageStockRequests() {
  return (
    state.currentUser?.permissions?.admin === true ||
    state.currentUser?.permissions?.manager === true ||
    state.currentUser?.currentRole === "Manager"
  );
}

function canControlShifts() {
  return canManageStockRequests();
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
  elements.shiftControls.classList.toggle("hidden", !canControlShifts());

  if (state.users.length === 0) {
    elements.usersList.className = "list empty";
    elements.usersList.textContent = "No users online.";
    return;
  }

  elements.usersList.className = "list";
  elements.usersList.innerHTML = state.users
    .map((user) => {
      const isConnected = user.connectionStatus === "connected";
      const connectionText = isConnected
        ? "Connected"
        : `Disconnected · last seen ${formatLastSeen(user.lastSeen)}`;

      const canEndThisShift = canControlShifts() && user.id !== state.currentUser?.id;
      const pushText = user.pushStatus?.lastPushError
        ? "Push: Error"
        : user.pushStatus?.pushSubscribed
          ? "Push: Subscribed"
          : "Push: Not subscribed";

      return `
        <article class="row-card">
          <strong>${user.name}</strong>
          <span>${user.currentRole} at ${user.currentLocation}</span>
          <span>Channel: ${user.currentChannel}</span>
          <span class="status-label ${user.status === "on_break" ? "break" : "online"}">
            ${user.status === "on_break" ? "On break" : "Available"}
          </span>
          <span class="status-label ${isConnected ? "online" : "offline"}">Connection: ${connectionText}</span>
          ${canControlShifts() ? `<span class="status-label ${user.pushStatus?.lastPushError ? "offline" : user.pushStatus?.pushSubscribed ? "online" : "offline"}">${pushText}</span>` : ""}
          ${canEndThisShift ? `<button type="button" data-end-shift-user-id="${user.id}">End Shift</button>` : ""}
        </article>
      `;
    })
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
            <button type="button" data-admin-action="toggle-manager" data-user-id="${user.id}">${managerText}</button>
            <button type="button" data-admin-action="toggle-chef" data-user-id="${user.id}">${chefText}</button>
            <button type="button" data-admin-action="${statusActionName}" data-user-id="${user.id}">${statusAction}</button>
            <button type="button" data-admin-action="reset-pin" data-user-id="${user.id}">Reset PIN</button>
            <button type="button" data-admin-action="delete" data-user-id="${user.id}">Delete</button>
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
            <button type="button" data-action="on_my_way" data-request-id="${request.id}" class="primary-button">On my way</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderRequests() {
  elements.clearCompletedButton.classList.toggle("hidden", !canManageStockRequests());

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
          ${canManageStockRequests() ? `<button type="button" data-delete-request-id="${request.id}">Delete Request</button>` : ""}
          ${assignedToCurrentUser && request.status !== "delivered" ? `<button type="button" data-deliver-id="${request.id}" class="primary-button">Delivered</button>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderAll() {
  renderTabs();
  renderAlertsControl();
  renderSettings();
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
  console.log("Send Request tapped");

  if (!state.currentUser) {
    alert("Start your shift before creating a stock request.");
    return;
  }

  socket.emit("stock:create", {
    location: elements.requestLocation.value,
    item: elements.requestItem.value
  });
}

function logoutUser() {
  console.log("Logout clicked");
  clearSavedSession();
  resetSessionState();
  showScreen("login");
  renderAll();
  socket.emit("user:logout");
}

function clearCompletedRequests() {
  console.log("Clear completed clicked");

  if (confirm("Clear all completed requests?")) {
    socket.emit("stock:clear_completed");
  }
}

function endAllShifts() {
  if (!confirm("End all active shifts?")) {
    return;
  }

  socket.emit("admin:shift:end_all", {
    keepSelf: elements.keepSelfConnected.checked
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
  const deleteRequestButton = event.target.closest("[data-delete-request-id]");
  const endShiftButton = event.target.closest("[data-end-shift-user-id]");

  if (endShiftButton) {
    event.preventDefault();

    if (confirm("End shift for this user?")) {
      socket.emit("admin:shift:end_user", {
        userId: endShiftButton.dataset.endShiftUserId
      });
    }
    return;
  }

  if (responseButton) {
    event.preventDefault();
    console.log("On my way tapped");
    socket.emit("stock:response", {
      requestId: responseButton.dataset.requestId,
      action: responseButton.dataset.action
    });
    return;
  }

  if (deliverButton) {
    event.preventDefault();
    console.log("Delivered tapped");
    socket.emit("stock:delivered", {
      requestId: deliverButton.dataset.deliverId
    });
    return;
  }

  if (deleteRequestButton) {
    event.preventDefault();
    console.log("Delete request clicked", deleteRequestButton.dataset.deleteRequestId);

    if (confirm("Delete this request?")) {
      socket.emit("stock:delete_request", {
        requestId: deleteRequestButton.dataset.deleteRequestId
      });
    }
    return;
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
state.alertsEnabled = localStorage.getItem(ALERTS_STORAGE_KEY) === "true";

socket.on("connect", () => {
  setConnectionStatus("Connection: Connected", true);
  restoreSavedSession();
  refreshPushStatus();
});

registerServiceWorker().catch(() => {
  // Push setup still works later from the Enable Push Notifications button if supported.
});

socket.on("disconnect", () => {
  setConnectionStatus("Connection: Disconnected", false);
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
  if (canControlShifts()) {
    socket.emit("settings:get");
  }
  saveSession();
  refreshPushStatus();
  requestBackendPushStatus();
  renderAll();
});

socket.on("user:restore_success", (data) => {
  console.log("Restore success");
  state.loggedInUser = data.registeredUser;
  state.currentUser = data.onlineUser;
  state.receivedAlerts = [];
  state.activeTab = "operations";
  showScreen("app");
  if (isCurrentUserAdmin()) {
    socket.emit("admin:users:list");
  }
  if (canControlShifts()) {
    socket.emit("settings:get");
  }
  saveSession();
  refreshPushStatus();
  requestBackendPushStatus();
  renderAll();
});

socket.on("user:restore_failed", (data) => {
  console.log("Restore failed", data?.message || "");
  clearSavedSession();
  resetSessionState();
  showScreen("login");
  renderAll();
});

socket.on("user:logged_out", () => {
  clearSavedSession();
  resetSessionState();
  showScreen("login");
  renderAll();
});

socket.on("user:start_failed", (data) => {
  alert(data.message || "Could not start shift.");
});

socket.on("stock:alert", (request) => {
  console.log("stock:alert received", request.id);

  if (!canRenderActionableStockAlert(request)) {
    console.log("receivedStockAlerts count", state.receivedAlerts.length);
    return;
  }

  const alreadyAdded = state.receivedAlerts.some((alert) => alert.id === request.id);

  if (!alreadyAdded) {
    state.receivedAlerts.unshift(request);
    triggerStockAlertFeedback(request.id);
  }

  console.log("receivedStockAlerts count", state.receivedAlerts.length);
  renderAlerts();
});

socket.on("stock:update", (requests) => {
  state.activeRequests = requests;
  const requestsById = new Map(requests.map((request) => [request.id, request]));

  // stock:update is public state for Active Requests. This reconciliation keeps existing actionable
  // alerts in sync and prevents a timing issue from leaving eligible users without the On my way card.
  state.receivedAlerts = state.receivedAlerts
    .map((alert) => requestsById.get(alert.id))
    .filter(Boolean)
    .filter(canRenderActionableStockAlert);

  for (const request of requests) {
    const alreadyAdded = state.receivedAlerts.some((alert) => alert.id === request.id);

    if (!alreadyAdded && canRenderActionableStockAlert(request)) {
      state.receivedAlerts.unshift(request);
    }
  }

  renderAll();
});

socket.on("stock:claim_failed", (data) => {
  alert(data.message || "This request has already been assigned.");
});

socket.on("push:subscribed", () => {
  state.pushEnabled = true;
  state.pushState = "enabled";
  clearAlertsMessage();
  renderAlertsControl();
  requestBackendPushStatus();
});

socket.on("push:error", (data) => {
  state.pushEnabled = false;
  state.pushState = "not_enabled";
  showAlertsMessage(data.message || "Could not enable push notifications.");
  renderAlertsControl();
});

socket.on("push:status_result", (data) => {
  state.pushEnabled = data.subscribed === true;

  if (data.lastPushError) {
    state.pushState = "not_enabled";
  } else if (data.subscribed) {
    state.pushState = "enabled";
  } else if ("Notification" in window && Notification.permission === "denied") {
    state.pushState = "blocked";
  } else if (!("Notification" in window) || !("PushManager" in window)) {
    state.pushState = "unsupported";
  } else {
    state.pushState = "not_enabled";
  }

  renderAlertsControl();
});

socket.on("settings:update", (settings) => {
  state.settings = settings;
  clearSettingsMessage();
  renderSettings();
});

socket.on("settings:error", (data) => {
  showSettingsMessage(data.message || "Settings action failed.");
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
  clearSavedSession();
  resetSessionState();
  showScreen("login");
});

socket.on("user:session_invalidated", (data) => {
  alert(data.message || "Your account was updated by an admin. Please log in again.");
  clearSavedSession();
  resetSessionState();
  showScreen("login");
});

socket.on("user:force_logout", (data) => {
  alert(data.message || "Your shift was ended by a manager.");
  clearSavedSession();
  resetSessionState();
  showScreen("login");
  renderAll();
});

elements.loginForm.addEventListener("submit", (event) => event.preventDefault());
elements.shiftForm.addEventListener("submit", (event) => event.preventDefault());
elements.stockForm.addEventListener("submit", (event) => event.preventDefault());
elements.adminCreateUserForm.addEventListener("submit", (event) => event.preventDefault());
elements.loginButton.addEventListener("click", loginUser);
elements.startShiftButton.addEventListener("click", startShift);
elements.logoutButton.addEventListener("click", logoutUser);
elements.sendRequestButton.addEventListener("click", createStockRequest);
elements.clearCompletedButton.addEventListener("click", clearCompletedRequests);
elements.endAllShiftsButton.addEventListener("click", endAllShifts);
elements.saveSettingsButton.addEventListener("click", saveSettings);
elements.enableAlertsButton.addEventListener("click", enableAlerts);
elements.enablePushButton.addEventListener("click", enablePushNotifications);
elements.alertsList.addEventListener("click", handleListClick);
elements.requestsList.addEventListener("click", handleListClick);
elements.usersList.addEventListener("click", handleListClick);
elements.adminCreateUserButton.addEventListener("click", createAdminUser);
elements.adminUsersList.addEventListener("click", handleAdminClick);
elements.operationsTab.addEventListener("click", () => switchTab("operations"));
elements.adminTab.addEventListener("click", () => switchTab("admin"));
