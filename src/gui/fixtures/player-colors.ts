export const PLAYER_COLORS = [
    0x006cff, 0xc12169, 0x7044ff, 0xc77e00, 0x0093b3, 0x1d85fd, 0xf83c1e,
    0xa059ef, 0xffd13e, 0x00b5d0, 0xffffff, 0xffffff, 0xffffff, 0xffffff,
];
export const PLAYER_COLORS_CSS = PLAYER_COLORS.map((c) => `#${c.toString(16)}`);
export const getPlayerColor = (playerIndex: number) =>
    PLAYER_COLORS[playerIndex % PLAYER_COLORS_CSS.length];
export const getPlayerColorCSS = (playerIndex: number) =>
    PLAYER_COLORS_CSS[playerIndex % PLAYER_COLORS_CSS.length];
