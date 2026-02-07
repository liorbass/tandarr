// Curated 12-color palette of dark-theme-friendly colors
const AVATAR_COLORS = [
  '#E57373', // red
  '#F06292', // pink
  '#BA68C8', // purple
  '#9575CD', // deep purple
  '#7986CB', // indigo
  '#64B5F6', // blue
  '#4FC3F7', // light blue
  '#4DB6AC', // teal
  '#81C784', // green
  '#AED581', // light green
  '#FFD54F', // amber
  '#FFB74D', // orange
];

export function getAvatarColor(nickname: string): string {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit int
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitial(nickname: string): string {
  return nickname.charAt(0).toUpperCase();
}
