"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, ExternalLink, MapPin, Phone, Plus } from "lucide-react";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { dollars } from "@/components/mortgage/format";
import { type Company, type PortfolioHouse } from "@/lib/crm/types";
import { CopyButton } from "@/components/ui/CopyButton";
import { useCrmContext } from "./useCrmContext";

/**
 * One company, and what they have.
 *
 * The portfolio is the point. Each row is a real property — the same table and
 * the same screening as anything in Properties — so a lender's whole inventory
 * can be run through the numbers rather than just listed.
 */

/** What a house in a portfolio says about itself under its address. */
export function houseLine(house: PortfolioHouse): string {
  const facts = [
    house.beds === null ? null : `${house.beds} bed`,
    house.baths === null ? null : `${house.baths} bath`,
    house.sqft === null ? null : `${house.sqft.toLocaleString()} sq ft`,
  ].filter(Boolean);

  if (facts.length === 0) return "No details recorded yet";
  return facts.join(" · ");
}

/** The asking price, or the fact that nobody has recorded one. */
export function priceLine(house: PortfolioHouse): string {
  return house.listPrice === null ? "No asking price yet" : dollars(house.listPrice, 0);
}

export function CompanyDetailPage({ companyId }: { companyId: string }) {
  const { ctxParams } = useCrmContext();
  const [company, setCompany] = useState<Company | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctxParams) return;
    let cancelled = false;

    // In the effect, not a callback it calls — see CompaniesPage.
    void (async () => {
      try {
        const res = await fetch(`/api/crm/companies/${companyId}?${ctxParams}`);
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        const data = await res.json();
        if (cancelled) return;
        setError(null);
        setCompany(data.detail.company);
        setPortfolio(data.detail.portfolio ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load that company");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctxParams, companyId]);

  const address = company
    ? [company.addressLine1, company.city, company.state, company.zip].filter(Boolean).join(", ")
    : "";

  return (
    <div className="overflow-y-auto flex-1 w-full px-4 pb-24 lg:px-8 lg:pb-8 max-w-3xl">
      <Link
        href="/companies"
        data-testid="back-to-companies"
        className="inline-flex items-center gap-1.5 text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors mt-4 mb-3"
      >
        <ArrowLeft size={13} /> Companies
      </Link>

      {error && (
        <div
          data-testid="company-error"
          className="mb-3 text-[12px] text-(--color-danger) border border-(--color-danger) rounded-(--radius-md) px-3 py-2"
        >
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonRegion label="Loading this company" testId="company-loading">
          <Skeleton className="h-20 w-full rounded-(--radius-xl)" />
          <Skeleton className="h-16 w-full rounded-(--radius-lg) mt-3" />
        </SkeletonRegion>
      ) : company === null ? null : (
        <>
          <div className="rounded-(--radius-xl) border border-(--color-border-default) bg-(--color-elevated) p-4">
            <div className="flex items-start gap-3">
              <span className="shrink-0 flex items-center justify-center w-11 h-11 rounded-(--radius-lg) bg-(--color-surface) text-(--color-text-secondary)">
                <Building2 size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h1
                  data-testid="company-name-heading"
                  className="text-[18px] font-semibold text-(--color-text-primary) wrap-break-word leading-snug"
                >
                  {company.name}
                </h1>
                {company.website && (
                  <a
                    href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="company-website-link"
                    className="inline-flex items-center gap-1 text-[12px] text-(--color-accent) mt-0.5"
                  >
                    Their listings
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>

            {(company.phone || address) && (
              <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-(--color-border-subtle)">
                {company.phone && (
                  <div className="flex items-center gap-2 text-[13px] text-(--color-text-primary)">
                    <Phone size={13} className="shrink-0 text-(--color-text-secondary)" />
                    <a href={`tel:${company.phone}`} data-testid="company-phone-link">
                      {company.phone}
                    </a>
                    <CopyButton value={company.phone} label="Phone" testId="copy-company-phone" />
                  </div>
                )}
                {address && (
                  <div className="flex items-start gap-2 text-[13px] text-(--color-text-primary)">
                    <MapPin size={13} className="shrink-0 mt-0.5 text-(--color-text-secondary)" />
                    <span className="min-w-0">{address}</span>
                    <CopyButton value={address} label="Address" testId="copy-company-address" />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between gap-3 mt-5 mb-1">
            <h2 className="text-[15px] font-semibold text-(--color-text-primary)">
              Their portfolio
            </h2>
            <Link
              href={`/properties/new?company=${companyId}`}
              data-testid="add-house-to-portfolio"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-(--radius-pill)
                bg-(--color-accent) text-(--color-base) text-[13px] font-semibold"
            >
              <Plus size={14} />
              Add a house
            </Link>
          </div>

          {portfolio.length === 0 ? (
            <div
              data-testid="portfolio-empty"
              className="border border-(--color-border-default) rounded-(--radius-lg) px-4 py-8 text-center mt-2"
            >
              <p className="text-[14px] font-medium text-(--color-text-primary)">
                No houses from them yet
              </p>
              <p className="text-[12px] text-(--color-text-secondary) mt-1 leading-relaxed">
                Add one and it works like any other house — the same resale
                check, the same numbers, the same answer on whether the deal
                works.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 mt-2">
              {portfolio.map((house) => (
                <li key={house.propertyId}>
                  <Link
                    href={`/properties/${house.propertyId}`}
                    data-testid={`portfolio-${house.propertyId}`}
                    className="flex items-center gap-3 p-3 rounded-(--radius-lg)
                      border border-(--color-border-default) bg-(--color-surface)
                      hover:border-(--color-border-strong) transition-colors"
                  >
                    {house.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={house.photoUrl}
                        alt=""
                        className="shrink-0 w-14 h-14 rounded-(--radius-md) object-cover"
                      />
                    ) : (
                      <span className="shrink-0 w-14 h-14 rounded-(--radius-md) bg-(--color-elevated)" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-(--color-text-primary) truncate">
                        {house.address}
                      </span>
                      <span className="block text-[12px] text-(--color-text-secondary) truncate">
                        {house.cityStateZip}
                      </span>
                      <span className="block text-[12px] text-(--color-text-secondary) mt-0.5">
                        {priceLine(house)} · {houseLine(house)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
