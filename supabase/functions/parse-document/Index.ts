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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const { tender_id, document_text, replace_existing } = await req.json();
    if (!tender_id || !document_text) return new Response(JSON.stringify({ error: 'tender_id and document_text required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify tender exists
    const { data: tender } = await callerClient.from('tenders').select('id, company_id, status').eq('id', tender_id).single();
    if (!tender) return new Response(JSON.stringify({ error: 'Tender not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    // Call OpenAI to split document into sections
    const aiPrompt = `You are a document parsing expert. Analyze the following document and split it into logical sections based on headings, numbered sections, or natural topic breaks.

Return a JSON object with this exact structure:
{
  "document_title": "The main title of the document if found, or null",
  "sections": [
    {
      "title": "Section heading or descriptive title",
      "section_type": "one of: executive_summary, company_profile, project_approach, methodology, technical_proposal, pricing, financial_proposal, bbbee_certificate, tax_clearance, compliance, quality_assurance, health_safety, environmental, cv_key_personnel, references, past_experience, insurance, terms_conditions, timeline, project_plan, risk_management, general",
      "content": "The full text content of this section",
      "is_mandatory": true or false,
      "priority": 0, 1, or 2
    }
  ]
}

IMPORTANT:
- Preserve the full content of each section exactly as written
- Use section headings as titles where available
- If no clear heading exists, create a descriptive title from the content
- Map each section to the closest section_type
- Use "general" for sections that don't fit any category
- Keep sections focused — don't merge unrelated content
- Preserve formatting within content using newlines

Document text:
${document_text.substring(0, 20000)}`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: aiPrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`OpenAI error: ${aiResponse.status} — ${errText}`);
    }

    const aiData = await aiResponse.json();
    const parsed = JSON.parse(aiData.choices[0].message.content);

    // Optionally delete existing tasks
    if (replace_existing) {
      await adminClient.from('tasks').delete().eq('tender_id', tender_id);
    }

    // Create tasks from parsed sections
    const tasksToInsert = (parsed.sections || []).map((s) => ({
      company_id: tender.company_id,
      tender_id,
      title: s.title,
      section_type: s.section_type || 'general',
      description: `Imported from document. Section: ${s.title}`,
      content: s.content,
      is_mandatory: s.is_mandatory || false,
      priority: s.priority || 0,
      status: 'unassigned',
      metadata: { ai_generated: true, source: 'document_import' },
    }));

    const { data: createdTasks, error: insertError } = await adminClient
      .from('tasks').insert(tasksToInsert).select();

    if (insertError) throw new Error(`Task creation failed: ${insertError.message}`);

    return new Response(JSON.stringify({
      success: true,
      document_title: parsed.document_title,
      sections_created: createdTasks?.length || 0,
      sections: parsed.sections?.map(s => ({ title: s.title, section_type: s.section_type })),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Parse document error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
