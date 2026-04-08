") {
    void maybeRegisterPushSubscription();
  }

  renderNotificationStatus();
}

function exportCurrentProfile() {
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

function serializeEntry