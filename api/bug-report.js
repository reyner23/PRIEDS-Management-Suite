/**
 * Vercel Function: HTML -> Vercel -> Google Apps Script Web App
 *
 * Environment variables:
 * - APPS_SCRIPT_WEB_APP_URL
 * - APPS_SCRIPT_API_SECRET
 */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method tidak diizinkan. Gunakan POST.'
    });
  }

  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});

    const action = body.action;
    const allowedActions = ['getBugData', 'refreshBugReport'];

    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `Action "${action || ''}" tidak valid.`
      });
    }

    const appsScriptUrl = String(
      process.env.APPS_SCRIPT_WEB_APP_URL || ''
    ).trim();

    const appsScriptSecret = String(
      process.env.APPS_SCRIPT_API_SECRET || ''
    ).trim();

    if (!appsScriptUrl) {
      throw new Error('APPS_SCRIPT_WEB_APP_URL belum diatur di Vercel.');
    }

    if (!appsScriptUrl.endsWith('/exec')) {
      throw new Error('APPS_SCRIPT_WEB_APP_URL harus menggunakan URL deployment yang berakhiran /exec.');
    }

    if (!appsScriptSecret) {
      throw new Error('APPS_SCRIPT_API_SECRET belum diatur di Vercel.');
    }

    const controller = new AbortController();
    const timeoutMs = action === 'refreshBugReport' ? 55000 : 25000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let appsScriptResponse;
    try {
      appsScriptResponse = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'Accept': 'application/json,text/plain,*/*'
        },
        body: JSON.stringify({
          action,
          secret: appsScriptSecret
        }),
        redirect: 'follow',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const responseText = await appsScriptResponse.text();
    const cleanedText = responseText.replace(/^\uFEFF/, '').trim();
    const contentType = appsScriptResponse.headers.get('content-type') || '';

    let result;
    try {
      result = JSON.parse(cleanedText);
    } catch (parseError) {
      const preview = cleanedText
        .replace(/\s+/g, ' ')
        .slice(0, 300);

      console.error('Apps Script returned non-JSON response', {
        action,
        status: appsScriptResponse.status,
        contentType,
        preview
      });

      const looksLikeHtml = /<html|<!doctype|accounts\.google\.com|Service Unavailable/i.test(cleanedText);

      return res.status(502).json({
        success: false,
        message: looksLikeHtml
          ? 'Apps Script mengembalikan halaman HTML, bukan JSON. Pastikan Web App di-deploy sebagai Execute as Me, akses Anyone, dan URL Vercel berakhiran /exec.'
          : 'Respons Apps Script bukan JSON yang valid.',
        upstreamStatus: appsScriptResponse.status,
        upstreamContentType: contentType,
        responsePreview: preview
      });
    }

    if (!appsScriptResponse.ok || !result.success) {
      return res.status(appsScriptResponse.ok ? 400 : 502).json({
        success: false,
        message: result.message || 'Apps Script gagal menjalankan proses.',
        upstreamStatus: appsScriptResponse.status
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    const isAbort = error && error.name === 'AbortError';

    console.error('Bug Report API Error:', error);

    return res.status(isAbort ? 504 : 500).json({
      success: false,
      message: isAbort
        ? 'Apps Script membutuhkan waktu terlalu lama. Coba kembali atau periksa durasi Vercel Function.'
        : (error.message || 'Gagal menghubungi Apps Script.')
    });
  }
};
