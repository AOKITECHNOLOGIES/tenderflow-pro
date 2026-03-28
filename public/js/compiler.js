// ============================================================================
// TenderFlow Pro — Phase 4B: Document Compiler & State Locking
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile } from './auth.js';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageBreak, Header, Footer, Table, TableRow, TableCell,
  WidthType, BorderStyle, ImageRun,
} from 'https://esm.sh/docx@8.5.0';

const SECTION_ORDER = [
  'executive_summary', 'company_profile', 'project_approach', 'methodology',
  'technical_proposal', 'timeline', 'project_plan', 'cv_key_personnel',
  'past_experience', 'references', 'quality_assurance', 'health_safety',
  'environmental', 'risk_management', 'pricing', 'financial_proposal',
  'bbbee_certificate', 'tax_clearance', 'compliance', 'insurance', 'terms_conditions',
];

// ── Text truncation helper ───────────────────────────────────────────────────
function truncateForAI(text, maxChars = 20000) {
  if (!text || text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '\n\n[Document truncated for processing — ' +
    Math.round((text.length / maxChars) * 100) + '% of original length sent]';
}

// ── Strip HTML helper ────────────────────────────────────────────────────────
function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .trim();
}

// ── Compile Tender ───────────────────────────────────────────────────────────
export async function compileTender(tenderId) {
  const profile = getProfile();

  const { data: tender, error: tenderError } = await supabase
    .from('tenders')
    .select('*, companies(name, logo_url, settings)')
    .eq('id', tenderId)
    .single();

  if (tenderError || !tender) throw new Error('Tender not found');
  if (['submitted', 'archived'].includes(tender.status)) throw new Error('Tender is already submitted and locked');

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, profiles!tasks_assigned_to_fkey(full_name, department)')
    .eq('tender_id', tenderId)
    .order('priority', { ascending: false });

  const mandatoryUnapproved = (tasks || []).filter(t => t.is_mandatory && t.status !== 'approved');
  if (mandatoryUnapproved.length > 0) {
    throw new Error(`Cannot compile: mandatory sections not approved — ${mandatoryUnapproved.map(t => t.title).join(', ')}`);
  }

  const sortedTasks = [...(tasks || [])].sort((a, b) => {
    const aIdx = SECTION_ORDER.indexOf(a.section_type) === -1 ? 99 : SECTION_ORDER.indexOf(a.section_type);
    const bIdx = SECTION_ORDER.indexOf(b.section_type) === -1 ? 99 : SECTION_ORDER.indexOf(b.section_type);
    return aIdx - bIdx;
  });

  const compiledSections = [];
  const companyName = tender.companies?.name || 'Company';

  for (const task of sortedTasks) {
    if (!task.content && task.status !== 'approved') continue;
    compiledSections.push({
      title: task.title,
      section_type: task.section_type,
      content: task.content || '[No content provided]',
      author: task.profiles?.full_name || 'Unknown',
      department: task.profiles?.department || 'General',
      status: task.status,
      is_mandatory: task.is_mandatory,
      version: task.content_version,
    });
  }

  const htmlDocument = generateCompiledHTML({
    tender, companyName,
    logoUrl: tender.companies?.logo_url,
    sections: compiledSections,
    generatedAt: new Date().toISOString(),
    generatedBy: profile.full_name,
  });

  const snapshotData = {
    tender: {
      id: tender.id, title: tender.title,
      reference_number: tender.reference_number,
      deadline: tender.deadline,
      issuing_authority: tender.issuing_authority,
    },
    company: companyName,
    sections: compiledSections,
    metadata: {
      compiled_at: new Date().toISOString(),
      compiled_by: profile.full_name,
      total_sections: compiledSections.length,
      mandatory_sections: compiledSections.filter(s => s.is_mandatory).length,
    },
  };

  return {
    htmlDocument, snapshotData,
    sectionCount: compiledSections.length,
    mandatoryCount: compiledSections.filter(s => s.is_mandatory).length,
  };
}

// ── Submit & Lock Tender ─────────────────────────────────────────────────────
export async function submitTender(tenderId, snapshotData) {
  const { error: updateError } = await supabase
    .from('tenders')
    .update({ status: 'submitted', snapshot_data: snapshotData })
    .eq('id', tenderId);

  if (updateError) throw new Error(`Submission failed: ${updateError.message}`);

  await supabase.from('documents').update({ is_locked: true }).eq('tender_id', tenderId);

  return { success: true };
}

// ── Generate Compiled HTML ───────────────────────────────────────────────────
function generateCompiledHTML({ tender, companyName, logoUrl, sections, generatedAt, generatedBy }) {
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  let sectionsHTML = '';
  let tocHTML = '';
  let sectionNum = 0;

  for (const section of sections) {
    sectionNum++;
    const sectionId = `section-${sectionNum}`;
    const sectionLabel = (section.section_type || 'general').replace(/_/g, ' ');

    tocHTML += `<tr>
      <td style="padding:6px 12px; border-bottom:1px solid #e2e8f0; font-size:13px;">
        <a href="#${sectionId}" style="color:#0284c7; text-decoration:none;">${sectionNum}. ${section.title}</a>
      </td>
      <td style="padding:6px 12px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#64748b; text-transform:capitalize;">${sectionLabel}</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#64748b;">${section.author}</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">
        ${section.is_mandatory ? '<span style="color:#dc2626; font-weight:600; font-size:11px;">MANDATORY</span>' : '<span style="font-size:11px; color:#94a3b8;">Optional</span>'}
      </td>
    </tr>`;

    const contentParagraphs = (section.content || '')
      .split('\n').filter(p => p.trim())
      .map(p => `<p style="margin:0 0 10px 0; line-height:1.7; color:#334155;">${p}</p>`)
      .join('');

    sectionsHTML += `<div id="${sectionId}" style="page-break-inside:avoid; margin-bottom:40px;">
      <h2 style="font-size:18px; color:#0f172a; border-bottom:2px solid #0ea5e9; padding-bottom:8px; margin-bottom:16px;">
        ${sectionNum}. ${section.title}
      </h2>
      <p style="font-size:11px; color:#94a3b8; margin-bottom:12px;">
        Section: ${sectionLabel} &nbsp;|&nbsp; Author: ${section.author} &nbsp;|&nbsp; Dept: ${section.department}
        ${section.is_mandatory ? '&nbsp;|&nbsp; <strong style="color:#dc2626;">MANDATORY</strong>' : ''}
      </p>
      ${contentParagraphs}
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${tender.title} — Tender Proposal</title>
  <style>
    @media print { .no-print { display: none !important; } body { font-size: 12px; } }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1e293b; }
    a { color: #0284c7; }
  </style>
</head>
<body>
  <div class="no-print" style="background:#f1f5f9; padding:12px 20px; border-radius:8px; margin-bottom:30px; display:flex; justify-content:space-between; align-items:center;">
    <span style="font-size:13px; color:#64748b;">Compiled Tender Document — ${formatDate(generatedAt)}</span>
    <button onclick="window.print()" style="background:#0ea5e9; color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-size:13px;">Print / Save as PDF</button>
  </div>
  <div style="text-align:center; padding:60px 0 40px; border-bottom:3px solid #0ea5e9; margin-bottom:40px;">
    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:60px; margin-bottom:20px;" />` : ''}
    <h1 style="font-size:28px; color:#0f172a; margin:0 0 8px;">${tender.title}</h1>
    <p style="font-size:16px; color:#64748b; margin:0 0 4px;">Tender Proposal</p>
    ${tender.reference_number ? `<p style="font-size:14px; color:#94a3b8; margin:4px 0;">Reference: ${tender.reference_number}</p>` : ''}
    ${tender.issuing_authority ? `<p style="font-size:14px; color:#94a3b8; margin:4px 0;">Issued by: ${tender.issuing_authority}</p>` : ''}
    <p style="font-size:14px; color:#94a3b8; margin:4px 0;">Submitted by: ${companyName}</p>
    <p style="font-size:13px; color:#94a3b8; margin:16px 0 0;">Date: ${formatDate(generatedAt)}</p>
    ${tender.deadline ? `<p style="font-size:13px; color:#94a3b8;">Deadline: ${formatDate(tender.deadline)}</p>` : ''}
  </div>
  <div style="margin-bottom:40px;">
    <h2 style="font-size:20px; color:#0f172a; margin-bottom:16px;">Table of Contents</h2>
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 12px; text-align:left; font-size:11px; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">Section</th>
          <th style="padding:8px 12px; text-align:left; font-size:11px; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">Type</th>
          <th style="padding:8px 12px; text-align:left; font-size:11px; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">Author</th>
          <th style="padding:8px 12px; text-align:center; font-size:11px; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0;">Required</th>
        </tr>
      </thead>
      <tbody>${tocHTML}</tbody>
    </table>
  </div>
  ${sectionsHTML}
  <div style="border-top:2px solid #e2e8f0; padding-top:20px; margin-top:60px; text-align:center;">
    <p style="font-size:11px; color:#94a3b8;">This document was compiled by TenderFlow Pro on ${formatDate(generatedAt)} by ${generatedBy}. Contains ${sections.length} sections.</p>
    <p style="font-size:11px; color:#cbd5e1;">© ${new Date().getFullYear()} ${companyName}. Confidential.</p>
  </div>
</body>
</html>`;
}

// ── RFQ AI Analysis ──────────────────────────────────────────────────────────
export async function triggerRFQAnalysis(tenderId, fileText) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const truncatedText = truncateForAI(fileText);

  const response = await supabase.functions.invoke('parse-rfq', {
    body: { tender_id: tenderId, document_text: truncatedText },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) throw new Error(response.error.message || 'AI analysis failed');
  if (!response.data || !response.data.success) throw new Error(response.data?.error || 'AI analysis returned no data');

  return response.data;
}

// ── PDF/DOCX Text Extraction ─────────────────────────────────────────────────
export async function extractTextFromFile(file) {
  if (file.type === 'application/pdf') {
    console.log('[PDF] Starting extraction:', file.name, file.size);
    try {
      const pdfjs = window.pdfjsLib;
      if (!pdfjs) throw new Error('PDF.js not loaded — ensure the script tag is present in index.html');

      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      console.log('[PDF] Loaded, pages:', pdf.numPages);

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n\n';
      }
      return fullText;
    } catch (err) {
      console.error('[PDF] Extraction failed:', err.message);
      throw new Error(`PDF extraction failed: ${err.message}`);
    }
  }

  if (file.name.endsWith('.docx') || file.name.endsWith('.doc') || file.type.includes('wordprocessingml') || file.type.includes('msword')) {
    try {
      const mammoth = await import('https://esm.sh/mammoth@1.6.0');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      return result.value
        .replace(/<h[1-6][^>]*>/gi, '\n\n## ')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<p[^>]*>/gi, '\n')
        .replace(/<\/p>/gi, '')
        .replace(/<li[^>]*>/gi, '\n• ')
        .replace(/<\/li>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } catch (err) {
      console.error('[DOCX] Extraction failed:', err.message);
      throw new Error(`Word document extraction failed: ${err.message}`);
    }
  }

  if (file.type.startsWith('text/')) {
    return await file.text();
  }

  throw new Error(`Unsupported file type: ${file.type}`);
}

// ── Download Helper ──────────────────────────────────────────────────────────
export function downloadHTML(htmlContent, filename) {
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'tender-proposal.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Document Section Parser ──────────────────────────────────────────────────
export async function triggerDocumentParse(tenderId, fileText, replaceExisting) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const truncatedText = truncateForAI(fileText);

  const response = await supabase.functions.invoke('parse-document', {
    body: { tender_id: tenderId, document_text: truncatedText, replace_existing: replaceExisting },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) throw new Error(response.error.message || 'Document parsing failed');
  if (!response.data?.success) throw new Error(response.data?.error || 'No data returned');
  return response.data;
}

// ── compileAndDownload: branded .docx output ─────────────────────────────────
export async function compileAndDownload(tender, tasks) {
  const profile = getProfile();
  const companyName = tender.companies?.name || profile?.companies?.name || 'Company';

  // Fetch company branding
  const companyId = tender.company_id || profile?.company_id;
  const { data: branding } = await supabase
    .from('company_branding')
    .select('*')
    .eq('company_id', companyId)
    .single();

  const b = branding || {};
  const primaryColor   = (b.primary_color   || '#0ea5e9').replace('#', '');
  const secondaryColor = (b.secondary_color || '#0f172a').replace('#', '');
  const logoUrl        = b.logo_url || tender.companies?.logo_url || null;
  const proposalHeader = b.proposal_header || '';
  const proposalFooter = b.proposal_footer || `© ${new Date().getFullYear()} ${companyName}. Confidential.`;
  const coverTemplate  = b.cover_template || 'default';
  const documentFont   = b.document_font || 'Calibri';
  const bodySize       = parseInt(b.document_font_size || '20');
  const headingSize    = bodySize + 10;
  const titleSize      = bodySize + 32;

  const noBorder   = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' };
  const cellBorder = { style: BorderStyle.SINGLE,  size: 1, color: 'e2e8f0' };

  // Sort and filter tasks
  const sortedTasks = [...(tasks || [])].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.section_type) === -1 ? 99 : SECTION_ORDER.indexOf(a.section_type);
    const bi = SECTION_ORDER.indexOf(b.section_type) === -1 ? 99 : SECTION_ORDER.indexOf(b.section_type);
    return ai - bi;
  });

  const compiledSections = sortedTasks
    .filter(t => t.status === 'approved' || t.content)
    .map(t => ({
      title:        t.title,
      section_type: t.section_type,
      content:      t.content || '[No content provided]',
      author:       t.profiles?.full_name || 'Unknown',
      department:   t.profiles?.department || 'General',
      is_mandatory: t.is_mandatory,
    }));

  const children = [];

  // ── Logo ──────────────────────────────────────────────────────────────────
  if (logoUrl) {
    try {
      const res       = await fetch(logoUrl);
      const buf       = await res.arrayBuffer();
      const uint8     = new Uint8Array(buf);
      const ct        = res.headers.get('content-type') || 'image/png';
      const imageType = ct.includes('png') ? 'png' : ct.includes('svg') ? 'svg' : 'jpg';
      children.push(new Paragraph({
        children: [new ImageRun({ data: uint8, transformation: { width: 150, height: 60 }, type: imageType })],
        alignment: AlignmentType.LEFT,
        spacing: { before: 400, after: 400 },
      }));
    } catch (_) { /* skip if logo fetch fails */ }
  }

  // ── Cover title ───────────────────────────────────────────────────────────
  const coverAlign = coverTemplate === 'minimal' ? AlignmentType.CENTER : AlignmentType.LEFT;

  children.push(
    new Paragraph({
      children: [new TextRun({ text: tender.title, bold: true, size: titleSize, color: secondaryColor, font: documentFont })],
      alignment: coverAlign,
      spacing: { before: 800, after: 300 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Tender Proposal', size: bodySize + 8, color: primaryColor, font: documentFont })],
      alignment: coverAlign,
      spacing: { after: 600 },
    }),
  );

  // ── Cover metadata table ──────────────────────────────────────────────────
  const metaRows = [
    ['Document name',    tender.title || '—'],
    ['Reference',        tender.reference_number || null],
    ['Issued by',        tender.issuing_authority || null],
    ['Submitted by',     companyName],
    ['Account Manager',  tender.account_manager || null],
    ['Date',             new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['Deadline',         tender.deadline ? new Date(tender.deadline).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }) : null],
    ['Classification',   'Confidential'],
  ].filter(([, v]) => v !== null);

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: metaRows.map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          borders: { top: cellBorder, bottom: cellBorder, left: noBorder, right: noBorder },
          children: [new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: bodySize - 2, color: '64748b', font: documentFont })],
          })],
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          borders: { top: cellBorder, bottom: cellBorder, left: noBorder, right: noBorder },
          children: [new Paragraph({
            children: [new TextRun({ text: value, size: bodySize - 2, font: documentFont })],
          })],
        }),
      ],
    })),
  }));

  if (proposalHeader) {
    children.push(new Paragraph({
      children: [new TextRun({ text: proposalHeader, size: bodySize - 2, color: '94a3b8', italics: true, font: documentFont })],
      spacing: { before: 400 },
    }));
  }

  // ── Page break → Table of Contents ───────────────────────────────────────
  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(new Paragraph({
    children: [new TextRun({ text: 'Table of Contents', bold: true, size: headingSize, color: primaryColor, font: documentFont })],
    spacing: { before: 400, after: 300 },
  }));

  compiledSections.forEach((section, i) => {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${i + 1}. ${section.title}`, size: bodySize, font: documentFont }),
        section.is_mandatory
          ? new TextRun({ text: '  [MANDATORY]', color: 'dc2626', size: bodySize - 2, bold: true, font: documentFont })
          : new TextRun(''),
      ],
      spacing: { after: 120 },
    }));
  });

  // ── Page break → Sections ─────────────────────────────────────────────────
  children.push(new Paragraph({ children: [new PageBreak()] }));

  compiledSections.forEach((section, i) => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${section.title}`, bold: true, size: headingSize, color: primaryColor, font: documentFont })],
        spacing: { before: 400, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: primaryColor } },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Author: ${section.author}`, color: '94a3b8', size: bodySize - 4, font: documentFont }),
          new TextRun({ text: `  |  Dept: ${section.department}`, color: '94a3b8', size: bodySize - 4, font: documentFont }),
          section.is_mandatory
            ? new TextRun({ text: '  |  MANDATORY', color: 'dc2626', bold: true, size: bodySize - 4, font: documentFont })
            : new TextRun(''),
        ],
        spacing: { after: 200 },
      }),
    );

    const plainText = stripHtml(section.content);
    plainText.split('\n').filter(p => p.trim()).forEach(para => {
      children.push(new Paragraph({
        children: [new TextRun({ text: para.trim(), size: bodySize, font: documentFont })],
        spacing: { after: 160 },
      }));
    });

    children.push(new Paragraph({ spacing: { after: 300 } }));
  });

  // ── Last page ─────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      children: [new TextRun({
        text: `This document was compiled by TenderFlow Pro on ${new Date().toLocaleDateString()} by ${profile?.full_name || 'Unknown'}. Contains ${compiledSections.length} sections.`,
        size: bodySize - 4, color: '94a3b8', font: documentFont,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: proposalFooter, size: bodySize - 4, color: '94a3b8', font: documentFont })],
      alignment: AlignmentType.CENTER,
    }),
  );

  // ── Build document with headers and footers ───────────────────────────────
  const doc = new Document({
    sections: [{
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: companyName, bold: true, size: bodySize - 4, color: primaryColor, font: documentFont }),
              new TextRun({ text: `  |  ${tender.title}`, size: bodySize - 4, color: '94a3b8', font: documentFont }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [new TextRun({ text: `${companyName} — Confidential`, size: bodySize - 4, color: '94a3b8', font: documentFont })],
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' } },
          })],
        }),
      },
      children,
    }],
    title:   tender.title,
    subject: 'Tender Proposal',
    creator: profile?.full_name || 'TenderFlow Pro',
    company: companyName,
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = (tender.title || 'tender').replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-proposal.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
