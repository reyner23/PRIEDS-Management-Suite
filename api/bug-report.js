/**
 * Vercel Function:
 * HTML → Vercel → Apps Script Web App
 */

module.exports = async function handler(req, res) {
  // Jangan menyimpan hasil respons sebagai cache.
  res.setHeader("Cache-Control", "no-store, max-age=0");

  // Izinkan hanya POST.
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method tidak diizinkan. Gunakan POST."
    });
  }

  try {
    const action = req.body && req.body.action;

    const allowedActions = [
      "getBugData",
      "refreshBugReport"
    ];

    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action tidak valid."
      });
    }

    const appsScriptUrl =
      process.env.APPS_SCRIPT_WEB_APP_URL;

    const appsScriptSecret =
      process.env.APPS_SCRIPT_API_SECRET;

    if (!appsScriptUrl) {
      throw new Error(
        "APPS_SCRIPT_WEB_APP_URL belum diatur di Vercel."
      );
    }

    if (!appsScriptSecret) {
      throw new Error(
        "APPS_SCRIPT_API_SECRET belum diatur di Vercel."
      );
    }

    const appsScriptResponse = await fetch(
      appsScriptUrl,
      {
        method: "POST",
        headers: {
          /*
           * text/plain menghindari preflight CORS tambahan
           * saat diteruskan ke Apps Script.
           */
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: action,
          secret: appsScriptSecret
        }),
        redirect: "follow"
      }
    );

    const responseText =
      await appsScriptResponse.text();

    let result;

    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error(
        "Apps Script raw response:",
        responseText
      );

      throw new Error(
        "Respons Apps Script bukan JSON yang valid."
      );
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message:
          result.message ||
          "Apps Script gagal menjalankan proses."
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error(
      "Bug Report API Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Gagal menghubungi Apps Script."
    });
  }
};