"use client";

import { Ban, Phone, Mail, Star } from "lucide-react";
import { emailDisplay, phoneDisplay } from "@/lib/crm/suppression";
import { type ContactEmail, type ContactPhone, type ContactWithChannels } from "@/lib/crm/types";

/**
 * A contact and its channels.
 *
 * A suppressed number stays on screen, struck through, with the reason next to
 * it. Hiding it does not suppress the call — it moves the lookup somewhere
 * nobody can flag it, and the number found on Whitepages carries none of this
 * record.
 *
 * Read this before treating any of it as a safety control: **the strike-through
 * is a warning, not the protection.** Nothing on this screen stops a send. The
 * real control is the provider adapter refusing it server-side, in phase 4.
 */

const RELATIONSHIP_LABEL: Record<string, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  heir: "Heir",
  agent: "Agent",
  tenant: "Tenant",
  neighbor: "Neighbor",
  unknown: "Unknown",
};

function PhoneRow({ phone }: { phone: ContactPhone }) {
  const d = phoneDisplay(phone);

  return (
    <li className="flex items-center gap-2 text-[13px] min-w-0" data-testid="contact-phone">
      <Phone size={12} className="text-(--color-text-tertiary) shrink-0" />
      {d.allowTelLink ? (
        <a href={`tel:${phone.number}`} className="text-(--color-text-primary) hover:underline truncate">
          {phone.number}
        </a>
      ) : (
        <span className="line-through text-(--color-text-tertiary) truncate" data-testid="suppressed-phone">
          {phone.number}
        </span>
      )}
      {phone.is_primary && <Star size={10} className="text-(--color-accent) shrink-0" />}
      {d.reasonLabel && (
        <span className="inline-flex items-center gap-1 text-[10px] text-(--color-danger) shrink-0">
          <Ban size={10} /> {d.reasonLabel}
        </span>
      )}
    </li>
  );
}

function EmailRow({ email }: { email: ContactEmail }) {
  const d = emailDisplay(email);

  return (
    <li className="flex items-center gap-2 text-[13px] min-w-0" data-testid="contact-email">
      <Mail size={12} className="text-(--color-text-tertiary) shrink-0" />
      {d.allowTelLink ? (
        <a href={`mailto:${email.email}`} className="text-(--color-text-primary) hover:underline truncate">
          {email.email}
        </a>
      ) : (
        <span className="line-through text-(--color-text-tertiary) truncate">{email.email}</span>
      )}
      {d.reasonLabel && (
        <span className="inline-flex items-center gap-1 text-[10px] text-(--color-danger) shrink-0">
          <Ban size={10} /> {d.reasonLabel}
        </span>
      )}
    </li>
  );
}

export function ContactCard({ contact }: { contact: ContactWithChannels }) {
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.company ||
    "Unnamed contact";

  return (
    <div className="bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-lg)] px-3.5 py-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-[14px] font-medium text-(--color-text-primary)">{name}</p>
        <span className="text-[10px] uppercase tracking-wider text-(--color-text-tertiary)">
          {RELATIONSHIP_LABEL[contact.relationship] ?? contact.relationship}
        </span>
      </div>

      {contact.company && contact.first_name && (
        <p className="text-[11px] text-(--color-text-tertiary) mt-0.5">{contact.company}</p>
      )}

      {(contact.phones.length > 0 || contact.emails.length > 0) && (
        <ul className="mt-2 grid gap-1.5">
          {contact.phones.map((p) => (
            <PhoneRow key={p.id} phone={p} />
          ))}
          {contact.emails.map((e) => (
            <EmailRow key={e.id} email={e} />
          ))}
        </ul>
      )}

      {contact.notes && (
        <p className="text-[12px] text-(--color-text-secondary) mt-2 leading-relaxed">{contact.notes}</p>
      )}
    </div>
  );
}
