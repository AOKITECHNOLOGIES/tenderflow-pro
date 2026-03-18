// ============================================================================
// TenderFlow Pro — AI RFQ Parser (Supabase Edge Function)
// supabase/functions/parse-rfq/index.ts
// ============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SECTION_DEPARTMENT_MAP: Record<string, string> = {
  executive_summary:    'Management',
  company_profile:      'Management',
  project_approach:     'Engineering',
  methodology:          'Engineering',
  technical_proposal:   'Engineering',
  pricing:              'Finance',
  financial_proposal:   'Finance',
  bbbee_certificate:    'Compliance',
  tax_clearance:        'Compliance',
  compliance:           'Compliance',
  quality_assurance:    'Quality',
  health_safety:        'HSE',
  environmental:        'HSE',
  cv_key_personnel:     'HR',
  references:           'Business Development',
  past_experience:      'Business Development',
  insurance:            'Legal',
  terms_conditions:     'Legal',
  timeline:             'Project Management',
  project_plan:         'Project Management',
  risk_management:      'Project Management',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'No authorization header' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey   = Deno.env.get('OPENAI_API_KEY')!;

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    // Accept both 'text' and 'document_text' for compatibility
    const body = await req.json();
    const { tender_id } = body;
    const document_text: string = body.text || body.document_text || '';

    if (!tender_id || !document_text) return new Response(JSON.stringify({ error: 'tender_id and text are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const { data: tender } = await supabaseUser.from('tenders').select('id, company_id, status').eq('id', tender_id).single();
    if (!tender) return new Response(JSON.stringify({ error: 'Tender not found or access denied' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const { data: company } = await supabaseAdmin.from('companies').select('ai_enabled').eq('id', tender.company_id).single();
    if (!company?.ai_enabled) return new Response(JSON.stringify({ error: 'AI features are disabled for your company.' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    // ── Chunk long documents — process in up to 3 passes if needed ──────────
    const MAX_CHARS = 28000;
    const chunks: string[] = [];
    if (document_text.length <= MAX_CHARS) {
      chunks.push(document_text);
    } else {
      // Split on double newlines to avoid cutting mid-sentence
      let remaining = document_text;
      while (remaining.length > 0) {
        if (remaining.length <= MAX_CHARS) {
          chunks.push(remaining);
          break;
        }
        let cutAt = remaining.lastIndexOf('\n\n', MAX_CHARS);
        if (cutAt < MAX_CHARS * 0.5) cutAt = MAX_CHARS;
        chunks.push(remaining.slice(0, cutAt));
        remaining = remaining.slice(cutAt).trim();
        if (chunks.length >= 3) {
          // Append remainder to last chunk rather than losing it
          chunks[chunks.length - 1] += '\n\n' + remaining;
          break;
        }
      }
    }

    // ── Call OpenAI — one call per chunk, merge results ──────────────────────
    const allRequirements: any[] = [];
    const allInfoItems: any[] = [];
    let mergedSummary = '';
    let mergedIssuingAuthority = '';
    let mergedDeadline = '';
    let mergedValue = '';

    for (let i = 0; i < chunks.length; i++) {
      const chunkLabel = chunks.length > 1 ? ` (Part ${i + 1} of ${chunks.length})` : '';

      const aiPrompt = `You are a senior bid manager and tender specialist with 20+ years of experience preparing winning proposals. Your task is to perform a thorough, expert-level analysis of the following RFQ/tender document${chunkLabel}.

You must extract EVERY piece of information that a bid team would need to respond to this tender. Be exhaustive — miss nothing.

Return a JSON object with this EXACT structure:

{
  "summary": "A detailed 4-6 sentence executive summary covering: what is being procured, who is procuring it, the scope of work, key evaluation criteria, and strategic context",
  "issuing_authority": "Full legal name of the issuing organization",
  "submission_deadline": "ISO 8601 datetime string if found, otherwise null",
  "estimated_value": "Contract value or budget if mentioned, otherwise null",
  "evaluation_criteria": "How bids will be scored/evaluated — e.g. 90/10 BBBEE points, technical weighting",
  "requirements": [
    {
      "title": "Clear, specific title for this deliverable or task",
      "section_type": "MUST be one of: executive_summary | company_profile | project_approach | methodology | technical_proposal | pricing | financial_proposal | bbbee_certificate | tax_clearance | compliance | quality_assurance | health_safety | environmental | cv_key_personnel | references | past_experience | insurance | terms_conditions | timeline | project_plan | risk_management",
      "description": "DETAILED description — minimum 3 sentences. Include: exactly what must be submitted, any specified format or page limits, specific criteria that will be evaluated, any referenced clause numbers from the document",
      "is_mandatory": true or false,
      "priority": 0 for normal | 1 for high | 2 for critical elimination criteria,
      "suggested_department": "Which department should own this task",
      "word_count_guide": "Suggested length e.g. '500-800 words' or 'as per template'",
      "key_points": ["bullet 1 the writer must address", "bullet 2", "bullet 3"]
    }
  ],
  "information_items": [
    {
      "title": "Title of this informational item",
      "category": "one of: deadline | evaluation | scoring | contact | formatting | submission_instructions | terms | background | scope",
      "detail": "Full verbatim or near-verbatim text of this important item from the document",
      "importance": "high | medium | low"
    }
  ]
}

REQUIREMENTS RULES — follow these strictly:
1. Create a SEPARATE requirement for EVERY distinct deliverable, document, certificate, or section the bidder must submit
2. Do NOT merge multiple deliverables into one requirement
3. Include ALL of the following if present in the document: cover letter, company registration, tax clearance, BBBEE certificate, organogram, CVs for each key role, proof of experience, bank letters, insurance certificates, professional memberships, site visit attendance, declaration forms, pricing schedules, project methodology, implementation timeline, risk register, quality plan, HSE plan
4. Mark as is_mandatory: true anything containing words: must, shall, required, mandatory, will not be considered, disqualifying, eliminatory, compulsory, prerequisite
5. Mark priority: 2 (critical) for anything that causes disqualification if missing
6. Mark priority: 1 (high) for scored requirements that significantly affect the evaluation score
7. The description must be detailed enough that someone who has never read the RFQ can write the response section correctly
8. key_points must list every specific sub-item the response must address

INFORMATION ITEMS RULES:
1. Capture ALL important dates, deadlines, briefing sessions, site visits
2. Capture ALL scoring breakdowns and evaluation matrices
3. Capture ALL formatting and submission instructions (page limits, font, binding, number of copies)
4. Capture ALL contact details and clarification procedures
5. Capture ALL terms, conditions, and eligibility requirements
6. These are NOT tasks — they are reference information the bid team needs to know
7. Be thorough — a bid manager reading only the information_items should understand the full context

RFQ Document Text${chunkLabel}:
${chunks[i]}`;

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
      const analysis = JSON.parse(aiData.choices[0].message.content);

      if (i === 0) {
        mergedSummary = analysis.summary || '';
        mergedIssuingAuthority = analysis.issuing_authority || '';
        mergedDeadline = analysis.submission_deadline || '';
        mergedValue = analysis.estimated_value || '';
      }

      allRequirements.push(...(analysis.requirements || []));
      allInfoItems.push(...(analysis.information_items || []));
    }

    // ── Deduplicate requirements by title similarity ──────────────────────────
    const seen = new Set<string>();
    const uniqueRequirements = allRequirements.filter(r => {
      const key = r.title?.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Build final analysis object ──────────────────────────────────────────
    const finalAnalysis = {
      summary: mergedSummary,
      issuing_authority: mergedIssuingAuthority,
      submission_deadline: mergedDeadline,
      estimated_value: mergedValue,
      requirements: uniqueRequirements,
      information_items: allInfoItems,
    };

    // ── Create actionable tasks from requirements ─────────────────────────────
    const tasksToInsert = uniqueRequirements.map((req) => ({
      company_id: tender.company_id,
      tender_id,
      title: req.title,
      section_type: req.section_type || 'general',
      description: [
        req.description,
        req.key_points?.length ? `\n\nKey points to address:\n${req.key_points.map((p: string) => `• ${p}`).join('\n')}` : '',
        req.word_count_guide ? `\n\nSuggested length: ${req.word_count_guide}` : '',
      ].filter(Boolean).join(''),
      is_mandatory: req.is_mandatory || false,
      priority: req.priority || 0,
      status: 'unassigned',
      metadata: {
        suggested_department: req.suggested_department || SECTION_DEPARTMENT_MAP[req.section_type] || 'General',
        ai_generated: true,
        source: 'rfq_parse',
        key_points: req.key_points || [],
        word_count_guide: req.word_count_guide || null,
      },
    }));

    const { data: createdTasks, error: insertError } = await supabaseAdmin
      .from('tasks').insert(tasksToInsert).select();
    if (insertError) throw new Error(`Task creation failed: ${insertError.message}`);

    // ── Store information items as tender notes in ai_analysis ───────────────
    await supabaseAdmin.from('tenders').update({
      ai_analysis: {
        ...finalAnalysis,
        information_items: allInfoItems,
        parsed_at: new Date().toISOString(),
        chunks_processed: chunks.length,
        total_requirements: uniqueRequirements.length,
        total_info_items: allInfoItems.length,
      },
      status: 'in_progress',
      ...(mergedIssuingAuthority ? { issuing_authority: mergedIssuingAuthority } : {}),
    }).eq('id', tender_id);

    // ── Audit log ─────────────────────────────────────────────────────────────
    await supabaseAdmin.from('system_audit').insert({
      company_id: tender.company_id,
      user_id: user.id,
      action: 'ai_analysis',
      table_name: 'tenders',
      record_id: tender_id,
      description: `AI parsed RFQ: ${uniqueRequirements.length} tasks created, ${allInfoItems.length} info items captured, ${chunks.length} chunk(s) processed`,
      new_data: {
        summary: mergedSummary,
        task_count: createdTasks?.length,
        info_count: allInfoItems.length,
      },
    }).catch(() => {}); // Non-fatal

    return new Response(JSON.stringify({
      success: true,
      analysis: finalAnalysis,
      tasks_created: createdTasks?.length || 0,
      info_items: allInfoItems.length,
      chunks_processed: chunks.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Parse RFQ error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
