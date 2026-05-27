export type PolymarketMarket = {
  id?: string;
  conditionId?: string;
  slug?: string;
  question?: string;
  title?: string;
  description?: string;
  category?: string;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  updatedAt?: string;
};

export type PolymarketTrade = {
  id?: string;
  conditionId?: string;
  market?: string;
  marketId?: string;
  makerAddress?: string;
  walletAddress?: string;
  side?: string;
  price?: string | number;
  size?: string | number;
  amount?: string | number;
  transactionHash?: string;
  txHash?: string;
  timestamp?: string | number;
};
