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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      attendance: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          ip_address: string | null
          status: string
          user_id: string
          added_by: string | null
          notes: string | null
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          status?: string
          user_id: string
          added_by?: string | null
          notes?: string | null
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          status?: string
          user_id?: string
          added_by?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          assigned_to: string
          assigned_by: string
          priority: string
          status: string
          due_date: string | null
          started_at: string | null
          completed_at: string | null
          completion_note: string | null
          progress: number
          category: string | null
          account_id: string | null
          daily_target: number | null
          daily_achieved: number
          is_recurring: boolean
          recurrence: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          assigned_to: string
          assigned_by: string
          priority?: string
          status?: string
          due_date?: string | null
          started_at?: string | null
          completed_at?: string | null
          completion_note?: string | null
          progress?: number
          category?: string | null
          account_id?: string | null
          daily_target?: number | null
          daily_achieved?: number
          is_recurring?: boolean
          recurrence?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          assigned_to?: string
          assigned_by?: string
          priority?: string
          status?: string
          due_date?: string | null
          started_at?: string | null
          completed_at?: string | null
          completion_note?: string | null
          progress?: number
          category?: string | null
          account_id?: string | null
          daily_target?: number | null
          daily_achieved?: number
          is_recurring?: boolean
          recurrence?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      managed_accounts: {
        Row: {
          id: string
          name: string
          platform: string
          url: string | null
          description: string | null
          assigned_to: string
          created_by: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          platform?: string
          url?: string | null
          description?: string | null
          assigned_to: string
          created_by: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          platform?: string
          url?: string | null
          description?: string | null
          assigned_to?: string
          created_by?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_templates: {
        Row: {
          id: string
          title: string
          description: string | null
          position: string
          default_priority: string
          default_category: string | null
          daily_target: number | null
          is_active: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          position: string
          default_priority?: string
          default_category?: string | null
          daily_target?: number | null
          is_active?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          position?: string
          default_priority?: string
          default_category?: string | null
          daily_target?: number | null
          is_active?: boolean
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          id: string
          user_id: string
          leave_type: string
          start_date: string
          end_date: string
          reason: string
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          leave_type: string
          start_date: string
          end_date: string
          reason: string
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          leave_type?: string
          start_date?: string
          end_date?: string
          reason?: string
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      employee_schedules: {
        Row: {
          id: string
          user_id: string
          schedule: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          schedule?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          schedule?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_resets: {
        Row: {
          id: string
          user_id: string
          reset_month: string
          reset_at: string
          reset_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          reset_month: string
          reset_at?: string
          reset_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          reset_month?: string
          reset_at?: string
          reset_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          base_salary: number | null
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
          is_approved: boolean
          phone: string | null
          position: string | null
          rules_accepted: boolean
          updated_at: string
          user_id: string
          date_of_birth: string | null
          address: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          national_id: string | null
          archived: boolean
          archived_at: string | null
          archive_reason: string | null
          hire_date: string | null
          matricule: string | null
          counters_reset_at: string | null
          is_paused: boolean
          paused_at: string | null
        }
        Insert: {
          base_salary?: number | null
          created_at?: string
          department?: string | null
          email: string
          full_name: string
          id?: string
          is_approved?: boolean
          phone?: string | null
          position?: string | null
          rules_accepted?: boolean
          updated_at?: string
          user_id: string
          date_of_birth?: string | null
          address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          national_id?: string | null
          archived?: boolean
          archived_at?: string | null
          archive_reason?: string | null
          hire_date?: string | null
          matricule?: string | null
          counters_reset_at?: string | null
          is_paused?: boolean
          paused_at?: string | null
        }
        Update: {
          base_salary?: number | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          phone?: string | null
          position?: string | null
          rules_accepted?: boolean
          updated_at?: string
          user_id?: string
          date_of_birth?: string | null
          address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          national_id?: string | null
          archived?: boolean
          archived_at?: string | null
          archive_reason?: string | null
          hire_date?: string | null
          matricule?: string | null
          counters_reset_at?: string | null
          is_paused?: boolean
          paused_at?: string | null
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          id: string
          user_id: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          uploaded_at: string
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          rejection_reason: string | null
        }
        Insert: {
          id?: string
          user_id: string
          document_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          uploaded_at?: string
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          rejection_reason?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          uploaded_at?: string
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          rejection_reason?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          id: string
          task_id: string
          user_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      task_checklist: {
        Row: {
          id: string
          task_id: string
          label: string
          is_done: boolean
          sort_order: number
        }
        Insert: {
          id?: string
          task_id: string
          label: string
          is_done?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          task_id?: string
          label?: string
          is_done?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          id: string
          user_id: string
          report_date: string
          tasks_done: string
          tasks_in_progress: string | null
          blockers: string | null
          plans_tomorrow: string | null
          mood: string
          hours_worked: number | null
          admin_note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          report_date: string
          tasks_done: string
          tasks_in_progress?: string | null
          blockers?: string | null
          plans_tomorrow?: string | null
          mood?: string
          hours_worked?: number | null
          admin_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          report_date?: string
          tasks_done?: string
          tasks_in_progress?: string | null
          blockers?: string | null
          plans_tomorrow?: string | null
          mood?: string
          hours_worked?: number | null
          admin_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_suggestions: {
        Row: {
          id: string
          department: string
          position: string | null
          title: string
          description: string | null
          priority: string
          category: string | null
          is_recurring_suggestion: boolean
          recurrence: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          department: string
          position?: string | null
          title: string
          description?: string | null
          priority?: string
          category?: string | null
          is_recurring_suggestion?: boolean
          recurrence?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          department?: string
          position?: string | null
          title?: string
          description?: string | null
          priority?: string
          category?: string | null
          is_recurring_suggestion?: boolean
          recurrence?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          permission: string
          granted: boolean
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          permission: string
          granted?: boolean
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          permission?: string
          granted?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_permission: {
        Args: { _user_id: string; _permission: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "bureau" | "terrain"
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
      app_role: ["admin", "manager", "bureau", "terrain"],
    },
  },
} as const
