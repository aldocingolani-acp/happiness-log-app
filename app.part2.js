eminder?.time || "23:00")}</span>
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
  builder.classList.toggle("hidden", !runtime.showProfileBuilder);
}

function renderEntryForm() {
  const profile = getActiveProfile();
  const dateInput = document.getElementById("entry-date");
  dateInput.value = runtime.selectedDate;

  const draft = ensureDraft(profile);
  const fields = document.getElementById("entry-fields");
  fields.innerHTML = "";

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

  document.getElementById("entry-notes").value = draft.notes || "";
  renderComputedSection();
}

function renderComputedSection() {
  const profile = getActiveProfile();
  const draft = ensureDraft(profile);
  const computed = computeForDraft(profile, draft);

  document.getElementById("eta-value").textContent = formatScore(computed.eta);
  document.getElementById("iota-value").textContent = formatScore(computed.iota);
  document.getElementById("eta-caption").textContent =
    "ETA = media pesata delle 4 sfere.";
  document.getElementById("iota-caption").textContent =
    "IOTA = oggi + memoria breve + memoria media + memoria lunga.";

  document.getElementById("seed-summary").textContent = `ETA ${formatScore(
    computed.eta
  )} / IOTA ${formatScore(computed.iota)}`;

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

function renderSettings() {
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

function renderHistory() {
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

function handleDateChange(event) {
  runtime.selectedDate = event.target.value || todayIso();
  renderEntryForm();
  renderHistory();
}

function handleEntrySave(event) {
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

function handleSettingsSave(event) {
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

  if (Notification.permission === "granted