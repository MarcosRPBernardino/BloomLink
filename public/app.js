const SERVER_URL = window.location.origin;

const locations = [
  "Kitchen",
  "Washing Area",
  "Front of House",
  "Container (Courtyard)",
  "Shack (Front)",
  "Floor (upstairs)"
];

const stockItemsByCategory = {
  "Cups & Containers": [
    "12oz Cups",
    "8oz Cups",
    "Clear Cups",
    "12oz Lids",
    "8oz Lids",
    "Clear Lids",
    "Açaí Bowl 12oz",
    "Açaí Bowl 8oz",
    "Açaí Lids",
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
  "Ice Cream & Açaí": [
    "Açaí Mix",
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

const stockCategories = Object.keys(stockItemsByCategory);

const socket = io(SERVER_URL);
const SESSION_STORAGE_KEY = "bloomlinkSession";
const ALERTS_STORAGE_KEY = "bloomlinkAlertsEnabled";
let relativeTimestampTimerId = null;
let stockMessageTimerId = null;

const state = {
  loggedInUser: null,
  currentUser: null,
  users: [],
  activeRequests: [],
  receivedAlerts: [],
  adminUsers: [],
  stockItems: [],
  stockDraftQuantities: {},
  stockHasUnsavedChanges: false,
  stockSavePending: false,
  stockPermissionUsers: [],
  stockPermissions: [],
  pendingDeliveryRequestId: null,
  activeTab: "operations",
  alertsEnabled: false,
  audioContext: null,
  highlightedAlertIds: new Set(),
  pushEnabled: false,
  pushState: "not_enabled",
  settings: {
    autoEndEnabled: false,
    autoEndTime: "21:00",
    lastAutoEndDate: null
  },
  serviceWorkerRegistration: null,
  lastSelectedStockCategory: "Cups & Containers"
};

const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  shiftScreen: document.querySelector("#shiftScreen"),
  appScreen: document.querySelector("#appScreen"),
  operationsTab: document.querySelector("#operationsTab"),
  stockTab: document.querySelector("#stockTab"),
  adminTab: document.querySelector("#adminTab"),
  operationsView: document.querySelector("#operationsView"),
  stockView: document.querySelector("#stockView"),
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
  requestCategory: document.querySelector("#requestCategory"),
  requestItem: document.querySelector("#requestItem"),
  loginError: document.querySelector("#loginError"),
  loggedUserName: document.querySelector("#loggedUserName"),
  currentUserInfo: document.querySelector("#currentUserInfo"),
  alertsStatus: document.querySelector("#alertsStatus"),
  enableAlertsButton: document.querySelector("#enableAlertsButton"),
  pushStatus: document.querySelector("#pushStatus"),
  enablePushButton: document.querySelector("#enablePushButton"),
  iphoneHelpButton: document.querySelector("#iphoneHelpButton"),
  iphoneHelpCard: document.querySelector("#iphoneHelpCard"),
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
  stockItemsList: document.querySelector("#stockItemsList"),
  stockUnsavedIndicator: document.querySelector("#stockUnsavedIndicator"),
  saveStockChangesButton: document.querySelector("#saveStockChangesButton"),
  stockHistoryPanel: document.querySelector("#stockHistoryPanel"),
  downloadStockLogsButton: document.querySelector("#downloadStockLogsButton"),
  stockLastUpdated: document.querySelector("#stockLastUpdated"),
  stockMessage: document.querySelector("#stockMessage"),
  stockPermissionPanel: document.querySelector("#stockPermissionPanel"),
  stockPermissionUser: document.querySelector("#stockPermissionUser"),
  stockPermissionDuration: document.querySelector("#stockPermissionDuration"),
  grantStockPermissionButton: document.querySelector("#grantStockPermissionButton"),
  stockPermissionMessage: document.querySelector("#stockPermissionMessage"),
  stockPermissionsList: document.querySelector("#stockPermissionsList"),
  containerStockDialog: document.querySelector("#containerStockDialog"),
  containerStockYesButton: document.querySelector("#containerStockYesButton"),
  containerStockNoButton: document.querySelector("#containerStockNoButton"),
  usersList: document.querySelector("#usersList"),
  teamCount: document.querySelector("#teamCount"),
  alertsList: document.querySelector("#alertsList"),
  requestsList: document.querySelector("#requestsList")
};

function fillSelect(select, values) {
  select.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function updateRequestItemsForCategory(category) {
  const items = stockItemsByCategory[category] || [];
  const previousItem = elements.requestItem.value;

  fillSelect(elements.requestItem, items);

  if (items.includes(previousItem)) {
    elements.requestItem.value = previousItem;
  }
}

function handleRequestCategoryChange() {
  state.lastSelectedStockCategory = elements.requestCategory.value;
  updateRequestItemsForCategory(state.lastSelectedStockCategory);
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

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatCompactAge(timestamp) {
  if (!timestamp) {
    return "";
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

  if (hoursAgo < 24) {
    return `${hoursAgo} hr ago`;
  }

  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
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

  if (screenName === "app") {
    startRelativeTimestampTimer();
  } else {
    stopRelativeTimestampTimer();
  }
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

function showStockMessage(message, type = "error", autoHide = false) {
  if (stockMessageTimerId) {
    clearTimeout(stockMessageTimerId);
    stockMessageTimerId = null;
  }

  elements.stockMessage.textContent = message;
  elements.stockMessage.classList.toggle("success-message", type === "success");
  elements.stockMessage.classList.toggle("error-message", type !== "success");
  elements.stockMessage.classList.remove("hidden");

  if (autoHide) {
    stockMessageTimerId = setTimeout(clearStockMessage, 3500);
  }
}

function clearStockMessage() {
  if (stockMessageTimerId) {
    clearTimeout(stockMessageTimerId);
    stockMessageTimerId = null;
  }

  elements.stockMessage.textContent = "";
  elements.stockMessage.classList.remove("success-message");
  elements.stockMessage.classList.add("error-message");
  elements.stockMessage.classList.add("hidden");
}

function resetSessionState() {
  state.loggedInUser = null;
  state.currentUser = null;
  state.users = [];
  state.activeRequests = [];
  state.receivedAlerts = [];
  state.adminUsers = [];
  state.stockItems = [];
  state.stockDraftQuantities = {};
  state.stockHasUnsavedChanges = false;
  state.stockSavePending = false;
  state.stockPermissionUsers = [];
  state.stockPermissions = [];
  state.pendingDeliveryRequestId = null;
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

function requestStockCountData() {
  if (!canUseStockCount()) {
    return;
  }

  socket.emit("stock_items:get");
}

function requestStockPermissionList() {
  if (!canManageStockRequests()) {
    return;
  }

  socket.emit("stock_permission:list");
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

function getTeamCountText(count) {
  return `${count} active team member${count === 1 ? "" : "s"}`;
}

function refreshRelativeTimestamps() {
  if (!state.currentUser || elements.appScreen.classList.contains("hidden")) {
    return;
  }

  renderAlerts();
  renderRequests();
}

function startRelativeTimestampTimer() {
  if (relativeTimestampTimerId) {
    return;
  }

  relativeTimestampTimerId = setInterval(refreshRelativeTimestamps, 30000);
}

function stopRelativeTimestampTimer() {
  if (!relativeTimestampTimerId) {
    return;
  }

  clearInterval(relativeTimestampTimerId);
  relativeTimestampTimerId = null;
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

function canUseStockCount() {
  return canManageStockRequests() || state.currentUser?.stockCountAccess?.allowed === true;
}

function canViewStockHistory() {
  return canManageStockRequests();
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
  const canUseStockTab = canUseStockCount();

  if (!canUseAdminTab && state.activeTab === "admin") {
    state.activeTab = "operations";
  }

  if (!canUseStockTab && state.activeTab === "stock") {
    state.activeTab = "operations";
  }

  elements.stockTab.classList.toggle("hidden", !canUseStockTab);
  elements.adminTab.classList.toggle("hidden", !canUseAdminTab);
  elements.operationsView.classList.toggle("hidden", state.activeTab !== "operations");
  elements.stockView.classList.toggle("hidden", state.activeTab !== "stock" || !canUseStockTab);
  elements.adminView.classList.toggle("hidden", state.activeTab !== "admin" || !canUseAdminTab);
  elements.operationsTab.classList.toggle("active", state.activeTab === "operations");
  elements.stockTab.classList.toggle("active", state.activeTab === "stock");
  elements.adminTab.classList.toggle("active", state.activeTab === "admin");
}

function switchTab(tabName) {
  if (tabName === "admin" && !isCurrentUserAdmin()) {
    return;
  }

  if (tabName === "stock" && !canUseStockCount()) {
    return;
  }

  state.activeTab = tabName;
  renderTabs();

  if (tabName === "stock") {
    requestStockCountData();
    requestStockPermissionList();
  }
}

function renderUsers() {
  elements.shiftControls.classList.toggle("hidden", !canControlShifts());
  elements.teamCount.textContent = getTeamCountText(state.users.length);

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

function getStockDraftQuantity(item) {
  return state.stockDraftQuantities[item.id] ?? item.currentQuantity;
}

function getChangedStockItems() {
  return state.stockItems
    .map((item) => ({
      id: item.id,
      currentQuantity: getStockDraftQuantity(item)
    }))
    .filter((change) => {
      const originalItem = state.stockItems.find((item) => item.id === change.id);
      return originalItem && originalItem.currentQuantity !== change.currentQuantity;
    });
}

function updateStockUnsavedState() {
  state.stockHasUnsavedChanges = getChangedStockItems().length > 0;
  elements.stockUnsavedIndicator.classList.toggle("hidden", !state.stockHasUnsavedChanges);
  elements.saveStockChangesButton.disabled = !state.stockHasUnsavedChanges || state.stockSavePending;
}

function setStockDraftQuantity(itemId, value, shouldRender = true) {
  const nextQuantity = Math.max(0, Math.floor(Number(value) || 0));
  state.stockDraftQuantities[itemId] = nextQuantity;
  updateStockUnsavedState();

  if (shouldRender) {
    renderStockItems();
  }
}

function renderStockItems() {
  updateStockUnsavedState();
  renderStockLastUpdated();

  if (!canUseStockCount()) {
    elements.stockItemsList.className = "list empty";
    elements.stockItemsList.textContent = "Stock count access is required.";
    return;
  }

  if (state.stockItems.length === 0) {
    elements.stockItemsList.className = "list empty";
    elements.stockItemsList.textContent = "Stock items not loaded yet.";
    return;
  }

  const itemsByCategory = new Map();

  for (const item of state.stockItems) {
    if (!itemsByCategory.has(item.category)) {
      itemsByCategory.set(item.category, []);
    }

    itemsByCategory.get(item.category).push(item);
  }

  elements.stockItemsList.className = "stock-category-list";
  elements.stockItemsList.innerHTML = stockCategories
    .filter((category) => itemsByCategory.has(category))
    .map((category) => {
      const items = itemsByCategory.get(category);

      return `
        <section class="stock-category">
          <h3>${category}</h3>
          <div class="stock-item-list">
            ${items
              .map((item) => {
                const draftQuantity = getStockDraftQuantity(item);

                return `
                  <article class="stock-item-row">
                    <span>${item.name}</span>
                    <div class="stock-quantity-control">
                      <button type="button" data-stock-action="decrement" data-stock-item-id="${item.id}" aria-label="Decrease ${item.name}">-</button>
                      <input type="number" min="0" step="1" inputmode="numeric" value="${draftQuantity}" data-stock-input-id="${item.id}" aria-label="${item.name} quantity">
                      <button type="button" data-stock-action="increment" data-stock-item-id="${item.id}" aria-label="Increase ${item.name}">+</button>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderStockLastUpdated() {
  const latestTimestamp = state.stockItems
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  elements.stockLastUpdated.textContent = latestTimestamp
    ? `Last updated: ${formatDateTime(latestTimestamp)}`
    : "Last updated: Not updated yet";
}

function showStockPermissionMessage(message) {
  elements.stockPermissionMessage.textContent = message;
  elements.stockPermissionMessage.classList.remove("hidden");
}

function clearStockPermissionMessage() {
  elements.stockPermissionMessage.textContent = "";
  elements.stockPermissionMessage.classList.add("hidden");
}

function renderStockPermissionPanel() {
  const canManagePermissions = canManageStockRequests();
  elements.stockPermissionPanel.classList.toggle("hidden", !canManagePermissions);

  if (!canManagePermissions) {
    return;
  }

  const currentSelectedUserId = elements.stockPermissionUser.value;
  elements.stockPermissionUser.innerHTML = state.stockPermissionUsers
    .map((user) => `<option value="${user.id}">${user.name}</option>`)
    .join("");

  if (currentSelectedUserId) {
    elements.stockPermissionUser.value = currentSelectedUserId;
  }

  elements.grantStockPermissionButton.disabled = state.stockPermissionUsers.length === 0;

  if (state.stockPermissions.length === 0) {
    elements.stockPermissionsList.className = "list empty";
    elements.stockPermissionsList.textContent = "No temporary stock permissions active.";
    return;
  }

  elements.stockPermissionsList.className = "list";
  elements.stockPermissionsList.innerHTML = state.stockPermissions
    .map(
      (permission) => `
        <article class="row-card stock-permission-card">
          <div class="request-header">
            <strong>${permission.userName}</strong>
            <span class="status-label online">Temporary access</span>
          </div>
          <span>Expires at ${formatTime(permission.expiresAt)}</span>
          <span>Granted by ${permission.grantedByName}</span>
          <button type="button" data-stock-permission-action="revoke" data-permission-id="${permission.id}">Revoke</button>
        </article>
      `
    )
    .join("");
}

function renderStockHistoryPanel() {
  elements.stockHistoryPanel.classList.toggle("hidden", !canViewStockHistory());
}

function renderStockTab() {
  renderStockItems();
  renderStockHistoryPanel();
  renderStockPermissionPanel();
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
          <span>Requested by ${request.requestedBy.name}</span>
          <span class="timestamp-text">Created ${formatCompactAge(request.createdAt)}</span>
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
      const assignedTimeText = request.assignedAt ? `Assigned ${formatCompactAge(request.assignedAt)}` : "";
      const deliveredAtText = request.deliveredAt ? ` at ${formatTime(request.deliveredAt)}` : "";
      let assignmentText = "Not assigned yet";

      if (request.status === "delivered") {
        assignmentText = request.assignedTo?.name
          ? `Delivered by ${request.assignedTo.name}${deliveredAtText}`
          : `Delivered${deliveredAtText}`;
      } else if (request.assignedTo) {
        assignmentText = `Assigned to ${request.assignedTo.name}`;
      }

      return `
        <article class="row-card request-card">
          <div class="request-header">
            <strong>${getRequestTitle(request)}</strong>
            <span class="status-label ${request.status}">${request.status}</span>
          </div>
          <span>Requested by ${request.requestedBy.name}</span>
          <span class="timestamp-text">Created ${formatCompactAge(request.createdAt)}</span>
          <span>${assignmentText}</span>
          ${request.status === "assigned" && assignedTimeText ? `<span class="timestamp-text">${assignedTimeText}</span>` : ""}
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
  renderStockTab();
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

function ensureContainerStockDialog() {
  if (elements.containerStockDialog) {
    return;
  }

  const dialog = document.createElement("div");
  dialog.id = "containerStockDialog";
  dialog.className = "dialog-backdrop hidden";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "containerStockTitle");
  dialog.innerHTML = `
    <div class="dialog-card">
      <h2 id="containerStockTitle">Container Stock</h2>
      <p>Have you taken this item from the container?</p>
      <div class="dialog-actions">
        <button id="containerStockNoButton" type="button" class="secondary-button">No</button>
        <button id="containerStockYesButton" type="button" class="primary-button">Yes</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  elements.containerStockDialog = dialog;
  elements.containerStockYesButton = dialog.querySelector("#containerStockYesButton");
  elements.containerStockNoButton = dialog.querySelector("#containerStockNoButton");
  elements.containerStockYesButton.addEventListener("click", () => confirmStockDelivery(true));
  elements.containerStockNoButton.addEventListener("click", () => confirmStockDelivery(false));
}

function openContainerStockDialog(requestId) {
  ensureContainerStockDialog();
  console.log("Delivered clicked, opening container confirmation", requestId);
  state.pendingDeliveryRequestId = requestId;
  elements.containerStockDialog.classList.remove("hidden");
  elements.containerStockYesButton.focus();
}

function closeContainerStockDialog() {
  state.pendingDeliveryRequestId = null;
  elements.containerStockDialog.classList.add("hidden");
}

function confirmStockDelivery(takenFromContainer) {
  if (!state.pendingDeliveryRequestId) {
    closeContainerStockDialog();
    return;
  }

  console.log("Container confirmation answer", state.pendingDeliveryRequestId, takenFromContainer);
  socket.emit("stock:delivered", {
    requestId: state.pendingDeliveryRequestId,
    takenFromContainer
  });
  closeContainerStockDialog();
}

function saveStockChanges() {
  const changes = getChangedStockItems();

  if (changes.length === 0) {
    return;
  }

  clearStockMessage();
  state.stockSavePending = true;
  updateStockUnsavedState();
  socket.emit("stock_items:update", {
    changes
  });
}

function downloadStockLogsXlsx() {
  if (!canViewStockHistory()) {
    return;
  }

  clearStockMessage();
  socket.emit("stock_logs:export_request");
}

function grantStockPermission() {
  if (!canManageStockRequests()) {
    return;
  }

  clearStockPermissionMessage();
  socket.emit("stock_permission:grant", {
    userId: elements.stockPermissionUser.value,
    durationHours: Number(elements.stockPermissionDuration.value)
  });
}

function handleStockPermissionClick(event) {
  const button = event.target.closest("[data-stock-permission-action]");

  if (!button || button.dataset.stockPermissionAction !== "revoke") {
    return;
  }

  socket.emit("stock_permission:revoke", {
    permissionId: button.dataset.permissionId
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

function toggleIphoneHelp() {
  elements.iphoneHelpCard.classList.toggle("hidden");
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
    openContainerStockDialog(deliverButton.dataset.deliverId);
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

function handleStockClick(event) {
  const button = event.target.closest("[data-stock-action]");

  if (!button) {
    return;
  }

  const itemId = button.dataset.stockItemId;
  const item = state.stockItems.find((stockItem) => stockItem.id === itemId);

  if (!item) {
    return;
  }

  const currentDraft = getStockDraftQuantity(item);
  const nextQuantity =
    button.dataset.stockAction === "increment"
      ? currentDraft + 1
      : currentDraft - 1;

  setStockDraftQuantity(itemId, nextQuantity);
}

function handleStockInput(event) {
  const input = event.target.closest("[data-stock-input-id]");

  if (!input) {
    return;
  }

  setStockDraftQuantity(input.dataset.stockInputId, input.value, false);
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
fillSelect(elements.requestCategory, stockCategories);
elements.currentLocation.value = "Shack (Front)";
elements.requestLocation.value = "Shack (Front)";
elements.requestCategory.value = state.lastSelectedStockCategory;
updateRequestItemsForCategory(state.lastSelectedStockCategory);
elements.requestItem.value = "12oz Cups";
state.alertsEnabled = localStorage.getItem(ALERTS_STORAGE_KEY) === "true";

socket.on("connect", () => {
  setConnectionStatus("Connection: Connected", true);
  restoreSavedSession();
  refreshPushStatus();
});

registerServiceWorker().catch(() => {});

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
  requestStockPermissionList();
  requestStockCountData();
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
  requestStockPermissionList();
  requestStockCountData();
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

socket.on("stock_items:update", (items) => {
  const wasSaving = state.stockSavePending;
  state.stockItems = items;
  state.stockDraftQuantities = Object.fromEntries(
    items.map((item) => [item.id, item.currentQuantity])
  );
  state.stockHasUnsavedChanges = false;
  state.stockSavePending = false;

  if (wasSaving) {
    showStockMessage("Stock changes saved.", "success", true);
  } else {
    clearStockMessage();
  }

  renderStockTab();
});

socket.on("stock_items:error", (data) => {
  const message = state.stockSavePending
    ? "Could not save stock changes."
    : data.message || "Stock count action failed.";

  state.stockSavePending = false;
  updateStockUnsavedState();
  showStockMessage(message);
});

socket.on("stock_logs:export_ready", async (data) => {
  try {
    const response = await fetch(data.url);

    if (!response.ok) {
      throw new Error("XLSX export failed.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = data.fileName || "stock-count-log.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    showStockMessage("Could not download stock history.");
  }
});

socket.on("stock_permission:list", (data) => {
  state.stockPermissionUsers = data.users || [];
  state.stockPermissions = data.permissions || [];
  clearStockPermissionMessage();
  renderStockPermissionPanel();
});

socket.on("stock_permission:error", (data) => {
  showStockPermissionMessage(data.message || "Stock permission action failed.");
});

socket.on("user:stock_access_update", (user) => {
  state.currentUser = user;

  if (!canUseStockCount() && state.activeTab === "stock") {
    state.activeTab = "operations";
  }

  if (canUseStockCount()) {
    requestStockCountData();
  }

  requestStockPermissionList();
  renderAll();
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
elements.iphoneHelpButton.addEventListener("click", toggleIphoneHelp);
elements.requestCategory.addEventListener("change", handleRequestCategoryChange);
elements.saveStockChangesButton.addEventListener("click", saveStockChanges);
elements.downloadStockLogsButton.addEventListener("click", downloadStockLogsXlsx);
elements.grantStockPermissionButton.addEventListener("click", grantStockPermission);
if (elements.containerStockYesButton && elements.containerStockNoButton) {
  elements.containerStockYesButton.addEventListener("click", () => confirmStockDelivery(true));
  elements.containerStockNoButton.addEventListener("click", () => confirmStockDelivery(false));
}
elements.stockItemsList.addEventListener("click", handleStockClick);
elements.stockItemsList.addEventListener("input", handleStockInput);
elements.stockPermissionsList.addEventListener("click", handleStockPermissionClick);
elements.alertsList.addEventListener("click", handleListClick);
elements.requestsList.addEventListener("click", handleListClick);
elements.usersList.addEventListener("click", handleListClick);
elements.adminCreateUserButton.addEventListener("click", createAdminUser);
elements.adminUsersList.addEventListener("click", handleAdminClick);
elements.operationsTab.addEventListener("click", () => switchTab("operations"));
elements.stockTab.addEventListener("click", () => switchTab("stock"));
elements.adminTab.addEventListener("click", () => switchTab("admin"));
