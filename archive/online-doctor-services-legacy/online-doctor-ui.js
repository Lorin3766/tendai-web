/**
 * Archived Online doctor UI helpers (Task 15d-3).
 * Removed from the live Services screen and desktop sidebar because the label
 * implies a medical service Obrium does not offer. Kept for reference only.
 */
export const ONLINE_DOCTOR_OPTIONS = [
  { id: 'chat', name: 'Chat with doctor', description: 'Text consultation', icon: '💬' },
  { id: 'voice', name: 'Voice call', description: 'Audio consultation', icon: '📞' },
  { id: 'video', name: 'Video call', description: 'Video consultation', icon: '📹' },
];

export function getOnlineDoctorIcon(id) {
  const icons = {
    chat: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#9A9A9A"/><path d="M7 9H17V11H7V9ZM7 12H14V14H7V12Z" fill="#FFFFFF"/></svg>`,
    voice: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="#FF3B30"/></svg>`,
    video: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 10.5V7C17 6.45 16.55 6 16 6H4C3.45 6 3 6.45 3 7V17C3 17.55 3.45 18 4 18H16C16.55 18 17 17.55 17 17V13.5L21 17.5V6.5L17 10.5Z" fill="#6B6B6B"/></svg>`,
  };
  return icons[id] || '';
}
