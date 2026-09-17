import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddContactForm } from "./add-contact-form";
import { AddRatingForm } from "./add-rating-form";
import { AddHiringSignalForm } from "./add-hiring-signal-form";
import { AddSignalForm } from "./add-signal-form";
import { AddPainSignalForm } from "./add-pain-signal-form";
import { AddActivityForm } from "./add-activity-form";

export const dynamic = "force-dynamic";

const TABS = ["overview", "contacts", "signals", "activity"] as const;
type Tab = (typeof TABS)[number];

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab: Tab = (TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as Tab)
    : "overview";

  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      `id, name, website, company_type, address_line_1, address_line_2, city, state, country, zip, phone,
       lifecycle_stage, lead_status, prospect_tier, qualification_summary, sdr_signal_summary, portfolio_size,
       parent_company:parent_company_id ( id, name ),
       owner:owner_id ( id, name )`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!company) notFound();

  const parentCompany = company.parent_company as unknown as { id: number; name: string } | null;
  const owner = company.owner as unknown as { id: number; name: string } | null;
  const isProperty = company.company_type === "Property";

  const [
    { data: propertyDetails },
    { data: children },
    { data: contacts },
    { data: ratings },
    { data: hiringSignals },
    { data: signals },
    { data: activities },
  ] = await Promise.all([
    isProperty
      ? supabase
          .from("property_details")
          .select("id, property_type, property_class, rooms_units, portfolio_role")
          .eq("company_id", id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("companies")
      .select("id, name, company_type, city, country")
      .eq("parent_company_id", id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, job_title, contact_role, decision_maker_level")
      .eq("company_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("company_ratings").select("channel, rating, review_count, captured_at").eq("company_id", id),
    supabase
      .from("company_hiring_signals")
      .select("id, role, job_title, strength, source_url, detected_at")
      .eq("company_id", id)
      .order("detected_at", { ascending: false }),
    supabase
      .from("company_signals")
      .select("id, signal_type, strength, source_url, detected_at")
      .eq("company_id", id)
      .order("detected_at", { ascending: false }),
    supabase
      .from("activities")
      .select("id, activity_type, actor_name, body, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const { data: painSignals } = propertyDetails
    ? await supabase
        .from("property_pain_signals")
        .select("id, pain_type, source_url, detected_at")
        .eq("property_id", propertyDetails.id)
        .order("detected_at", { ascending: false })
    : { data: null };

  const tabHref = (tab: Tab) => (tab === "overview" ? `/companies/${id}` : `/companies/${id}?tab=${tab}`);
  const tabLabel: Record<Tab, string> = {
    overview: "Overview",
    contacts: `Contacts (${contacts?.length ?? 0})`,
    signals: "Signals & Ratings",
    activity: `Activity (${activities?.length ?? 0})`,
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-8">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
            Back to Companies
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900">{company.name}</h1>
        </div>
        <Link
          href={`/companies/${id}/edit`}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Edit
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className="rounded bg-zinc-100 px-2 py-0.5">{company.company_type}</span>
        <span className="rounded bg-zinc-100 px-2 py-0.5">{company.lifecycle_stage}</span>
        <span className="rounded bg-zinc-100 px-2 py-0.5">{company.lead_status}</span>
        {company.prospect_tier && (
          <span className="rounded bg-zinc-100 px-2 py-0.5">{company.prospect_tier}</span>
        )}
        {parentCompany && (
          <span className="rounded bg-zinc-100 px-2 py-0.5">
            Part of{" "}
            <Link href={`/companies/${parentCompany.id}`} className="underline">
              {parentCompany.name}
            </Link>
          </span>
        )}
      </div>

      <nav className="flex gap-1 border-b border-zinc-200">
        {TABS.map((tab) => (
          <Link
            key={tab}
            href={tabHref(tab)}
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === tab
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tabLabel[tab]}
          </Link>
        ))}
      </nav>

      {activeTab === "overview" && (
        <>
          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Overview</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-zinc-500">Website</dt>
                <dd className="text-zinc-900">{company.website ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Phone</dt>
                <dd className="text-zinc-900">{company.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Address</dt>
                <dd className="text-zinc-900">
                  {[company.address_line_1, company.address_line_2].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">City / State</dt>
                <dd className="text-zinc-900">{[company.city, company.state].filter(Boolean).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Country / Zip</dt>
                <dd className="text-zinc-900">{[company.country, company.zip].filter(Boolean).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Owner</dt>
                <dd className="text-zinc-900">{owner?.name ?? "Unassigned"}</dd>
              </div>
            </dl>
          </section>

          {propertyDetails && (
            <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Property Profile</h2>
                <AddPainSignalForm companyId={Number(id)} />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-zinc-500">Property Type</dt>
                  <dd className="text-zinc-900">{propertyDetails.property_type ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Class</dt>
                  <dd className="text-zinc-900">{propertyDetails.property_class ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Rooms/Units</dt>
                  <dd className="text-zinc-900">{propertyDetails.rooms_units ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Portfolio Role</dt>
                  <dd className="text-zinc-900">{propertyDetails.portfolio_role ?? "—"}</dd>
                </div>
              </dl>

              <div className="border-t border-zinc-100 pt-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Pain Signals
                </h3>
                {!painSignals?.length ? (
                  <p className="text-sm text-zinc-500">No pain signals logged yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {painSignals.map((p) => (
                      <li key={p.id} className="flex items-center justify-between">
                        <span className="text-zinc-900">{p.pain_type}</span>
                        <span className="text-zinc-500">{p.detected_at}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {company.company_type !== "Property" && (
            <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-zinc-900">
                Portfolio ({children?.length ?? 0} listed{" "}
                {company.portfolio_size ? `of ${company.portfolio_size} known` : ""})
              </h2>
              {!children?.length ? (
                <p className="text-sm text-zinc-500">No properties linked to this group yet.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm">
                  {children.map((child) => (
                    <li key={child.id} className="flex items-center justify-between py-2">
                      <Link href={`/companies/${child.id}`} className="font-medium text-zinc-900 hover:underline">
                        {child.name}
                      </Link>
                      <span className="text-zinc-500">
                        {child.company_type} · {[child.city, child.country].filter(Boolean).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Qualification</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Qualification Summary</dt>
                <dd className="text-zinc-900">{company.qualification_summary ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Why Now (SDR Signal Summary)</dt>
                <dd className="text-zinc-900">{company.sdr_signal_summary ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </>
      )}

      {activeTab === "contacts" && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Contacts</h2>
            <AddContactForm companyId={Number(id)} />
          </div>
          {!contacts?.length ? (
            <p className="text-sm text-zinc-500">No contacts yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {contacts.map((c) => (
                <li key={c.id} className="space-y-0.5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900">
                      {c.first_name} {c.last_name ?? ""}
                    </span>
                    <span className="text-zinc-500">{c.contact_role}</span>
                  </div>
                  <div className="text-zinc-500">
                    {[c.job_title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                    {c.decision_maker_level && ` · ${c.decision_maker_level}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === "signals" && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Ratings &amp; Reviews</h2>
              <AddRatingForm companyId={Number(id)} />
            </div>
            {!ratings?.length ? (
              <p className="text-sm text-zinc-500">No ratings logged yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm">
                {ratings.map((r) => (
                  <li key={r.channel} className="flex items-center justify-between py-2">
                    <span className="font-medium text-zinc-900">{r.channel}</span>
                    <span className="text-zinc-500">
                      {r.rating ?? "—"} ({r.review_count ?? 0} reviews)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Hiring Signals</h2>
              <AddHiringSignalForm companyId={Number(id)} />
            </div>
            {!hiringSignals?.length ? (
              <p className="text-sm text-zinc-500">No hiring signals logged yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm">
                {hiringSignals.map((h) => (
                  <li key={h.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-900">{h.role ?? h.job_title}</span>
                      <span className="text-zinc-500">{h.strength}</span>
                    </div>
                    <div className="text-zinc-500">{h.job_title} · {h.detected_at}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Sales Signals</h2>
              <AddSignalForm companyId={Number(id)} />
            </div>
            {!signals?.length ? (
              <p className="text-sm text-zinc-500">No sales signals logged yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm">
                {signals.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span className="font-medium text-zinc-900">{s.signal_type}</span>
                    <span className="text-zinc-500">{s.strength} · {s.detected_at}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {activeTab === "activity" && (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Activity</h2>
            <AddActivityForm companyId={Number(id)} />
          </div>
          {!activities?.length ? (
            <p className="text-sm text-zinc-500">No activity logged yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {activities.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900">{a.activity_type}</span>
                    <span className="text-zinc-500">
                      {a.actor_name} · {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  {a.body && <p className="mt-1 text-zinc-600">{a.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
