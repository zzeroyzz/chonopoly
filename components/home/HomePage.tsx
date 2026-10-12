"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, Mail, MapPin, Clock, ShieldCheck } from "lucide-react";

/**
 * Public marketing page at "/".
 *
 * This used to redirect straight into /finances, which is what made the whole
 * app behave as though budgeting were the front door. Now the root is what a
 * seller sees, and the app lives behind a login.
 *
 * The seller form is a placeholder until the CRM's phase 5 endpoint exists —
 * submissions there create a property, a contact and a web_form activity. Until
 * that route is built this collects nothing; it says so rather than pretending
 * to send.
 */

const SELLING_POINTS = [
  {
    icon: <Clock size={18} />,
    title: "Close on your timeline",
    body: "Two weeks or two months. You pick the date and we work to it.",
  },
  {
    icon: <ShieldCheck size={18} />,
    title: "No repairs, no cleanup",
    body: "We buy as-is. Leave what you don't want — the condition is our problem.",
  },
  {
    icon: <MapPin size={18} />,
    title: "Local to Georgia",
    body: "We know the counties, the closing attorneys, and what houses here actually sell for.",
  },
];

export function HomePage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="min-h-screen bg-(--color-base) text-(--color-text-primary)">
      {/* Header */}
      <header className="px-5 lg:px-10 py-5 flex items-center justify-between border-b border-(--color-border-subtle)">
        <span className="text-[13px] uppercase tracking-[0.12em] font-medium">
          Park Hawkins Properties
        </span>
        <a href="#contact" className="text-[13px] text-(--color-accent)">
          Get an offer
        </a>
      </header>

      {/* Hero */}
      <section className="px-5 lg:px-10 pt-12 pb-10 lg:pt-20 lg:pb-16">
        <div className="grid gap-4" style={{ alignContent: "start" }}>
          <h1 className="text-[34px] lg:text-[54px] font-bold leading-[1.05] max-w-3xl">
            Sell your Georgia house without listing it.
          </h1>
          <p className="text-[15px] lg:text-[17px] text-(--color-text-secondary) max-w-2xl leading-relaxed">
            No agent, no showings, no repairs. Tell us about the property and we&apos;ll come back
            with a cash offer and a closing date that works for you.
          </p>
          <div className="mt-2">
            <a
              href="#contact"
              className="inline-flex items-center h-11 px-5 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold"
            >
              Tell us about your property
            </a>
          </div>
        </div>
      </section>

      {/* Selling points */}
      <section className="px-5 lg:px-10 pb-12">
        <div className="grid gap-4 lg:grid-cols-3" style={{ alignContent: "start" }}>
          {SELLING_POINTS.map((p) => (
            <div
              key={p.title}
              className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-5 shadow-[var(--shadow-sm)]"
            >
              <span className="text-(--color-accent)">{p.icon}</span>
              <h2 className="text-[16px] font-semibold mt-3">{p.title}</h2>
              <p className="text-[13px] text-(--color-text-secondary) mt-1.5 leading-relaxed">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="px-5 lg:px-10 pb-16">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-5 lg:p-8 max-w-2xl">
          <h2 className="text-[20px] font-semibold">Get a cash offer</h2>
          <p className="text-[13px] text-(--color-text-secondary) mt-1.5">
            No obligation. We&apos;ll follow up within a day.
          </p>

          {submitted ? (
            <p className="text-[14px] text-(--color-accent) mt-6">
              Thanks — we&apos;ll be in touch shortly.
            </p>
          ) : (
            <form
              className="grid gap-3 mt-5"
              style={{ alignContent: "start" }}
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
            >
              <Field label="Your name" name="name" />
              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Phone" name="phone" type="tel" />
                <Field label="Email" name="email" type="email" />
              </div>
              <Field label="Property address" name="address" />
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
                  Anything we should know
                </span>
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-1.5 w-full rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) px-3 py-2 text-[14px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent) transition-colors"
                />
              </label>
              {/* Honeypot — real people never fill this, bots usually do. */}
              <input
                type="text"
                name="company_website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
              <button
                type="submit"
                className="h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold mt-1"
              >
                Send
              </button>
              <p className="text-[11px] text-(--color-text-tertiary)">
                Not yet wired to the CRM — this form doesn&apos;t send anywhere until the intake
                endpoint is built.
              </p>
            </form>
          )}

          <div className="flex flex-wrap gap-4 mt-6 pt-5 border-t border-(--color-border-subtle) text-[13px] text-(--color-text-secondary)">
            <span className="flex items-center gap-2">
              <Phone size={14} className="text-(--color-text-tertiary)" /> (000) 000-0000
            </span>
            <span className="flex items-center gap-2">
              <Mail size={14} className="text-(--color-text-tertiary)" /> hello@parkhawkins.com
            </span>
          </div>
        </div>
      </section>

      {/* Footer — the way in. Unadvertised, not secret: the route itself is
          protected by proxy.ts, which is what actually keeps people out. */}
      <footer className="px-5 lg:px-10 py-6 border-t border-(--color-border-subtle) flex items-center justify-between">
        <span className="text-[11px] text-(--color-text-tertiary)">
          © {new Date().getFullYear()} Park Hawkins Properties
        </span>
        <Link href="/login" className="text-[11px] text-(--color-text-disabled) hover:text-(--color-text-tertiary) transition-colors">
          Staff
        </Link>
      </footer>
    </div>
  );
}

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
        {label}
      </span>
      <input
        type={type}
        name={name}
        className="mt-1.5 w-full h-11 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) px-3 text-[14px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent) transition-colors"
      />
    </label>
  );
}
