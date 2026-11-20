export function showDialog(id: string): void {
  const dialog = document.getElementById(id)
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal()
}

export function closeDialog(id: string): void {
  const dialog = document.getElementById(id)
  if (dialog instanceof HTMLDialogElement) dialog.close()
}
