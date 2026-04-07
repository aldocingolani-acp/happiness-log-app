import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const webPushSubject = Deno.env.get("WEB_PUSH_SUBJECT") || "mailto:ops@example.com";
const webPushPublicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY") || "";
const webPushPrivateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY") || "";
const appBaseUrl = Deno.env.get("APP_BASE_URL") || "/";

if (!supabaseUrl || !serviceRoleKey || !webPushPublicKey || !webPushPrivateKey) {
  console.warn("Variabili Supabase/Web Push mancanti.");
}

webpush.setVapidDetails(webPushSubject, webPushPublicKey, webPushPrivateKey);

type DueReminder = {
  profile_id: string;
  display_name: string;
  local_date: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async () => {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("due_push_subscriptions", {
    lookahead_minutes: 15,
  });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const dueReminders = (data || []) as DueReminder[];
  let sent = 0;
  let cleaned = 0;

  for (const reminder of dueReminders) {
    try {
      await webpush.sendNotification(
        {
          endpoint: reminder.endpoint,
          keys: {
            p256dh: reminder.p256dh,
            auth: reminder.auth,
          },
        },
        JSON.stringify({
          title: "Check felicita",
          body: `${reminder.display_name}, e' il momento di inserire i 4 voti della giornata.`,
          url: appBaseUrl,
        })
      );

      const { error: logError } = await supabase.from("happiness_reminder_logs").insert({
        profile_id: reminder.profile_id,
        local_date: reminder.local_date,
      });

      if (logError) {
        console.warn("Reminder inviato ma log non salvato", logError.message);
      }

      sent += 1;
    } catch (sendError) {
      const message = String(sendError);
      console.warn("Errore invio push", message);

      if (message.includes("410") || message.includes("404")) {
        const { error: deleteError } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", reminder.endpoint);

        if (!deleteError) {
          cleaned += 1;
        }
      }
    }
  }

  return Response.json({
    ok: true,
    evaluated: dueReminders.length,
    sent,
    cleaned,
  });
});
