import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
export const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

const sessionModeKey = "snack-vote-session-mode";
export type SessionMode = "personal" | "shared";
export function getSessionMode():SessionMode{return localStorage.getItem(sessionModeKey)==="shared"?"shared":"personal"}
export function setSessionMode(mode:SessionMode){localStorage.setItem(sessionModeKey,mode)}
const browserAuthStorage={
  getItem(key:string){return getSessionMode()==="shared"?sessionStorage.getItem(key):localStorage.getItem(key)},
  setItem(key:string,value:string){if(getSessionMode()==="shared"){localStorage.removeItem(key);sessionStorage.setItem(key,value)}else{sessionStorage.removeItem(key);localStorage.setItem(key,value)}},
  removeItem(key:string){localStorage.removeItem(key);sessionStorage.removeItem(key)},
};

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: browserAuthStorage,
    },
  },
);
