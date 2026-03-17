/**
 * Convert a hex color code to HSL components
 * @param {string} hex - The hex color code (e.g., "#7d95ff")
 * @returns {object} - The HSL components
 */
export function hexToHSL(hex: string): {
  h: number
  s: number
  l: number
} {
  // Remove '#' if it's there
  hex = hex.replace(/^#/, '')

  // Parse r, g, b values
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255

  // Find min and max values to get lightness
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (max === min) {
    // Achromatic (gray)
    h = 0
    s = 0
  } else {
    const d = max - min
    // Saturation calculation
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    // Hue calculation
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) % 6
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h *= 60 // Convert to degrees
  }

  return {
    h: Math.round(h), // Hue in degrees
    s: Math.round(s * 100), // Saturation in percentage
    l: Math.round(l * 100), // Lightness in percentage
  }
}
