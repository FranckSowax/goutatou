/**
 * Pré-validation de numéro pour les campagnes (avant tout envoi/checkContact).
 * 241 (Gabon) : exactement 8 ou 9 chiffres après l'indicatif — cf. normalizeGabonPhone
 * (apps/web/src/lib/lp/wa.ts) pour le format de stockage. Autres indicatifs : on reste
 * permissif, simple contrôle de longueur totale (8 à 15 chiffres, plage E.164 usuelle).
 */
export function validPhoneForCountry(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('241')) {
    const rest = digits.length - 3
    return rest === 8 || rest === 9
  }
  return digits.length >= 8 && digits.length <= 15
}
