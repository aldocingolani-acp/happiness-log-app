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

const DAILY_SCORE_SYMBOL = "\u03B9";
const OVERALL_SCORE_SYMBOL = "\u03C6";

const APP_CONFIG = readAppConfig();

const runtime = {
  selectedDate: todayIso(),
  activeTab: "input",
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
  return buildEmptyState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildEmptyState() {
  return {
    activeProfileId: null,
    profiles: [],
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

function _legacy_bindGlobalEvents() {
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
      const profile = getActiveProfile();
      if (!profile) {
        return;
      }
      const draft = ensureDraft(profile);
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

function _legacy_render() {
  renderCloudPanel();
  renderProfileList();
  renderProfileBuilder();
  renderEntryForm();
  renderComputedSection();
  renderSettings();
  renderCharts();
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
  authEmail.disabled = false;

  if (!APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
    configCopy.textContent =
      "Configura config.js con URL e anon key Supabase per attivare login, sync e reminder push.";
    authSummary.textContent = "Modalita locale attiva. Nessun account collegato.";
    authSubmit.disabled = true;
    authEmail.disabled = true;
    syncButton.disabled = true;
    pullButton.disabled = true;
    logoutButton.disabled = true;
    cloudStatus.textContent =
      "Cloud disattivato. L'app continua a funzionare in locale.";
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
    authEmail.disabled = true;
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

function _legacy_renderProfileList() {
  const list = document.getElementById("profile-list");
  list.innerHTML = "";

  if (state.profiles.length === 0) {
    list.innerHTML = '<p class="empty-copy">Nessun profilo presente su questo dispositivo.</p>';
    return;
  }

  state.profiles.forEach((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "profile-chip" + (profile.id === state.activeProfileId ? " active" : "");
    button.innerHTML = `
      <strong>${escapeHtml(profile.name)}</strong>
      <span>Pesi ${formatWeights(profile.etaWeights)}</span>
      <span>Reminder ${escapeHtml(profile.reminder?.time || "23:00")}</span>
    `;
    button.addEventListener("click", () => {
      state.activeProfileId = profile.id;
      runtime.selectedDate = todayIso();
      render();
      void maybeRegisterPushSubscription();
    });
    list.appendChild(button);
  });
}

function _legacy_renderProfileBuilder() {
  const builder = document.getElementById("profile-builder");
  const toggleButton = document.getElementById("toggle-profile-builder");
  const shouldShow = runtime.showProfileBuilder || state.profiles.length === 0;
  builder.classList.toggle("hidden", !shouldShow);
  toggleButton.textContent = state.profiles.length === 0 ? "Crea primo profilo" : "Nuovo profilo";
}

function _legacy_renderEntryForm() {
  const profile = getActiveProfile();
  const dateInput = document.getElementById("entry-date");
  const fields = document.getElementById("entry-fields");
  const notes = document.getElementById("entry-notes");
  const saveButton = document.querySelector('#entry-form button[type="submit"]');
  const notificationButton = document.getElementById("request-notifications");
  dateInput.value = runtime.selectedDate;

  fields.innerHTML = "";

  if (!profile) {
    dateInput.disabled = true;
    notes.value = "";
    notes.disabled = true;
    saveButton.disabled = true;
    notificationButton.disabled = true;
    fields.innerHTML =
      '<p class="empty-copy">Accedi oppure crea un profilo per inserire i voti del giorno.</p>';
    return;
  }

  dateInput.disabled = false;
  notes.disabled = false;
  saveButton.disabled = false;
  notificationButton.disabled = false;

  const draft = ensureDraft(profile);

  SPHERES.forEach((sphere) => {
    const wrapper = document.createElement("div");
    wrapper.className = "slider-card";
    wrapper.innerHTML = `
      <div class="slider-row">
        <div>
          <strong>${sphere.label}</strong>
          <div class="section-kicker">${sphere.description}</div>
        </div>
        <div class="slider-meta">
          <span class="weight-pill">${formatPercent(profile.etaWeights[sphere.key])}</span>
          <span class="value-pill" id="value-${sphere.key}">${formatScore(
            draft.spheres[sphere.key]
          )}</span>
        </div>
      </div>
      <input
        id="slider-${sphere.key}"
        type="range"
        min="0"
        max="10"
        step="0.5"
        value="${draft.spheres[sphere.key]}"
      />
    `;
    fields.appendChild(wrapper);

    wrapper
      .querySelector(`#slider-${sphere.key}`)
      .addEventListener("input", (event) => {
        const nextValue = clamp(Number(event.target.value), 0, 10);
        draft.spheres[sphere.key] = nextValue;
        wrapper.querySelector(`#value-${sphere.key}`).textContent =
          formatScore(nextValue);
        renderComputedSection();
      });
  });

  notes.value = draft.notes || "";
}

function _legacy_renderComputedSection() {
  const profile = getActiveProfile();
  const draft = ensureDraft(profile);
  const computed = computeForDraft(profile, draft);

  document.getElementById("eta-value").textContent = formatScore(computed.eta);
  document.getElementById("iota-value").textContent = formatScore(computed.iota);
  document.getElementById("eta-caption").textContent =
    "Media pesata delle 4 sfere.";
  document.getElementById("iota-caption").textContent =
    "Valore complessivo con memoria breve, media e lunga.";

  document.getElementById("seed-summary").textContent = `ETA ${formatScore(
    computed.eta
  )} · IOTA ${formatScore(computed.iota)}`;

  const breakdown = document.getElementById("iota-breakdown");
  breakdown.innerHTML = "";

  const cards = [
    {
      label: "Oggi",
      avg: computed.components.todayEta,
      weight: profile.iotaWeights.today,
    },
    {
      label: `1-${profile.windows.recentDays} giorni`,
      avg: computed.components.recentAvg,
      weight: profile.iotaWeights.recent,
    },
    {
      label: `${profile.windows.recentDays + 1}-${profile.windows.mediumDays} giorni`,
      avg: computed.components.mediumAvg,
      weight: profile.iotaWeights.medium,
    },
    {
      label: `${profile.windows.mediumDays + 1}-${profile.windows.longDays} giorni`,
      avg: computed.components.longAvg,
      weight: profile.iotaWeights.long,
    },
  ];

  cards.forEach((item) => {
    const card = document.createElement("article");
    card.className = "breakdown-card";
    card.innerHTML = `
      <span>${item.label}</span>
      <strong>${formatScore(item.avg)}</strong>
      <span>Peso ${formatPercent(item.weight)}</span>
    `;
    breakdown.appendChild(card);
  });
}

function _legacy_renderSettings() {
  const profile = getActiveProfile();
  const form = document.getElementById("settings-form");

  form.elements.eta_relational.value = profile.etaWeights.relational;
  form.elements.eta_expressive.value = profile.etaWeights.expressive;
  form.elements.eta_reflective.value = profile.etaWeights.reflective;
  form.elements.eta_virtuous.value = profile.etaWeights.virtuous;

  form.elements.iota_today.value = profile.iotaWeights.today;
  form.elements.iota_recent.value = profile.iotaWeights.recent;
  form.elements.iota_medium.value = profile.iotaWeights.medium;
  form.elements.iota_long.value = profile.iotaWeights.long;

  form.elements.recentDays.value = profile.windows.recentDays;
  form.elements.mediumDays.value = profile.windows.mediumDays;
  form.elements.longDays.value = profile.windows.longDays;

  form.elements.baseline_recent.value = profile.baselines.recent;
  form.elements.baseline_medium.value = profile.baselines.medium;
  form.elements.baseline_long.value = profile.baselines.long;
  form.elements.reminder_time.value = profile.reminder?.time || "23:00";
  form.elements.reminder_timezone.value =
    profile.reminder?.timezone || "Europe/Rome";
}

function _legacy_renderHistory() {
  const profile = getActiveProfile();
  const mount = document.getElementById("history-table");
  const sorted = [...profile.entries].sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    mount.innerHTML = `<p class="history-empty">Ancora nessuna giornata salvata.</p>`;
    return;
  }

  const rows = sorted
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.date)}</td>
          <td>${formatScore(entry.spheres.relational)}</td>
          <td>${formatScore(entry.spheres.expressive)}</td>
          <td>${formatScore(entry.spheres.reflective)}</td>
          <td>${formatScore(entry.spheres.virtuous)}</td>
          <td>${formatScore(entry.eta)}</td>
          <td>${formatScore(entry.iota)}</td>
        </tr>
      `
    )
    .join("");

  mount.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Rel.</th>
          <th>Esp.</th>
          <th>Rifl.</th>
          <th>Virt.</th>
          <th>ETA</th>
          <th>IOTA</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderNotificationStatus() {
  const pill = document.getElementById("notification-status");
  if (!("Notification" in window)) {
    pill.textContent = "Browser senza supporto";
    return;
  }

  if (Notification.permission === "granted") {
    pill.textContent = "Permesso concesso";
    return;
  }

  if (Notification.permission === "denied") {
    pill.textContent = "Permesso negato";
    return;
  }

  pill.textContent = "Permesso non richiesto";
}

function handleProfileCreate(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("profileName") || "").trim();
  if (!name) {
    return;
  }

  const etaWeights = normalizeWeights({
    relational: Number(form.get("relationalImportance")) || 0,
    expressive: Number(form.get("expressiveImportance")) || 0,
    reflective: Number(form.get("reflectiveImportance")) || 0,
    virtuous: Number(form.get("virtuousImportance")) || 0,
  });

  const profile = hydrateProfile({
    id: crypto.randomUUID(),
    name,
    etaWeights,
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
      time: String(form.get("reminderTime") || "23:00"),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome",
    },
    entries: [],
    createdAt: new Date().toISOString(),
  });

  state.profiles.push(profile);
  state.activeProfileId = profile.id;
  runtime.showProfileBuilder = false;
  event.currentTarget.reset();
  saveState();
  render();
  void syncProfilesToCloud({ pullAfterPush: false });
}

function _legacy_handleDateChange(event) {
  runtime.selectedDate = event.target.value || todayIso();
  renderEntryForm();
  renderHistory();
}

function _legacy_handleEntrySave(event) {
  event.preventDefault();
  const profile = getActiveProfile();
  const draft = ensureDraft(profile);
  const computed = computeForDraft(profile, draft);
  const existingEntry = profile.entries.find((item) => item.date === draft.date);
  const nowIso = new Date().toISOString();
  const entry = {
    id: existingEntry?.id || crypto.randomUUID(),
    date: draft.date,
    spheres: { ...draft.spheres },
    notes: draft.notes || "",
    eta: round2(computed.eta),
    iota: round2(computed.iota),
    savedAt: nowIso,
    createdAt: existingEntry?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const index = profile.entries.findIndex((item) => item.date === entry.date);
  if (index >= 0) {
    profile.entries[index] = entry;
  } else {
    profile.entries.push(entry);
  }

  recomputeProfileEntries(profile);
  profile.updatedAt = nowIso;
  saveState();
  renderHistory();
  renderComputedSection();
  void syncProfilesToCloud({ pullAfterPush: false });
}

function _legacy_handleSettingsSave(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const profile = getActiveProfile();

  profile.etaWeights = normalizeWeights({
    relational: Number(form.elements.eta_relational.value) || 0,
    expressive: Number(form.elements.eta_expressive.value) || 0,
    reflective: Number(form.elements.eta_reflective.value) || 0,
    virtuous: Number(form.elements.eta_virtuous.value) || 0,
  });

  profile.iotaWeights = normalizeWeights({
    today: Number(form.elements.iota_today.value) || 0,
    recent: Number(form.elements.iota_recent.value) || 0,
    medium: Number(form.elements.iota_medium.value) || 0,
    long: Number(form.elements.iota_long.value) || 0,
  });

  const recentDays = clampInt(Number(form.elements.recentDays.value) || 2, 1, 30);
  const mediumDays = clampInt(
    Number(form.elements.mediumDays.value) || 45,
    recentDays + 1,
    180
  );
  const longDays = clampInt(
    Number(form.elements.longDays.value) || 548,
    mediumDays + 1,
    730
  );

  profile.windows = {
    recentDays,
    mediumDays,
    longDays,
  };

  profile.baselines = {
    recent: clamp(Number(form.elements.baseline_recent.value) || 0, 0, 10),
    medium: clamp(Number(form.elements.baseline_medium.value) || 0, 0, 10),
    long: clamp(Number(form.elements.baseline_long.value) || 0, 0, 10),
  };

  profile.reminder = {
    time: String(form.elements.reminder_time.value || "23:00"),
    timezone: String(form.elements.reminder_timezone.value || "Europe/Rome").trim() || "Europe/Rome",
  };

  profile.updatedAt = new Date().toISOString();
  recomputeProfileEntries(profile);
  saveState();
  render();
  void syncProfilesToCloud({ pullAfterPush: false });
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    renderNotificationStatus();
    return;
  }

  try {
    await Notification.requestPermission();
  } catch (error) {
    console.warn("Permesso notifiche non disponibile.", error);
  }

  if (Notification.permission === "granted") {
    void maybeRegisterPushSubscription();
  }

  renderNotificationStatus();
}

function _legacy_exportCurrentProfile() {
  const profile = getActiveProfile();
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    profile,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(profile.name)}-felicita-profile.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importProfileFromFile(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = parsed.profile;
    if (!incoming || !incoming.name || !incoming.etaWeights) {
      throw new Error("Formato profilo non valido.");
    }

    const profile = hydrateProfile({
      ...incoming,
      id: crypto.randomUUID(),
    });
    recomputeProfileEntries(profile);
    state.profiles.push(profile);
    state.activeProfileId = profile.id;
    saveState();
    render();
    void syncProfilesToCloud({ pullAfterPush: false });
  } catch (error) {
    alert("Impossibile importare il profilo.");
    console.warn(error);
  } finally {
    event.target.value = "";
  }
}

async function initCloud() {
  if (!APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
    runtime.cloud.enabled = false;
    runtime.cloud.ready = false;
    runtime.cloud.initialized = true;
    return;
  }

  runtime.cloud.enabled = true;
  runtime.cloud.loading = true;
  setCloudStatus("Connessione Supabase in corso...", "warning", false);

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const client = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    runtime.cloud.client = client;
    runtime.cloud.ready = true;
    runtime.cloud.initialized = true;
    runtime.cloud.loading = false;

    const {
      data: { session },
      error,
    } = await client.auth.getSession();

    if (error) {
      throw error;
    }

    runtime.cloud.session = session;
    runtime.cloud.user = session?.user ?? null;
    runtime.cloud.authEmail = session?.user?.email || runtime.cloud.authEmail;

    client.auth.onAuthStateChange((_event, nextSession) => {
      runtime.cloud.session = nextSession;
      runtime.cloud.user = nextSession?.user ?? null;
      runtime.cloud.authEmail = nextSession?.user?.email || runtime.cloud.authEmail;

      if (runtime.cloud.user) {
        setCloudStatus(`Connesso come ${runtime.cloud.user.email}.`, "", true);
        void syncProfilesToCloud({ pullAfterPush: true });
      } else {
        setCloudStatus("Sessione cloud scollegata.", "warning", true);
        render();
      }
    });

    if (runtime.cloud.user) {
      setCloudStatus(`Connesso come ${runtime.cloud.user.email}.`, "", false);
      await syncProfilesToCloud({ pullAfterPush: true });
    } else {
      setCloudStatus("Supabase pronto. Accedi con il magic link per sincronizzare.", "warning", false);
    }
  } catch (error) {
    runtime.cloud.loading = false;
    runtime.cloud.ready = false;
    runtime.cloud.client = null;
    console.warn("Errore inizializzazione Supabase.", error);
    setCloudStatus(explainSupabaseError(error), "error", false);
  }
}

async function handleEmailSignIn(event) {
  event.preventDefault();

  if (!runtime.cloud.client) {
    setCloudStatus("Configura Supabase in config.js prima di attivare il login.", "warning");
    return;
  }

  const email = String(event.currentTarget.elements.auth_email.value || "").trim();
  runtime.cloud.authEmail = email;

  if (!email) {
    setCloudStatus("Inserisci un indirizzo email valido.", "warning");
    renderCloudPanel();
    return;
  }

  setCloudStatus("Invio del magic link in corso...", "warning");

  try {
    const redirectTo = APP_CONFIG.authRedirectTo || stripAuthTokensFromUrl(window.location.href);
    const { error } = await runtime.cloud.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      console.warn(error);
      setCloudStatus(explainSupabaseError(error), "error");
      return;
    }

    setCloudStatus(`Magic link inviato a ${email}. Aprilo sul telefono per completare il login.`, "");
  } catch (error) {
    console.warn(error);
    setCloudStatus(explainSupabaseError(error), "error");
  }
}

async function handleLogout() {
  if (!runtime.cloud.client) {
    return;
  }

  try {
    const { error } = await runtime.cloud.client.auth.signOut();
    if (error) {
      console.warn(error);
      setCloudStatus(explainSupabaseError(error), "error");
      return;
    }

    runtime.cloud.user = null;
    runtime.cloud.session = null;
    setCloudStatus("Logout completato. L'app resta utilizzabile in locale.", "warning");
    render();
  } catch (error) {
    console.warn(error);
    setCloudStatus(explainSupabaseError(error), "error");
  }
}

async function syncProfilesToCloud(options = {}) {
  if (!runtime.cloud.client || !runtime.cloud.user || runtime.cloud.syncing) {
    return;
  }

  runtime.cloud.syncing = true;
  setCloudStatus("Sincronizzazione cloud in corso...", "warning");

  try {
    const userId = runtime.cloud.user.id;
    const profilePayload = state.profiles.map((profile) =>
      serializeProfileForCloud(profile, userId)
    );
    const entryPayload = state.profiles.flatMap((profile) =>
      profile.entries.map((entry) => serializeEntryForCloud(profile, entry))
    );

    if (profilePayload.length > 0) {
      const { error } = await runtime.cloud.client
        .from("happiness_profiles")
        .upsert(profilePayload, { onConflict: "id" });
      if (error) {
        throw error;
      }
    }

    if (entryPayload.length > 0) {
      const { error } = await runtime.cloud.client
        .from("happiness_entries")
        .upsert(entryPayload, { onConflict: "id" });
      if (error) {
        throw error;
      }
    }

    if (options.pullAfterPush !== false) {
      await pullProfilesFromCloud({ silent: true });
    }

    await maybeRegisterPushSubscription();
    runtime.cloud.lastSyncAt = new Date().toISOString();
    setCloudStatus(
      `Cloud aggiornato alle ${new Date(runtime.cloud.lastSyncAt).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      })}.`,
      ""
    );
  } catch (error) {
    console.warn("Errore sync cloud.", error);
    setCloudStatus(explainSupabaseError(error), "error");
  } finally {
    runtime.cloud.syncing = false;
    render();
  }
}

async function pullProfilesFromCloud(options = {}) {
  if (!runtime.cloud.client || !runtime.cloud.user) {
    setCloudStatus("Serve un login attivo per leggere dal cloud.", "warning");
    return;
  }

  if (!options.silent) {
    setCloudStatus("Scaricamento dati cloud in corso...", "warning");
  }

  try {
    const { data: profileRows, error: profileError } = await runtime.cloud.client
      .from("happiness_profiles")
      .select("*")
      .eq("owner_user_id", runtime.cloud.user.id)
      .order("created_at", { ascending: true });

    if (profileError) {
      throw profileError;
    }

    if (!profileRows || profileRows.length === 0) {
      if (!options.silent) {
        setCloudStatus("Nessun profilo cloud trovato. Resta disponibile il contenuto locale.", "warning");
      }
      return;
    }

    const profileIds = profileRows.map((row) => row.id);
    const { data: entryRows, error: entryError } = await runtime.cloud.client
      .from("happiness_entries")
      .select("*")
      .in("profile_id", profileIds)
      .order("entry_date", { ascending: true });

    if (entryError) {
      throw entryError;
    }

    const entriesByProfileId = new Map();
    (entryRows || []).forEach((row) => {
      const bucket = entriesByProfileId.get(row.profile_id) || [];
      bucket.push(mapCloudEntry(row));
      entriesByProfileId.set(row.profile_id, bucket);
    });

    state.profiles = profileRows.map((row) =>
      mapCloudProfile(row, entriesByProfileId.get(row.id) || [])
    );

    if (!state.profiles.find((profile) => profile.id === state.activeProfileId)) {
      state.activeProfileId = state.profiles[0]?.id || null;
    }

    saveState();
    render();

    if (!options.silent) {
      setCloudStatus("Dati cloud caricati nel dispositivo.", "");
    }
  } catch (error) {
    console.warn("Errore pull cloud.", error);
    setCloudStatus(explainSupabaseError(error), "error");
  }
}

async function maybeRegisterPushSubscription() {
  if (
    !runtime.cloud.client ||
    !runtime.cloud.user ||
    !APP_CONFIG.webPushPublicKey ||
    !runtime.cloud.serviceWorkerRegistration ||
    !("PushManager" in window) ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  try {
    const activeProfile = getActiveProfile();
    if (!activeProfile) {
      return;
    }

    const registration = runtime.cloud.serviceWorkerRegistration;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(APP_CONFIG.webPushPublicKey),
      });
    }

    const raw = subscription.toJSON();
    const payload = {
      profile_id: activeProfile.id,
      endpoint: subscription.endpoint,
      p256dh: raw.keys?.p256dh || "",
      auth: raw.keys?.auth || "",
      user_agent: navigator.userAgent,
    };

    if (!payload.p256dh || !payload.auth) {
      setCloudStatus("Subscription push incompleta. Riprova dal telefono.", "warning");
      return;
    }

    const { error } = await runtime.cloud.client
      .from("push_subscriptions")
      .upsert(payload, { onConflict: "endpoint" });

    if (error) {
      console.warn("Errore registrazione push.", error);
      setCloudStatus(explainSupabaseError(error), "error");
    }
  } catch (error) {
    console.warn("Errore push subscription.", error);
    setCloudStatus("Push non registrata. Verifica HTTPS, chiave VAPID e permesso notifiche.", "warning");
  }
}

function serializeProfileForCloud(profile, userId) {
  return {
    id: profile.id,
    owner_user_id: userId,
    display_name: profile.name,
    eta_weights: profile.etaWeights,
    iota_weights: profile.iotaWeights,
    windows: profile.windows,
    baselines: profile.baselines,
    reminder_time: profile.reminder?.time || "23:00",
    timezone: profile.reminder?.timezone || "Europe/Rome",
    created_at: profile.createdAt || new Date().toISOString(),
    updated_at: profile.updatedAt || new Date().toISOString(),
  };
}

function serializeEntryForCloud(profile, entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    profile_id: profile.id,
    entry_date: entry.date,
    relational: entry.spheres.relational,
    expressive: entry.spheres.expressive,
    reflective: entry.spheres.reflective,
    virtuous: entry.spheres.virtuous,
    eta: round2(entry.eta),
    iota: round2(entry.iota),
    notes: entry.notes || "",
    created_at: entry.createdAt || entry.savedAt || new Date().toISOString(),
    updated_at: entry.updatedAt || entry.savedAt || new Date().toISOString(),
  };
}

function mapCloudProfile(row, entries) {
  const profile = hydrateProfile({
    id: row.id,
    name: row.display_name,
    etaWeights: row.eta_weights,
    iotaWeights: row.iota_weights,
    windows: row.windows,
    baselines: row.baselines,
    reminder: {
      time: String(row.reminder_time || "23:00").slice(0, 5),
      timezone: row.timezone || "Europe/Rome",
    },
    entries,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  recomputeProfileEntries(profile);
  return profile;
}

function mapCloudEntry(row) {
  return hydrateEntry({
    id: row.id,
    date: row.entry_date,
    spheres: {
      relational: Number(row.relational),
      expressive: Number(row.expressive),
      reflective: Number(row.reflective),
      virtuous: Number(row.virtuous),
    },
    notes: row.notes || "",
    eta: Number(row.eta),
    iota: Number(row.iota),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    savedAt: row.updated_at || row.created_at,
  });
}

function setCloudStatus(message, tone = "", shouldRender = true) {
  runtime.cloud.status = message;
  runtime.cloud.statusTone = tone;
  if (shouldRender) {
    renderCloudPanel();
  }
}

function computeForDraft(profile, draft) {
  const entryMap = new Map(profile.entries.map((entry) => [entry.date, entry]));
  const eta = computeEta(profile.etaWeights, draft.spheres);
  entryMap.set(draft.date, { date: draft.date, eta });

  const recentStart = 1;
  const recentEnd = profile.windows.recentDays;
  const mediumStart = recentEnd + 1;
  const mediumEnd = profile.windows.mediumDays;
  const longStart = mediumEnd + 1;
  const longEnd = profile.windows.longDays;

  const recentAvg = computeWindowAverage(
    entryMap,
    draft.date,
    recentStart,
    recentEnd,
    profile.baselines.recent
  );
  const mediumAvg = computeWindowAverage(
    entryMap,
    draft.date,
    mediumStart,
    mediumEnd,
    profile.baselines.medium
  );
  const longAvg = computeWindowAverage(
    entryMap,
    draft.date,
    longStart,
    longEnd,
    profile.baselines.long
  );

  const normalizedIotaWeights = normalizeWeights(profile.iotaWeights);
  const iota =
    eta * (normalizedIotaWeights.today / 100) +
    recentAvg * (normalizedIotaWeights.recent / 100) +
    mediumAvg * (normalizedIotaWeights.medium / 100) +
    longAvg * (normalizedIotaWeights.long / 100);

  return {
    eta,
    iota,
    components: {
      todayEta: eta,
      recentAvg,
      mediumAvg,
      longAvg,
    },
  };
}

function recomputeProfileEntries(profile) {
  const sorted = [...profile.entries].sort((a, b) => a.date.localeCompare(b.date));
  const recomputedEntries = [];
  const workingProfile = {
    ...profile,
    entries: recomputedEntries,
  };

  sorted.forEach((entry) => {
    const computed = computeForDraft(workingProfile, entry);
    recomputedEntries.push({
      ...entry,
      eta: round2(computed.eta),
      iota: round2(computed.iota),
    });
  });

  profile.entries = recomputedEntries;
}

function computeEta(weights, spheres) {
  const normalized = normalizeWeights(weights);
  return (
    (spheres.relational || 0) * (normalized.relational / 100) +
    (spheres.expressive || 0) * (normalized.expressive / 100) +
    (spheres.reflective || 0) * (normalized.reflective / 100) +
    (spheres.virtuous || 0) * (normalized.virtuous / 100)
  );
}

function computeWindowAverage(entryMap, anchorDate, startOffset, endOffset, fallback) {
  if (endOffset < startOffset) {
    return fallback;
  }

  const values = [];
  for (let offset = startOffset; offset <= endOffset; offset += 1) {
    const iso = shiftIsoDate(anchorDate, -offset);
    values.push(entryMap.get(iso)?.eta ?? fallback);
  }
  return average(values);
}

function ensureDraft(profile) {
  const key = profile.id;
  const existingEntry = profile.entries.find((entry) => entry.date === runtime.selectedDate);
  const currentDraft = runtime.drafts[key];

  if (currentDraft && currentDraft.date === runtime.selectedDate) {
    return currentDraft;
  }

  runtime.drafts[key] = {
    date: runtime.selectedDate,
    spheres: existingEntry
      ? { ...existingEntry.spheres }
      : {
          relational: 5,
          expressive: 5,
          reflective: 5,
          virtuous: 5,
        },
    notes: existingEntry?.notes || "",
  };

  return runtime.drafts[key];
}

function _legacy_getActiveProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
}

function normalizeWeights(values) {
  const entries = Object.entries(values).map(([key, value]) => [
    key,
    Math.max(0, Number(value) || 0),
  ]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0) {
    const even = round2(100 / entries.length);
    return entries.reduce((accumulator, [key], index) => {
      accumulator[key] =
        index === entries.length - 1
          ? round2(100 - Object.values(accumulator).reduce((sum, item) => sum + item, 0))
          : even;
      return accumulator;
    }, {});
  }

  let assigned = 0;
  return entries.reduce((accumulator, [key, value], index) => {
    if (index === entries.length - 1) {
      accumulator[key] = round2(100 - assigned);
      return accumulator;
    }
    const normalized = round2((value / total) * 100);
    accumulator[key] = normalized;
    assigned += normalized;
    return accumulator;
  }, {});
}

function formatWeights(weights) {
  const normalized = normalizeWeights(weights);
  return Object.values(normalized)
    .map((value) => `${formatPercent(value)}`)
    .join(" / ");
}

function formatPercent(value) {
  return `${round2(value)}%`;
}

function formatScore(value) {
  return round2(value).toFixed(2);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampInt(value, min, max) {
  return Math.round(clamp(value, min, max));
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function shiftIsoDate(isoDate, offsetDays) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readAppConfig() {
  const rawConfig = window.APP_CONFIG || {};
  return {
    supabaseUrl: String(rawConfig.supabaseUrl || "").trim(),
    supabaseAnonKey: String(rawConfig.supabaseAnonKey || "").trim(),
    authRedirectTo: String(rawConfig.authRedirectTo || "").trim(),
    webPushPublicKey: String(rawConfig.webPushPublicKey || "").trim(),
  };
}

function stripAuthTokensFromUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.delete("code");
    return parsed.toString();
  } catch (_error) {
    return window.location.origin + window.location.pathname;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function explainSupabaseError(error) {
  const message = String(error?.message || error || "Errore sconosciuto");
  if (message.toLowerCase().includes("invalid api key")) {
    return "Anon key Supabase non valida. Controlla config.js.";
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "Connessione cloud non riuscita. Verifica URL Supabase, CORS e rete.";
  }
  return message;
}

function getActiveProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0] || null;
}

function _legacy_render_v2() {
  renderCloudPanel();
  renderProfileList();
  renderProfileBuilder();
  renderEntryForm();
  renderComputedSection();
  renderSettings();
  renderCharts();
  renderHistory();
  renderNotificationStatus();
}

function renderProfileList() {
  const list = document.getElementById("profile-list");
  list.innerHTML = "";

  if (state.profiles.length === 0) {
    list.innerHTML = '<p class="empty-copy">Nessun profilo presente su questo dispositivo.</p>';
    return;
  }

  state.profiles.forEach((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "profile-chip" + (profile.id === state.activeProfileId ? " active" : "");
    button.innerHTML = `
      <strong>${escapeHtml(profile.name)}</strong>
      <span>Iota ${DAILY_SCORE_SYMBOL}: ${formatWeights(profile.etaWeights)}</span>
      <span>${profile.entries.length} giornate salvate</span>
    `;
    button.addEventListener("click", () => {
      state.activeProfileId = profile.id;
      runtime.selectedDate = todayIso();
      render();
      void maybeRegisterPushSubscription();
    });
    list.appendChild(button);
  });
}

function renderProfileBuilder() {
  const builder = document.getElementById("profile-builder");
  const toggleButton = document.getElementById("toggle-profile-builder");
  const shouldShow = runtime.showProfileBuilder || state.profiles.length === 0;
  builder.classList.toggle("hidden", !shouldShow);
  toggleButton.textContent = state.profiles.length === 0 ? "Crea primo profilo" : "Nuovo profilo";
}

function renderEntryForm() {
  const profile = getActiveProfile();
  const dateInput = document.getElementById("entry-date");
  const fields = document.getElementById("entry-fields");
  const notes = document.getElementById("entry-notes");
  const saveButton = document.querySelector('#entry-form button[type="submit"]');
  const notificationButton = document.getElementById("request-notifications");

  dateInput.value = runtime.selectedDate;
  fields.innerHTML = "";

  if (!profile) {
    dateInput.disabled = true;
    notes.value = "";
    notes.disabled = true;
    saveButton.disabled = true;
    notificationButton.disabled = true;
    fields.innerHTML =
      '<p class="empty-copy">Accedi oppure crea un profilo per inserire i voti del giorno.</p>';
    return;
  }

  dateInput.disabled = false;
  notes.disabled = false;
  saveButton.disabled = false;
  notificationButton.disabled = false;

  const draft = ensureDraft(profile);

  SPHERES.forEach((sphere) => {
    const wrapper = document.createElement("div");
    wrapper.className = "slider-card";
    wrapper.innerHTML = `
      <div class="slider-row">
        <div>
          <strong>${sphere.label}</strong>
          <div class="section-kicker">${sphere.description}</div>
        </div>
        <div class="slider-meta">
          <span class="weight-pill">${formatPercent(profile.etaWeights[sphere.key])}</span>
          <span class="value-pill" id="value-${sphere.key}">${formatScore(
            draft.spheres[sphere.key]
          )}</span>
        </div>
      </div>
      <input
        id="slider-${sphere.key}"
        type="range"
        min="0"
        max="10"
        step="0.5"
        value="${draft.spheres[sphere.key]}"
      />
    `;
    fields.appendChild(wrapper);

    wrapper
      .querySelector(`#slider-${sphere.key}`)
      .addEventListener("input", (event) => {
        const nextValue = clamp(Number(event.target.value), 0, 10);
        draft.spheres[sphere.key] = nextValue;
        wrapper.querySelector(`#value-${sphere.key}`).textContent =
          formatScore(nextValue);
        renderComputedSection();
      });
  });

  notes.value = draft.notes || "";
}

function renderComputedSection() {
  const profile = getActiveProfile();
  const summary = document.getElementById("score-summary");
  const summaryCopy = document.getElementById("score-summary-copy");
  const breakdown = document.getElementById("iota-breakdown");

  if (!profile) {
    document.getElementById("eta-value").textContent = "--";
    document.getElementById("iota-value").textContent = "--";
    document.getElementById("eta-caption").textContent =
      `Iota ${DAILY_SCORE_SYMBOL}: media pesata della singola giornata.`;
    document.getElementById("iota-caption").textContent =
      `Fi ${OVERALL_SCORE_SYMBOL}: valore complessivo con memoria storica.`;
    summary.textContent = "Nessun dato visibile";
    summaryCopy.textContent =
      "Chi apre il link da zero non vede numeri: i valori compaiono solo dopo accesso o creazione di un profilo.";
    breakdown.innerHTML = "";
    return;
  }

  const draft = ensureDraft(profile);
  const computed = computeForDraft(profile, draft);

  document.getElementById("eta-value").textContent = formatScore(computed.eta);
  document.getElementById("iota-value").textContent = formatScore(computed.iota);
  document.getElementById("eta-caption").textContent =
    `Iota ${DAILY_SCORE_SYMBOL}: media pesata giornaliera delle quattro sfere.`;
  document.getElementById("iota-caption").textContent =
    `Fi ${OVERALL_SCORE_SYMBOL}: valore complessivo con memoria breve, media e lunga.`;
  summary.textContent = `Iota ${DAILY_SCORE_SYMBOL} ${formatScore(computed.eta)} / Fi ${OVERALL_SCORE_SYMBOL} ${formatScore(computed.iota)}`;
  summaryCopy.textContent = `Profilo ${profile.name}, data ${formatDateLabel(draft.date)}.`;
  breakdown.innerHTML = "";

  const cards = [
    {
      label: "Giorno selezionato",
      avg: computed.components.todayEta,
      weight: profile.iotaWeights.today,
    },
    {
      label: `1-${profile.windows.recentDays} giorni`,
      avg: computed.components.recentAvg,
      weight: profile.iotaWeights.recent,
    },
    {
      label: `${profile.windows.recentDays + 1}-${profile.windows.mediumDays} giorni`,
      avg: computed.components.mediumAvg,
      weight: profile.iotaWeights.medium,
    },
    {
      label: `${profile.windows.mediumDays + 1}-${profile.windows.longDays} giorni`,
      avg: computed.components.longAvg,
      weight: profile.iotaWeights.long,
    },
  ];

  cards.forEach((item) => {
    const card = document.createElement("article");
    card.className = "breakdown-card";
    card.innerHTML = `
      <span>${item.label}</span>
      <strong>${formatScore(item.avg)}</strong>
      <span>Peso ${formatPercent(item.weight)}</span>
    `;
    breakdown.appendChild(card);
  });
}

function renderSettings() {
  const profile = getActiveProfile();
  const form = document.getElementById("settings-form");
  const saveButton = form.querySelector('button[type="submit"]');
  const exportButton = document.getElementById("export-profile");
  const inputs = [...form.querySelectorAll('input:not(#import-profile)')];

  if (!profile) {
    inputs.forEach((input) => {
      input.value = "";
      input.disabled = true;
    });
    saveButton.disabled = true;
    exportButton.disabled = true;
    return;
  }

  inputs.forEach((input) => {
    input.disabled = false;
  });
  saveButton.disabled = false;
  exportButton.disabled = false;

  form.elements.eta_relational.value = profile.etaWeights.relational;
  form.elements.eta_expressive.value = profile.etaWeights.expressive;
  form.elements.eta_reflective.value = profile.etaWeights.reflective;
  form.elements.eta_virtuous.value = profile.etaWeights.virtuous;

  form.elements.iota_today.value = profile.iotaWeights.today;
  form.elements.iota_recent.value = profile.iotaWeights.recent;
  form.elements.iota_medium.value = profile.iotaWeights.medium;
  form.elements.iota_long.value = profile.iotaWeights.long;

  form.elements.recentDays.value = profile.windows.recentDays;
  form.elements.mediumDays.value = profile.windows.mediumDays;
  form.elements.longDays.value = profile.windows.longDays;

  form.elements.baseline_recent.value = profile.baselines.recent;
  form.elements.baseline_medium.value = profile.baselines.medium;
  form.elements.baseline_long.value = profile.baselines.long;
  form.elements.reminder_time.value = profile.reminder?.time || "23:00";
  form.elements.reminder_timezone.value =
    profile.reminder?.timezone || "Europe/Rome";
}

function renderHistory() {
  const profile = getActiveProfile();
  const mount = document.getElementById("history-table");

  if (!profile) {
    mount.innerHTML =
      '<p class="history-empty">Nessun dato disponibile. Accedi o crea un profilo per iniziare.</p>';
    return;
  }

  const sorted = [...profile.entries].sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    mount.innerHTML = `<p class="history-empty">Ancora nessuna giornata salvata.</p>`;
    return;
  }

  const rows = sorted
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.date)}</td>
          <td>${formatScore(entry.spheres.relational)}</td>
          <td>${formatScore(entry.spheres.expressive)}</td>
          <td>${formatScore(entry.spheres.reflective)}</td>
          <td>${formatScore(entry.spheres.virtuous)}</td>
          <td>${formatScore(entry.eta)}</td>
          <td>${formatScore(entry.iota)}</td>
        </tr>
      `
    )
    .join("");

  mount.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Rel.</th>
          <th>Esp.</th>
          <th>Rifl.</th>
          <th>Virt.</th>
          <th>Iota ${DAILY_SCORE_SYMBOL}</th>
          <th>Fi ${OVERALL_SCORE_SYMBOL}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderCharts() {
  const profile = getActiveProfile();
  const sphereMount = document.getElementById("sphere-chart");
  const summaryMount = document.getElementById("summary-chart");

  if (!profile) {
    const emptyCopy =
      '<p class="chart-empty">Nessun grafico disponibile finché non esiste un profilo con dati salvati.</p>';
    sphereMount.innerHTML = emptyCopy;
    summaryMount.innerHTML = emptyCopy;
    return;
  }

  const sortedEntries = [...profile.entries].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedEntries.length === 0) {
    const emptyCopy =
      '<p class="chart-empty">Salva almeno una giornata per vedere l\'andamento nel tempo.</p>';
    sphereMount.innerHTML = emptyCopy;
    summaryMount.innerHTML = emptyCopy;
    return;
  }

  renderLineChart(sphereMount, sortedEntries, [
    { label: "Relazionale", color: "#f0a39b", accessor: (entry) => entry.spheres.relational },
    { label: "Espressiva", color: "#f3c78c", accessor: (entry) => entry.spheres.expressive },
    { label: "Riflessiva", color: "#98bfd9", accessor: (entry) => entry.spheres.reflective },
    { label: "Virtuosa", color: "#9ccfc0", accessor: (entry) => entry.spheres.virtuous },
    { label: `Iota ${DAILY_SCORE_SYMBOL}`, color: "#7ca592", accessor: (entry) => entry.eta },
  ]);

  renderLineChart(summaryMount, sortedEntries, [
    { label: `Iota ${DAILY_SCORE_SYMBOL}`, color: "#7ca592", accessor: (entry) => entry.eta },
    { label: `Fi ${OVERALL_SCORE_SYMBOL}`, color: "#d18f94", accessor: (entry) => entry.iota },
  ]);
}

function renderLineChart(mount, entries, seriesList) {
  const width = 720;
  const height = 260;
  const padding = { top: 16, right: 14, bottom: 34, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xForIndex = (index) =>
    entries.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (plotWidth * index) / (entries.length - 1);
  const yForValue = (value) =>
    padding.top + plotHeight - (clamp(Number(value) || 0, 0, 10) / 10) * plotHeight;

  const gridValues = [0, 2.5, 5, 7.5, 10];
  const xLabelIndexes = pickAxisLabelIndexes(entries.length);

  const grid = gridValues
    .map((value) => {
      const y = yForValue(value);
      return `
        <line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />
        <text class="chart-axis-label" x="${padding.left - 8}" y="${y + 4}" text-anchor="end">${round2(value)}</text>
      `;
    })
    .join("");

  const xLabels = xLabelIndexes
    .map((index) => {
      const x = xForIndex(index);
      return `<text class="chart-axis-label" x="${x}" y="${height - 8}" text-anchor="middle">${formatDateLabel(
        entries[index].date
      )}</text>`;
    })
    .join("");

  const lines = seriesList
    .map((series) => {
      const points = entries.map((entry, index) => ({
        x: round2(xForIndex(index)),
        y: round2(yForValue(series.accessor(entry))),
      }));
      const path = points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
      const dots = points
        .map(
          (point) =>
            `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4" fill="${series.color}" />`
        )
        .join("");
      return `
        <path class="chart-line" d="${path}" stroke="${series.color}" />
        ${dots}
      `;
    })
    .join("");

  const legend = seriesList
    .map(
      (series) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${series.color}"></span>
          ${escapeHtml(series.label)}
        </span>
      `
    )
    .join("");

  mount.innerHTML = `
    <div class="chart-legend">${legend}</div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico temporale">
      ${grid}
      ${lines}
      ${xLabels}
    </svg>
  `;
}

function pickAxisLabelIndexes(length) {
  if (length <= 6) {
    return Array.from({ length }, (_value, index) => index);
  }

  return [...new Set([0, Math.floor((length - 1) / 3), Math.floor((length - 1) / 2), Math.floor(((length - 1) * 2) / 3), length - 1])];
}

function formatDateLabel(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

function handleEntrySave(event) {
  event.preventDefault();
  const profile = getActiveProfile();
  if (!profile) {
    return;
  }

  const draft = ensureDraft(profile);
  const computed = computeForDraft(profile, draft);
  const existingEntry = profile.entries.find((item) => item.date === draft.date);
  const nowIso = new Date().toISOString();
  const entry = {
    id: existingEntry?.id || crypto.randomUUID(),
    date: draft.date,
    spheres: { ...draft.spheres },
    notes: draft.notes || "",
    eta: round2(computed.eta),
    iota: round2(computed.iota),
    savedAt: nowIso,
    createdAt: existingEntry?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const index = profile.entries.findIndex((item) => item.date === entry.date);
  if (index >= 0) {
    profile.entries[index] = entry;
  } else {
    profile.entries.push(entry);
  }

  recomputeProfileEntries(profile);
  profile.updatedAt = nowIso;
  saveState();
  render();
  void syncProfilesToCloud({ pullAfterPush: false });
}

function handleSettingsSave(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const profile = getActiveProfile();
  if (!profile) {
    return;
  }

  profile.etaWeights = normalizeWeights({
    relational: Number(form.elements.eta_relational.value) || 0,
    expressive: Number(form.elements.eta_expressive.value) || 0,
    reflective: Number(form.elements.eta_reflective.value) || 0,
    virtuous: Number(form.elements.eta_virtuous.value) || 0,
  });

  profile.iotaWeights = normalizeWeights({
    today: Number(form.elements.iota_today.value) || 0,
    recent: Number(form.elements.iota_recent.value) || 0,
    medium: Number(form.elements.iota_medium.value) || 0,
    long: Number(form.elements.iota_long.value) || 0,
  });

  const recentDays = clampInt(Number(form.elements.recentDays.value) || 2, 1, 30);
  const mediumDays = clampInt(
    Number(form.elements.mediumDays.value) || 45,
    recentDays + 1,
    180
  );
  const longDays = clampInt(
    Number(form.elements.longDays.value) || 548,
    mediumDays + 1,
    730
  );

  profile.windows = {
    recentDays,
    mediumDays,
    longDays,
  };

  profile.baselines = {
    recent: clamp(Number(form.elements.baseline_recent.value) || 0, 0, 10),
    medium: clamp(Number(form.elements.baseline_medium.value) || 0, 0, 10),
    long: clamp(Number(form.elements.baseline_long.value) || 0, 0, 10),
  };

  profile.reminder = {
    time: String(form.elements.reminder_time.value || "23:00"),
    timezone: String(form.elements.reminder_timezone.value || "Europe/Rome").trim() || "Europe/Rome",
  };

  profile.updatedAt = new Date().toISOString();
  recomputeProfileEntries(profile);
  saveState();
  render();
  void syncProfilesToCloud({ pullAfterPush: false });
}

function exportCurrentProfile() {
  const profile = getActiveProfile();
  if (!profile) {
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    profile,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(profile.name)}-felicita-profile.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("Service worker non registrato.", error);
    return null;
  }
}

function bindGlobalEvents() {
  document
    .getElementById("auth-form")
    .addEventListener("submit", handleEmailSignIn);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      runtime.activeTab = normalizeTab(button.dataset.tab);
      renderActiveTab();
    });
  });

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
      const profile = getActiveProfile();
      if (!profile) {
        return;
      }
      const draft = ensureDraft(profile);
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
  renderComputedSection();
  renderSettings();
  renderCharts();
  renderHistory();
  renderNotificationStatus();
  renderActiveTab();
}

function handleDateChange(event) {
  runtime.selectedDate = event.target.value || todayIso();
  render();
}

function normalizeTab(tab) {
  return ["input", "summary", "settings"].includes(tab) ? tab : "input";
}

function renderActiveTab() {
  runtime.activeTab = normalizeTab(runtime.activeTab);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === runtime.activeTab);
  });

  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== runtime.activeTab);
  });
}
