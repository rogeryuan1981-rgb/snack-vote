import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("AUTH_REQUIRED");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) throw new Error("AUTH_REQUIRED");
    const { data: caller } = await adminClient.from("employees").select("id,role,active").eq("user_id", user.id).maybeSingle();
    if (!caller?.active || caller.role !== "admin") throw new Error("ADMIN_REQUIRED");

    const { employeeId } = await request.json();
    const { data: target, error: targetError } = await adminClient.from("employees").select("user_id").eq("id", employeeId).maybeSingle();
    if (targetError || !target?.user_id) throw new Error("TARGET_HAS_NO_LOGIN");
    if (target.user_id === user.id) throw new Error("CANNOT_REVOKE_SELF");

    const { error: signOutError } = await adminClient.auth.admin.signOut(target.user_id, "global");
    if (signOutError) throw signOutError;
    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return Response.json({ error: message }, { status: 400, headers: corsHeaders });
  }
});
