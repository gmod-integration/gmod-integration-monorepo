/*
 * Convert seconds to time
 * @param {number} seconds - The seconds to convert
 * @param {boolean} force - Force the conversion even if the time is 0 min 2digit
 * @param {Array<format>} formatDate - The format to convert the time
 */
export function convertSecToTime(seconds: number, force: boolean, formatDate: Array<'w' | 'd' | 'h' | 'm' | 's'>) {
  force = force || false
  formatDate = formatDate || ['w', 'd', 'h', 'm', 's']

  // let weeks = Math.floor(seconds / 604800);
  // let days = Math.floor((seconds % 604800) / 86400);
  // let hours = Math.floor(((seconds % 604800) % 86400) / 3600);
  // let minutes = Math.floor((((seconds % 604800) % 86400) % 3600) / 60);
  // let secs = Math.floor((((seconds % 604800) % 86400) % 3600) % 60);
  const operators = {
    w: (seconds: number) => Math.floor(seconds / 604800),
    d: (seconds: number) => Math.floor((seconds % 604800) / 86400),
    h: (seconds: number) => Math.floor(((seconds % 604800) % 86400) / 3600),
    m: (seconds: number) => Math.floor((((seconds % 604800) % 86400) % 3600) / 60),
    s: (seconds: number) => Math.floor((((seconds % 604800) % 86400) % 3600) % 60),
  }

  let time = ''
  formatDate.forEach((format) => {
    const value = operators[format](seconds)
    if (value > 0 || force) {
      time += value.toString().padStart(2, '0') + format + ' '
    }
  })

  return time.trim()
}
