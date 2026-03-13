// ============================================================================
// TenderFlow Pro — Batch 2: Email Sender Edge Function
// ============================================================================
// Deploy: supabase functions deploy send-notification
// Called by: notification triggers or manually from frontend
// Reads SMTP config from email_config table, sends via SMTP.
// ============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Email templates
const TEMPLATES = {
  task_assigned: (data) => ({
    subject: `[TenderFlow] New task assigned: ${data.task_title}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#0ea5e9;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">New Task Assigned</h2>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <p>Hi ${data.user_name},</p>
          <p>You've been assigned a new task:</p>
          <div style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin:16px 0;">
            <p style="margin:0;font-weight:bold;color:#0f172a;">${data.task_title}</p>
            <p style="margin:4px 0 0;color:#64748b;font-size:14px;">Tender: ${data.tender_title || '—'}</p>
            ${data.due_date ? `<p style="margin:4px 0 0;color:#64748b;font-size:14px;">Due: ${data.due_date}</p>` : ''}
            ${data.is_mandatory ? '<p style="margin:8px 0 0;color:#dc2626;font-size:13px;font-weight:bold;">⚠ MANDATORY REQUIREMENT</p>' : ''}
          </div>
          <a href="${data.app_url}#/tasks/${data.task_id}" style="display:inline-block;background:#0ea5e9;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;margin-top:8px;">View Task</a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">— TenderFlow Pro</p>
        </div>
      </div>`,
  }),

  task_approved: (data) => ({
    subject: `[TenderFlow] Your task was approved: ${data.task_title}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#10b981;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">✓ Task Approved</h2>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <p>Hi ${data.user_name},</p>
          <p>Your task <strong>${data.task_title}</strong> has been approved!</p>
          <a href="${data.app_url}#/tasks/${data.task_id}" style="display:inline-block;background:#10b981;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">View Task</a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">— TenderFlow Pro</p>
        </div>
      </div>`,
  }),

  task_revision: (data) => ({
    subject: `[TenderFlow] Revision requested: ${data.task_title}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#f59e0b;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">🔄 Revision Requested</h2>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <p>Hi ${data.user_name},</p>
          <p>A revision has been requested on your task: <strong>${data.task_title}</strong></p>
          ${data.notes ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;margin:12px 0;"><p style="margin:0;font-size:14px;color:#92400e;">${data.notes}</p></div>` : ''}
          <a href="${data.app_url}#/tasks/${data.task_id}" style="display:inline-block;background:#f59e0b;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">View Task</a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">— TenderFlow Pro</p>
        </div>
      </div>`,
  }),

  tender_submitted: (data) => ({
    subject: `[TenderFlow] Tender submitted: ${data.tender_title}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#059669;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">🔒 Tender Submitted & Locked</h2>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <p>Hi ${data.user_name},</p>
          <p>The tender <strong>${data.tender_title}</strong> has been compiled and submitted.</p>
          <p>All tasks and documents are now locked and read-only.</p>
          ${data.reference_number ? `<p style="color:#64748b;">Reference: ${data.reference_number}</p>` : ''}
          <a href="${data.app_url}#/tenders/${data.tender_id}" style="display:inline-block;background:#059669;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">View Tender</a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">— TenderFlow Pro</p>
        </div>
      </div>`,
  }),

  tender_deadline: (data) => ({
    subject: `[TenderFlow] ⏰ Deadline approaching: ${data.tender_title}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#dc2626;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">⏰ Deadline Approaching</h2>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <p>Hi ${data.user_name},</p>
          <p>The tender <strong>${data.tender_title}</strong> is due on <strong>${data.deadline}</strong>.</p>
          <p style="color:#dc2626;font-weight:bold;">Please ensure all tasks are completed and submitted.</p>
          <a href="${data.app_url}#/tenders/${data.tender_id}" style="display:inline-block;background:#dc2626;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">View Tender</a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">— TenderFlow Pro</p>
        </div>
      </div>`,
  }),
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { notification_id, template, data, company_id, to_email } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({ error: 'company_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get SMTP config for this company
    const { data: config } = await supabaseAdmin
      .from('email_config')
      .select('*')
      .eq('company_id', company_id)
      .eq('is_enabled', true)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: 'Email not enabled for this company', skipped: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build email from template
    const templateFn = TEMPLATES[template];
    if (!templateFn) {
      return new Response(JSON.stringify({ error: `Unknown template: ${template}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { subject, html } = templateFn(data);

    // Send via SMTP
    const client = new SmtpClient();
    await client.connectTLS({
      hostname: config.smtp_host,
      port: config.smtp_port,
      username: config.smtp_user,
      password: atob(config.smtp_pass_encrypted), // Decode base64
    });

    await client.send({
      from: `${config.from_name || 'TenderFlow'} <${config.from_email || config.smtp_user}>`,
      to: to_email,
      subject,
      content: '',
      html,
      replyTo: config.reply_to || config.from_email,
    });

    await client.close();

    // Mark notification as emailed
    if (notification_id) {
      await supabaseAdmin.from('notifications').update({
        metadata: { ...data, email_sent: true, email_sent_at: new Date().toISOString() },
      }).eq('id', notification_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Email send error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
