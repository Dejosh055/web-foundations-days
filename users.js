const USERS_URL = "https://jsonplaceholder.typicode.com/users";

const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusMessage = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

// Every user loaded from the API. The filter works on this array, so
// typing never triggers a new request.
let allUsers = [];

function setStatus(message) {
  statusMessage.textContent = message;
}

// Draws any array of users. Text from the API only goes in through textContent.
function renderUsers(list) {
  usersList.textContent = "";

  if (list.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    usersList.append(empty);
    return;
  }

  list.forEach(function (user) {
    const item = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = "Email: " + user.email;

    const city = document.createElement("div");
    city.textContent = "City: " + user.address.city;

    const company = document.createElement("div");
    company.textContent = "Company: " + user.company.name;

    item.append(name, email, city, company);
    usersList.append(item);
  });
}

async function loadUsers() {
  loadButton.disabled = true;
  setStatus("Loading users...");

  try {
    const response = await fetch(USERS_URL);

    // fetch only rejects on network failure; 404 or 500 still "succeed",
    // so the status code has to be checked by hand.
    if (!response.ok) {
      throw new Error("Server responded with status " + response.status);
    }

    allUsers = await response.json();
    renderUsers(allUsers);
    applyFilter();
    setStatus("Loaded " + allUsers.length + " users.");
  } catch (error) {
    setStatus("Could not load users: " + error.message);
  } finally {
    loadButton.disabled = false;
  }
}

// Shows only the stored users whose name includes the typed text
// (ignoring case). Does nothing until users have been loaded.
function applyFilter() {
  if (allUsers.length === 0) {
    return;
  }

  const term = filterInput.value.trim().toLowerCase();
  const matches = allUsers.filter(function (user) {
    return user.name.toLowerCase().includes(term);
  });

  renderUsers(matches);
}

loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", applyFilter);
