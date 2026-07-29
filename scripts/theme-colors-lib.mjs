import postcss from "postcss";

export const REQUIRED_THEME_TOKENS = {
  sunrise: {
    paper: "--sun-paper",
    ink: "--sun-ink",
    graphite: "--sun-graphite",
    ember: "--sun-ember",
    gold: "--sun-gold",
    pine: "--sun-pine",
  },
  midnight: {
    paper: "--mid-paper",
    ink: "--mid-ink",
    graphite: "--mid-graphite",
    ember: "--mid-ember",
    gold: "--mid-gold",
    pine: "--mid-pine",
  },
};

const channelToHex = (channel, tokenName) => {
  const value = Number(channel);
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${tokenName} contains an invalid RGB channel: ${channel}`);
  }
  return value.toString(16).padStart(2, "0").toUpperCase();
};

export const readTokenHex = (css, tokenName) => {
  const declarations = [];
  postcss.parse(css).walkDecls(tokenName, (declaration) => {
    declarations.push(declaration);
  });

  if (declarations.length === 0) {
    throw new Error(
      `Required theme token ${tokenName} is missing from app/tokens.css`,
    );
  }
  if (declarations.length > 1) {
    throw new Error(
      `Theme token ${tokenName} must have exactly one declaration; found ${declarations.length}`,
    );
  }

  const value = declarations[0].value.trim();
  const channels = value.match(/^(\d+)\s+(\d+)\s+(\d+)$/);
  if (!channels) {
    throw new Error(
      `${tokenName} must contain exactly three integer RGB channels`,
    );
  }

  return `#${channels
    .slice(1)
    .map((channel) => channelToHex(channel, tokenName))
    .join("")}`;
};

export const buildThemeColors = (css) =>
  Object.fromEntries(
    Object.entries(REQUIRED_THEME_TOKENS).map(([themeName, tokens]) => [
      themeName,
      Object.fromEntries(
        Object.entries(tokens).map(([colorName, tokenName]) => [
          colorName,
          readTokenHex(css, tokenName),
        ]),
      ),
    ]),
  );

export const renderGeneratedModule = (themeColors) => `/**
 * GENERATED FILE — do not edit directly.
 * Source: app/tokens.css
 * Generator: scripts/sync-theme-colors.mjs
 */
export const THEME_COLORS = ${JSON.stringify(themeColors, null, 2)} as const;
`;
