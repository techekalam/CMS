// Supabase Edge Function: send-notification
// Called directly from the coordinator dashboard when an action is taken.
// No webhook needed — the client calls this function directly.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = 'CMS Notifications <noreply@cavendish.ac.ug>';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      }
    });
  }

  try {
    const { email, title, message } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'No email provided' }), { status: 400 });
    }

    // Send email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: title || 'CMS Notification',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#0a192f">${title || 'Notification'}</h2>
            <p style="font-size:15px;color:#334155;line-height:1.6">${message || ''}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
            <p style="font-size:12px;color:#94a3b8">
              This is an automated notification from the Cavendish University Uganda 
              Capstone Management System.
            </p>
          </div>
        `
      })
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      return new Response(JSON.stringify({ error: 'Email failed', detail: errText }), {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
});
