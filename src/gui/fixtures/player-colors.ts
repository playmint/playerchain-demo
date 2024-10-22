export const PLAYER_COLORS = [
    '#006cff', '#c12169', '#7044ff', '#c77e00', '#0093b3',
];

export const PLAYER_COLORS_UI = [
    '#0096ff', '#ff348f', '#bf6cff', '#e49100', '#00c0be',
];

export const getPlayerColor = (playerIndex: number) =>
    PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];

export const getPlayerColorUi = (playerIndex: number) =>
    PLAYER_COLORS_UI[playerIndex % PLAYER_COLORS_UI.length];