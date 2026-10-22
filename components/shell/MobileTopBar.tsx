/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";

/**
 * The header: the mark, centred, and nothing else.
 *
 * It held the app's name set in small caps on the left and your avatar on the
 * right. Both went: the name was a line of text doing a logo's job, and the
 * avatar is in the bottom bar now, where a thumb can reach it — two of them
 * meant two ways to the same screen, one of them out of reach.
 *
 * The mark is a link home rather than decoration, because a logo in the middle
 * of a header is the one thing people tap when they want to start again.
 */
export function MobileTopBar() {
  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-(--color-base) border-b border-(--color-border-subtle) flex items-center justify-center px-4 shrink-0">
      <Link href="/properties" aria-label="Park Hawkins Capital" className="flex items-center">
        <img src="/ph-logo.svg" alt="" className="h-8 w-8" />
      </Link>
    </div>
  );
}
