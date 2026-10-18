export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          body: string | null
          contact_id: string | null
          created_at: string
          direction: string
          id: string
          occurred_at: string
          outcome: string | null
          pipeline_entry_id: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          occurred_at?: string
          outcome?: string | null
          pipeline_entry_id: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          occurred_at?: string
          outcome?: string | null
          pipeline_entry_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_pipeline_entry_id_fkey"
            columns: ["pipeline_entry_id"]
            isOneToOne: false
            referencedRelation: "pipeline_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      analyses: {
        Row: {
          archived_at: string | null
          arv: number | null
          capex_pct: number
          closing_cost_items: Json
          closing_costs: number
          closing_costs_itemized: boolean
          created_at: string
          created_by: string
          down_payment: number
          electricity_monthly: number
          expense_growth_pct: number
          garbage_monthly: number
          gas_monthly: number
          gross_monthly_income: number
          hoa_monthly: number
          id: string
          income_growth_pct: number
          income_itemized: boolean
          income_items: Json
          inputs: Json | null
          inputs_version: number
          insurance: number
          insurance_period: string
          interest_rate: number
          is_cash_purchase: boolean
          is_primary: boolean
          kind: string
          label: string | null
          loan_amount_override: number | null
          loan_term_years: number
          management_pct: number
          other_monthly: number
          outputs: Json | null
          owner_id: string
          owner_type: string
          points: number
          profile_snapshot: Json | null
          property_growth_pct: number
          property_id: string | null
          property_taxes: number
          property_taxes_period: string
          purchase_price: number
          rehab_enabled: boolean
          repair_cost_items: Json
          repair_costs: number
          repair_costs_itemized: boolean
          repairs_pct: number
          sales_expenses_pct: number
          updated_at: string
          vacancy_pct: number
          version: number
          water_sewer_monthly: number
        }
        Insert: {
          archived_at?: string | null
          arv?: number | null
          capex_pct?: number
          closing_cost_items?: Json
          closing_costs?: number
          closing_costs_itemized?: boolean
          created_at?: string
          created_by: string
          down_payment?: number
          electricity_monthly?: number
          expense_growth_pct?: number
          garbage_monthly?: number
          gas_monthly?: number
          gross_monthly_income?: number
          hoa_monthly?: number
          id?: string
          income_growth_pct?: number
          income_itemized?: boolean
          income_items?: Json
          inputs?: Json | null
          inputs_version?: number
          insurance?: number
          insurance_period?: string
          interest_rate?: number
          is_cash_purchase?: boolean
          is_primary?: boolean
          kind?: string
          label?: string | null
          loan_amount_override?: number | null
          loan_term_years?: number
          management_pct?: number
          other_monthly?: number
          outputs?: Json | null
          owner_id: string
          owner_type: string
          points?: number
          profile_snapshot?: Json | null
          property_growth_pct?: number
          property_id?: string | null
          property_taxes?: number
          property_taxes_period?: string
          purchase_price?: number
          rehab_enabled?: boolean
          repair_cost_items?: Json
          repair_costs?: number
          repair_costs_itemized?: boolean
          repairs_pct?: number
          sales_expenses_pct?: number
          updated_at?: string
          vacancy_pct?: number
          version?: number
          water_sewer_monthly?: number
        }
        Update: {
          archived_at?: string | null
          arv?: number | null
          capex_pct?: number
          closing_cost_items?: Json
          closing_costs?: number
          closing_costs_itemized?: boolean
          created_at?: string
          created_by?: string
          down_payment?: number
          electricity_monthly?: number
          expense_growth_pct?: number
          garbage_monthly?: number
          gas_monthly?: number
          gross_monthly_income?: number
          hoa_monthly?: number
          id?: string
          income_growth_pct?: number
          income_itemized?: boolean
          income_items?: Json
          inputs?: Json | null
          inputs_version?: number
          insurance?: number
          insurance_period?: string
          interest_rate?: number
          is_cash_purchase?: boolean
          is_primary?: boolean
          kind?: string
          label?: string | null
          loan_amount_override?: number | null
          loan_term_years?: number
          management_pct?: number
          other_monthly?: number
          outputs?: Json | null
          owner_id?: string
          owner_type?: string
          points?: number
          profile_snapshot?: Json | null
          property_growth_pct?: number
          property_id?: string | null
          property_taxes?: number
          property_taxes_period?: string
          purchase_price?: number
          rehab_enabled?: boolean
          repair_cost_items?: Json
          repair_costs?: number
          repair_costs_itemized?: boolean
          repairs_pct?: number
          sales_expenses_pct?: number
          updated_at?: string
          vacancy_pct?: number
          version?: number
          water_sewer_monthly?: number
        }
        Relationships: [
          {
            foreignKeyName: "analyses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_versions: {
        Row: {
          analysis_id: string
          id: string
          inputs: Json | null
          inputs_version: number
          kind: string
          label: string
          outputs: Json | null
          profile_snapshot: Json | null
          property_id: string | null
          superseded_at: string
          superseded_by: string | null
          version: number
        }
        Insert: {
          analysis_id: string
          id?: string
          inputs?: Json | null
          inputs_version?: number
          kind: string
          label: string
          outputs?: Json | null
          profile_snapshot?: Json | null
          property_id?: string | null
          superseded_at?: string
          superseded_by?: string | null
          version: number
        }
        Update: {
          analysis_id?: string
          id?: string
          inputs?: Json | null
          inputs_version?: number
          kind?: string
          label?: string
          outputs?: Json | null
          profile_snapshot?: Json | null
          property_id?: string | null
          superseded_at?: string
          superseded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "analysis_versions_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: string
          created_at: string
          current_value: number
          icon: string
          id: string
          is_liquid: boolean
          linked_debt_id: string | null
          name: string
          owner_id: string
          owner_type: string
        }
        Insert: {
          asset_type?: string
          created_at?: string
          current_value: number
          icon?: string
          id?: string
          is_liquid?: boolean
          linked_debt_id?: string | null
          name: string
          owner_id: string
          owner_type: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          current_value?: number
          icon?: string
          id?: string
          is_liquid?: boolean
          linked_debt_id?: string | null
          name?: string
          owner_id?: string
          owner_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_linked_debt_id_fkey"
            columns: ["linked_debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_payments: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          id: string
          paid_at: string
          period: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          id?: string
          paid_at?: string
          period: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          id?: string
          paid_at?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount: number
          category_id: string | null
          context_id: string
          context_type: string
          created_at: string
          due_day: number
          id: string
          is_active: boolean
          is_auto_detected: boolean
          last_paid_at: string | null
          name: string
          notified_3day: boolean
          notified_today: boolean
          owner_id: string
          owner_type: string
          plaid_merchant: string | null
          recurrence: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          context_id: string
          context_type?: string
          created_at?: string
          due_day: number
          id?: string
          is_active?: boolean
          is_auto_detected?: boolean
          last_paid_at?: string | null
          name: string
          notified_3day?: boolean
          notified_today?: boolean
          owner_id: string
          owner_type?: string
          plaid_merchant?: string | null
          recurrence: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          context_id?: string
          context_type?: string
          created_at?: string
          due_day?: number
          id?: string
          is_active?: boolean
          is_auto_detected?: boolean
          last_paid_at?: string | null
          name?: string
          notified_3day?: boolean
          notified_today?: boolean
          owner_id?: string
          owner_type?: string
          plaid_merchant?: string | null
          recurrence?: string
        }
        Relationships: []
      }
      budget_daily_snapshots: {
        Row: {
          amount_spent: number
          budget_id: string
          created_at: string
          daily_rate: number
          date: string
          days_remaining_after: number
          id: string
          notified_80: boolean
          notified_over: boolean
          remaining_after: number
        }
        Insert: {
          amount_spent?: number
          budget_id: string
          created_at?: string
          daily_rate: number
          date: string
          days_remaining_after: number
          id?: string
          notified_80?: boolean
          notified_over?: boolean
          remaining_after: number
        }
        Update: {
          amount_spent?: number
          budget_id?: string
          created_at?: string
          daily_rate?: number
          date?: string
          days_remaining_after?: number
          id?: string
          notified_80?: boolean
          notified_over?: boolean
          remaining_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_daily_snapshots_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          category_id: string
          created_at: string
          goal_id: string
          id: string
          name: string | null
          owner_id: string
          owner_type: string
          period_end: string
          period_start: string
          period_type: string
          recurring: boolean
          rollover_enabled: boolean
          status: string
          total_limit: number
        }
        Insert: {
          category_id: string
          created_at?: string
          goal_id: string
          id?: string
          name?: string | null
          owner_id: string
          owner_type: string
          period_end: string
          period_start: string
          period_type: string
          recurring?: boolean
          rollover_enabled?: boolean
          status?: string
          total_limit: number
        }
        Update: {
          category_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          name?: string | null
          owner_id?: string
          owner_type?: string
          period_end?: string
          period_start?: string
          period_type?: string
          recurring?: boolean
          rollover_enabled?: boolean
          status?: string
          total_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_profiles: {
        Row: {
          buying_pct: number
          cash_available: number
          cash_reserves: number
          closing_cost_pct: number
          contingency_photos_pct: number
          contingency_visit_pct: number
          county_loan_limit: number | null
          created_at: string
          created_by: string
          down_payment_pct: number
          dpa_enabled: boolean
          dpa_rate: number
          dpa_structure: string
          dpa_term_years: number
          holding_monthly: number
          holding_months: number
          id: string
          interest_rate: number
          loan_type: string
          owner_id: string
          owner_type: string
          renovation_program: string
          selling_pct: number
          term_years: number
          updated_at: string
        }
        Insert: {
          buying_pct?: number
          cash_available?: number
          cash_reserves?: number
          closing_cost_pct?: number
          contingency_photos_pct?: number
          contingency_visit_pct?: number
          county_loan_limit?: number | null
          created_at?: string
          created_by: string
          down_payment_pct?: number
          dpa_enabled?: boolean
          dpa_rate?: number
          dpa_structure?: string
          dpa_term_years?: number
          holding_monthly?: number
          holding_months?: number
          id?: string
          interest_rate?: number
          loan_type?: string
          owner_id: string
          owner_type: string
          renovation_program?: string
          selling_pct?: number
          term_years?: number
          updated_at?: string
        }
        Update: {
          buying_pct?: number
          cash_available?: number
          cash_reserves?: number
          closing_cost_pct?: number
          contingency_photos_pct?: number
          contingency_visit_pct?: number
          county_loan_limit?: number | null
          created_at?: string
          created_by?: string
          down_payment_pct?: number
          dpa_enabled?: boolean
          dpa_rate?: number
          dpa_structure?: string
          dpa_term_years?: number
          holding_monthly?: number
          holding_months?: number
          id?: string
          interest_rate?: number
          loan_type?: string
          owner_id?: string
          owner_type?: string
          renovation_program?: string
          selling_pct?: number
          term_years?: number
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_custom: boolean
          name: string
          user_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_custom?: boolean
          name: string
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_custom?: boolean
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chapter_progress: {
        Row: {
          chapter_id: string
          completed_at: string | null
          id: string
          quiz_passed: boolean
          quiz_score: number | null
          tabs_visited: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chapter_id: string
          completed_at?: string | null
          id?: string
          quiz_passed?: boolean
          quiz_score?: number | null
          tabs_visited?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chapter_id?: string
          completed_at?: string | null
          id?: string
          quiz_passed?: boolean
          quiz_score?: number | null
          tabs_visited?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contact_emails: {
        Row: {
          contact_id: string
          created_at: string
          email: string
          id: string
          is_primary: boolean
          source: string
          status: string
          suppressed_at: string | null
          suppressed_by: string | null
          suppression_reason: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean
          source?: string
          status?: string
          suppressed_at?: string | null
          suppressed_by?: string | null
          suppression_reason?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          source?: string
          status?: string
          suppressed_at?: string | null
          suppressed_by?: string | null
          suppression_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_phones: {
        Row: {
          confidence: number | null
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean
          line_type: string
          number: string
          source: string
          status: string
          suppressed_at: string | null
          suppressed_by: string | null
          suppression_reason: string | null
        }
        Insert: {
          confidence?: number | null
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          line_type?: string
          number: string
          source?: string
          status?: string
          suppressed_at?: string | null
          suppressed_by?: string | null
          suppression_reason?: string | null
        }
        Update: {
          confidence?: number | null
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          line_type?: string
          number?: string
          source?: string
          status?: string
          suppressed_at?: string | null
          suppressed_by?: string | null
          suppression_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_phones_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string
          created_by: string
          first_name: string | null
          id: string
          last_name: string | null
          mailing_address_line1: string | null
          mailing_city: string | null
          mailing_state: string | null
          mailing_zip: string | null
          notes: string | null
          owner_id: string
          owner_type: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          mailing_address_line1?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          notes?: string | null
          owner_id: string
          owner_type: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          mailing_address_line1?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          notes?: string | null
          owner_id?: string
          owner_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          created_at: string
          current_balance: number
          debt_type: string
          icon: string
          id: string
          interest_rate: number
          last_synced_at: string | null
          minimum_payment: number
          name: string
          original_balance: number
          owner_id: string
          owner_type: string
          priority_order: number
          status: string
          target_date: string | null
        }
        Insert: {
          created_at?: string
          current_balance: number
          debt_type?: string
          icon?: string
          id?: string
          interest_rate: number
          last_synced_at?: string | null
          minimum_payment?: number
          name: string
          original_balance: number
          owner_id: string
          owner_type: string
          priority_order?: number
          status?: string
          target_date?: string | null
        }
        Update: {
          created_at?: string
          current_balance?: number
          debt_type?: string
          icon?: string
          id?: string
          interest_rate?: number
          last_synced_at?: string | null
          minimum_payment?: number
          name?: string
          original_balance?: number
          owner_id?: string
          owner_type?: string
          priority_order?: number
          status?: string
          target_date?: string | null
        }
        Relationships: []
      }
      dreams: {
        Row: {
          created_at: string
          description: string | null
          goal_id: string | null
          icon: string
          id: string
          owner_id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          goal_id?: string | null
          icon?: string
          id?: string
          owner_id: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          goal_id?: string | null
          icon?: string
          id?: string
          owner_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "dreams_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_accounts: {
        Row: {
          account_name: string
          account_role: string
          account_subtype: string | null
          cached_balance: number | null
          created_at: string
          goal_id: string
          id: string
          institution_name: string | null
          plaid_account_id: string
          plaid_item_id: string
          user_id: string
        }
        Insert: {
          account_name?: string
          account_role?: string
          account_subtype?: string | null
          cached_balance?: number | null
          created_at?: string
          goal_id: string
          id?: string
          institution_name?: string | null
          plaid_account_id: string
          plaid_item_id: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_role?: string
          account_subtype?: string | null
          cached_balance?: number | null
          created_at?: string
          goal_id?: string
          id?: string
          institution_name?: string | null
          plaid_account_id?: string
          plaid_item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_accounts_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted: boolean
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: string
          team_id: string | null
          token: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          invited_by: string
          org_id: string
          role: string
          team_id?: string | null
          token: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          team_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          earned_at: string
          id: string
          milestone_key: string
          notified: boolean
          owner_id: string
        }
        Insert: {
          earned_at?: string
          id?: string
          milestone_key: string
          notified?: boolean
          owner_id: string
        }
        Update: {
          earned_at?: string
          id?: string
          milestone_key?: string
          notified?: boolean
          owner_id?: string
        }
        Relationships: []
      }
      mortgage_scenario_versions: {
        Row: {
          home_value: number
          id: string
          inputs: Json
          inputs_version: number
          label: string
          loan_type: string
          monthly_payment: number
          scenario_id: string
          superseded_at: string
          superseded_by: string | null
          version: number
        }
        Insert: {
          home_value: number
          id?: string
          inputs: Json
          inputs_version: number
          label: string
          loan_type: string
          monthly_payment: number
          scenario_id: string
          superseded_at?: string
          superseded_by?: string | null
          version: number
        }
        Update: {
          home_value?: number
          id?: string
          inputs?: Json
          inputs_version?: number
          label?: string
          loan_type?: string
          monthly_payment?: number
          scenario_id?: string
          superseded_at?: string
          superseded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_scenario_versions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "mortgage_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      mortgage_scenarios: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          home_value: number
          id: string
          inputs: Json
          inputs_version: number
          label: string
          loan_type: string
          monthly_payment: number
          owner_id: string
          owner_type: string
          profile_snapshot: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          home_value: number
          id?: string
          inputs: Json
          inputs_version?: number
          label: string
          loan_type: string
          monthly_payment: number
          owner_id: string
          owner_type: string
          profile_snapshot?: Json | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          home_value?: number
          id?: string
          inputs?: Json
          inputs_version?: number
          label?: string
          loan_type?: string
          monthly_payment?: number
          owner_id?: string
          owner_type?: string
          profile_snapshot?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          org_id: string | null
          role: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          org_id?: string | null
          role: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          org_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_entries: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          id: string
          owner_id: string
          owner_type: string
          property_id: string
          source: string
          stage: string
          stage_since: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          id?: string
          owner_id: string
          owner_type: string
          property_id: string
          source?: string
          stage?: string
          stage_since?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          id?: string
          owner_id?: string
          owner_type?: string
          property_id?: string
          source?: string
          stage?: string
          stage_since?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_items: {
        Row: {
          access_token: string
          balances_refreshed_at: string | null
          created_at: string
          id: string
          institution_name: string | null
          item_id: string
          last_synced_at: string | null
          liquid_accounts_json: Json | null
          liquid_balance: number | null
          transactions_cursor: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          balances_refreshed_at?: string | null
          created_at?: string
          id?: string
          institution_name?: string | null
          item_id: string
          last_synced_at?: string | null
          liquid_accounts_json?: Json | null
          liquid_balance?: number | null
          transactions_cursor?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          balances_refreshed_at?: string | null
          created_at?: string
          id?: string
          institution_name?: string | null
          item_id?: string
          last_synced_at?: string | null
          liquid_accounts_json?: Json | null
          liquid_balance?: number | null
          transactions_cursor?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plaid_transactions: {
        Row: {
          amount: number
          category_detailed: string | null
          category_override: string | null
          category_primary: string | null
          created_at: string
          currency_code: string | null
          date: string
          id: string
          merchant_name: string | null
          name: string | null
          pending: boolean
          pending_transaction_id: string | null
          plaid_account_id: string
          plaid_item_id: string
          plaid_transaction_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_detailed?: string | null
          category_override?: string | null
          category_primary?: string | null
          created_at?: string
          currency_code?: string | null
          date: string
          id?: string
          merchant_name?: string | null
          name?: string | null
          pending?: boolean
          pending_transaction_id?: string | null
          plaid_account_id: string
          plaid_item_id: string
          plaid_transaction_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_detailed?: string | null
          category_override?: string | null
          category_primary?: string | null
          created_at?: string
          currency_code?: string | null
          date?: string
          id?: string
          merchant_name?: string | null
          name?: string | null
          pending?: boolean
          pending_transaction_id?: string | null
          plaid_account_id?: string
          plaid_item_id?: string
          plaid_transaction_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_debts: {
        Row: {
          created_at: string
          debt_type: string
          id: string
          include_in_ratios: boolean
          label: string
          monthly_payment: number
          profile_id: string
        }
        Insert: {
          created_at?: string
          debt_type?: string
          id?: string
          include_in_ratios?: boolean
          label: string
          monthly_payment: number
          profile_id: string
        }
        Update: {
          created_at?: string
          debt_type?: string
          id?: string
          include_in_ratios?: boolean
          label?: string
          monthly_payment?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_debts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_incomes: {
        Row: {
          borrower: string | null
          created_at: string
          gross_monthly: number
          id: string
          income_type: string
          label: string
          profile_id: string
        }
        Insert: {
          borrower?: string | null
          created_at?: string
          gross_monthly: number
          id?: string
          income_type?: string
          label: string
          profile_id: string
        }
        Update: {
          borrower?: string | null
          created_at?: string
          gross_monthly?: number
          id?: string
          income_type?: string
          label?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_incomes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "buyer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_color: string | null
          avatar_url: string | null
          dashboard_layout: Json | null
          display_name: string | null
          health_score_last_calculated: string | null
          id: string
          last_chapter_id: string | null
          last_tab_slug: string | null
          onboarding_complete: boolean
          pay_cycle_start_day: number
          role: string
          updated_at: string | null
          username: string | null
          weekly_report_enabled: boolean
          weekly_report_sent_date: string | null
        }
        Insert: {
          avatar_color?: string | null
          avatar_url?: string | null
          dashboard_layout?: Json | null
          display_name?: string | null
          health_score_last_calculated?: string | null
          id: string
          last_chapter_id?: string | null
          last_tab_slug?: string | null
          onboarding_complete?: boolean
          pay_cycle_start_day?: number
          role?: string
          updated_at?: string | null
          username?: string | null
          weekly_report_enabled?: boolean
          weekly_report_sent_date?: string | null
        }
        Update: {
          avatar_color?: string | null
          avatar_url?: string | null
          dashboard_layout?: Json | null
          display_name?: string | null
          health_score_last_calculated?: string | null
          id?: string
          last_chapter_id?: string | null
          last_tab_slug?: string | null
          onboarding_complete?: boolean
          pay_cycle_start_day?: number
          role?: string
          updated_at?: string | null
          username?: string | null
          weekly_report_enabled?: boolean
          weekly_report_sent_date?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_hash: string
          address_line1: string
          annual_taxes: number | null
          baths: number | null
          beds: number | null
          city: string | null
          county: string | null
          created_at: string
          created_by: string
          description: string | null
          facts_source: string
          facts_updated_at: string | null
          id: string
          last_sale_date: string | null
          last_sale_price: number | null
          latitude: number | null
          listing_url: string | null
          longitude: number | null
          lot_sqft: number | null
          needs_address_review: boolean
          origin: string
          owner_id: string
          owner_type: string
          parcel_number: string | null
          photo_url: string | null
          property_type: string
          sqft: number | null
          state: string
          updated_at: string
          visit_completed_at: string | null
          year_built: number | null
          zip: string | null
        }
        Insert: {
          address_hash: string
          address_line1: string
          annual_taxes?: number | null
          baths?: number | null
          beds?: number | null
          city?: string | null
          county?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          facts_source?: string
          facts_updated_at?: string | null
          id?: string
          last_sale_date?: string | null
          last_sale_price?: number | null
          latitude?: number | null
          listing_url?: string | null
          longitude?: number | null
          lot_sqft?: number | null
          needs_address_review?: boolean
          origin?: string
          owner_id: string
          owner_type: string
          parcel_number?: string | null
          photo_url?: string | null
          property_type?: string
          sqft?: number | null
          state?: string
          updated_at?: string
          visit_completed_at?: string | null
          year_built?: number | null
          zip?: string | null
        }
        Update: {
          address_hash?: string
          address_line1?: string
          annual_taxes?: number | null
          baths?: number | null
          beds?: number | null
          city?: string | null
          county?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          facts_source?: string
          facts_updated_at?: string | null
          id?: string
          last_sale_date?: string | null
          last_sale_price?: number | null
          latitude?: number | null
          listing_url?: string | null
          longitude?: number | null
          lot_sqft?: number | null
          needs_address_review?: boolean
          origin?: string
          owner_id?: string
          owner_type?: string
          parcel_number?: string | null
          photo_url?: string | null
          property_type?: string
          sqft?: number | null
          state?: string
          updated_at?: string
          visit_completed_at?: string | null
          year_built?: number | null
          zip?: string | null
        }
        Relationships: []
      }
      property_comps: {
        Row: {
          baths: number | null
          beds: number | null
          city: string | null
          correlation: number | null
          created_at: string
          created_by: string
          days_old: number | null
          days_on_market: number | null
          distance_miles: number | null
          external_id: string | null
          formatted_address: string
          id: string
          included: boolean
          last_seen_date: string | null
          latitude: number | null
          listed_date: string | null
          listing_type: string | null
          longitude: number | null
          lot_sqft: number | null
          notes: string | null
          owner_id: string
          owner_type: string
          price: number | null
          property_id: string
          property_type: string | null
          removed_date: string | null
          source: string
          sqft: number | null
          state: string | null
          status: string
          updated_at: string
          year_built: number | null
          zip: string | null
        }
        Insert: {
          baths?: number | null
          beds?: number | null
          city?: string | null
          correlation?: number | null
          created_at?: string
          created_by: string
          days_old?: number | null
          days_on_market?: number | null
          distance_miles?: number | null
          external_id?: string | null
          formatted_address: string
          id?: string
          included?: boolean
          last_seen_date?: string | null
          latitude?: number | null
          listed_date?: string | null
          listing_type?: string | null
          longitude?: number | null
          lot_sqft?: number | null
          notes?: string | null
          owner_id: string
          owner_type: string
          price?: number | null
          property_id: string
          property_type?: string | null
          removed_date?: string | null
          source: string
          sqft?: number | null
          state?: string | null
          status: string
          updated_at?: string
          year_built?: number | null
          zip?: string | null
        }
        Update: {
          baths?: number | null
          beds?: number | null
          city?: string | null
          correlation?: number | null
          created_at?: string
          created_by?: string
          days_old?: number | null
          days_on_market?: number | null
          distance_miles?: number | null
          external_id?: string | null
          formatted_address?: string
          id?: string
          included?: boolean
          last_seen_date?: string | null
          latitude?: number | null
          listed_date?: string | null
          listing_type?: string | null
          longitude?: number | null
          lot_sqft?: number | null
          notes?: string | null
          owner_id?: string
          owner_type?: string
          price?: number | null
          property_id?: string
          property_type?: string | null
          removed_date?: string | null
          source?: string
          sqft?: number | null
          state?: string | null
          status?: string
          updated_at?: string
          year_built?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_comps_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean
          property_id: string
          relationship: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          property_id: string
          relationship?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          property_id?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_stage_history: {
        Row: {
          changed_at: string
          changed_by: string
          from_stage: string | null
          id: string
          note: string | null
          pipeline_entry_id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          from_stage?: string | null
          id?: string
          note?: string | null
          pipeline_entry_id: string
          to_stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          from_stage?: string | null
          id?: string
          note?: string | null
          pipeline_entry_id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_stage_history_pipeline_entry_id_fkey"
            columns: ["pipeline_entry_id"]
            isOneToOne: false
            referencedRelation: "pipeline_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      rentcast_requests: {
        Row: {
          billable: boolean
          endpoint: string
          error: string | null
          id: string
          owner_id: string
          owner_type: string
          property_id: string | null
          requested_at: string
          status_code: number | null
          succeeded: boolean
        }
        Insert: {
          billable?: boolean
          endpoint: string
          error?: string | null
          id?: string
          owner_id: string
          owner_type: string
          property_id?: string | null
          requested_at?: string
          status_code?: number | null
          succeeded: boolean
        }
        Update: {
          billable?: boolean
          endpoint?: string
          error?: string | null
          id?: string
          owner_id?: string
          owner_type?: string
          property_id?: string | null
          requested_at?: string
          status_code?: number | null
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rentcast_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goal_history: {
        Row: {
          balance: number
          goal_id: string
          id: string
          recorded_at: string
        }
        Insert: {
          balance: number
          goal_id: string
          id?: string
          recorded_at?: string
        }
        Update: {
          balance?: number
          goal_id?: string
          id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goal_history_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          current_balance: number
          goal_type: string
          icon: string
          id: string
          last_synced_at: string | null
          name: string
          notified_drop: boolean
          owner_id: string
          owner_type: string
          previous_balance: number
          status: string
          target_amount: number | null
          target_date: string | null
        }
        Insert: {
          created_at?: string
          current_balance?: number
          goal_type: string
          icon?: string
          id?: string
          last_synced_at?: string | null
          name: string
          notified_drop?: boolean
          owner_id: string
          owner_type: string
          previous_balance?: number
          status?: string
          target_amount?: number | null
          target_date?: string | null
        }
        Update: {
          created_at?: string
          current_balance?: number
          goal_type?: string
          icon?: string
          id?: string
          last_synced_at?: string | null
          name?: string
          notified_drop?: boolean
          owner_id?: string
          owner_type?: string
          previous_balance?: number
          status?: string
          target_amount?: number | null
          target_date?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          auto_generated: boolean
          cadence_step: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          due_date: string
          id: string
          pipeline_entry_id: string
          status: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          auto_generated?: boolean
          cadence_step?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_date: string
          id?: string
          pipeline_entry_id: string
          status?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          auto_generated?: boolean
          cadence_step?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_date?: string
          id?: string
          pipeline_entry_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_pipeline_entry_id_fkey"
            columns: ["pipeline_entry_id"]
            isOneToOne: false
            referencedRelation: "pipeline_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          accepted: boolean | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          team_id: string
          token: string
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          team_id: string
          token: string
        }
        Update: {
          accepted?: boolean | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_shared_accounts: {
        Row: {
          id: string
          owner_user_id: string
          plaid_item_id: string
          shared_at: string
          team_id: string
        }
        Insert: {
          id?: string
          owner_user_id: string
          plaid_item_id: string
          shared_at?: string
          team_id: string
        }
        Update: {
          id?: string
          owner_user_id?: string
          plaid_item_id?: string
          shared_at?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_shared_accounts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          date: string
          id: string
          is_manual: boolean
          merchant_name: string
          note: string | null
          plaid_transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          date: string
          id?: string
          is_manual?: boolean
          merchant_name: string
          note?: string | null
          plaid_transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          date?: string
          id?: string
          is_manual?: boolean
          merchant_name?: string
          note?: string | null
          plaid_transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding: {
        Row: {
          added_asset: boolean
          added_debt: boolean
          added_savings_goal: boolean
          connected_bank: boolean
          created_at: string
          dismissed_at: string | null
          set_up_budget: boolean
          user_id: string
        }
        Insert: {
          added_asset?: boolean
          added_debt?: boolean
          added_savings_goal?: boolean
          connected_bank?: boolean
          created_at?: string
          dismissed_at?: string | null
          set_up_budget?: boolean
          user_id: string
        }
        Update: {
          added_asset?: boolean
          added_debt?: boolean
          added_savings_goal?: boolean
          connected_bank?: boolean
          created_at?: string
          dismissed_at?: string | null
          set_up_budget?: boolean
          user_id?: string
        }
        Relationships: []
      }
      valuations: {
        Row: {
          active_comp_count: number
          comp_ids: string[]
          created_at: string
          created_by: string
          id: string
          kind: string
          note: string | null
          owner_id: string
          owner_type: string
          property_id: string
          removed_comp_count: number
          sold_comp_count: number
          source: string
          superseded_at: string | null
          value: number
          value_high: number | null
          value_low: number | null
        }
        Insert: {
          active_comp_count?: number
          comp_ids?: string[]
          created_at?: string
          created_by: string
          id?: string
          kind: string
          note?: string | null
          owner_id: string
          owner_type: string
          property_id: string
          removed_comp_count?: number
          sold_comp_count?: number
          source: string
          superseded_at?: string | null
          value: number
          value_high?: number | null
          value_low?: number | null
        }
        Update: {
          active_comp_count?: number
          comp_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          note?: string | null
          owner_id?: string
          owner_type?: string
          property_id?: string
          removed_comp_count?: number
          sold_comp_count?: number
          source?: string
          superseded_at?: string | null
          value?: number
          value_high?: number | null
          value_low?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "valuations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      crm_change_stage: {
        Args: {
          p_entry_id: string
          p_note?: string
          p_to_stage: string
          p_user_id: string
        }
        Returns: {
          assigned_to: string | null
          created_at: string
          created_by: string
          id: string
          owner_id: string
          owner_type: string
          property_id: string
          source: string
          stage: string
          stage_since: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pipeline_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crm_complete_task: {
        Args: { p_task_id: string; p_user_id: string }
        Returns: {
          assigned_to: string | null
          auto_generated: boolean
          cadence_step: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          due_date: string
          id: string
          pipeline_entry_id: string
          status: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_team_ids: {
        Args: never
        Returns: {
          team_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_org_admin_or_owner: { Args: { p_org_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
