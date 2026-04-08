const STORAGE_KEY = "felicita-pwa.v1";
const SPHERES = [
  {
    key: "relational",
    label: "Relazionale",
    description: "Amici, partner, famiglia, legami e vicinanza.",
  },
  {
    key: "expressive",
    label: "Espressivo-creativa",
    description: "Arte, sport, musica, corpo, mente, work off.",
  },
  {
    key: "reflective",
    label: "Riflessiva",
    description: "Come ti senti con te stesso, energia, salute, immagine.",
  },
  {
    key: "virtuous",
    label: "Virtuosa",
    description: "Doveri, lavoro, studio, morale, disciplina.",
  },
];

const DEFAULT_WINDOWS = {
  recentDays: 2,
  mediumDays: 45,
  longDays: 548,
};

const APP_CONFIG = readAppConfig();

const runtime = {
  selectedDate: todayIso(),
  drafts: {},
  showProfileBuilder: false,
  cloud: {
    enabled: false,
    ready: false,
    loading: false,
    syncing: false,
    initialized: false,
    client: null,
    user: null,
    session: null,
    status: "Modalita locale attiva.",
    statusTone: "warning",
    serviceWorkerRegistration: null,
    authEmail: "",
    lastSyncAt: "",
  },
};

let state = loadState();

bootstrap();

async function bootstrap() {
  runtime.cloud.serviceWorkerRegistration = await registerServiceWorker();
  await initCloud();
  render();
  bindGlobalEvents();
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        runtime.selectedDate = todayIso();
        const profiles = parsed.profiles.map(hydrateProfile);
        profiles.forEach(recomputeProfileEntries);
        return {
          activeProfileId: parsed.activeProfileId,
          profiles,
        };
      }
    }
  } catch (error) {
    console.warn("Impossibile leggere lo stato salvato.", error);
  }
  return buildSeedState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildSeedState() {
  const profile = hydrateProfile({
    id: crypto.randomUUID(),
    name: "Aldo",
    etaWeights: {
      relational: 35,
      expressive: 25,
      reflective: 15,
      virtuous: 25,
    },
    iotaWeights: {
      today: 60,
      recent: 25,
      medium: 10,
      long: 5,
    },
    windows: { ...DEFAULT_WINDOWS },
    baselines: {
      recent: 9,
      medium: 6.5,
      long: 8,
    },
    reminder: {
      time: "23:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome",
    },
    entries: [],
    createdAt: new Date().toISOString(),
  });

  const seedEntry = {
    id: crypto.randomUUID(),
    date: todayIso(),
    spheres: {
      relational: 9,
      expressive: 7,
      reflective: 7.5,
      virtuous: 8.5,
    },
    notes: "Seed iniziale basato sui valori del brief.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const computed = computeForDraft(profile, seedEntry);
  profile.entries.push({
    ...seedEntry,
    eta: round2(computed.eta),
    iota: round2(computed.iota),
    savedAt: new Date().toISOString(),
  });

  return {
    activeProfileId: profile.id,
    profiles: [profile],
  };
}

function hydrateProfile(rawProfile = {}) {
  const recentDays = clampInt(Number(rawProfile.windows?.recentDays) || 2, 1, 30);
  const mediumDays = clampInt(
    Number(rawProfile.windows?.mediumDays) || 45,
    recentDays + 1,
    180
  );
  const longDays = clampInt(
    Number(rawProfile.windows?.longDays) || 548,
    mediumDays + 1,
    730
  );

  return {
    id: rawProfile.id || crypto.randomUUID(),
    name: rawProfile.name || rawProfile.displayName || "Profilo",
    etaWeights: normalizeWeights({
      relational: rawProfile.etaWeights?.relational ?? 35,
      expressive: rawProfile.etaWeights?.expressive ?? 25,
      reflective: rawProfile.etaWeights?.reflective ?? 15,
      virtuous: rawProfile.etaWeights?.virtuous ?? 25,
    }),
    iotaWeights: normalizeWeights({
      today: rawProfile.iotaWeights?.today ?? 60,
      recent: rawProfile.iotaWeights?.recent ?? 25,
      medium: rawProfile.iotaWeights?.medium ?? 10,
      long: rawProfile.iotaWeights?.long ?? 5,
    }),
    windows: {
      recentDays,
      mediumDays,
      longDays,
    },
    baselines: {
      recent: clamp(Number(rawProfile.baselines?.recent) || 9, 0, 10),
      medium: clamp(Number(rawProfile.baselines?.medium) || 6.5, 0, 10),
      long: clamp(Number(rawProfile.baselines?.long) || 8, 0, 10),
    },
    reminder: {
      time: rawProfile.reminder?.time || "23:00",
      timezone:
        rawProfile.reminder?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "Europe/Rome",
    },
    entries: Array.isArray(rawProfile.entries)
      ? rawProfile.entries.map(hydrateEntry)
      : [],
    createdAt: rawProfile.createdAt || new Date().toISOString(),
    updatedAt: rawProfile.updatedAt || rawProfile.updated_at || rawProfile.createdAt || new Date().toISOString(),
  };
}

function hydrateEntry(rawEntry = {}) {
  return {
    id: rawEntry.id || crypto.randomUUID(),
    date: rawEntry.date || todayIso(),
    spheres: {
      relational: clamp(Number(rawEntry.spheres?.relational) || 0, 0, 10),
      expressive: clamp(Number(rawEntry.spheres?.expressive) || 0, 0, 10),
      reflective: clamp(Number(rawEntry.spheres?.reflective) || 0, 0, 10),
      virtuous: clamp(Number(rawEntry.spheres?.virtuous) || 0, 0, 10),
    },
    notes: rawEntry.notes || "",
    eta: round2(rawEntry.eta),
    iota: round2(rawEntry.iota),
    savedAt: rawEntry.savedAt || new Date().toISOString(),
    createdAt: rawEntry.createdAt || rawEntry.created_at || rawEntry.savedAt || new Date().toISOString(),
    updatedAt:
      rawEntry.updatedAt ||
      rawEntry.updated_at ||
      rawEntry.savedAt ||
      rawEntry.createdAt ||
      new Date().toISOString(),
  };
}

function bindGlobalEvents() {
  document
    .getElementById("auth-form")
    .addEventListener("submit", handleEmailSignIn);

  document
    .getElementById("sync-cloud")
    .addEventListener("click", () => {
      void syncProfilesToCloud({ pullAfterPush: true });
    });

  document
    .getElementById("pull-cloud")
    .addEventListener("click", () => {
      void pullProfilesFromCloud();
    });

  document
    .getElementById("logout-button")
    .addEventListener("click", handleLogout);

  document
    .getElementById("toggle-profile-builder")
    .addEventListener("click", () => {
      runtime.showProfileBuilder = !runtime.showProfileBuilder;
      renderProfileBuilder();
    });

  document
    .getElementById("cancel-profile-builder")
    .addEventListener("click", () => {
      runtime.showProfileBuilder = false;
      renderProfileBuilder();
    });

  document
    .getElementById("profile-builder")
    .addEventListener("submit", handleProfileCreate);

  document
    .getElementById("entry-form")
    .addEventListener("submit", handleEntrySave);

  document
    .getElementById("entry-date")
    .addEventListener("change", handleDateChange);

  document
    .getElementById("entry-notes")
    .addEventListener("input", (event) => {
      const draft = ensureDraft(getActiveProfile());
      draft.notes = event.target.value;
      renderComputedSection();
    });

  document
    .getElementById("settings-form")
    .addEventListener("submit", handleSettingsSave);

  document
    .getElementById("request-notifications")
    .addEventListener("click", requestNotificationPermission);

  document
    .getElementById("export-profile")
    .addEventListener("click", exportCurrentProfile);

  document
    .getElementById("import-profile")
    .addEventListener("change", importProfileFromFile);
}

function render() {
  renderCloudPanel();
  renderProfileList();
  renderProfileBuilder();
  renderEntryForm();
  renderSettings();
  renderHistory();
  renderNotificationStatus();
}

function renderCloudPanel() {
  const configCopy = document.getElementById("cloud-config-copy");
  const authSummary = document.getElementById("auth-summary");
  const cloudStatus = document.getElementById("cloud-status");
  const authEmail = document.getElementById("auth-email");
  const authSubmit = document.getElementById("auth-submit");
  const syncButton = document.getElementById("sync-cloud");
  const pullButton = document.getElementById("pull-cloud");
  const logoutButton = document.getElementById("logout-button");

  authEmail.value = runtime.cloud.authEmail;

  if (!APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
    configCopy.textContent =
      "Configura config.js con URL e anon key Supabase per attivare login, sync e reminder push.";
    authSummary.textContent = "Modalita locale attiva. Nessun account collegato.";
    authSubmit.disabled = true;
    syncButton.disabled = true;
    pullButton.disabled = true;
    logoutButton.disabled = true;
    cloudStatus.textContent =
      "Supabase non configurato: l'app continua a funzionare offline sul dispositivo.";
    cloudStatus.className = "cloud-status warning";
    return;
  }

  if (!runtime.cloud.ready) {
    configCopy.textContent = runtime.cloud.loading
      ? "Connessione Supabase in inizializzazione."
      : "Supabase configurato ma non raggiungibile o non valido.";
    authSummary.textContent = runtime.cloud.loading
      ? "Sto preparando login e sincronizzazione cloud."
      : "Controlla URL, anon key, redirect URL e CORS del progetto.";
    authSubmit.disabled = true;
    syncButton.disabled = true;
    pullButton.disabled = true;
    logoutButton.disabled = true;
    cloudStatus.textContent = runtime.cloud.status || "Connessione cloud in corso...";
    cloudStatus.className = `cloud-status ${runtime.cloud.statusTone}`.trim();
    return;
  }

  configCopy.textContent =
    "Magic link via email per accedere. Dopo il login puoi sincronizzare profili, giornate e subscription push.";
  authSubmit.disabled = false;
  syncButton.disabled = !runtime.cloud.user || runtime.cloud.syncing;
  pullButton.disabled = !runtime.cloud.user || runtime.cloud.syncing;
  logoutButton.disabled = !runtime.cloud.user;

  if (runtime.cloud.user) {
    authSummary.textContent = `Connesso come ${runtime.cloud.user.email}.`;
  } else {
    authSummary.textContent = "Inserisci la tua email per ricevere un magic link.";
  }

  cloudStatus.textContent = runtime.cloud.status || "";
  cloudStatus.className = `cloud-status ${runtime.cloud.statusTone}`.trim();
}

function renderProfileList() {
  const list = document.getElementById("profile-list");
  list.innerHTML = "";

  state.profiles.forEach((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "profile-chip" + (profile.id === state.activeProfileId ? " active" : "");
    button.innerHTML = `
      <strong>${escapeHtml(profile.name)}</strong>
      <span>ETA ${formatWeights(profile.etaWeights)}</span>
      <span>Reminder ${escapeHtml(profile.r