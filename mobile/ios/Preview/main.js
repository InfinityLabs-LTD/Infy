const modeButtons = document.querySelectorAll("[data-mode]");
const forms = {
  signin: document.querySelector("#signin"),
  register: document.querySelector("#register"),
  recover: document.querySelector("#recover"),
  authed: document.querySelector("#authed")
};

function show(mode) {
  for (const panel of Object.values(forms)) panel.classList.remove("visible");
  forms[mode].classList.add("visible");
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
}

function setMessage(id, text, isError = false) {
  const node = document.querySelector(id);
  node.textContent = text;
  node.classList.toggle("error", isError);
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => show(button.dataset.mode));
});

forms.signin.addEventListener("submit", (event) => {
  event.preventDefault();
  setMessage("#signin-message", "Token pair saved to secure storage. Opening authenticated shell...");
  setTimeout(() => show("authed"), 450);
});

forms.register.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = forms.register.querySelector("input").value.trim();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    setMessage("#register-message", "Username must be 3-32 lowercase letters, numbers or underscores.", true);
    return;
  }
  setMessage("#register-message", "Registration request accepted. Session created.");
  setTimeout(() => show("authed"), 450);
});

forms.recover.addEventListener("submit", (event) => {
  event.preventDefault();
  setMessage("#recover-message", "If the email is verified, Infy will send a reset link.");
});

document.querySelector("#logout").addEventListener("click", () => {
  setMessage("#signin-message", "");
  show("signin");
});

