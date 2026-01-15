export const FRIEND_BASICS_KEYS = [
  "user.preferred_name",
  "user.name_avoid",
  "user.pronouns_optional",
  "user.location_general",
  "user.timezone",
  "user.relationships.core",
  "user.pets",
  "user.kids",
  "user.work_background",
  "user.boundaries",
  "user.communication_style",
] as const;

export const SENSITIVE_CATEGORIES = [
  "mental_health",
  "diagnosis",
  "self_harm_history",
  "substance_use",
  "trauma_details",
  "sexual_content",
  "medical_conditions",
] as const;

export const LOCK_ON_CORRECTION_COUNT = 2;

export const RETRIEVAL_LIMIT_CORE = 12;
export const RETRIEVAL_LIMIT_NORMAL = 18;
export const RETRIEVAL_LIMIT_SENSITIVE = 8;
