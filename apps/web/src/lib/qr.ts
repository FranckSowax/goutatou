import 'server-only'
import QRCode from 'qrcode'

/**
 * Génère un QR code en SVG (chaîne de caractères) pour le texte donné.
 * Fond blanc forcé + marge suffisante pour rester scannable une fois imprimé.
 */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  })
}
