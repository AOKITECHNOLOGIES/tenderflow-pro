// ============================================================================
// TenderFlow Pro — Phase 4A: AI RFQ Parser (Supabase Edge Function)
// ============================================================================
// Deploy to: supabase/functions/parse-rfq/index.ts
// Invoked by Bid Managers after uploading an RFQ document.
// Extracts mandatory requirements, suggests tasks & department assignments.
// ============================================================================

// --- FILE: supabase/functions/parse-rfq/index.ts ---

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Department assignment mapping — extend as needed
const SECTION_DEPARTMENT_MAP = {
  'executive_summary':    'Management',
  'company_profile':      'Management',
  'project_approach':     'Engineering',
  'methodology':          'Engineering',
  'technical_proposal':   'Engineering',
  'pricing':              'Finance',
  'financial_proposal':   'Finance',
  'bbbee_certificate':    'Compliance',
  'tax_clearance':        'Compliance',
  'compliance':           'Compliance',
  'quality_assurance':    'Quality',
  'health_safety':        'HSE',
  'environmental':        'HSE',
  'cv_key_personnel':     'HR',
  'references':           'Business Development',
  'past_experience':      'Business Development',
  'insurance':            'Legal',
  'terms_conditions':     'Legal',
  'timeline':             'Project Management',
  'project_plan':         'Project Management',
  'risk_management':      'Project Management',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Init Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    // User client (respects RLS)
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client (bypasses RLS for task creation)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request
    const { tender_id, document_text } = await req.json();
    if (!tender_id || !document_text) {
      return new Response(JSON.stringify({ error: 'tender_id and document_text required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify tender exists and user has access
    const { data: tender, error: tenderError } = await supabaseUser
      .from('tenders')
      .select('id, company_id, status')
      .eq('id', tender_id)
      .single();

    if (tenderError || !tender) {
      return new Response(JSON.stringify({ error: 'Tender not found or access denied' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check company has AI enabled
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('ai_enabled')
      .eq('id', tender.company_id)
      .single();

    if (!company?.ai_enabled) {
      return new Response(JSON.stringify({ error: 'AI features are disabled for your company. Contact the system administrator.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Call OpenAI to parse the RFQ ────────────────────────────────────────

    const aiPrompt = `You are a tender/RFQ analysis expert. Analyze the following RFQ document text and extract structured data.

Return a JSON object with this exact structure:
{
  "summary": "Brief 2-3 sentence summary of what this tender is requesting",
  "issuing_authority": "Name of the organization issuing the RFQ",
  "submission_deadline": "ISO date string if found, or null",
  "estimated_value": "Estimated contract value if mentioned, or null",
  "requirements": [
    {
      "title": "Short descriptive title for this requirement section",
      "section_type": "one of: executive_summary, company_profile, project_approach, methodology, technical_proposal, pricing, financial_proposal, bbbee_certificate, tax_clearance, compliance, quality_assurance, health_safety, environmental, cv_key_personnel, references, past_experience, insurance, terms_conditions, timeline, project_plan, risk_management",
      "description": "Detailed description of what must be provided",
      "is_mandatory": true/false,
      "priority": 0-2 (0=normal, 1=high, 2=critical)
    }
  ]
}

IMPORTANT:
- Extract ALL requirements mentioned in the document
- Mark anything with words like "must", "shall", "required", "mandatory" as is_mandatory: true
- Assign appropriate section_type from the list above
- If a requirement doesn't fit any section_type, use the closest match
- Critical requirements (elimination criteria) should have priority: 2

RFQ Document Text:
${document_text.substring(0, 15000)}`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: aiPrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`OpenAI API error: ${aiResponse.status} — ${errText}`);
    }

    const aiData = await aiResponse.json();
    const analysis = JSON.parse(aiData.choices[0].message.content);

    // ── Create tasks from parsed requirements ───────────────────────────────

    const tasksToInsert = (analysis.requirements || []).map((req) => ({
      company_id: tender.company_id,
      tender_id: tender_id,
      title: req.title,
      section_type: req.section_type,
      description: req.description,
      is_mandatory: req.is_mandatory || false,
      priority: req.priority || 0,
      status: 'unassigned',
      metadata: {
        suggested_department: SECTION_DEPARTMENT_MAP[req.section_type] || 'General',
        ai_generated: true,
      },
    }));

    // Insert tasks via service role (bypass RLS for batch insert)
    const { data: createdTasks, error: insertError } = await supabaseAdmin
      .from('tasks')
      .insert(tasksToInsert)
      .select();

    if (insertError) {
      throw new Error(`Task creation failed: ${insertError.message}`);
    }

    // Update tender with AI analysis and status
    await supabaseAdmin.from('tenders').update({
      ai_analysis: analysis,
      status: 'in_progress',
    }).eq('id', tender_id);

    // Audit log
    await supabaseAdmin.from('system_audit').insert({
      company_id: tender.company_id,
      user_id: user.id,
      action: 'ai_analysis',
      table_name: 'tenders',
      record_id: tender_id,
      description: `AI parsed RFQ: ${analysis.requirements?.length || 0} requirements extracted, ${createdTasks?.length || 0} tasks created`,
      new_data: { summary: analysis.summary, task_count: createdTasks?.length },
    });

    return new Response(JSON.stringify({
      success: true,
      analysis,
      tasks_created: createdTasks?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse RFQ error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
