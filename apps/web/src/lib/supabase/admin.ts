import 'server-only'
import { createServiceClient } from '@goutatou/db'

/** Client service_role — servers actions admin uniquement. Ne JAMAIS importer côté client. */
export function createAdminClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
