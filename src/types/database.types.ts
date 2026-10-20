export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'owner' | 'admin' | 'member';
export type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
export type CallOutcome =
  | 'answered_by_business'
  | 'forwarded_to_ai'
  | 'missed_call_texted'
  | 'caller_abandoned'
  | 'caller_abandoned_before_ai'
  | 'ai_conversation_completed'
  | 'voicemail';
export type MessageDirection = 'inbound' | 'outbound_api';
export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'received';
export type MessageType = 'missed_call_auto_reply' | 'manual_chat' | 'system_alert';
export type ReviewReplyStatus = 'pending' | 'generating' | 'manual_review' | 'published' | 'failed' | 'skipped';
export type SentimentType = 'positive' | 'neutral' | 'negative';
export type OptOutSource = 'inbound_stop' | 'manual_admin' | 'api';
export type A2PStatus = 'unregistered' | 'pending' | 'approved' | 'failed';

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          business_phone: string | null;
          business_address: string | null;
          timezone: string;
          business_hours: Json;
          ai_receptionist_prompt: string | null;
          vapi_assistant_id: string | null;
          vapi_phone_number_id: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          subscription_status: string;
          monthly_voice_minutes_limit: number;
          monthly_sms_limit: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['organizations']['Row']> & { name: string; slug: string };
        Update: Partial<Database['public']['Tables']['organizations']['Row']>;
      };
      users: {
        Row: {
          id: string;
          organization_id: string | null;
          role: UserRole;
          email: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['users']['Row']> & { id: string; email: string };
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      twilio_configs: {
        Row: {
          id: string;
          organization_id: string;
          label: string;
          is_primary: boolean;
          twilio_phone_number: string;
          twilio_phone_sid: string | null;
          twilio_twiml_bin_sid: string | null;
          forward_to_number: string;
          forward_timeout_seconds: number;
          abandon_threshold_seconds: number;
          missed_call_sms_enabled: boolean;
          missed_call_sms_template: string;
          ai_voice_enabled: boolean;
          after_hours_direct_to_ai: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['twilio_configs']['Row']> & {
          organization_id: string;
          twilio_phone_number: string;
          forward_to_number: string;
        };
        Update: Partial<Database['public']['Tables']['twilio_configs']['Row']>;
      };
      call_logs: {
        Row: {
          id: string;
          organization_id: string;
          call_sid: string;
          parent_call_sid: string | null;
          child_call_sid: string | null;
          from_number: string;
          to_number: string;
          status: CallStatus;
          outcome: CallOutcome | null;
          vapi_ended_reason: string | null;
          duration_seconds: number;
          vapi_call_id: string | null;
          caller_name: string | null;
          recording_url: string | null;
          transcript: string | null;
          ai_summary: string | null;
          sms_rescued: boolean;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['call_logs']['Row']> & {
          organization_id: string;
          call_sid: string;
          from_number: string;
          to_number: string;
        };
        Update: Partial<Database['public']['Tables']['call_logs']['Row']>;
      };
      messages: {
        Row: {
          id: string;
          organization_id: string;
          call_log_id: string | null;
          message_sid: string | null;
          from_number: string;
          to_number: string;
          body: string;
          direction: MessageDirection;
          status: MessageStatus;
          type: MessageType;
          error_code: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['messages']['Row']> & {
          organization_id: string;
          from_number: string;
          to_number: string;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Row']>;
      };
      reviews: {
        Row: {
          id: string;
          organization_id: string;
          google_review_id: string;
          reviewer_name: string;
          reviewer_photo_url: string | null;
          star_rating: number;
          comment: string | null;
          review_created_at: string;
          sentiment: SentimentType | null;
          reply_text: string | null;
          reply_status: ReviewReplyStatus;
          approved_by: string | null;
          approved_at: string | null;
          ai_model: string | null;
          ai_generated_at: string | null;
          reply_published_at: string | null;
          reply_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['reviews']['Row']> & {
          organization_id: string;
          google_review_id: string;
          reviewer_name: string;
          star_rating: number;
          review_created_at: string;
        };
        Update: Partial<Database['public']['Tables']['reviews']['Row']>;
      };
      usage_records: {
        Row: {
          id: string;
          organization_id: string;
          billing_period_start: string;
          billing_period_end: string;
          ai_voice_seconds_used: number;
          sms_messages_sent: number;
          ai_review_replies_generated: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['usage_records']['Row']> & {
          organization_id: string;
          billing_period_start: string;
          billing_period_end: string;
        };
        Update: Partial<Database['public']['Tables']['usage_records']['Row']>;
      };
      sms_opt_outs: {
        Row: {
          id: string;
          organization_id: string;
          phone_number: string;
          opted_out_at: string;
          source: OptOutSource;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['sms_opt_outs']['Row']> & {
          organization_id: string;
          phone_number: string;
        };
        Update: Partial<Database['public']['Tables']['sms_opt_outs']['Row']>;
      };
      a2p_registrations: {
        Row: {
          id: string;
          organization_id: string;
          brand_sid: string | null;
          campaign_sid: string | null;
          messaging_service_sid: string | null;
          status: A2PStatus;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['a2p_registrations']['Row']> & {
          organization_id: string;
        };
        Update: Partial<Database['public']['Tables']['a2p_registrations']['Row']>;
      };
    };
  };
}
