import { scoreWhaleActivity } from "../scoring";
import type { AnomalyCandidate, LargeTrade } from "../types";

export const detectWhaleActivity = (trade: LargeTrade): AnomalyCandidate => {
  const { severityScore, confidenceScore } = scoreWhaleActivity(trade.usdValue);
  const side = trade.side === "buy" ? "bought" : "sold";

  return {
    anomalyType: "whale_activity",
    marketId: trade.marketId,
    severityScore,
    confidenceScore,
    detectedAt: trade.tradeTimestamp,
    walletAddresses: [trade.walletAddress],
    summary: `${trade.walletAddress.slice(0, 6)}...${trade.walletAddress.slice(
      -4
    )} ${side} $${Math.round(trade.usdValue).toLocaleString()} in a single trade.`,
    metadata: {
      wallet_address: trade.walletAddress,
      usd_value: trade.usdValue,
      side: trade.side,
      price: trade.price,
      quantity: trade.quantity,
      transaction_hash: trade.transactionHash,
      trade_timestamp: trade.tradeTimestamp.toISOString()
    }
  };
};
