import type {
  AnomalySignal,
  MarketRegime,
  NarrativeStrength,
  NarrativeTheme,
  PaginatedResponse
} from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { queryObject, signalsQuerySchema } from "@/lib/query";
import { corsHeaders, ok } from "@/lib/responses";

type QualityConfidence = "low" | "medium" | "high" | "critical";
type SignalLifecycle = "emerging" | "active" | "fading" | "resolved";

type SignalRow = {
  id: string;
  market_id: string;
  market_title: string;
  market_category: string | null;
  market_status: string;
  market_liquidity: string | null;
  market_volume_24h: string | null;
  market_probability: string | null;
  anomaly_type: string;
  severity_score: string;
  confidence_score: string;
  summary: string;
  wallet_addresses: string[] | null;
  metadata: Record<string, unknown>;
  detected_at: Date;
  created_at: Date;
};

type WalletQualityRow = {
  wallet_address: string;
  smart_money_score: string;
  conviction_score: string;
  influence_score: string;
  metadata: Record<string, unknown>;
};

type WalletQuality = {
  reliability: number;
  conviction: number;
  timing: number;
  specializationTags: string[];
  coordinatedFlow: boolean;
};

type MarketContextRow = {
  id: string;
  title: string;
  category: string;
};

type EnrichedSignal = AnomalySignal & {
  dedupeKey: string;
  marketCategory: string | null;
  marketLiquidity: number;
  marketVolume24h: number;
  walletQuality: WalletQuality;
};

const CURATION_CANDIDATE_LIMIT = 750;
const DEDUPE_WINDOW_MS = 45 * 60 * 1000;

const NARRATIVE_KEYWORDS: Array<{ theme: NarrativeTheme; keywords: string[] }> = [
  {
    theme: "election_uncertainty",
    keywords: [
      "election",
      "president",
      "senate",
      "congress",
      "poll",
      "vote",
      "primary",
      "trump",
      "biden",
      "vance"
    ]
  },
  {
    theme: "monetary_policy",
    keywords: ["fed", "fomc", "rate cut", "interest rate", "cpi", "inflation", "treasury"]
  },
  {
    theme: "geopolitical_escalation",
    keywords: ["china", "taiwan", "iran", "israel", "gaza", "ukraine", "russia", "nato", "sanction"]
  },
  {
    theme: "ai_regulation",
    keywords: [
      "ai",
      "artificial intelligence",
      "openai",
      "anthropic",
      "nvidia",
      "chip",
      "semiconductor",
      "regulation",
      "antitrust"
    ]
  },
  {
    theme: "crypto_etf_optimism",
    keywords: ["bitcoin", "ethereum", "crypto", "etf", "sec"]
  },
  {
    theme: "recession_fears",
    keywords: ["recession", "gdp", "unemployment", "jobs", "payroll"]
  },
  { theme: "energy_shock", keywords: ["oil", "gas", "energy", "opec", "brent", "wti"] },
  {
    theme: "conflict_escalation",
    keywords: ["war", "ceasefire", "missile", "invasion", "attack", "conflict"]
  },
  {
    theme: "trade_war_risk",
    keywords: ["tariff", "trade war", "export control", "import", "trade deal"]
  },
  { theme: "liquidity_stress", keywords: ["liquidity", "bank", "credit", "default", "debt"] }
];

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const toNumber = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const metadataNumber = (metadata: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const metadataString = (metadata: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
};

const metadataStringArray = (metadata: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
};

const confidenceLabel = (score: number): QualityConfidence => {
  if (score >= 88) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
};

const narrativeTheme = (row: SignalRow): NarrativeTheme => {
  const haystack = `${row.market_category ?? ""} ${row.market_title} ${row.summary}`.toLowerCase();
  return (
    NARRATIVE_KEYWORDS.find(({ keywords }) =>
      keywords.some((keyword) => haystack.includes(keyword))
    )?.theme ?? "geopolitical_escalation"
  );
};

const narrativeStrength = (
  priorityScore: number,
  relatedSignalCount: number,
  walletQuality: WalletQuality
): NarrativeStrength => {
  const score =
    priorityScore * 0.65 +
    Math.min(18, relatedSignalCount * 4) +
    (walletQuality.coordinatedFlow ? 10 : 0) +
    Math.min(12, walletQuality.reliability * 0.12);
  if (score >= 82) return "dominant";
  if (score >= 58) return "active";
  if (score >= 32) return "emerging";
  return "weak";
};

const relatedMarketContext = (
  row: SignalRow,
  theme: NarrativeTheme,
  relatedSignalCount: number,
  walletQuality: WalletQuality
) => {
  if (relatedSignalCount >= 3) {
    return `Repeated ${theme.replaceAll("_", " ")} signals suggest attention may be spreading within this market cluster.`;
  }
  if (walletQuality.specializationTags.length > 0) {
    return `Wallet specialization appears aligned with ${theme.replaceAll("_", " ")} context.`;
  }
  if (row.market_category) {
    return `Category overlap places this signal in the ${row.market_category} narrative lane.`;
  }
  return null;
};

const marketRegimeForSignal = (
  row: SignalRow,
  priorityScore: number,
  relatedSignalCount: number,
  walletQuality: WalletQuality,
  liquidity: number,
  volume24h: number
): MarketRegime => {
  const probabilityMove = probabilityMoveMagnitude(row.metadata);
  const volumeStrength = volumeAnomalyStrength(row.metadata);
  const volumeLiquidityRatio = liquidity > 0 ? volume24h / liquidity : volume24h > 0 ? 99 : 0;

  if (priorityScore >= 82 && relatedSignalCount >= 3) return "narrative_overheating";
  if (priorityScore >= 76 && volumeStrength >= 3) return "speculative_frenzy";
  if (liquidity < 1_000 || (probabilityMove >= 0.06 && liquidity < 3_000)) {
    return "liquidity_stress";
  }
  if (probabilityMove >= 0.08) return "high_volatility";
  if (probabilityMove >= 0.04 || walletQuality.conviction >= 65) return "momentum_driven";
  if (volumeStrength >= 2 || relatedSignalCount >= 2 || volumeLiquidityRatio >= 2) {
    return "elevated_attention";
  }
  if (priorityScore < 35 && relatedSignalCount <= 1) return "quiet";
  return "stabilization";
};

const regimeAdjustedConfidence = (
  priorityScore: number,
  regime: MarketRegime,
  walletQuality: WalletQuality,
  relatedSignalCount: number
) => {
  let adjustment = 0;
  if (regime === "quiet" && walletQuality.conviction >= 50) adjustment += 8;
  if (regime === "liquidity_stress" || regime === "high_volatility") adjustment += 4;
  if (regime === "narrative_overheating" || regime === "speculative_frenzy") adjustment -= 8;
  if (relatedSignalCount >= 3) adjustment += 5;
  return clamp(priorityScore + adjustment);
};

const regimeContext = (regime: MarketRegime) => {
  if (regime === "quiet") {
    return "A signal surfacing from a quiet regime may deserve attention because baseline activity is low.";
  }
  if (regime === "narrative_overheating" || regime === "speculative_frenzy") {
    return "Repeated anomalies in an overheated regime may contain more noise; confidence is interpreted cautiously.";
  }
  if (regime === "liquidity_stress") {
    return "Liquidity appears thin, so probability movement may be amplified by smaller flows.";
  }
  if (regime === "momentum_driven") {
    return "Market behavior suggests directional momentum may be persisting.";
  }
  if (regime === "high_volatility") {
    return "Market behavior suggests elevated volatility and unstable repricing.";
  }
  if (regime === "elevated_attention") {
    return "Attention regime appears elevated across recent activity and signal density.";
  }
  return null;
};

const clusterTag = (theme: NarrativeTheme) => {
  if (theme === "ai_regulation") return "AI / Regulation";
  if (theme === "monetary_policy") return "Monetary Policy";
  if (theme === "election_uncertainty") return "Elections";
  if (theme === "trade_war_risk") return "Trade War";
  if (theme === "crypto_etf_optimism") return "Crypto ETF";
  if (theme === "energy_shock") return "Energy Markets";
  if (theme === "recession_fears") return "Recession Risk";
  if (theme === "liquidity_stress") return "Liquidity Stress";
  return "Conflict Escalation";
};

const affectedMarketsForSignal = (
  row: SignalRow,
  theme: NarrativeTheme,
  marketContexts: MarketContextRow[]
) =>
  marketContexts
    .filter((market) => market.id !== row.market_id)
    .map((market) => {
      const sameCategory = market.category === row.market_category;
      const themeWord = theme.split("_")[0] ?? theme;
      const keywordOverlap = market.title.toLowerCase().includes(themeWord);
      if (!sameCategory && !keywordOverlap) return null;
      return {
        marketId: market.id,
        title: market.title,
        relationship: sameCategory ? "category overlap" : "theme keyword overlap"
      };
    })
    .filter(
      (
        market
      ): market is {
        marketId: string;
        title: string;
        relationship: string;
      } => Boolean(market)
    )
    .slice(0, 3);

const signalLifecycle = (
  row: SignalRow,
  relatedSignalCount: number,
  priorityScore: number
): SignalLifecycle => {
  if (["closed", "settled", "cancelled"].includes(row.market_status)) return "resolved";

  const ageHours = (Date.now() - row.detected_at.getTime()) / 3_600_000;
  if (ageHours <= 0.5 && relatedSignalCount <= 1) return "emerging";
  if (ageHours <= 6 || relatedSignalCount >= 3 || priorityScore >= 75) return "active";
  if (ageHours <= 24) return "fading";
  return "resolved";
};

const marketRegimeScore = (liquidity: number, volume24h: number) => {
  const liquidityScore = Math.min(20, Math.log10(liquidity + 1) * 4);
  const volumeScore = Math.min(20, Math.log10(volume24h + 1) * 4);
  return liquidityScore + volumeScore;
};

const probabilityMoveMagnitude = (metadata: Record<string, unknown>) =>
  Math.abs(
    metadataNumber(metadata, [
      "probability_move",
      "probability_change",
      "move",
      "delta",
      "sixty_minute_move",
      "fifteen_minute_move",
      "five_minute_move"
    ])
  );

const volumeAnomalyStrength = (metadata: Record<string, unknown>) =>
  metadataNumber(metadata, [
    "spike_multiple",
    "volume_multiple",
    "baseline_multiple",
    "activity_multiple",
    "latest_5m_volume"
  ]);

const signalDirection = (metadata: Record<string, unknown>, anomalyType: string) => {
  const explicit = metadataString(metadata, ["direction", "side", "outcome"]);
  if (explicit) return explicit.toLowerCase();

  const current = metadataNumber(metadata, ["current_probability"]);
  const previous = metadataNumber(metadata, ["previous_probability"]);
  if (current > 0 && previous > 0 && current !== previous) {
    return current > previous ? "yes_up" : "yes_down";
  }

  if (anomalyType.includes("whale") || anomalyType.includes("wallet")) {
    const outcome = metadataString(metadata, ["trade_outcome", "dominant_outcome"]);
    const side = metadataString(metadata, ["trade_side", "dominant_side"]);
    return [outcome, side].filter(Boolean).join("_") || "wallet_flow";
  }

  return "market";
};

const compositeType = (
  row: SignalRow,
  walletQuality: WalletQuality,
  liquidity: number,
  volume24h: number
) => {
  const signalKind = metadataString(row.metadata, ["signal_kind"]);
  const probabilityMove = probabilityMoveMagnitude(row.metadata);
  const volumeStrength = volumeAnomalyStrength(row.metadata);
  const categoryText = `${row.market_category ?? ""} ${row.market_title}`.toLowerCase();
  const isGeopolitical =
    /geopolitic|politic|election|iran|israel|gaza|ukraine|russia|china|taiwan|fed|cpi|inflation|tariff|sanction/.test(
      categoryText
    );

  if (
    isGeopolitical &&
    (row.anomaly_type === "coordinated_wallet_activity" || walletQuality.coordinatedFlow) &&
    walletQuality.reliability >= 45
  ) {
    return "coordinated_geopolitical_accumulation";
  }

  if (
    ["large_concentrated_yes_buying", "synchronized_directional_flow"].includes(signalKind ?? "") ||
    (row.anomaly_type.includes("wallet") && walletQuality.conviction >= 55)
  ) {
    return "high_conviction_smart_money_entry";
  }

  if (row.anomaly_type === "probability_shock" && volumeStrength >= 2) {
    return "momentum_continuation_flow";
  }

  if (row.anomaly_type === "probability_shock" && probabilityMove >= 0.06 && liquidity < 2_500) {
    return "liquidity_vacuum_probability_jump";
  }

  if (
    row.anomaly_type === "volume_spike" ||
    row.anomaly_type === "activity_burst" ||
    volume24h >= 25_000
  ) {
    return "elevated_attention_regime";
  }

  return signalKind ?? row.anomaly_type;
};

const walletQualityForSignal = (
  walletAddresses: string[],
  walletsByAddress: Map<string, WalletQuality>
): WalletQuality => {
  const walletQualities = walletAddresses
    .map((address) => walletsByAddress.get(address.toLowerCase()))
    .filter((quality): quality is WalletQuality => Boolean(quality));

  if (walletQualities.length === 0) {
    return {
      reliability: 0,
      conviction: 0,
      timing: 0,
      specializationTags: [],
      coordinatedFlow: false
    };
  }

  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

  return {
    reliability: average(walletQualities.map((quality) => quality.reliability)),
    conviction: average(walletQualities.map((quality) => quality.conviction)),
    timing: average(walletQualities.map((quality) => quality.timing)),
    specializationTags: Array.from(
      new Set(walletQualities.flatMap((quality) => quality.specializationTags))
    ),
    coordinatedFlow: walletQualities.some((quality) => quality.coordinatedFlow)
  };
};

const qualityScore = (
  row: SignalRow,
  relatedSignalCount: number,
  walletQuality: WalletQuality,
  liquidity: number,
  volume24h: number
) => {
  const probabilityMove = probabilityMoveMagnitude(row.metadata);
  const volumeStrength = volumeAnomalyStrength(row.metadata);
  const coordinated =
    row.anomaly_type === "coordinated_wallet_activity" || walletQuality.coordinatedFlow;
  const persistence = Math.min(12, Math.max(0, relatedSignalCount - 1) * 4);

  return clamp(
    toNumber(row.confidence_score) * 0.18 +
      toNumber(row.severity_score) * 0.22 +
      walletQuality.reliability * 0.14 +
      walletQuality.conviction * 0.12 +
      walletQuality.timing * 0.08 +
      Math.min(12, probabilityMove * 120) +
      Math.min(10, volumeStrength * 2) +
      marketRegimeScore(liquidity, volume24h) * 0.25 +
      (coordinated ? 8 : 0) +
      persistence
  );
};

const contributorsForSignal = (
  row: SignalRow,
  walletQuality: WalletQuality,
  relatedSignalCount: number,
  liquidity: number,
  volume24h: number
) => {
  const contributors: string[] = [];
  if (walletQuality.reliability >= 65) contributors.push("high-reliability wallets");
  if (walletQuality.conviction >= 55) contributors.push("high-conviction flow");
  if (walletQuality.timing >= 55) contributors.push("favorable entry timing");
  if (row.anomaly_type === "coordinated_wallet_activity" || walletQuality.coordinatedFlow) {
    contributors.push("synchronized wallet participation");
  }
  if (probabilityMoveMagnitude(row.metadata) >= 0.05) contributors.push("material YES repricing");
  if (volumeAnomalyStrength(row.metadata) >= 2) contributors.push("volume anomaly");
  if (relatedSignalCount > 1) contributors.push(`${relatedSignalCount} related events`);
  if (liquidity >= 10_000 || volume24h >= 25_000) contributors.push("active market regime");
  if (walletQuality.specializationTags.length > 0) {
    contributors.push(`${walletQuality.specializationTags.slice(0, 2).join(", ")} specialization`);
  }
  return contributors.length > 0 ? contributors : ["single anomaly event"];
};

const signalExplanation = (
  row: SignalRow,
  composite: string,
  contributors: string[],
  confidence: QualityConfidence,
  relatedSignalCount: number
) => {
  const readableComposite = composite.replaceAll("_", " ");
  const direction = signalDirection(row.metadata, row.anomaly_type).replaceAll("_", " ");
  const repeatedText =
    relatedSignalCount > 1
      ? ` It groups ${relatedSignalCount} similar events observed close together.`
      : "";

  return `${readableComposite} detected in ${row.market_title}. Direction: ${direction}. Confidence is ${confidence} because ${contributors
    .slice(0, 3)
    .join(", ")} contributed to the signal.${repeatedText}`;
};

const suppressSignal = (signal: EnrichedSignal) => {
  if (signal.qualityConfidence === "critical" || signal.qualityConfidence === "high") return false;
  if ((signal.priorityScore ?? 0) >= 42) return false;
  if (signal.relatedSignalCount && signal.relatedSignalCount >= 3) return false;
  return signal.severityScore < 55 && signal.confidenceScore < 55;
};

const groupSignals = (signals: EnrichedSignal[]) => {
  const groups = new Map<string, EnrichedSignal>();

  for (const signal of signals) {
    const bucket = Math.floor(new Date(signal.detectedAt).getTime() / DEDUPE_WINDOW_MS);
    const key = `${signal.dedupeKey}:${bucket}`;
    const existing = groups.get(key);

    if (
      !existing ||
      (signal.priorityScore ?? 0) > (existing.priorityScore ?? 0) ||
      (signal.priorityScore === existing.priorityScore &&
        new Date(signal.detectedAt).getTime() > new Date(existing.detectedAt).getTime())
    ) {
      groups.set(key, signal);
    }
  }

  return Array.from(groups.values());
};

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = signalsQuerySchema.parse(queryObject(request));
  const sql = getSql();

  const candidateLimit = Math.max(CURATION_CANDIDATE_LIMIT, query.limit + query.offset + 100);
  const rows = await sql<SignalRow[]>`
    SELECT
      ae.id,
      ae.market_id,
      m.title AS market_title,
      m.category AS market_category,
      m.status::text AS market_status,
      m.liquidity::text AS market_liquidity,
      COALESCE(m.volume_24h, NULLIF(m.metadata->>'gamma_volume', '')::numeric)::text AS market_volume_24h,
      COALESCE(m.current_probability_yes, m.current_probability)::text AS market_probability,
      ae.anomaly_type::text,
      ae.severity_score::text,
      ae.confidence_score::text,
      ae.summary,
      ae.wallet_addresses,
      ae.metadata,
      ae.detected_at,
      ae.created_at
    FROM anomaly_events ae
    INNER JOIN markets m ON m.id = ae.market_id
    WHERE
      ae.detected_at >= now() - (${query.lookbackHours}::int * interval '1 hour')
      AND (${query.anomalyType ?? null}::text IS NULL OR ae.anomaly_type::text = ${query.anomalyType ?? null})
      AND (${query.marketId ?? null}::uuid IS NULL OR ae.market_id = ${query.marketId ?? null}::uuid)
      AND (${query.minSeverity ?? null}::numeric IS NULL OR ae.severity_score >= ${query.minSeverity ?? null})
    ORDER BY ae.detected_at DESC
    LIMIT ${candidateLimit}
  `;

  const walletAddresses = Array.from(
    new Set(
      rows.flatMap((row) => row.wallet_addresses ?? []).map((address) => address.toLowerCase())
    )
  );
  const walletRows =
    walletAddresses.length === 0
      ? []
      : await sql<WalletQualityRow[]>`
          SELECT
            wallet_address,
            smart_money_score::text,
            conviction_score::text,
            influence_score::text,
            metadata
          FROM wallet_profiles
          WHERE lower(wallet_address) = ANY(${walletAddresses}::text[])
        `;
  const marketContexts = await sql<MarketContextRow[]>`
    SELECT id, title, category
    FROM markets
    WHERE is_active_universe = true
    ORDER BY universe_rank ASC NULLS LAST, updated_at DESC
    LIMIT 250
  `;

  const walletsByAddress = new Map<string, WalletQuality>(
    walletRows.map((row) => {
      const metadata = row.metadata ?? {};
      const tags = metadataStringArray(metadata, ["specialization_tags"]);
      return [
        row.wallet_address.toLowerCase(),
        {
          reliability:
            metadataNumber(metadata, ["reliability_score"]) || toNumber(row.smart_money_score),
          conviction: toNumber(row.conviction_score),
          timing: metadataNumber(metadata, ["entry_timing_score"]),
          specializationTags: tags,
          coordinatedFlow:
            metadata.coordinated_flow_participation === true ||
            metadata.coordinated_flow_participation === "true"
        }
      ];
    })
  );

  const relatedCounts = rows.reduce((counts, row) => {
    const direction = signalDirection(row.metadata, row.anomaly_type);
    const key = `${row.market_id}:${row.anomaly_type}:${direction}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  const enriched = rows.map((row): EnrichedSignal => {
    const walletAddressesForSignal = (row.wallet_addresses ?? []).map((address) =>
      address.toLowerCase()
    );
    const liquidity = toNumber(row.market_liquidity);
    const volume24h = toNumber(row.market_volume_24h);
    const walletQuality = walletQualityForSignal(walletAddressesForSignal, walletsByAddress);
    const direction = signalDirection(row.metadata, row.anomaly_type);
    const relatedKey = `${row.market_id}:${row.anomaly_type}:${direction}`;
    const relatedSignalCount = relatedCounts.get(relatedKey) ?? 1;
    const priorityScore = qualityScore(
      row,
      relatedSignalCount,
      walletQuality,
      liquidity,
      volume24h
    );
    const qualityConfidence = confidenceLabel(priorityScore);
    const composite = compositeType(row, walletQuality, liquidity, volume24h);
    const signalNarrativeTheme = narrativeTheme(row);
    const signalNarrativeStrength = narrativeStrength(
      priorityScore,
      relatedSignalCount,
      walletQuality
    );
    const affectedMarkets = affectedMarketsForSignal(row, signalNarrativeTheme, marketContexts);
    const signalMarketRegime = marketRegimeForSignal(
      row,
      priorityScore,
      relatedSignalCount,
      walletQuality,
      liquidity,
      volume24h
    );
    const adjustedConfidence = regimeAdjustedConfidence(
      priorityScore,
      signalMarketRegime,
      walletQuality,
      relatedSignalCount
    );
    const contributors = contributorsForSignal(
      row,
      walletQuality,
      relatedSignalCount,
      liquidity,
      volume24h
    );

    const signal: EnrichedSignal = {
      id: row.id,
      marketId: row.market_id,
      marketTitle: row.market_title,
      anomalyType: row.anomaly_type,
      severityScore: toNumber(row.severity_score),
      confidenceScore: toNumber(row.confidence_score),
      summary: row.summary,
      walletAddresses: row.wallet_addresses ?? [],
      metadata: row.metadata,
      detectedAt: row.detected_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      qualityConfidence,
      priorityScore,
      lifecycle: signalLifecycle(row, relatedSignalCount, priorityScore),
      compositeType: composite,
      explanation: signalExplanation(
        row,
        composite,
        contributors,
        qualityConfidence,
        relatedSignalCount
      ),
      contributors,
      relatedSignalCount,
      isSuppressed: false,
      narrativeTheme: signalNarrativeTheme,
      narrativeStrength: signalNarrativeStrength,
      affectedMarkets,
      clusterTag: clusterTag(signalNarrativeTheme),
      crossMarketConfidence: Math.min(
        100,
        priorityScore + affectedMarkets.length * 6 + (relatedSignalCount > 1 ? 8 : 0)
      ),
      marketRegime: signalMarketRegime,
      regimeAdjustedConfidence: adjustedConfidence,
      regimeContext: regimeContext(signalMarketRegime),
      relatedMarketContext: relatedMarketContext(
        row,
        signalNarrativeTheme,
        relatedSignalCount,
        walletQuality
      ),
      dedupeKey: `${row.market_id}:${composite}:${direction}`,
      marketCategory: row.market_category,
      marketLiquidity: liquidity,
      marketVolume24h: volume24h,
      walletQuality
    };

    return {
      ...signal,
      isSuppressed: suppressSignal(signal)
    };
  });

  const curated = groupSignals(enriched)
    .filter((signal) => !signal.isSuppressed)
    .filter(
      (signal) =>
        (query.confidence === undefined || signal.qualityConfidence === query.confidence) &&
        (query.lifecycle === undefined || signal.lifecycle === query.lifecycle)
    )
    .sort((left, right) => {
      if (query.sort === "detected_at") {
        const byTime = new Date(left.detectedAt).getTime() - new Date(right.detectedAt).getTime();
        return query.direction === "asc" ? byTime : -byTime;
      }

      const byPriority = (left.priorityScore ?? 0) - (right.priorityScore ?? 0);
      return query.direction === "asc" ? byPriority : -byPriority;
    });

  const pageItems = curated.slice(query.offset, query.offset + query.limit);
  const total = curated.length;
  const data: PaginatedResponse<AnomalySignal> = {
    items: pageItems.map(
      ({
        dedupeKey: _dedupeKey,
        marketCategory: _marketCategory,
        marketLiquidity: _marketLiquidity,
        marketVolume24h: _marketVolume24h,
        walletQuality: _walletQuality,
        ...signal
      }) => signal
    ),
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total,
      nextOffset: query.offset + query.limit < total ? query.offset + query.limit : null
    }
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
