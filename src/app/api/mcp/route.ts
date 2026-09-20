import { NextResponse } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchEnum, matchCountry } from "@/lib/companies/matching";
import { fetchPicklistValues } from "@/lib/picklists";
import {
  addChannels,
  addCompanyLink,
  findContactsByEmails,
  normalizeContactPayload,
  type Actor,
} from "@/lib/contacts";
import { RATING_CHANNELS, RESEARCH_OUTCOMES } from "@/lib/companies/constants";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

// Everything Codex writes is unverified until a person reviews it (human-in-the-loop).
const AGENT: Actor = { type: "agent", name: "Codex" };

// Tools that change data. Each successful call is recorded in the activity log with its exact
// arguments and result, so reviewers can see what the agent submitted.
const AUDITED_TOOLS = new Set([
  "find_or_create_company",
  "link_company_to_parent",
  "update_qualification",
  "update_property_profile",
  "find_or_create_contact",
  "add_rating",
  "add_signal",
  "add_hiring_signal",
  "add_pain_signal",
  "set_research_outcome",
]);

const mcpHandler = createMcpHandler((server) => {
  const supabase = createAdminClient();

  const registerTool = server.registerTool.bind(server) as unknown as (
    name: string,
    config: unknown,
    cb: (args: Record<string, unknown>, extra: unknown) => Promise<ToolResult>
  ) => unknown;
  (server as unknown as { registerTool: typeof registerTool }).registerTool = (name, config, cb) =>
    registerTool(
      name,
      config,
      AUDITED_TOOLS.has(name)
        ? async (args, extra) => {
            const result = await cb(args, extra);
            if (!result.isError) {
              try {
                const output = JSON.parse(result.content[0].text) as Record<string, unknown>;
                const companyId = Number(args.company_id ?? output.company_id) || null;
                const contactId = Number(output.contact_id) || null;
                if (companyId || contactId) {
                  await supabase.from("activities").insert({
                    company_id: companyId,
                    contact_id: contactId,
                    activity_type: "research",
                    actor_type: "agent",
                    actor_name: AGENT.name,
                    body: `Agent tool call: ${name}`,
                    metadata: { tool: name, args, result: output },
                  });
                }
              } catch {
                // An audit-log failure must never fail the research write itself.
              }
            }
            return result;
          }
        : cb
    );

  server.registerTool(
    "list_companies",
    {
      title: "List Companies",
      description:
        "List companies (properties, management companies, portfolios), optionally filtered by lead_status, lifecycle_stage, or company_type. Use this to find leads to research.",
      inputSchema: {
        lead_status: z.string().optional(),
        lifecycle_stage: z.string().optional(),
        company_type: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ lead_status, lifecycle_stage, company_type, limit }) => {
      let query = supabase
        .from("companies")
        .select("id, name, website, city, state, country, company_type, lifecycle_stage, lead_status, prospect_tier, parent_company_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (lead_status) query = query.eq("lead_status", lead_status);
      if (lifecycle_stage) query = query.eq("lifecycle_stage", lifecycle_stage);
      if (company_type) query = query.eq("company_type", company_type);

      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return json(data);
    }
  );

  server.registerTool(
    "get_company",
    {
      title: "Get Company",
      description:
        "Get full detail for one company: core fields, property profile, ratings, hiring signals, sales signals, pain signals, contacts, offer recommendations, and parent/child portfolio links.",
      inputSchema: { company_id: z.number().int() },
    },
    async ({ company_id }) => {
      const { data: company, error } = await supabase
        .from("companies")
        .select(
          `*, parent_company:parent_company_id ( id, name, company_type ),
           owner:owner_id ( id, name )`
        )
        .eq("id", company_id)
        .is("deleted_at", null)
        .single();

      if (error || !company) return errorResult(error?.message ?? "Company not found");

      const [
        { data: propertyDetails },
        { data: children },
        { data: contactLinks },
        { data: ratings },
        { data: hiringSignals },
        { data: signals },
        { data: offers },
      ] = await Promise.all([
        company.company_type === "Property"
          ? supabase.from("property_details").select("*").eq("company_id", company_id).single()
          : Promise.resolve({ data: null }),
        supabase.from("companies").select("id, name, company_type, city, country").eq("parent_company_id", company_id).is("deleted_at", null),
        supabase
          .from("contact_companies")
          .select(
            `is_primary, job_title, contact_role, decision_maker_level, is_verified, source_url, evidence, added_by_type,
             contact:contact_id!inner (
               id, first_name, last_name, linkedin_url, contact_line_type,
               contact_emails ( email, label, company_id, is_primary, is_verified, source_url, evidence, added_by_type ),
               contact_phones ( phone, label, company_id, is_primary, is_verified, source_url, evidence, added_by_type )
             )`
          )
          .eq("company_id", company_id)
          .is("contact.deleted_at", null),
        supabase.from("company_ratings").select("*").eq("company_id", company_id),
        supabase.from("company_hiring_signals").select("*").eq("company_id", company_id),
        supabase.from("company_signals").select("*").eq("company_id", company_id),
        supabase.from("offer_recommendations").select("*").eq("company_id", company_id),
      ]);

      const { data: painSignals } = propertyDetails
        ? await supabase.from("property_pain_signals").select("*").eq("property_id", propertyDetails.id)
        : { data: null };

      // One entry per person; job details and verification are for THIS company's link.
      const contacts = (contactLinks ?? []).map(({ contact, ...link }) => ({
        ...(contact as unknown as object),
        this_company: link,
      }));

      return json({ company, propertyDetails, children, contacts, ratings, hiringSignals, signals, offers, painSignals });
    }
  );

  server.registerTool(
    "find_or_create_company",
    {
      title: "Find or Create Company",
      description:
        "Find an existing company by name/website, or create it if it doesn't exist. Use this both for a company you're researching and for newly-discovered related companies (e.g. a portfolio owner or sibling property). Never creates a duplicate for the same name+website.",
      inputSchema: {
        name: z.string(),
        company_type: z.string().default("Property"),
        website: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        property_type: z.string().optional(),
        parent_company_id: z.number().int().optional(),
        // Newly-discovered portfolio siblings should start at "Lead", not the default
        // "Prospect" a cold/unconfirmed record gets.
        lifecycle_stage: z.string().optional(),
      },
    },
    async ({ name, company_type, website, city, state, country, property_type, parent_company_id, lifecycle_stage }) => {
      const [validCompanyTypes, validPropertyTypes, validLifecycleStages, validCountries] = await Promise.all([
        fetchPicklistValues(supabase, "company_type"),
        fetchPicklistValues(supabase, "property_type"),
        fetchPicklistValues(supabase, "lifecycle_stage"),
        fetchPicklistValues(supabase, "country"),
      ]);
      const resolvedType = matchEnum(company_type, validCompanyTypes, "Property")!;

      let existing = null;
      if (website) {
        const { data } = await supabase.from("companies").select("id").ilike("website", `%${website}%`).is("deleted_at", null).limit(1).single();
        existing = data;
      }
      if (!existing) {
        const { data } = await supabase.from("companies").select("id").ilike("name", name).is("deleted_at", null).limit(1).single();
        existing = data;
      }

      if (existing) {
        return json({ status: "found", company_id: existing.id });
      }

      const { data: created, error } = await supabase
        .from("companies")
        .insert({
          name,
          website: website || null,
          city: city || null,
          state: state || null,
          country: matchCountry(country, validCountries) ?? (country?.trim() || null),
          company_type: resolvedType,
          parent_company_id: parent_company_id || null,
          lifecycle_stage: matchEnum(lifecycle_stage, validLifecycleStages, "Lead"),
          lead_status: "New",
          source: "codex_research",
        })
        .select("id")
        .single();

      if (error || !created) return errorResult(error?.message ?? "Failed to create company");

      if (resolvedType === "Property") {
        await supabase.from("property_details").insert({
          company_id: created.id,
          property_type: matchEnum(property_type, validPropertyTypes, null),
          portfolio_role: parent_company_id ? "Portfolio Property" : "Independent",
        });
      }

      return json({ status: "created", company_id: created.id });
    }
  );

  server.registerTool(
    "link_company_to_parent",
    {
      title: "Link Company to Parent",
      description:
        "Set an existing company's parent company (portfolio/group). Use this after discovering a company belongs to a portfolio you've found or created with find_or_create_company.",
      inputSchema: { company_id: z.number().int(), parent_company_id: z.number().int() },
    },
    async ({ company_id, parent_company_id }) => {
      const { error } = await supabase.from("companies").update({ parent_company_id }).eq("id", company_id);
      if (error) return errorResult(error.message);

      // Only upgrade an unset/default role -- never overwrite a more specific one a human set.
      await supabase
        .from("property_details")
        .update({ portfolio_role: "Portfolio Property" })
        .eq("company_id", company_id)
        .in("portfolio_role", ["Independent"]);

      return json({ status: "linked", company_id, parent_company_id });
    }
  );

  server.registerTool(
    "update_qualification",
    {
      title: "Update Qualification",
      description: "Write research findings: qualification summary, why-now narrative, and/or prospect tier.",
      inputSchema: {
        company_id: z.number().int(),
        qualification_summary: z.string().optional(),
        sdr_signal_summary: z.string().optional(),
        prospect_tier: z.string().optional(),
      },
    },
    async ({ company_id, qualification_summary, sdr_signal_summary, prospect_tier }) => {
      const fields: Record<string, string> = {};
      if (qualification_summary !== undefined) fields.qualification_summary = qualification_summary;
      if (sdr_signal_summary !== undefined) fields.sdr_signal_summary = sdr_signal_summary;
      if (prospect_tier !== undefined) {
        const validProspectTiers = await fetchPicklistValues(supabase, "prospect_tier");
        const tier = matchEnum(prospect_tier, validProspectTiers, null);
        if (!tier) return errorResult(`Invalid prospect_tier. Allowed: ${validProspectTiers.join(", ")}`);
        fields.prospect_tier = tier;
      }

      const { error } = await supabase.from("companies").update(fields).eq("id", company_id);
      if (error) return errorResult(error.message);
      return json({ status: "updated", company_id });
    }
  );

  server.registerTool(
    "update_property_profile",
    {
      title: "Update Property Profile",
      description:
        "Write property classification discovered during research onto an EXISTING company: property_type/portfolio_role (Properties) and/or portfolio_size (portfolio/group companies). Does not touch address fields -- those are only set at creation, never refreshed automatically.",
      inputSchema: {
        company_id: z.number().int(),
        property_type: z.string().optional(),
        portfolio_role: z.string().optional(),
        portfolio_size: z.number().int().optional(),
      },
    },
    async ({ company_id, property_type, portfolio_role, portfolio_size }) => {
      if (portfolio_size !== undefined) {
        const { error } = await supabase.from("companies").update({ portfolio_size }).eq("id", company_id);
        if (error) return errorResult(error.message);
      }

      if (property_type !== undefined || portfolio_role !== undefined) {
        const [validPropertyTypes, validPortfolioRoles] = await Promise.all([
          fetchPicklistValues(supabase, "property_type"),
          fetchPicklistValues(supabase, "portfolio_role"),
        ]);
        const fields: Record<string, string | null> = {};
        if (property_type !== undefined) fields.property_type = matchEnum(property_type, validPropertyTypes, null);
        if (portfolio_role !== undefined) fields.portfolio_role = matchEnum(portfolio_role, validPortfolioRoles, null);

        const { error, count } = await supabase
          .from("property_details")
          .update(fields, { count: "exact" })
          .eq("company_id", company_id);
        if (error) return errorResult(error.message);
        if (count === 0) return errorResult("This company has no property profile -- property_type/portfolio_role only apply to Properties");
      }

      return json({ status: "updated", company_id });
    }
  );

  server.registerTool(
    "find_or_create_contact",
    {
      title: "Find or Create Contact",
      description:
        "Record a person you found during research and associate them with a company. Everything you submit is stored UNVERIFIED with your source/evidence, and a human reviews it later -- so include a source_url or evidence for every email and phone, and only submit real addresses you actually found (never guess or invent one, and skip generic front-desk mailboxes). " +
        "The person is matched by ANY of the emails you send; if they already exist they are not duplicated -- this company is added to their companies (a person can work with several), missing emails/phones are added, and existing verified or human-entered values are never overwritten (blanks are filled). job_title / contact_role / decision_maker_level describe the person AT THIS company. " +
        "Per email or phone, applies_to_company (default true) ties it to this company (a work address); set it to false for a personal email or cell that is not company-specific. " +
        "Role/decision-maker/label values must match the admin picklists; unrecognized ones are ignored and reported in 'warnings'. If your emails belong to two different existing contacts you'll get an error -- those need a manual merge.",
      inputSchema: {
        company_id: z.number().int(),
        first_name: z.string(),
        last_name: z.string().optional(),
        linkedin_url: z.string().optional(),
        contact_line_type: z.string().optional(),
        job_title: z.string().optional(),
        contact_role: z.string().optional(),
        decision_maker_level: z.string().optional(),
        link_source_url: z.string().optional(),
        link_evidence: z.string().optional(),
        emails: z
          .array(
            z
              .object({
                email: z.string().email(),
                label: z.string().optional(),
                applies_to_company: z.boolean().default(true),
                source_url: z.string().optional(),
                evidence: z.string().optional(),
              })
              .refine((e) => e.source_url || e.evidence, { message: "each email needs a source_url or evidence" })
          )
          .min(1),
        phones: z
          .array(
            z
              .object({
                phone: z.string(),
                label: z.string().optional(),
                applies_to_company: z.boolean().default(true),
                source_url: z.string().optional(),
                evidence: z.string().optional(),
              })
              .refine((p) => p.source_url || p.evidence, { message: "each phone needs a source_url or evidence" })
          )
          .optional(),
      },
    },
    async ({
      company_id,
      first_name,
      last_name,
      linkedin_url,
      contact_line_type,
      job_title,
      contact_role,
      decision_maker_level,
      link_source_url,
      link_evidence,
      emails,
      phones,
    }) => {
      const { data: company } = await supabase.from("companies").select("id").eq("id", company_id).is("deleted_at", null).maybeSingle();
      if (!company) return errorResult(`Company ${company_id} not found`);

      const scope = (applies: boolean) => (applies ? company_id : null);
      const n = await normalizeContactPayload(
        supabase,
        {
          first_name,
          last_name,
          linkedin_url,
          contact_line_type,
          companies: [
            { company_id, job_title, contact_role, decision_maker_level, source_url: link_source_url, evidence: link_evidence },
          ],
          emails: emails.map((e) => ({ ...e, company_id: scope(e.applies_to_company) })),
          phones: (phones ?? []).map((p) => ({ ...p, company_id: scope(p.applies_to_company) })),
        },
        { lenient: true }
      );
      if (n.error) return errorResult(n.error);

      const owners = await findContactsByEmails(supabase, n.emails!.map((e) => e.value));
      const ownerIds = [...new Set(owners.map((o) => o.contact_id))];
      if (ownerIds.length > 1) {
        return errorResult(
          `These emails belong to different existing contacts (${ownerIds.join(", ")}). They need a manual merge -- submit only one person's emails.`
        );
      }

      let contactId: number;
      let status: "created" | "updated";
      if (ownerIds.length === 1) {
        contactId = ownerIds[0];
        status = "updated";
        // Fill blanks on the person; never overwrite what's already there.
        const { data: current } = await supabase.from("contacts").select("last_name, linkedin_url, contact_line_type").eq("id", contactId).single();
        const fill: Record<string, string | null> = {};
        for (const field of ["last_name", "linkedin_url", "contact_line_type"] as const) {
          if (n.person[field] && !current?.[field]) fill[field] = n.person[field];
        }
        if (Object.keys(fill).length) {
          const { error } = await supabase.from("contacts").update(fill).eq("id", contactId);
          if (error) return errorResult(error.message);
        }
      } else {
        const { data: created, error } = await supabase.from("contacts").insert(n.person).select("id").single();
        if (error || !created) return errorResult(error?.message ?? "Failed to create contact");
        contactId = Number(created.id);
        status = "created";
      }

      const link = await addCompanyLink(supabase, contactId, n.companies![0], AGENT);
      const emailResult = link.error ? null : await addChannels(supabase, "contact_emails", contactId, n.emails!, AGENT);
      const phoneResult =
        link.error || emailResult?.error ? null : await addChannels(supabase, "contact_phones", contactId, n.phones ?? [], AGENT);

      const failure = link.error || emailResult?.error || phoneResult?.error;
      if (failure) {
        if (status === "created") await supabase.from("contacts").delete().eq("id", contactId);
        return errorResult(failure.message);
      }

      return json({
        status,
        contact_id: contactId,
        company_id,
        company_link_added: link.added,
        company_link_fields_updated: link.updatedFields,
        emails_added: emailResult?.added,
        emails_already_present: emailResult?.existing,
        phones_added: phoneResult?.added,
        phones_already_present: phoneResult?.existing,
        verification: "unverified -- pending human review",
        warnings: n.warnings,
      });
    }
  );

  server.registerTool(
    "add_rating",
    {
      title: "Add Rating",
      description: `Add or refresh a review-channel rating. Channels: ${RATING_CHANNELS.join(", ")}.`,
      inputSchema: {
        company_id: z.number().int(),
        channel: z.string(),
        rating: z.number().optional(),
        review_count: z.number().int().optional(),
      },
    },
    async ({ company_id, channel, rating, review_count }) => {
      const resolvedChannel = matchEnum(channel, RATING_CHANNELS, null);
      if (!resolvedChannel) return errorResult(`Invalid channel. Allowed: ${RATING_CHANNELS.join(", ")}`);

      const { error } = await supabase
        .from("company_ratings")
        .upsert(
          { company_id, channel: resolvedChannel, rating: rating ?? null, review_count: review_count ?? null, captured_at: new Date().toISOString() },
          { onConflict: "company_id,channel" }
        );
      if (error) return errorResult(error.message);
      return json({ status: "saved", company_id, channel: resolvedChannel });
    }
  );

  server.registerTool(
    "add_signal",
    {
      title: "Add Sales Signal",
      description: "Log a company-level sales signal (management change, portfolio expansion, guest complaints, etc.). Free text signal_type -- no fixed list.",
      inputSchema: {
        company_id: z.number().int(),
        signal_type: z.string(),
        strength: z.string().optional(),
        source_url: z.string().optional(),
      },
    },
    async ({ company_id, signal_type, strength, source_url }) => {
      const validStrengthLevels = await fetchPicklistValues(supabase, "strength");
      const { error } = await supabase.from("company_signals").insert({
        company_id,
        signal_type,
        strength: matchEnum(strength, validStrengthLevels, null),
        source_url: source_url || null,
      });
      if (error) return errorResult(error.message);
      return json({ status: "logged", company_id });
    }
  );

  server.registerTool(
    "add_hiring_signal",
    {
      title: "Add Hiring Signal",
      description:
        "Log a detected job posting for this company. Valid roles are managed in the admin Settings page -- pass your best match and it will be normalized.",
      inputSchema: {
        company_id: z.number().int(),
        role: z.string().optional(),
        job_title: z.string().optional(),
        strength: z.string().optional(),
        source_url: z.string().optional(),
      },
    },
    async ({ company_id, role, job_title, strength, source_url }) => {
      const [validHiringSignalRoles, validStrengthLevels] = await Promise.all([
        fetchPicklistValues(supabase, "hiring_signal_role"),
        fetchPicklistValues(supabase, "strength"),
      ]);
      const { error } = await supabase.from("company_hiring_signals").insert({
        company_id,
        role: matchEnum(role, validHiringSignalRoles, null),
        job_title: job_title || null,
        strength: matchEnum(strength, validStrengthLevels, null),
        source_url: source_url || null,
      });
      if (error) return errorResult(error.message);
      return json({ status: "logged", company_id });
    }
  );

  server.registerTool(
    "add_pain_signal",
    {
      title: "Add Pain Signal",
      description: "Log a guest-communication pain signal found for a Property (e.g. unanswered calls, front desk staffing). Only valid for companies that are Properties.",
      inputSchema: { company_id: z.number().int(), pain_type: z.string(), source_url: z.string().optional() },
    },
    async ({ company_id, pain_type, source_url }) => {
      const { data: propertyDetails } = await supabase.from("property_details").select("id").eq("company_id", company_id).single();
      if (!propertyDetails) return errorResult("This company has no property profile -- pain signals only apply to Properties");

      const { error } = await supabase.from("property_pain_signals").insert({
        property_id: propertyDetails.id,
        pain_type,
        source_url: source_url || null,
      });
      if (error) return errorResult(error.message);
      return json({ status: "logged", company_id });
    }
  );

  // add_offer_recommendation is intentionally NOT exposed here: Primary/Secondary sales
  // angle fields stay SDR-managed until the logic mapping research evidence to a specific
  // play is reviewed and approved.

  server.registerTool(
    "log_activity",
    {
      title: "Log Research Activity",
      description: "Log a research note against a company, visible in its activity timeline (attributed to the agent).",
      inputSchema: { company_id: z.number().int(), body: z.string(), actor_name: z.string().default("Codex") },
    },
    async ({ company_id, body, actor_name }) => {
      const { error } = await supabase.from("activities").insert({
        company_id,
        activity_type: "research",
        actor_type: "agent",
        actor_name,
        body,
      });
      if (error) return errorResult(error.message);
      return json({ status: "logged", company_id });
    }
  );

  server.registerTool(
    "set_research_outcome",
    {
      title: "Set Research Outcome",
      description:
        "Record the outcome of researching this company, following the standard rules: " +
        "Qualified sets lead_status=Qualified AND advances lifecycle_stage to 'Sales Qualified'. " +
        "Needs Review (incomplete research) and DisQualified set lead_status only -- " +
        "lifecycle_stage is left unchanged. Anything past Qualified (Opportunity, Customer, " +
        "etc.) is a human decision, not made here.",
      inputSchema: { company_id: z.number().int(), outcome: z.enum(RESEARCH_OUTCOMES) },
    },
    async ({ company_id, outcome }) => {
      const fields: Record<string, string> = { lead_status: outcome };
      if (outcome === "Qualified") fields.lifecycle_stage = "Sales Qualified";

      const { error } = await supabase.from("companies").update(fields).eq("id", company_id);
      if (error) return errorResult(error.message);
      return json({ status: "updated", company_id, ...fields });
    }
  );
});

async function authenticate(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.MCP_API_KEY}`;
  return process.env.MCP_API_KEY && authHeader === expected;
}

async function handler(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return mcpHandler(request);
}

export { handler as GET, handler as POST };
