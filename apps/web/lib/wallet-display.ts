import type { WalletArchetype, WalletIntelligenceSummary } from "@probis/types";

const ADJECTIVES = [
  "Alpha",
  "Apex",
  "Prime",
  "Signal",
  "Vector",
  "Atlas",
  "Nova",
  "Cipher"
] as const;

const archetypeNoun: Record<WalletArchetype, string> = {
  whale: "Whale",
  sniper: "Sniper Wallet",
  momentum_trader: "Momentum Wallet",
  high_frequency_scalper: "Scalper",
  concentrated_conviction_buyer: "Conviction Buyer",
  broad_diversified_trader: "Diversified Wallet",
  emerging_wallet: "Emerging Wallet",
  inactive_wallet: "Dormant Wallet",
  low_activity_wallet: "Low-Activity Wallet",
  directional_buyer: "Directional Buyer",
  directional_seller: "Directional Seller"
};

export const shortWalletAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const archetypeLabel = (value: string | null | undefined) =>
  value
    ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Emerging Wallet";

const hashWallet = (walletAddress: string) => {
  let hash = 0;
  for (let index = 0; index < walletAddress.length; index += 1) {
    hash = (hash * 31 + walletAddress.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const walletAlias = (
  walletAddress: string,
  archetype: WalletArchetype | string | null | undefined
) => {
  const normalized =
    archetype && archetype in archetypeNoun ? (archetype as WalletArchetype) : "emerging_wallet";
  const hash = hashWallet(`${walletAddress}:${normalized}`);
  const prefix = ADJECTIVES[hash % ADJECTIVES.length];
  const number = (hash % 97) + 1;
  return `${prefix} ${archetypeNoun[normalized]} #${number}`;
};

export const walletAliasFromSummary = (wallet: WalletIntelligenceSummary) =>
  walletAlias(
    wallet.walletAddress,
    typeof wallet.metadata.archetype === "string" ? wallet.metadata.archetype : null
  );
