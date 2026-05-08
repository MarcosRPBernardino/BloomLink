const SERVER_URL = window.SERVER_URL || window.location.origin;

const locations = [
  "Kitchen",
  "Washing Area",
  "Front of House",
  "Container (Courtyard)",
  "Shack (Front)",
  "Floor (upstairs)"
];

const roles = ["Manager", "Chef", "Staff", "KP", "Stock Runner"];

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
  currentUser: null,
  users: [],
  activeRequests: [],
  receivedAlerts: []
};

const elements = {
  connectionStatus: document.querySelector("#connectionStatus"),
  connectForm: document.querySelector("#connectForm"),
  stockForm: document.querySelector("#stockForm"),
  userName: document.querySelector("#userName"),
  currentRole: document.querySelector("#currentRole"),
  currentLocation: document.querySelector("#currentLocation"),
  userStatus: document.querySelector("#userStatus"),
  requestLocation: document.querySelector("#requestLocation"),
  requestItem: document.querySelector("#requestItem"),
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

function getRequestTitle(request) {
  return `${request.location} needs ${request.item}`;
}

function canCurrentUserRenderStockAlerts() {
  return state.currentUser?.currentRole !== "Staff";
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
        <article class="row-card alert-card">
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
  renderUsers();
  renderAlerts();
  renderRequests();
}

function connectUser(event) {
  event.preventDefault();

  const user = {
    id: socket.id,
    name: elements.userName.value,
    currentRole: elements.currentRole.value,
    currentLocation: elements.currentLocation.value,
    currentChannel: "All",
    status: elements.userStatus.value,
    online: true
  };

  state.currentUser = user;
  socket.emit("user:connect", user);
  renderAll();
}

function createStockRequest(event) {
  event.preventDefault();

  if (!state.currentUser) {
    alert("Connect as a user before creating a stock request.");
    return;
  }

  socket.emit("stock:create", {
    location: elements.requestLocation.value,
    item: elements.requestItem.value
  });
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

fillSelect(elements.currentRole, roles);
fillSelect(elements.currentLocation, locations);
fillSelect(elements.requestLocation, locations);
fillSelect(elements.requestItem, stockItems);
elements.currentRole.value = "Staff";
elements.currentLocation.value = "Shack (Front)";
elements.requestLocation.value = "Shack (Front)";
elements.requestItem.value = "12oz Cups";

socket.on("connect", () => {
  setConnectionStatus("Socket connected", true);
});

socket.on("disconnect", () => {
  setConnectionStatus("Socket disconnected", false);
});

socket.on("users:update", (users) => {
  state.users = users;
  renderUsers();
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

elements.connectForm.addEventListener("submit", connectUser);
elements.stockForm.addEventListener("submit", createStockRequest);
elements.alertsList.addEventListener("click", handleListClick);
elements.requestsList.addEventListener("click", handleListClick);
