export function dateToDiscordTimestamp(date: Date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`
}

export function secToTime(sec: number, precision: number = -1) {
  let time = ''
  const weeks = Math.floor(sec / 604800)
  const days = Math.floor(sec / 86400) % 7
  const hours = Math.floor(sec / 3600) % 24
  const minutes = Math.floor(sec / 60) % 60
  const seconds = sec % 60

  if (weeks > 0) time += `${weeks}w `
  if (days > 0) time += `${days}d `
  if (hours > 0) time += `${hours}h `
  if (minutes > 0) time += `${minutes}m `
  if (seconds > 0) time += `${seconds}s`

  if (precision === -1) {
    return time
  }

  const timeParts = time.trim().split(' ')
  return timeParts.slice(0, precision).join(' ')
}
