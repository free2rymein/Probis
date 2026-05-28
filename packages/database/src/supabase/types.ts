export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: {
    foreignKeyName: string;
    columns: string[];
    referencedRelation: string;
    referencedColumns: string[];
  }[];
};

export type Database = {
  public: {
    Tables: {
      markets: Table<
        {
          id: string;
          source: Database["public"]["Enums"]["market_source"];
          external_id: string;
          slug: string;
          title: string;
          description: string | null;
          category: string;
          status: Database["public"]["Enums"]["market_status"];
          resolution_date: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          source: Database["public"]["Enums"]["market_source"];
          external_id: string;
          slug: string;
          title: string;
          description?: string | null;
          category: string;
          status?: Database["public"]["Enums"]["market_status"];
          resolution_date?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      trades: Table<
        {
          id: string;
          market_id: string;
          wallet_address: string;
          side: Database["public"]["Enums"]["trade_side"];
          price: string;
          quantity: string;
          usd_value: string;
          transaction_hash: string;
          trade_timestamp: string;
          created_at: string;
        },
        {
          id?: string;
          market_id: string;
          wallet_address: string;
          side: Database["public"]["Enums"]["trade_side"];
          price: string;
          quantity: string;
          usd_value: string;
          transaction_hash: string;
          trade_timestamp: string;
          created_at?: string;
        },
        never
      >;
      market_aggregates_1m: Table<
        {
          market_id: string;
          bucket: string;
          open: string;
          high: string;
          low: string;
          close: string;
          volume: string;
          trade_count: number;
        },
        {
          market_id: string;
          bucket: string;
          open: string;
          high: string;
          low: string;
          close: string;
          volume: string;
          trade_count: number;
        }
      >;
      wallet_stats: Table<
        {
          wallet_address: string;
          realized_pnl: string;
          unrealized_pnl: string;
          win_rate: string;
          avg_hold_time: number;
          conviction_score: string;
          reputation_score: string;
          information_advantage_score: string;
          updated_at: string;
        },
        {
          wallet_address: string;
          realized_pnl?: string;
          unrealized_pnl?: string;
          win_rate?: string;
          avg_hold_time?: number;
          conviction_score?: string;
          reputation_score?: string;
          information_advantage_score?: string;
          updated_at?: string;
        }
      >;
      anomaly_events: Table<
        {
          id: string;
          market_id: string;
          anomaly_type: Database["public"]["Enums"]["anomaly_type"];
          severity_score: string;
          summary: string;
          confidence_score: string;
          wallet_addresses: string[];
          metadata: Json;
          detected_at: string;
          created_at: string;
        },
        {
          id?: string;
          market_id: string;
          anomaly_type: Database["public"]["Enums"]["anomaly_type"];
          severity_score: string;
          summary: string;
          confidence_score: string;
          wallet_addresses?: string[];
          metadata?: Json;
          detected_at: string;
          created_at?: string;
        }
      >;
      narrative_events: Table<
        {
          id: string;
          source: string;
          title: string;
          content: string;
          tags: string[];
          event_timestamp: string;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          source: string;
          title: string;
          content: string;
          tags?: string[];
          event_timestamp: string;
          metadata?: Json;
          created_at?: string;
        }
      >;
      market_timeline: Table<
        {
          id: string;
          market_id: string;
          event_type: Database["public"]["Enums"]["timeline_event_type"];
          event_timestamp: string;
          payload: Json;
          created_at: string;
        },
        {
          id?: string;
          market_id: string;
          event_type: Database["public"]["Enums"]["timeline_event_type"];
          event_timestamp: string;
          payload?: Json;
          created_at?: string;
        }
      >;
      alerts: Table<
        {
          id: string;
          user_id: string;
          alert_type: Database["public"]["Enums"]["alert_type"];
          conditions: Json;
          is_active: boolean;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          alert_type: Database["public"]["Enums"]["alert_type"];
          conditions?: Json;
          is_active?: boolean;
          created_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_trade_partition_month: {
        Args: { partition_month: string };
        Returns: undefined;
      };
    };
    Enums: {
      market_source: "polymarket" | "kalshi" | "manifold" | "internal";
      market_status: "draft" | "open" | "paused" | "closed" | "settled" | "cancelled";
      trade_side: "buy" | "sell";
      anomaly_type:
        | "probability_gap"
        | "volume_spike"
        | "liquidity_drain"
        | "wallet_cluster"
        | "timeline_discontinuity"
        | "narrative_correlation"
        | "price_dislocation"
        | "probability_shock"
        | "activity_burst"
        | "whale_activity"
        | "repeat_whale_activity"
        | "coordinated_wallet_activity";
      timeline_event_type:
        | "trade"
        | "aggregate"
        | "market_sync"
        | "live_trade_ingested"
        | "aggregate_updated"
        | "anomaly_detected"
        | "anomaly"
        | "narrative"
        | "alert"
        | "resolution"
        | "system";
      alert_type: "market" | "wallet" | "anomaly" | "narrative" | "system";
    };
    CompositeTypes: Record<string, never>;
  };
};
