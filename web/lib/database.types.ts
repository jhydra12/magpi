export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      analysis_runs: {
        Row: {
          commit_sha: string | null
          created_at: string
          default_branch: string | null
          error: string | null
          finished_at: string | null
          id: string
          org_id: string
          progress_label: string | null
          repository_name: string
          repository_owner: string
          repository_url: string
          result: Json | null
          stage: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          commit_sha?: string | null
          created_at?: string
          default_branch?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          org_id: string
          progress_label?: string | null
          repository_name: string
          repository_owner: string
          repository_url: string
          result?: Json | null
          stage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          commit_sha?: string | null
          created_at?: string
          default_branch?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          org_id?: string
          progress_label?: string | null
          repository_name?: string
          repository_owner?: string
          repository_url?: string
          result?: Json | null
          stage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chunks: {
        Row: {
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          ordinal: number
          org_id: string
          space_id: string
          token_count: number | null
          tsv: unknown
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          ordinal: number
          org_id: string
          space_id: string
          token_count?: number | null
          tsv?: unknown
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          ordinal?: number
          org_id?: string
          space_id?: string
          token_count?: number | null
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_in_space"
            columns: ["document_id", "space_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "chunks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_space_in_org"
            columns: ["space_id", "org_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      connections: {
        Row: {
          access_token_enc: string | null
          created_at: string
          cursor: string | null
          external_account_id: string | null
          id: string
          last_synced_at: string | null
          org_id: string
          provider: string
          refresh_token_enc: string | null
          scope_selection: Json
          scopes: string[]
          status: Database["public"]["Enums"]["connection_status"]
          status_detail: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          created_at?: string
          cursor?: string | null
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          org_id: string
          provider: string
          refresh_token_enc?: string | null
          scope_selection?: Json
          scopes?: string[]
          status?: Database["public"]["Enums"]["connection_status"]
          status_detail?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          created_at?: string
          cursor?: string | null
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          org_id?: string
          provider?: string
          refresh_token_enc?: string | null
          scope_selection?: Json
          scopes?: string[]
          status?: Database["public"]["Enums"]["connection_status"]
          status_detail?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["slug"]
          },
        ]
      }
      conversation_folders: {
        Row: {
          color: Database["public"]["Enums"]["folder_color"]
          created_at: string
          id: string
          name: string
          org_id: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: Database["public"]["Enums"]["folder_color"]
          created_at?: string
          id?: string
          name: string
          org_id: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: Database["public"]["Enums"]["folder_color"]
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_folders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          folder_id: string | null
          id: string
          org_id: string
          space_filter: string[] | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          id?: string
          org_id: string
          space_filter?: string[] | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          id?: string
          org_id?: string
          space_filter?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_folder_of_owner"
            columns: ["folder_id", "user_id"]
            isOneToOne: false
            referencedRelation: "conversation_folders"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_settings: {
        Row: {
          id: boolean
          model_rehearsal: boolean
          updated_at: string
        }
        Insert: {
          id?: boolean
          model_rehearsal?: boolean
          updated_at?: string
        }
        Update: {
          id?: boolean
          model_rehearsal?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          connection_id: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          dream_run_id: string | null
          external_id: string | null
          id: string
          last_retrieved_at: string | null
          mime_type: string | null
          org_id: string
          origin: Database["public"]["Enums"]["document_origin"]
          retrieval_count: number
          size_bytes: number | null
          source_chunk_ids: string[]
          space_id: string
          storage_path: string | null
          title: string
          updated_at: string
          url: string | null
          version: number
        }
        Insert: {
          connection_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          dream_run_id?: string | null
          external_id?: string | null
          id?: string
          last_retrieved_at?: string | null
          mime_type?: string | null
          org_id: string
          origin: Database["public"]["Enums"]["document_origin"]
          retrieval_count?: number
          size_bytes?: number | null
          source_chunk_ids?: string[]
          space_id: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          version?: number
        }
        Update: {
          connection_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          dream_run_id?: string | null
          external_id?: string | null
          id?: string
          last_retrieved_at?: string | null
          mime_type?: string | null
          org_id?: string
          origin?: Database["public"]["Enums"]["document_origin"]
          retrieval_count?: number
          size_bytes?: number | null
          source_chunk_ids?: string[]
          space_id?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_dream_run_in_space"
            columns: ["dream_run_id", "space_id"]
            isOneToOne: false
            referencedRelation: "dream_runs"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_space_in_org"
            columns: ["space_id", "org_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      dream_links: {
        Row: {
          confirmed_at: string | null
          created_at: string
          dismissed_at: string | null
          document_a: string
          document_b: string
          dream_run_id: string
          id: string
          rationale: string | null
          similarity: number
          space_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          document_a: string
          document_b: string
          dream_run_id: string
          id?: string
          rationale?: string | null
          similarity: number
          space_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          document_a?: string
          document_b?: string
          dream_run_id?: string
          id?: string
          rationale?: string | null
          similarity?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_links_document_a_in_space"
            columns: ["document_a", "space_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "dream_links_document_b_in_space"
            columns: ["document_b", "space_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "dream_links_run_in_space"
            columns: ["dream_run_id", "space_id"]
            isOneToOne: false
            referencedRelation: "dream_runs"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "dream_links_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input_document_count: number
          kind: Database["public"]["Enums"]["dream_kind"]
          org_id: string
          output_document_id: string | null
          space_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["dream_status"]
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_document_count?: number
          kind: Database["public"]["Enums"]["dream_kind"]
          org_id: string
          output_document_id?: string | null
          space_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["dream_status"]
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_document_count?: number
          kind?: Database["public"]["Enums"]["dream_kind"]
          org_id?: string
          output_document_id?: string | null
          space_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["dream_status"]
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dream_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_runs_output_in_space"
            columns: ["output_document_id", "space_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "dream_runs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          canonical_name: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["entity_kind"]
          name: string
          org_id: string
          space_id: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["entity_kind"]
          name: string
          org_id: string
          space_id: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["entity_kind"]
          name?: string
          org_id?: string
          space_id?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_mentions: {
        Row: {
          chunk_id: string
          created_at: string
          document_id: string
          entity_id: string
          id: string
          space_id: string
        }
        Insert: {
          chunk_id: string
          created_at?: string
          document_id: string
          entity_id: string
          id?: string
          space_id: string
        }
        Update: {
          chunk_id?: string
          created_at?: string
          document_id?: string
          entity_id?: string
          id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_mentions_chunk_in_space"
            columns: ["chunk_id", "space_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "entity_mentions_document_in_space"
            columns: ["document_id", "space_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "entity_mentions_entity_in_space"
            columns: ["entity_id", "space_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id", "space_id"]
          },
          {
            foreignKeyName: "entity_mentions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          connection_id: string | null
          created_at: string
          document_id: string
          error: string | null
          id: string
          org_id: string
          space_id: string
          stage: Database["public"]["Enums"]["ingest_stage"]
          status: Database["public"]["Enums"]["ingest_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          connection_id?: string | null
          created_at?: string
          document_id: string
          error?: string | null
          id?: string
          org_id: string
          space_id: string
          stage?: Database["public"]["Enums"]["ingest_stage"]
          status?: Database["public"]["Enums"]["ingest_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          connection_id?: string | null
          created_at?: string
          document_id?: string
          error?: string | null
          id?: string
          org_id?: string
          space_id?: string
          stage?: Database["public"]["Enums"]["ingest_stage"]
          status?: Database["public"]["Enums"]["ingest_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_jobs_space_in_org"
            columns: ["space_id", "org_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      messages: {
        Row: {
          citations: Json
          condensed_query: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          latency_ms: number | null
          role: Database["public"]["Enums"]["message_role"]
          token_count: number | null
        }
        Insert: {
          citations?: Json
          condensed_query?: string | null
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          role: Database["public"]["Enums"]["message_role"]
          token_count?: number | null
        }
        Update: {
          citations?: Json
          condensed_query?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          role?: Database["public"]["Enums"]["message_role"]
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      model_calls: {
        Row: {
          id: string
          input_tokens: number
          latency_ms: number
          model: string
          occurred_at: string
          org_id: string
          output_tokens: number
          purpose: string
          succeeded: boolean
        }
        Insert: {
          id?: string
          input_tokens?: number
          latency_ms?: number
          model: string
          occurred_at?: string
          org_id: string
          output_tokens?: number
          purpose: string
          succeeded?: boolean
        }
        Update: {
          id?: string
          input_tokens?: number
          latency_ms?: number
          model?: string
          occurred_at?: string
          org_id?: string
          output_tokens?: number
          purpose?: string
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "model_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          provider: string
          return_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at: string
          provider: string
          return_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          provider?: string
          return_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["slug"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: Database["public"]["Enums"]["org_plan"]
          seats: number
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: Database["public"]["Enums"]["org_plan"]
          seats?: number
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: Database["public"]["Enums"]["org_plan"]
          seats?: number
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: []
      }
      pending_connections: {
        Row: {
          access_token_enc: string
          created_at: string
          expires_at: string
          external_account_id: string | null
          provider: string
          refresh_token_enc: string | null
          return_to: string | null
          scopes: string[]
          ticket_hash: string
          token_expires_at: string | null
          user_id: string
        }
        Insert: {
          access_token_enc: string
          created_at?: string
          expires_at: string
          external_account_id?: string | null
          provider: string
          refresh_token_enc?: string | null
          return_to?: string | null
          scopes?: string[]
          ticket_hash: string
          token_expires_at?: string | null
          user_id: string
        }
        Update: {
          access_token_enc?: string
          created_at?: string
          expires_at?: string
          external_account_id?: string | null
          provider?: string
          refresh_token_enc?: string | null
          return_to?: string | null
          scopes?: string[]
          ticket_hash?: string
          token_expires_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_connections_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["slug"]
          },
        ]
      }
      providers: {
        Row: {
          auth_url: string | null
          description: string
          display_name: string
          docs_url: string | null
          enabled: boolean
          kind: string
          position: number
          scope_selection_kind: string | null
          scopes: string[]
          slug: string
          token_url: string | null
        }
        Insert: {
          auth_url?: string | null
          description?: string
          display_name: string
          docs_url?: string | null
          enabled?: boolean
          kind?: string
          position?: number
          scope_selection_kind?: string | null
          scopes?: string[]
          slug: string
          token_url?: string | null
        }
        Update: {
          auth_url?: string | null
          description?: string
          display_name?: string
          docs_url?: string | null
          enabled?: boolean
          kind?: string
          position?: number
          scope_selection_kind?: string | null
          scopes?: string[]
          slug?: string
          token_url?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      space_members: {
        Row: {
          created_at: string
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          created_at: string
          description: string | null
          dreaming_enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["space_kind"]
          name: string
          org_id: string
          owner_user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          dreaming_enabled?: boolean
          id?: string
          kind: Database["public"]["Enums"]["space_kind"]
          name: string
          org_id: string
          owner_user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          dreaming_enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["space_kind"]
          name?: string
          org_id?: string
          owner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spaces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          id: string
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["usage_kind"]
          occurred_at: string
          org_id: string
          quantity: number
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["usage_kind"]
          occurred_at?: string
          org_id: string
          quantity?: number
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["usage_kind"]
          occurred_at?: string
          org_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_ingest_allowed: {
        Args: { p_org_id: string }
        Returns: {
          allowed: boolean
          plan_limit: number
          reason: string
          used: number
        }[]
      }
      check_query_allowed: {
        Args: { p_org_id: string }
        Returns: {
          allowed: boolean
          plan_limit: number
          reason: string
          used: number
        }[]
      }
      claim_dream_runs: {
        Args: { p_limit: number; p_org_id?: string }
        Returns: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input_document_count: number
          kind: Database["public"]["Enums"]["dream_kind"]
          org_id: string
          output_document_id: string | null
          space_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["dream_status"]
          triggered_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "dream_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_edge_dream_run: {
        Args: { p_org_id?: string }
        Returns: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input_document_count: number
          kind: Database["public"]["Enums"]["dream_kind"]
          org_id: string
          output_document_id: string | null
          space_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["dream_status"]
          triggered_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "dream_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_ingest_jobs: {
        Args: { p_limit: number; p_org_id?: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          connection_id: string | null
          created_at: string
          document_id: string
          error: string | null
          id: string
          org_id: string
          space_id: string
          stage: Database["public"]["Enums"]["ingest_stage"]
          status: Database["public"]["Enums"]["ingest_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ingest_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_oauth_state: {
        Args: { p_state: string }
        Returns: {
          code_verifier: string
          provider: string
          return_to: string
          user_id: string
        }[]
      }
      consume_pending_connection: {
        Args: { p_ticket_hash: string }
        Returns: {
          access_token_enc: string
          external_account_id: string
          provider: string
          refresh_token_enc: string
          return_to: string
          scopes: string[]
          token_expires_at: string
          user_id: string
        }[]
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_s: number }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_s: number
        }[]
      }
      create_team_space: {
        Args: { p_description?: string; p_name: string; p_org_id: string }
        Returns: string
      }
      dream_execution_mode: { Args: never; Returns: string }
      enqueue_document: {
        Args: { p_document: Json; p_force?: boolean }
        Returns: {
          document_id: string
          ingest_job_id: string
        }[]
      }
      enqueue_dream: {
        Args: {
          p_kinds: Database["public"]["Enums"]["dream_kind"][]
          p_org_id: string
          p_space_id: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input_document_count: number
          kind: Database["public"]["Enums"]["dream_kind"]
          org_id: string
          output_document_id: string | null
          space_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["dream_status"]
          triggered_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "dream_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      entity_mention_counts: {
        Args: { p_entity_ids: string[]; p_space_id: string }
        Returns: {
          entity_id: string
          mentions: number
        }[]
      }
      freshen_demo_corpus: { Args: { p_org_id: string }; Returns: undefined }
      invoke_worker: {
        Args: { p_batch: number; p_worker: string }
        Returns: undefined
      }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_space_member: { Args: { p_space_id: string }; Returns: boolean }
      model_rehearsal_enabled: { Args: never; Returns: boolean }
      org_member_emails: {
        Args: { p_org_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      org_usage_totals: {
        Args: { p_month_start: string; p_org_id: string }
        Returns: {
          documents: number
          queries: number
          storage_bytes: number
        }[]
      }
      plan_document_limit: {
        Args: { p_plan: Database["public"]["Enums"]["org_plan"] }
        Returns: number
      }
      plan_monthly_query_limit: {
        Args: { p_plan: Database["public"]["Enums"]["org_plan"] }
        Returns: number
      }
      prune_oauth_states: { Args: never; Returns: undefined }
      prune_pending_connections: { Args: never; Returns: undefined }
      prune_rate_limits: { Args: never; Returns: undefined }
      queue_nightly_dreams: { Args: never; Returns: number }
      record_retrieval: {
        Args: { p_document_ids: string[] }
        Returns: undefined
      }
      replace_document_chunks: {
        Args: { p_chunks: Json; p_document_id: string; p_metadata: Json }
        Returns: undefined
      }
      routes_into_visible_space: {
        Args: { p_scope_selection: Json }
        Returns: boolean
      }
      schedule_workers: { Args: never; Returns: undefined }
      search: {
        Args: {
          match_count?: number
          query_embedding: string
          query_text: string
          space_filter?: string[]
        }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          score: number
          space_id: string
        }[]
      }
      set_dream_execution_mode: { Args: { p_mode: string }; Returns: undefined }
      set_model_rehearsal: { Args: { p_enabled: boolean }; Returns: boolean }
      sweep_stale_worker_runs: { Args: never; Returns: undefined }
      text_search_query: { Args: { p_text: string }; Returns: unknown }
      visible_space_ids: { Args: never; Returns: string[] }
      wake_compute_dream_worker: { Args: never; Returns: undefined }
      wake_edge_dream_worker: { Args: never; Returns: undefined }
    }
    Enums: {
      analysis_status: "queued" | "analyzing" | "succeeded" | "failed"
      connection_status: "active" | "syncing" | "error" | "revoked" | "expired"
      document_origin: "upload" | "sync" | "dream"
      dream_kind: "entities" | "digest" | "connections"
      dream_status: "queued" | "running" | "succeeded" | "failed" | "timeout"
      entity_kind: "person" | "project" | "customer" | "decision"
      folder_color:
        | "gray"
        | "brand"
        | "blue"
        | "indigo"
        | "purple"
        | "pink"
        | "crimson"
        | "orange"
        | "amber"
        | "green"
      ingest_stage: "fetch" | "extract" | "chunk" | "embed" | "store"
      ingest_status: "queued" | "running" | "succeeded" | "failed" | "timeout"
      message_role: "user" | "assistant"
      org_plan: "free" | "team" | "enterprise"
      org_role: "owner" | "admin" | "member"
      space_kind: "personal" | "team" | "org"
      usage_kind:
        | "document_ingested"
        | "chunk_embedded"
        | "query"
        | "dream_run"
        | "embedding_tokens"
        | "chat_tokens"
        | "storage_bytes"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      analysis_status: ["queued", "analyzing", "succeeded", "failed"],
      connection_status: ["active", "syncing", "error", "revoked", "expired"],
      document_origin: ["upload", "sync", "dream"],
      dream_kind: ["entities", "digest", "connections"],
      dream_status: ["queued", "running", "succeeded", "failed", "timeout"],
      entity_kind: ["person", "project", "customer", "decision"],
      folder_color: [
        "gray",
        "brand",
        "blue",
        "indigo",
        "purple",
        "pink",
        "crimson",
        "orange",
        "amber",
        "green",
      ],
      ingest_stage: ["fetch", "extract", "chunk", "embed", "store"],
      ingest_status: ["queued", "running", "succeeded", "failed", "timeout"],
      message_role: ["user", "assistant"],
      org_plan: ["free", "team", "enterprise"],
      org_role: ["owner", "admin", "member"],
      space_kind: ["personal", "team", "org"],
      usage_kind: [
        "document_ingested",
        "chunk_embedded",
        "query",
        "dream_run",
        "embedding_tokens",
        "chat_tokens",
        "storage_bytes",
      ],
    },
  },
} as const

