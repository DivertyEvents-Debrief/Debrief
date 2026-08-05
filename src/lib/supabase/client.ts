import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client navigateur. Clé anon uniquement : toutes les requêtes passent par
 * RLS, et les tables restent fermées tant qu'aucune session n'est ouverte.
 * La clé de service n'existe que dans la fonction Edge, jamais ici — un
 * front statique est intégralement lisible par le visiteur.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont requis. Copiez .env.example vers .env.local.',
  )
}

let instance: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!instance) {
    instance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'debrief-auth',
      },
    })
  }
  return instance
}

export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = anonKey
export const ATTACHMENTS_BUCKET = 'debrief-attachments'
