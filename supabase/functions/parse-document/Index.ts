// ============================================================================
// TenderFlow Pro — Parse Document into Editable Sections
// supabase/functions/parse-document/index.ts
// ============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey   = Deno.env.get('OPENAI_API_KEY')!;

    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    // Accept both field name variants for compatibility
    const body = await req.json();
    const { tender_id, replace_existing, mode } = body;
    const document_text: string = body.text || body.document_text || '';

    if (!tender_id || !document_text) return new Response(JSON.stringify({ error: 'tender_id and text are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const { data: tender } = await callerClient.from('tenders').select('id, company_id, status').eq('id', tender_id).single();
    if (!tender) return new Response(JSON.stringify({ error: 'Tender not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    // If called with mode: 'rfq', redirect to the deeper RFQ analysis logic below
    const isRfqMode = mode === 'rfq';

    // ── Chunk long documents ─────────────────────────────────────────────────
    const MAX_CHARS = 28000;
    const chunks: string[] = [];
    if (document_text.length <= MAX_CHARS) {
      chunks.push(document_text);
    } else {
      let remaining = document_text;
      while (remaining.length > 0) {
        if (remaining.length <= MAX_CHARS) { chunks.push(remaining); break; }
        let cutAt = remaining.lastIndexOf('\n\n', MAX_CHARS);
        if (cutAt < MAX_CHARS * 0.5) cutAt = MAX_CHARS;
        chunks.push(remaining.slice(0, cutAt));
        remaining = remaining.slice(cutAt).trim();
        if (chunks.length >= 4) {
          chunks[chunks.length - 1] += '\n\n' + remaining;
          break;
        }
      }
    }

    // ── Process each chunk ───────────────────────────────────────────────────
    const allSections: any[] = [];
    const allInfoItems: any[] = [];
    let documentTitle = '';

    for (let i = 0; i < chunks.length; i++) {
      const chunkLabel = chunks.length > 1 ? ` (Part ${i + 1} of ${chunks.length})` : '';

      const aiPrompt = isRfqMode
        ? buildRfqPrompt(chunks[i], chunkLabel)
        : buildDocumentPrompt(chunks[i], chunkLabel);

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: aiPrompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
          max_tokens: 4000,
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        throw new Error(`OpenAI error: ${aiResponse.status} — ${errText}`);
      }

      const aiData = await aiResponse.json();
      const parsed = JSON.parse(aiData.choices[0].message.content);

      if (i === 0 && parsed.document_title) documentTitle = parsed.document_title;

      const sections = parsed.sections || parsed.requirements || [];
      const infoItems = parsed.information_items || [];

      allSections.push(...sections);
      allInfoItems.push(...infoItems);
    }

    // ── Deduplicate ──────────────────────────────────────────────────────────
    const seen = new Set<string>();
    const uniqueSections = allSections.filter(s => {
      const key = (s.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Optionally delete existing tasks ────────────────────────────────────
    if (replace_existing) {
      await adminClient.from('tasks').delete().eq('tender_id', tender_id);
    }

    // ── Insert tasks ─────────────────────────────────────────────────────────
    const tasksToInsert = uniqueSections.map((s) => ({
      company_id: tender.company_id,
      tender_id,
      title: s.title,
      section_type: s.section_type || 'general',
      description: buildTaskDescription(s),
      content: s.content || null,
      is_mandatory: s.is_mandatory || false,
      priority: s.priority || 0,
      status: 'unassigned',
      metadata: {
        ai_generated: true,
        source: isRfqMode ? 'rfq_parse' : 'document_import',
        suggested_department: s.suggested_department || null,
        key_points: s.key_points || [],
        word_count_guide: s.word_count_guide || null,
      },
    }));

    const { data: createdTasks, error: insertError } = await adminClient
      .from('tasks').insert(tasksToInsert).select();
    if (insertError) throw new Error(`Task creation failed: ${insertError.message}`);

    // ── Store information items in tender ai_analysis ────────────────────────
    if (allInfoItems.length > 0 || isRfqMode) {
      const existing = await adminClient.from('tenders').select('ai_analysis').eq('id', tender_id).single();
      await adminClient.from('tenders').update({
        ai_analysis: {
          ...(existing.data?.ai_analysis || {}),
          information_items: allInfoItems,
          document_title: documentTitle || undefined,
          parsed_at: new Date().toISOString(),
          chunks_processed: chunks.length,
        },
        status: 'in_progress',
      }).eq('id', tender_id);
    }

    return new Response(JSON.stringify({
      success: true,
      document_title: documentTitle,
      sections_created: createdTasks?.length || 0,
      info_items: allInfoItems.length,
      sections: uniqueSections.map(s => ({ title: s.title, section_type: s.section_type })),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Parse document error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildDocumentPrompt(text: string, chunkLabel: string): string {
  return `You are a senior document analyst and bid writing expert. Analyze the following document${chunkLabel} and split it into logical, actionable sections.

Return a JSON object with this EXACT structure:
{
  "document_title": "The main title of the document, or null if not found",
  "sections": [
    {
      "title": "Clear, specific section title",
      "section_type": "MUST be one of: executive_summary | company_profile | project_approach | methodology | technical_proposal | pricing | financial_proposal | bbbee_certificate | tax_clearance | compliance | quality_assurance | health_safety | environmental | cv_key_personnel | references | past_experience | insurance | terms_conditions | timeline | project_plan | risk_management | general",
      "content": "The COMPLETE, VERBATIM text content of this section — preserve every word, every sentence, every bullet point exactly as written",
      "is_mandatory": true or false,
      "priority": 0 for normal | 1 for high | 2 for critical,
      "suggested_department": "Which team should work on this section",
      "key_points": ["specific point writer must address", "another point"],
      "word_count_guide": "Suggested length or 'as per document'"
    }
  ],
  "information_items": [
    {
      "title": "Short title for this note",
      "category": "one of: deadline | evaluation | scoring | contact | formatting | submission_instructions | terms | background | scope",
      "detail": "Full text of this important item",
      "importance": "high | medium | low"
    }
  ]
}

SECTION RULES:
1. Extract EVERY distinct section — do not skip anything
2. Preserve the COMPLETE content of each section word-for-word in the content field
3. Each section must be independently workable by an assignee without reading other sections
4. If a section contains sub-sections, either keep as one task with clear content, or split if they are genuinely independent deliverables
5. Mark is_mandatory: true for sections that must be submitted to avoid disqualification
6. Identify key_points — these are the specific things the writer must address within this section

INFORMATION ITEMS RULES:
1. Extract all dates, deadlines, and important instructions as information_items (NOT as sections)
2. Extract scoring matrices, evaluation criteria, formatting rules
3. Extract submission procedures, contact details, site visit requirements
4. These are reference items — they inform the bid team but don't require writing

Document Text${chunkLabel}:
${text}`;
}

function buildRfqPrompt(text: string, chunkLabel: string): string {
  return `You are a senior bid manager with 20+ years of experience preparing winning tender proposals. Perform a thorough, expert-level analysis of this RFQ/tender document${chunkLabel}.

You must extract EVERY piece of information a bid team needs. Be exhaustive — miss nothing.

Return a JSON object with this EXACT structure:
{
  "document_title": "Full tender/RFQ name",
  "sections": [
    {
      "title": "Clear, specific title for this deliverable — e.g. 'Company Registration & Legal Status' not just 'Company Documents'",
      "section_type": "MUST be one of: executive_summary | company_profile | project_approach | methodology | technical_proposal | pricing | financial_proposal | bbbee_certificate | tax_clearance | compliance | quality_assurance | health_safety | environmental | cv_key_personnel | references | past_experience | insurance | terms_conditions | timeline | project_plan | risk_management | general",
      "content": null,
      "description": "DETAILED 4-6 sentence description of exactly what must be submitted. Include: what document/section is required, any specified format, page limits or word counts, what evaluators will be looking for, any referenced clause numbers, any minimum requirements that must be met",
      "is_mandatory": true or false — true if the word must/shall/required/mandatory appears, or if missing causes disqualification,
      "priority": 2 for elimination criteria | 1 for highly scored requirements | 0 for standard requirements,
      "suggested_department": "Which department/team should own this",
      "key_points": [
        "Every specific sub-item or sub-requirement the writer must address",
        "Any specific format or template requirement",
        "Any minimum threshold that must be met",
        "Any evaluation criteria specific to this section"
      ],
      "word_count_guide": "Suggested word count or page limit based on document instructions"
    }
  ],
  "information_items": [
    {
      "title": "Clear label for this item",
      "category": "one of: deadline | evaluation | scoring | contact | formatting | submission_instructions | terms | background | scope",
      "detail": "Full verbatim or near-verbatim text from the document for this item — do not paraphrase important details",
      "importance": "high | medium | low"
    }
  ]
}

MANDATORY SECTIONS TO LOOK FOR AND CREATE TASKS FOR (if present in document):
- Cover letter / transmittal letter
- Company registration documents (CIPC)  
- Tax clearance certificate / Tax PIN
- BBBEE certificate or affidavit
- Company profile / About us
- Organogram / company structure
- CVs for each named or role-specified key personnel
- Professional body memberships / certifications
- Proof of similar projects / experience (with specific number if stated)
- Client references / letters of award
- Technical proposal / solution description
- Project methodology
- Implementation plan / project plan
- Risk register
- Quality management plan
- HSE plan
- Environmental plan
- Insurance certificates (PI, public liability, employer's liability)
- Bank rating letter / financial statements
- Pricing schedule / bill of quantities
- Site visit attendance register (if applicable)
- Declaration forms (conflict of interest, MBD forms, SBD forms)
- Any other form or appendix specified in the RFQ

INFORMATION ITEMS TO CAPTURE:
- Submission deadline and time
- Tender validity period
- Briefing / clarification session dates and venues
- Scoring breakdown (e.g. 90/10, 80/20 price vs functionality)
- Evaluation matrix with weightings per section
- Submission format (hard copies, USB, online portal, email)
- Number of copies required
- Binding and formatting requirements
- Contact person for queries
- Grounds for disqualification
- Special conditions or eligibility requirements
- Site visit requirements
- Any financial thresholds or minimum turnover requirements

RFQ Document Text${chunkLabel}:
${text}`;
}

function buildTaskDescription(s: any): string {
  const parts: string[] = [];
  if (s.description) parts.push(s.description);
  if (s.key_points?.length) {
    parts.push('\n\nKey points to address:');
    parts.push(s.key_points.map((p: string) => `• ${p}`).join('\n'));
  }
  if (s.word_count_guide) parts.push(`\n\nSuggested length: ${s.word_count_guide}`);
  if (s.content && !s.description) parts.push(s.content.substring(0, 500) + (s.content.length > 500 ? '...' : ''));
  return parts.join('') || `Complete the "${s.title}" section for this tender submission.`;
}
