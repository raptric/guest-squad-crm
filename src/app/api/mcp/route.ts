import { NextResponse } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchEnum, matchCountry } from "@/lib/companies/matching";
import { fetchPicklistValues } from "@/lib/picklists";
import { addContactToCompany, isDuplicateEmailError, normalizeContactInput } from "@/lib/contacts";
import { RATING_CHANNELS, RESEARCH_OUTCOMES } from "@/lib/companies/constants";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const mcpHandler = createMcpHandler((server) => {
  const supabase = createAdminClient();

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
          .select("is_primary, contact:contact_id!inner ( * )")
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

      const contacts = (contactLinks ?? []).map((l) => ({ ...(l.contact as unknown as object), is_primary_company: l.is_primary }));

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
        "Find a contact by verified email, or create one under the given company if it doesn't exist. Only use this with a real, verified email address you found during research -- never create a contact for a generic front-desk line or an unverified/guessed email. If the email already exists, that contact is updated (only the fields you pass are changed) and additionally associated with this company -- a contact can belong to several companies (e.g. a regional manager or portfolio owner), so use this to link the same person to each relevant company. Role/decision-maker/line-type values must match the admin picklists; unrecognized ones are ignored and reported in 'warnings'.",
      inputSchema: {
        company_id: z.number().int(),
        email: z.string().email(),
        first_name: z.string(),
        last_name: z.string().optional(),
        job_title: z.string().optional(),
        phone: z.string().optional(),
        linkedin_url: z.string().optional(),
        contact_role: z.string().optional(),
        decision_maker_level: z.string().optional(),
        contact_line_type: z.string().optional(),
      },
    },
    async ({ company_id, email, ...rest }) => {
      const { fields, warnings } = await normalizeContactInput(supabase, { email, ...rest }, { lenient: true });
      const normalizedEmail = fields.email as string;

      const { data: company } = await supabase.from("companies").select("id").eq("id", company_id).is("deleted_at", null).maybeSingle();
      if (!company) return errorResult(`Company ${company_id} not found`);

      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", normalizedEmail)
        .is("deleted_at", null)
        .maybeSingle();

      if (existing) {
        // Only fields this call provided are in `fields` -- an omitted optional field
        // must never blank out something a previous call already set.
        const { error } = await supabase.from("contacts").update(fields).eq("id", existing.id);
        if (error) return errorResult(error.message);
        // The same person can work with several companies: add this company to their set.
        const link = await addContactToCompany(supabase, Number(existing.id), company_id);
        if (link.error) return errorResult(link.error.message);
        return json({ status: "updated", contact_id: existing.id, company_id, newly_associated: link.added, warnings });
      }

      const { data: created, error } = await supabase.from("contacts").insert(fields).select("id").single();
      if (isDuplicateEmailError(error)) return errorResult("A contact with this email already exists -- retry to update it");
      if (error || !created) return errorResult(error?.message ?? "Failed to create contact");
      const link = await addContactToCompany(supabase, Number(created.id), company_id);
      if (link.error) return errorResult(link.error.message);
      return json({ status: "created", contact_id: created.id, company_id, warnings });
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
