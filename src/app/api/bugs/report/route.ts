import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

const reportSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  logs: z.string().max(20000).optional(),
  networkLogs: z.string().max(10000).optional(),
  userAgent: z.string().optional(),
  pageUrl: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return unauthorizedResponse();
  }

  const roles = session.user.roles || ['INACTIF'];
  if (isInactive(roles)) {
    return forbiddenResponse();
  }

  let data: z.infer<typeof reportSchema>;
  try {
    data = reportSchema.parse(await request.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }

  const { title, description, logs, networkLogs, userAgent, pageUrl } = data;
  const userName = session.user.name || 'Inconnu';
  const userEmail = session.user.email || 'inconnu@example.com';
  const userRoles = roles.join(', ');
  const date = new Date().toISOString();

  const body = [
    '## Bug Report',
    '',
    `**Reporter:** ${userName} (${userEmail})  **Rôle:** ${userRoles}  **Date:** ${date}  **Page:** ${pageUrl || 'N/A'}  **UA:** ${userAgent || 'N/A'}`,
    '',
    '---',
    '',
    '## Description',
    '',
    description || '_Aucune description fournie._',
    '',
    '---',
    '',
    '<details><summary>Console Logs (last 50)</summary>',
    '',
    '```',
    logs || '(aucun log)',
    '```',
    '',
    '</details>',
    '',
    '<details><summary>Network Requests (last 30)</summary>',
    '',
    '```',
    networkLogs || '(aucune requête)',
    '```',
    '',
    '</details>',
  ].join('\n');

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token non configuré' }, { status: 502 });
  }

  const ghRes = await fetch('https://api.github.com/repos/jndev-42/CRF-Fleet-management/issues', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels: ['bug', 'user-report'] }),
  });

  if (!ghRes.ok) {
    const errText = await ghRes.text();
    console.error('GitHub API error:', ghRes.status, errText);
    return NextResponse.json({ error: 'Erreur lors de la création du ticket GitHub' }, { status: 502 });
  }

  const issue = await ghRes.json() as { html_url: string };
  return NextResponse.json({ issueUrl: issue.html_url }, { status: 201 });
}
