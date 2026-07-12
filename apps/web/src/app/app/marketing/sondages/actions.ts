'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { assertPlan } from '@/lib/premium'

const MAX_OPTIONS = 12
const MIN_OPTIONS = 2

/** Garde membre + plan Pro (sondages = Pro, comme chaîne/statuts). */
async function myRestaurant() {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  const restaurantId = data.restaurant_id as string
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  return { supabase, restaurantId }
}

export async function createPoll(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurant()

  const question = String(formData.get('question') ?? '').trim()
  if (!question) throw new Error('Écrivez une question.')

  const rawOptions = formData.getAll('options').map((o) => String(o).trim()).filter(Boolean)
  const options = Array.from(new Set(rawOptions))
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    throw new Error(`Ajoutez entre ${MIN_OPTIONS} et ${MAX_OPTIONS} options non vides.`)
  }
  if (options.length !== rawOptions.length) {
    throw new Error('Les options doivent être différentes les unes des autres.')
  }

  const isQuiz = String(formData.get('quiz') ?? '') === 'on'
  let quizCorrect: number | null = null
  if (isQuiz) {
    const raw = String(formData.get('quiz_correct') ?? '')
    const idx = Number.parseInt(raw, 10)
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      throw new Error('Sélectionnez la bonne réponse du quiz.')
    }
    quizCorrect = idx
  }

  const target = String(formData.get('target') ?? '')
  if (target !== 'channel' && target !== 'optin') {
    throw new Error('Choisissez une cible pour le sondage.')
  }

  if (target === 'channel') {
    const { data: resto } = await supabase
      .from('restaurants')
      .select('wa_channel_id')
      .eq('id', restaurantId)
      .single()
    if (!resto?.wa_channel_id) throw new Error('Créez d’abord votre chaîne WhatsApp.')
  }

  const { error } = await supabase.from('polls').insert({
    restaurant_id: restaurantId,
    question,
    options,
    quiz_correct: quizCorrect,
    target,
    status: 'queued',
  })
  if (error) throw new Error('Impossible d’envoyer le sondage. Réessayez.')

  revalidatePath('/app/marketing/sondages')
}
