function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`)
  return v
}

export function loadConfig() {
  return {
    port: Number(process.env.PORT ?? 8080),
    supabaseUrl: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    tokenKey: required('TOKEN_ENCRYPTION_KEY'),
  }
}
export type Config = ReturnType<typeof loadConfig>
