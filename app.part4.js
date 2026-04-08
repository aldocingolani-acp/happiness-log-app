ForCloud(profile, entry) {
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

function getActiveProfile() {
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
