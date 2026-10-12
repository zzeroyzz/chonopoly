import {
  type ContactPhone,
  type EmailSuppressionReason,
  type PhoneSuppressionReason,
} from "./types";

/**
 * Display rules for suppressed phone numbers and email addresses.
 *
 * Read this before changing anything here: the UI treatment is a WARNING, not
 * the protection. Nothing in this file stops a call or a text going out. The
 * real control is the provider adapter refusing the send server-side, which is
 * phase 4. If a future change makes this module look like an enforcement point,
 * it is lying.
 */

export const PHONE_SUPPRESSION_LABEL: Record<PhoneSuppressionReason, string> = {
  federal_dnc: "Federal DNC",
  seller_request: "Seller asked us to stop",
  wrong_number: "Wrong number",
};

export const EMAIL_SUPPRESSION_LABEL: Record<EmailSuppressionReason, string> = {
  unsubscribed: "Unsubscribed",
  seller_request: "Seller asked us to stop",
  wrong_address: "Wrong address",
};

export interface SuppressionDisplay {
  /** Strike the number through rather than hiding it. */
  strikeThrough: boolean;
  /** Render as a `tel:` link. */
  allowTelLink: boolean;
  /** Show the copy-to-clipboard affordance. */
  allowCopy: boolean;
  /** The reason, shown next to the number. Null when not suppressed. */
  reasonLabel: string | null;
}

const NOT_SUPPRESSED: SuppressionDisplay = {
  strikeThrough: false,
  allowTelLink: true,
  allowCopy: true,
  reasonLabel: null,
};

/**
 * A suppressed number stays visible, struck through, with the reason next to it.
 *
 * Hiding it doesn't suppress the call — it moves the lookup somewhere nobody can
 * flag it. An absent number is an invitation to go find it on Whitepages, and
 * the number found that way carries none of this record.
 */
export function phoneDisplay(phone: Pick<ContactPhone, "suppression_reason">): SuppressionDisplay {
  if (phone.suppression_reason === null) return NOT_SUPPRESSED;
  return {
    strikeThrough: true,
    allowTelLink: false,
    allowCopy: false,
    reasonLabel: PHONE_SUPPRESSION_LABEL[phone.suppression_reason],
  };
}

export function emailDisplay(email: {
  suppression_reason: EmailSuppressionReason | null;
}): SuppressionDisplay {
  if (email.suppression_reason === null) return NOT_SUPPRESSED;
  return {
    strikeThrough: true,
    allowTelLink: false,
    allowCopy: false,
    reasonLabel: EMAIL_SUPPRESSION_LABEL[email.suppression_reason],
  };
}

export function isSuppressed(phone: Pick<ContactPhone, "suppression_reason">): boolean {
  return phone.suppression_reason !== null;
}

/**
 * A disconnected number is not suppressed — nobody asked us to stop, the line
 * just doesn't work. It stays dialable because status is often wrong.
 */
export function isDialable(phone: Pick<ContactPhone, "suppression_reason">): boolean {
  return !isSuppressed(phone);
}

/**
 * The number to dial first: primary if it's dialable, else the first dialable
 * one. Null when every number on the contact is suppressed — which the caller
 * should say out loud rather than silently showing nothing.
 */
export function preferredPhone(phones: ContactPhone[]): ContactPhone | null {
  const dialable = phones.filter(isDialable);
  if (dialable.length === 0) return null;
  return dialable.find((p) => p.is_primary) ?? dialable[0];
}

/**
 * The suppression columns are only meaningful together: a reason with no
 * timestamp and no user can't show *when* we knew, which is the whole point of
 * recording it. The database enforces this with a CHECK; this mirrors it so a
 * form can refuse before a round trip.
 */
export function isAttributedSuppression(phone: Pick<
  ContactPhone,
  "suppression_reason" | "suppressed_at" | "suppressed_by"
>): boolean {
  if (phone.suppression_reason === null) return true;
  return phone.suppressed_at !== null && phone.suppressed_by !== null;
}
