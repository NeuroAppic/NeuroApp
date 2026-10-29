/**
 * Tipos de domínio compartilhados entre servidor e cliente.
 * Espelham as colunas expostas pelo banco (ver supabase/migrations).
 * Para tipos gerados automaticamente: `npm run db:types`.
 */

export const CONVERSATION_STATUSES = [
  "ai_active",
  "waiting_human",
  "human_active",
  "closed",
  "archived",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type MessageSender = "user" | "ai" | "staff" | "system";
export type MessageInputSource = "typed" | "quick" | "guided";
export type RiskLevel = "none" | "attention" | "high" | "critical";
export type StaffRole = "superadmin" | "admin" | "psychologist";
export type StaffAvailability = "offline" | "available" | "busy" | "away";
export type CredentialStatus = "pending" | "verified" | "rejected";

/** Mensagem como o portal a recebe (sem colunas internas). */
export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender: MessageSender;
  sender_label: string | null;
  content: string;
  client_message_id: string | null;
  input_source: MessageInputSource | null;
  reply_to_id: string | null;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  status: ConversationStatus;
  state_version: number;
  assigned_label: string | null;
  created_at: string;
  closed_at: string | null;
  last_message_at: string;
}

export interface QueueConversation extends ConversationSummary {
  user_id: string | null;
  priority: boolean;
  risk_level: RiskLevel;
  assigned_staff_id: string | null;
}

export interface QuickMessage {
  id: string;
  category: "essenciais" | "sentimentos" | "pedidos";
  label: string;
  message: string;
  sort_order: number;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  description: string;
  url?: string;
}

export interface EmergencyContacts {
  country: string;
  contacts: EmergencyContact[];
}

export type AudioCategory =
  | "brown_noise"
  | "white_noise"
  | "pink_noise"
  | "rain"
  | "nature"
  | "fan"
  | "water"
  | "ambient";

export type DemoGenerator = "white" | "pink" | "brown" | "rain" | "fan" | "water" | "wind";

export interface AudioTrack {
  id: string;
  title: string;
  description: string | null;
  category: AudioCategory;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  is_demo: boolean;
  demo_generator: DemoGenerator | null;
  color: string;
  icon: string;
  is_published: boolean;
  sort_order: number;
}

/** Faixa pronta para tocar: URL assinada (arquivo) ou gerador (demonstração). */
export interface PlayableTrack extends AudioTrack {
  url: string | null;
}

export interface StaffMember {
  user_id: string;
  full_name: string;
  display_name: string;
  professional_title: string | null;
  professional_registry: string | null;
  credential_status: CredentialStatus;
  is_active: boolean;
  availability: StaffAvailability;
  last_seen_at: string | null;
  roles: StaffRole[];
}
